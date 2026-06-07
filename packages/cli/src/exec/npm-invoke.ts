import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'fs-extra';

function findNpmOnPath(): { npmCli: string; nodeBin: string } | undefined {
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
  for (const dir of (process.env[pathKey] ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const nodeBin = path.join(
      dir,
      process.platform === 'win32' ? 'node.exe' : 'node',
    );
    const npmCli = path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (fs.existsSync(nodeBin) && fs.existsSync(npmCli)) {
      return { npmCli, nodeBin };
    }
  }
  return undefined;
}

/**
 * Invoke npm via node + npm-cli.js (RS-06: argv spawn, no .cmd wrapper on Windows).
 */
export function npmInvoke(
  subargs: string[],
): { command: string; args: string[] } {
  const fromPath = findNpmOnPath();
  if (fromPath) {
    return {
      command: fromPath.nodeBin,
      args: [fromPath.npmCli, ...subargs],
    };
  }

  const require = createRequire(import.meta.url);
  try {
    const npmCli = require.resolve('npm/bin/npm-cli.js');
    const nodeRoot = path.resolve(path.dirname(npmCli), '..', '..', '..');
    const nodeBin = path.join(
      nodeRoot,
      process.platform === 'win32' ? 'node.exe' : 'node',
    );
    return {
      command: fs.existsSync(nodeBin) ? nodeBin : process.execPath,
      args: [npmCli, ...subargs],
    };
  } catch {
    return {
      command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args: subargs,
    };
  }
}
