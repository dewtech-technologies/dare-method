import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'node:path';
import {
  defaultGuardConfigForProject,
  parseGuardConfig,
  type GuardConfig,
} from '../guard/config.js';
import { runGuardPipeline } from '../guard/pipeline.js';
import { classify, signArtifact } from '../guard/provenance.js';
import type { GuardResult } from '../guard/types.js';
import { safeSpawn } from '../exec/safe-spawn.js';

type UnicodeMode = 'strip' | 'block';
type OutputFormat = 'human' | 'json';

interface GuardCommandOptions {
  staged?: boolean;
  all?: boolean;
  strict?: boolean;
  format?: string;
  sign?: boolean;
  unicode?: string;
}

export interface RunGuardOptions {
  readonly cwd?: string;
  readonly unicode: UnicodeMode;
  readonly guardConfig: GuardConfig;
}

interface ResolveTargetsArgs {
  readonly cwd: string;
  readonly target?: string;
  readonly staged: boolean;
  readonly all: boolean;
  readonly trustedPaths: ReadonlyArray<string>;
}

const GUARD_FAIL_EXIT_CODE = 6;
const DARE_ARTIFACT_ROOTS = ['DARE', '.dare'];
const DARE_ARTIFACT_PREFIXES = ['DARE/', '.dare/'];
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist']);

function normalizeProjectPath(rawPath: string): string {
  return rawPath
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '');
}

function isUnicodeMode(value: string | undefined): value is UnicodeMode {
  return value === 'strip' || value === 'block';
}

function parseOutputFormat(value: string | undefined): OutputFormat | null {
  if (!value || value === 'human') return 'human';
  if (value === 'json') return 'json';
  return null;
}

function isWithinProject(cwd: string, absPath: string): boolean {
  const relative = path.relative(cwd, absPath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function findPatternRoot(pattern: string): string {
  const normalized = normalizeProjectPath(pattern);
  const wildcardIdx = normalized.search(/[\*\?]/);
  if (wildcardIdx < 0) {
    return normalized;
  }
  const prefix = normalized.slice(0, wildcardIdx).replace(/\/+$/, '');
  return prefix.length > 0 ? prefix : '.';
}

function matchesPathPattern(filePath: string, pattern: string): boolean {
  const normalizedPath = normalizeProjectPath(filePath);
  const normalizedPattern = normalizeProjectPath(pattern);
  const hasWildcard = normalizedPattern.includes('*');

  if (!hasWildcard) {
    return (
      normalizedPath === normalizedPattern ||
      normalizedPath.endsWith(`/${normalizedPattern}`)
    );
  }

  const source = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*');
  const regex = new RegExp(`^(?:.*/)?${source}$`);
  return regex.test(normalizedPath);
}

async function collectFilesRecursive(absRoot: string): Promise<string[]> {
  const files: string[] = [];
  const stack: string[] = [absRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    const stat = await fs.stat(current);
    if (stat.isFile()) {
      files.push(current);
      continue;
    }
    if (!stat.isDirectory()) continue;

    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;
      stack.push(path.join(current, entry.name));
    }
  }

  return files;
}

async function expandPathTarget(cwd: string, target: string): Promise<string[]> {
  const absTarget = path.resolve(cwd, target);
  if (!isWithinProject(cwd, absTarget) && absTarget !== cwd) {
    throw new Error('target path must stay within the project root');
  }
  if (!(await fs.pathExists(absTarget))) {
    throw new Error(`target not found: ${target}`);
  }
  const files = await collectFilesRecursive(absTarget);
  return files.map((absFile) => normalizeProjectPath(path.relative(cwd, absFile)));
}

async function resolveStagedTargets(cwd: string): Promise<string[]> {
  const result = await safeSpawn('git', ['diff', '--cached', '--name-only'], {
    cwd,
    timeoutSeconds: 30,
    maxChars: 500_000,
  });
  if (result.code !== 0) {
    throw new Error(
      `unable to list staged files: ${result.stderr.trim() || 'git diff failed'}`,
    );
  }

  const stagedFiles = result.stdout
    .split('\n')
    .map((line) => normalizeProjectPath(line.trim()))
    .filter((line) => line.length > 0);

  const existing: string[] = [];
  for (const relPath of stagedFiles) {
    const absPath = path.resolve(cwd, relPath);
    if (!(await fs.pathExists(absPath))) continue;
    const stat = await fs.stat(absPath);
    if (stat.isFile()) existing.push(relPath);
  }
  return existing;
}

function isDareArtifact(relPath: string): boolean {
  return DARE_ARTIFACT_PREFIXES.some(
    (prefix) => relPath === prefix.slice(0, -1) || relPath.startsWith(prefix),
  );
}

async function resolveAllTargets(
  cwd: string,
  trustedPaths: ReadonlyArray<string>,
): Promise<string[]> {
  const roots = new Set<string>(DARE_ARTIFACT_ROOTS);
  for (const trusted of trustedPaths) {
    roots.add(findPatternRoot(trusted));
  }

  const candidates = new Set<string>();
  for (const root of roots) {
    const absRoot = path.resolve(cwd, root);
    if (!(await fs.pathExists(absRoot))) continue;
    const files = await collectFilesRecursive(absRoot);
    for (const file of files) {
      if (!isWithinProject(cwd, file)) continue;
      candidates.add(normalizeProjectPath(path.relative(cwd, file)));
    }
  }

  const selected = [...candidates].filter((file) => {
    if (isDareArtifact(file)) return true;
    return trustedPaths.some((pattern) => matchesPathPattern(file, pattern));
  });
  selected.sort((a, b) => a.localeCompare(b));
  return selected;
}

async function resolveTargets(args: ResolveTargetsArgs): Promise<string[]> {
  const unique = new Set<string>();

  if (args.staged) {
    for (const file of await resolveStagedTargets(args.cwd)) unique.add(file);
    return [...unique];
  }

  if (args.all) {
    for (const file of await resolveAllTargets(args.cwd, args.trustedPaths)) {
      unique.add(file);
    }
    return [...unique];
  }

  if (!args.target) return [];
  for (const file of await expandPathTarget(args.cwd, args.target)) unique.add(file);
  return [...unique];
}

function computeExitCode(
  results: ReadonlyArray<GuardResult>,
  strict: boolean,
): number {
  const hasFail = results.some((result) => result.verdict === 'FAIL');
  if (hasFail) return GUARD_FAIL_EXIT_CODE;
  const hasWarn = results.some((result) => result.verdict === 'WARN');
  if (strict && hasWarn) return GUARD_FAIL_EXIT_CODE;
  return 0;
}

function printHumanReport(
  results: ReadonlyArray<GuardResult>,
  options: { readonly strict: boolean; readonly unicodeMode: UnicodeMode },
): void {
  console.log(chalk.blue.bold('\n🛡️  DARE Guard\n'));
  console.log(chalk.gray(`  unicode mode: ${options.unicodeMode}`));
  console.log(chalk.gray(`  strict mode : ${options.strict}`));
  console.log(chalk.gray(`  artifacts   : ${results.length}\n`));

  if (results.length === 0) {
    console.log(chalk.yellow('⚠  No artifacts selected for guard scan.\n'));
    return;
  }

  for (const result of results) {
    const status =
      result.verdict === 'FAIL'
        ? chalk.red('FAIL')
        : result.verdict === 'WARN'
          ? chalk.yellow('WARN')
          : chalk.green('PASS');
    console.log(`${status} ${chalk.cyan(result.artifact)}`);
    if (result.findings.length === 0) continue;
    for (const finding of result.findings) {
      const severity =
        finding.severity === 'FAIL' ? chalk.red('FAIL') : chalk.yellow('WARN');
      console.log(
        `  - ${severity} [${finding.layer}:${finding.rule}] ${finding.evidence}`,
      );
    }
  }

  const failCount = results.filter((result) => result.verdict === 'FAIL').length;
  const warnCount = results.filter((result) => result.verdict === 'WARN').length;
  const passCount = results.filter((result) => result.verdict === 'PASS').length;
  console.log(
    chalk.gray(
      `\nSummary: ${passCount} PASS, ${warnCount} WARN, ${failCount} FAIL`,
    ),
  );
}

async function resolvePrivateSigningKey(cwd: string): Promise<string> {
  const raw = process.env.DARE_GUARD_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error(
      '--sign requires DARE_GUARD_PRIVATE_KEY (PEM content or key file path)',
    );
  }

  if (raw.includes('BEGIN PRIVATE KEY')) return raw;
  const absPath = path.resolve(cwd, raw);
  if (!(await fs.pathExists(absPath))) {
    throw new Error(`--sign private key not found: ${raw}`);
  }
  return fs.readFile(absPath, 'utf8');
}

async function signTargets(args: {
  readonly cwd: string;
  readonly targets: ReadonlyArray<string>;
  readonly guardConfig: GuardConfig;
}): Promise<number> {
  const privateKeyPem = await resolvePrivateSigningKey(args.cwd);
  let signedCount = 0;

  for (const artifact of args.targets) {
    const cls = classify(artifact, args.guardConfig);
    if (cls.channel !== 'control') continue;

    const absPath = path.resolve(args.cwd, artifact);
    if (!(await fs.pathExists(absPath))) continue;
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) continue;

    const content = await fs.readFile(absPath);
    const signature = signArtifact(content, privateKeyPem);
    await fs.writeFile(`${absPath}.minisig`, `${signature}\n`, 'utf8');
    signedCount += 1;
  }

  return signedCount;
}

export async function runGuard(
  target: ReadonlyArray<string>,
  opts: RunGuardOptions,
): Promise<GuardResult[]> {
  const cwd = opts.cwd ?? process.cwd();
  const guardConfig: GuardConfig = { ...opts.guardConfig, unicode: opts.unicode };
  const results: GuardResult[] = [];

  for (const artifact of target) {
    const absPath = path.isAbsolute(artifact)
      ? artifact
      : path.resolve(cwd, artifact);
    if (!(await fs.pathExists(absPath))) continue;
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) continue;

    const content = await fs.readFile(absPath);
    const pipeline = runGuardPipeline(absPath, content, guardConfig, {
      cwd,
      boundaryIntent: 'read',
    });
    results.push(pipeline.result);
  }

  results.sort((a, b) => a.artifact.localeCompare(b.artifact));
  return results;
}

async function loadGuardConfig(cwd: string): Promise<GuardConfig> {
  const configPath = path.join(cwd, 'dare.config.json');
  if (!(await fs.pathExists(configPath))) {
    return defaultGuardConfigForProject();
  }
  const raw = (await fs.readJson(configPath)) as unknown;
  return parseGuardConfig(raw);
}

export const guardCommand = new Command('guard')
  .description('Run unicode + heuristic guard scans against project artifacts')
  .argument('[target]', 'File or directory to scan')
  .option('--staged', 'Scan staged files from git index', false)
  .option('--all', 'Scan trusted paths and DARE artifacts', false)
  .option('--strict', 'Treat WARN as FAIL for exit code', false)
  .option('--format <fmt>', 'Output format: human | json', 'human')
  .option('--sign', 'Sign trusted artifacts and emit .minisig files', false)
  .option('--unicode <mode>', 'Unicode mode override: strip | block')
  .action(async (target: string | undefined, options: GuardCommandOptions) => {
    const cwd = process.cwd();
    const selectors = Number(Boolean(target)) + Number(options.staged) + Number(options.all);
    if (selectors !== 1) {
      console.error('Error: choose exactly one target selector: <path> | --staged | --all');
      process.exit(1);
    }

    const format = parseOutputFormat(options.format);
    if (!format) {
      console.error(`Error: --format must be "human" or "json" (got "${options.format}")`);
      process.exit(1);
    }

    if (options.unicode && !isUnicodeMode(options.unicode)) {
      console.error(
        `Error: --unicode must be "strip" or "block" (got "${options.unicode}")`,
      );
      process.exit(1);
    }

    let unicodeMode: UnicodeMode;
    let guardConfig: GuardConfig;
    let results: GuardResult[];
    try {
      guardConfig = await loadGuardConfig(cwd);
      unicodeMode =
        options.unicode && isUnicodeMode(options.unicode)
          ? options.unicode
          : guardConfig.unicode;
      const targets = await resolveTargets({
        cwd,
        target,
        staged: Boolean(options.staged),
        all: Boolean(options.all),
        trustedPaths: guardConfig.trustedPaths,
      });
      if (options.sign) {
        const signedCount = await signTargets({
          cwd,
          targets,
          guardConfig,
        });
        console.log(chalk.gray(`ℹ signed ${signedCount} trusted artifact(s).`));
      }
      results = await runGuard(targets, {
        cwd,
        unicode: unicodeMode,
        guardConfig,
      });
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
      return;
    }

    if (format === 'json') {
      console.log(JSON.stringify(results));
    } else {
      printHumanReport(results, {
        strict: Boolean(options.strict),
        unicodeMode,
      });
    }

    process.exit(computeExitCode(results, Boolean(options.strict)));
  });
