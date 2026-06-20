import { spawn } from 'node:child_process';

export interface SafeSpawnResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface SafeSpawnOptions {
  cwd: string;
  timeoutSeconds: number;
  maxChars?: number;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_MAX_CHARS = 4000;

const SECRET_KEY_PATTERN =
  /(SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|API_KEY|AUTH|PRIVATE)/i;

const ENV_ALLOWLIST = new Set([
  'PATH',
  'PATHEXT',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'APPDATA',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'NODE_ENV',
  'DARE_LOG_LEVEL',
  'SystemRoot',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'ProgramW6432',
]);

function isGitConfigEnv(key: string): boolean {
  return (
    key === 'GIT_CONFIG_COUNT' ||
    /^GIT_CONFIG_KEY_\d+$/.test(key) ||
    /^GIT_CONFIG_VALUE_\d+$/.test(key)
  );
}

function appendCapped(buffer: string, chunk: string, max: number): string {
  if (buffer.length >= max) return buffer;
  return (buffer + chunk).slice(0, max);
}

/**
 * Remove env vars that look like secrets before passing to child processes (RS-02).
 */
export function sanitizeEnv(
  base: NodeJS.ProcessEnv | undefined,
): NodeJS.ProcessEnv {
  const source = base ?? process.env;
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (ENV_ALLOWLIST.has(key) || isGitConfigEnv(key)) {
      out[key] = value;
      continue;
    }
    if (SECRET_KEY_PATTERN.test(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Spawn with argv (shell:false), sanitized env, timeout and capped output (RS-06).
 */
export async function safeSpawn(
  command: string,
  args: ReadonlyArray<string>,
  opts: SafeSpawnOptions,
): Promise<SafeSpawnResult> {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const env = sanitizeEnv(opts.env);

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(command, [...args], {
        cwd: opts.cwd,
        shell: false,
        env,
      });
    } catch (err) {
      resolve({
        code: 1,
        stdout: '',
        stderr: `spawn error: ${err instanceof Error ? err.message : String(err)}`,
        timedOut: false,
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    proc.stdout?.on('data', (chunk: Buffer | string) => {
      stdout = appendCapped(stdout, chunk.toString(), maxChars);
    });
    proc.stderr?.on('data', (chunk: Buffer | string) => {
      stderr = appendCapped(stderr, chunk.toString(), maxChars);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      stderr = appendCapped(
        stderr,
        `\n[safe-spawn] timed out after ${opts.timeoutSeconds}s`,
        maxChars,
      );
    }, opts.timeoutSeconds * 1000);

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        code: 1,
        stdout,
        stderr: appendCapped(stderr, `spawn error: ${err.message}`, maxChars),
        timedOut,
      });
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      const exitCode = code ?? 0;
      resolve({
        code: timedOut && exitCode === 0 ? 124 : exitCode,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}
