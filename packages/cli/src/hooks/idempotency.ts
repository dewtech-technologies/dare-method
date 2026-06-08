import crypto from 'node:crypto';
import fs from 'fs-extra';
import path from 'node:path';
import { assertRelativeSafe, resolveSafePath } from '../utils/path-safety.js';
import type { HookEvent, HookEventPayload } from './types.js';
import type { AllowedActionKey } from './allowlist.js';

export interface IdempotencyContext {
  readonly projectRoot: string;
  readonly statePath?: string;
  /** For on-task-complete: touched files (sorted internally for hashing). */
  readonly touchedFiles?: readonly string[];
}

interface HooksStateFile {
  seen: Record<string, string>;
}

function normalizeFile(file: string): string {
  assertRelativeSafe(file);
  return file.replace(/\\/g, '/');
}

function hashMaterial(material: string): string {
  return crypto.createHash('sha256').update(material).digest('hex');
}

function materialForPayload(
  event: HookEvent,
  payload: HookEventPayload,
  touchedFiles?: readonly string[],
): string {
  switch (event) {
    case 'on-file-create':
    case 'on-save': {
      if (!payload.file) return '';
      return normalizeFile(payload.file);
    }
    case 'on-task-complete': {
      const taskId = payload.taskId ?? '';
      const files = (touchedFiles ?? [])
        .map((f) => normalizeFile(f))
        .sort();
      const filesHash = hashMaterial(files.join('\n'));
      return `${taskId}|${filesHash}`;
    }
    case 'pre-commit':
      return payload.taskId ?? '';
    default:
      return '';
  }
}

export function stateKey(
  event: HookEvent,
  action: AllowedActionKey,
  payload: HookEventPayload,
  opts?: { touchedFiles?: readonly string[] },
): string {
  const material = materialForPayload(event, payload, opts?.touchedFiles);
  return hashMaterial(`${event}|${action}|${material}`);
}

async function readState(ctx: IdempotencyContext): Promise<HooksStateFile> {
  const stateFile = resolveSafePath(ctx.projectRoot, ctx.statePath ?? '.dare/hooks-state.json');
  await fs.ensureDir(path.dirname(stateFile));
  if (!(await fs.pathExists(stateFile))) {
    return { seen: {} };
  }
  const data = (await fs.readJson(stateFile)) as HooksStateFile;
  return { seen: data.seen ?? {} };
}

async function writeState(ctx: IdempotencyContext, state: HooksStateFile): Promise<void> {
  const stateFile = resolveSafePath(ctx.projectRoot, ctx.statePath ?? '.dare/hooks-state.json');
  await fs.writeJson(stateFile, state, { spaces: 2 });
}

export async function shouldSkip(
  event: HookEvent,
  action: AllowedActionKey,
  payload: HookEventPayload,
  ctx: IdempotencyContext,
): Promise<boolean> {
  const key = stateKey(event, action, payload, { touchedFiles: ctx.touchedFiles });
  const state = await readState(ctx);
  return key in state.seen;
}

export async function markSeen(
  event: HookEvent,
  action: AllowedActionKey,
  payload: HookEventPayload,
  ctx: IdempotencyContext,
): Promise<void> {
  const key = stateKey(event, action, payload, { touchedFiles: ctx.touchedFiles });
  const state = await readState(ctx);
  if (state.seen[key]) return;
  state.seen[key] = new Date().toISOString();
  await writeState(ctx, state);
}
