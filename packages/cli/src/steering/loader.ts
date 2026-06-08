import fs from 'fs-extra';
import path from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import { assertRelativeSafe } from '../utils/path-safety.js';
import type { SteeringFile, SteeringFrontMatter } from './types.js';

const frontMatterSchema = z
  .object({
    scope: z.enum(['project', 'glob']),
    glob: z.string().min(1).optional(),
    priority: z.number().int().default(0),
    title: z.string().optional(),
  })
  .strict()
  .superRefine((fm, ctx) => {
    if (fm.scope === 'glob' && !fm.glob) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scope 'glob' requires a 'glob' field",
        path: ['glob'],
      });
    }
    if (fm.glob) sanitizeGlob(fm.glob, ctx);
  });

export class SteeringFrontMatterError extends Error {
  constructor(relPath: string, error: z.ZodError) {
    const detail = error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    super(`Invalid steering front-matter: ${relPath}: ${detail}`);
    this.name = 'SteeringFrontMatterError';
  }
}

function sanitizeGlob(glob: string, ctx: z.RefinementCtx): void {
  const norm = glob.replace(/\\/g, '/');
  if (path.posix.isAbsolute(norm) || norm.startsWith('..') || norm.includes('/../')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `glob must be relative and must not contain '..': ${glob}`,
      path: ['glob'],
    });
  }
}

function isBlockedSteeringSource(relPath: string): boolean {
  const base = path.basename(relPath);
  return /^\.env(\..*)?$/i.test(base);
}

function parseFrontMatter(raw: string): { frontMatter: unknown; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { frontMatter: undefined, body: raw };
  return { frontMatter: yaml.load(m[1]!) ?? {}, body: m[2] ?? '' };
}

/** Carrega todos os steering files descobertos + a base PROJECT-DNA (reuso, RF-08). */
export function loadSteeringFiles(projectRoot: string): SteeringFile[] {
  const files: SteeringFile[] = [];

  const dnaRel = path.posix.join('DARE', 'PROJECT-DNA.md');
  assertRelativeSafe(dnaRel);
  const dnaAbs = path.join(projectRoot, dnaRel);
  if (fs.pathExistsSync(dnaAbs)) {
    const body = fs.readFileSync(dnaAbs, 'utf-8');
    files.push({
      path: dnaRel,
      frontMatter: { scope: 'project', priority: 0 },
      body,
      isBase: true,
    });
  }

  const patternsRel = path.posix.join('DARE', 'PATTERNS.md');
  assertRelativeSafe(patternsRel);
  const patternsAbs = path.join(projectRoot, patternsRel);
  if (fs.pathExistsSync(patternsAbs)) {
    files.push({
      path: patternsRel,
      frontMatter: { scope: 'project', priority: 0 },
      body: fs.readFileSync(patternsAbs, 'utf-8'),
      isBase: true,
    });
  }

  const steeringDirRel = path.posix.join('.dare', 'steering');
  assertRelativeSafe(steeringDirRel);
  const steeringDirAbs = path.join(projectRoot, steeringDirRel);
  if (fs.pathExistsSync(steeringDirAbs)) {
    const entries = fs
      .readdirSync(steeringDirAbs)
      .filter((f) => f.endsWith('.md'))
      .sort();
    for (const entry of entries) {
      const relPath = path.posix.join(steeringDirRel, entry);
      if (isBlockedSteeringSource(relPath)) continue;
      assertRelativeSafe(relPath);
      const raw = fs.readFileSync(path.join(projectRoot, relPath), 'utf-8');
      const { frontMatter, body } = parseFrontMatter(raw);
      const parsed = frontMatterSchema.safeParse(frontMatter ?? {});
      if (!parsed.success) {
        throw new SteeringFrontMatterError(relPath, parsed.error);
      }
      files.push({
        path: relPath,
        frontMatter: parsed.data as SteeringFrontMatter,
        body,
        isBase: false,
      });
    }
  }

  return files;
}
