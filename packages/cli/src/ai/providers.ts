import { safeSpawn } from '../exec/safe-spawn.js';
import type { AgentRequest, AgentResult, AiProviderName, ProviderStatus } from './types.js';
import type { AiConfig } from './config.js';
import { resolveProviderConfig } from './config.js';
import { extractJsonObject } from './parse-json-output.js';
import {
  createCodexCliDriver,
  type CodexApproval,
  type CodexSandbox,
} from '../agent/drivers/codex.js';

export interface AiProvider {
  readonly name: AiProviderName;
  readonly requiresNetwork: boolean;
  probe(): Promise<ProviderStatus>;
  run(request: AgentRequest): Promise<AgentResult>;
}

const PROBE_TIMEOUT_SECONDS = 8;
const DEFAULT_RUN_TIMEOUT_SECONDS = 20 * 60;

function schemaInstruction(schema?: Record<string, unknown>): string {
  if (!schema) return '';
  return `\n\nRespond with JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`;
}

async function probeCli(command: string, args: string[] = ['--help']): Promise<Omit<ProviderStatus, 'name'>> {
  const result = await safeSpawn(command, args, {
    cwd: process.cwd(),
    timeoutSeconds: PROBE_TIMEOUT_SECONDS,
    maxChars: 4_000,
  });
  const detail = (result.stderr || result.stdout || '').trim().split(/\r?\n/).slice(0, 3).join(' ');
  if (result.code === 0 || detail.length > 0) {
    return {
      availability: 'available',
      command,
      detail: detail || 'help ok',
      requiresNetwork: true,
    };
  }
  return {
    availability: 'unavailable',
    command,
    detail: detail || `exit ${result.code}`,
    requiresNetwork: true,
  };
}

export class MockAiProvider implements AiProvider {
  readonly name = 'mock' as const;
  readonly requiresNetwork = false;
  private readonly responder: (request: AgentRequest) => AgentResult;

  constructor(responder?: (request: AgentRequest) => AgentResult) {
    this.responder =
      responder ??
      ((request) => ({
        ok: true,
        provider: 'mock',
        raw: '{"mock":true}',
        data: { mock: true, promptLength: request.prompt.length },
      }));
  }

  async probe(): Promise<ProviderStatus> {
    return {
      name: 'mock',
      availability: 'available',
      command: 'mock',
      detail: 'in-process mock provider',
      requiresNetwork: false,
    };
  }

  async run(request: AgentRequest): Promise<AgentResult> {
    if (request.signal?.aborted) {
      return { ok: false, provider: 'mock', raw: '', error: 'aborted' };
    }
    return this.responder(request);
  }
}

export class CodexAiProvider implements AiProvider {
  readonly name = 'codex' as const;
  readonly requiresNetwork = true;
  private readonly config: AiConfig;

  constructor(config: AiConfig) {
    this.config = config;
  }

  private settings() {
    return resolveProviderConfig<{
      command?: string;
      model?: string;
      sandbox?: CodexSandbox;
      approval?: CodexApproval;
      timeoutSeconds?: number;
    }>(this.config, 'codex');
  }

  command(): string {
    return (
      this.settings().command ??
      process.env['DARE_CODEX_COMMAND'] ??
      process.env['DARE_AI_CODEX_COMMAND'] ??
      'codex'
    );
  }

  async probe(): Promise<ProviderStatus> {
    const probe = await probeCli(this.command());
    return { ...probe, name: 'codex' };
  }

  async run(request: AgentRequest): Promise<AgentResult> {
    const settings = this.settings();
    const command = this.command();
    const prompt = request.prompt + schemaInstruction(request.schema);
    const timeoutSeconds = request.timeoutSeconds ?? settings.timeoutSeconds ?? DEFAULT_RUN_TIMEOUT_SECONDS;

    const argv = [
      'exec',
      '--json',
      '--sandbox',
      settings.sandbox ?? 'workspace-write',
      '--ask-for-approval',
      settings.approval ?? 'never',
    ];
    if (settings.model?.trim()) argv.push('--model', settings.model.trim());
    argv.push(prompt);

    const result = await safeSpawn(command, argv, {
      cwd: request.cwd,
      timeoutSeconds,
      maxChars: 400_000,
    });

    if (request.signal?.aborted) {
      return { ok: false, provider: 'codex', raw: result.stdout, error: 'aborted' };
    }

    let summary = '';
    let inputTokens = 0;
    let outputTokens = 0;
    for (const line of result.stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as {
          type?: string;
          item?: { type?: string; text?: string };
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
          summary = event.item.text?.trim() ?? summary;
        }
        if (event.type === 'turn.completed' && event.usage) {
          inputTokens = event.usage.input_tokens ?? inputTokens;
          outputTokens = event.usage.output_tokens ?? outputTokens;
        }
      } catch {
        // ignore non-json lines
      }
    }

    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout || 'codex exec failed').trim();
      return {
        ok: false,
        provider: 'codex',
        raw: detail,
        error: detail.split(/\r?\n/).slice(0, 5).join('\n'),
        inputTokens,
        outputTokens,
      };
    }

    try {
      const data = extractJsonObject(summary);
      return {
        ok: true,
        provider: 'codex',
        raw: summary,
        data,
        inputTokens,
        outputTokens,
      };
    } catch (err) {
      return {
        ok: false,
        provider: 'codex',
        raw: summary,
        error: err instanceof Error ? err.message : String(err),
        inputTokens,
        outputTokens,
      };
    }
  }
}

export class ClaudeCodeAiProvider implements AiProvider {
  readonly name = 'claude-code' as const;
  readonly requiresNetwork = true;
  private readonly config: AiConfig;

  constructor(config: AiConfig) {
    this.config = config;
  }

  private settings() {
    return resolveProviderConfig<{
      command?: string;
      model?: string;
      timeoutSeconds?: number;
    }>(this.config, 'claude-code');
  }

  command(): string {
    return (
      this.settings().command ??
      process.env['DARE_CLAUDE_COMMAND'] ??
      process.env['DARE_AI_CLAUDE_COMMAND'] ??
      'claude'
    );
  }

  async probe(): Promise<ProviderStatus> {
    const probe = await probeCli(this.command());
    return { ...probe, name: 'claude-code' };
  }

  async run(request: AgentRequest): Promise<AgentResult> {
    const settings = this.settings();
    const command = this.command();
    const timeoutSeconds = request.timeoutSeconds ?? settings.timeoutSeconds ?? DEFAULT_RUN_TIMEOUT_SECONDS;
    const prompt = request.prompt + schemaInstruction(request.schema);

    const argv = ['-p', prompt, '--output-format', 'json'];
    if (settings.model?.trim()) argv.push('--model', settings.model.trim());
    if (request.schema) argv.push('--json-schema', JSON.stringify(request.schema));

    const result = await safeSpawn(command, argv, {
      cwd: request.cwd,
      timeoutSeconds,
      maxChars: 400_000,
    });

    if (request.signal?.aborted) {
      return { ok: false, provider: 'claude-code', raw: result.stdout, error: 'aborted' };
    }

    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout || 'claude -p failed').trim();
      return { ok: false, provider: 'claude-code', raw: detail, error: detail.split(/\r?\n/)[0] };
    }

    try {
      const envelope = JSON.parse(result.stdout.trim()) as { result?: string; content?: string };
      const body = envelope.result ?? envelope.content ?? result.stdout;
      const data = extractJsonObject(typeof body === 'string' ? body : JSON.stringify(body));
      return { ok: true, provider: 'claude-code', raw: result.stdout, data };
    } catch {
      try {
        const data = extractJsonObject(result.stdout);
        return { ok: true, provider: 'claude-code', raw: result.stdout, data };
      } catch (err) {
        return {
          ok: false,
          provider: 'claude-code',
          raw: result.stdout,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }
}

abstract class GenericCliAiProvider implements AiProvider {
  abstract readonly name: AiProviderName;
  readonly requiresNetwork = true;
  protected readonly config: AiConfig;
  protected abstract configKey: 'cursor-cli' | 'antigravity-cli';
  protected abstract defaultCommand: string;
  protected abstract envKeys: readonly string[];

  constructor(config: AiConfig) {
    this.config = config;
  }

  command(): string {
    const settings = resolveProviderConfig<{ command?: string }>(this.config, this.configKey);
    if (settings.command?.trim()) return settings.command.trim();
    for (const key of this.envKeys) {
      const value = process.env[key];
      if (value?.trim()) return value.trim();
    }
    return this.defaultCommand;
  }

  async probe(): Promise<ProviderStatus> {
    const probe = await probeCli(this.command());
    return { ...probe, name: this.name };
  }

  async run(request: AgentRequest): Promise<AgentResult> {
    const settings = resolveProviderConfig<{ timeoutSeconds?: number }>(
      this.config,
      this.configKey,
    );
    const command = this.command();
    const timeoutSeconds = request.timeoutSeconds ?? settings.timeoutSeconds ?? DEFAULT_RUN_TIMEOUT_SECONDS;
    const prompt = request.prompt + schemaInstruction(request.schema);

    const argv = ['-p', prompt, '--output-format', 'json'];
    if (request.schema) argv.push('--json-schema', JSON.stringify(request.schema));

    const result = await safeSpawn(command, argv, {
      cwd: request.cwd,
      timeoutSeconds,
      maxChars: 400_000,
    });

    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout || `${command} failed`).trim();
      return { ok: false, provider: this.name, raw: detail, error: detail.split(/\r?\n/)[0] };
    }

    try {
      const data = extractJsonObject(result.stdout);
      return { ok: true, provider: this.name, raw: result.stdout, data };
    } catch (err) {
      return {
        ok: false,
        provider: this.name,
        raw: result.stdout,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export class CursorCliAiProvider extends GenericCliAiProvider {
  readonly name = 'cursor-cli' as const;
  protected configKey = 'cursor-cli' as const;
  protected defaultCommand = 'cursor-agent';
  protected envKeys = ['DARE_CURSOR_COMMAND', 'DARE_AI_CURSOR_COMMAND'] as const;
}

export class AntigravityCliAiProvider extends GenericCliAiProvider {
  readonly name = 'antigravity-cli' as const;
  protected configKey = 'antigravity-cli' as const;
  protected defaultCommand = 'antigravity';
  protected envKeys = ['DARE_ANTIGRAVITY_COMMAND', 'DARE_AI_ANTIGRAVITY_COMMAND'] as const;
}

export function createCodexDriverFromAiConfig(config: AiConfig) {
  const settings = resolveProviderConfig<{
    command?: string;
    model?: string;
    sandbox?: CodexSandbox;
    approval?: CodexApproval;
    timeoutSeconds?: number;
  }>(config, 'codex');
  return createCodexCliDriver(settings);
}
