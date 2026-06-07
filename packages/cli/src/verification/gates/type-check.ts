import path from 'node:path';
import fs from 'fs-extra';
import { safeSpawn } from '../../exec/safe-spawn.js';
import { npmInvoke } from '../../exec/npm-invoke.js';
import { resolvePythonBin } from '../../dag-runner/ralph-loop.js';
import type { AspectResult } from '../types.js';

export function typeCommandFor(
  stack: string,
  cwd: string,
): { command: string; args: string[] } | null {
  switch (stack) {
    case 'node-nestjs':
    case 'react':
    case 'vue':
    case 'mcp-server-node-ts': {
      const npm = npmInvoke(['exec', 'tsc', '--noEmit']);
      return { command: npm.command, args: npm.args };
    }
    case 'python-fastapi':
    case 'mcp-server-python':
      return {
        command: resolvePythonBin(cwd, 'mypy'),
        args: ['.'],
      };
    case 'php-laravel': {
      const phpstan = path.join(cwd, 'vendor', 'bin', 'phpstan');
      const phpstanBat = `${phpstan}.bat`;
      if (fs.existsSync(phpstanBat)) return { command: phpstanBat, args: ['analyse'] };
      if (fs.existsSync(phpstan)) return { command: phpstan, args: ['analyse'] };
      return null;
    }
    default:
      return null;
  }
}

async function isToolPresent(
  command: string,
  cwd: string,
): Promise<boolean> {
  const result = await safeSpawn(command, ['--version'], {
    cwd,
    timeoutSeconds: 15,
    maxChars: 1000,
  });
  return result.code === 0;
}

export async function checkTypes(args: {
  readonly stack: string;
  readonly cwd: string;
  readonly timeoutSeconds: number;
}): Promise<AspectResult> {
  const start = Date.now();
  const cmd = typeCommandFor(args.stack, args.cwd);

  if (!cmd) {
    return {
      aspect: 'type',
      verdict: 'SKIP',
      reason: `no type-checker for ${args.stack}`,
      durationMs: Date.now() - start,
    };
  }

  if (
    (args.stack === 'python-fastapi' || args.stack === 'mcp-server-python') &&
    !(await isToolPresent(cmd.command, args.cwd))
  ) {
    return {
      aspect: 'type',
      verdict: 'SKIP',
      reason: 'mypy not available',
      durationMs: Date.now() - start,
    };
  }

  const result = await safeSpawn(cmd.command, cmd.args, {
    cwd: args.cwd,
    timeoutSeconds: args.timeoutSeconds,
    maxChars: 4000,
  });
  const durationMs = Date.now() - start;

  if (result.code === 0) {
    return {
      aspect: 'type',
      verdict: 'PASS',
      reason: 'type-check passed',
      durationMs,
    };
  }

  const detail = (result.stderr || result.stdout).trim().slice(0, 500);
  return {
    aspect: 'type',
    verdict: 'FAIL',
    reason: detail || `type-check failed (exit ${result.code})`,
    durationMs,
  };
}
