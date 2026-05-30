/**
 * Module detector for `dare reverse`.
 *
 * Reconstructs a brownfield codebase's module map without an AST: it picks
 * module boundaries via a cascade (workspaces → convention dirs → `src/`
 * subdirs → top-level fallback), measures each module (files / LOC / size
 * bucket), and infers a module-to-module dependency graph from import
 * statements. Line/regex-based on purpose — same trade-off as the rest of the
 * CLI (ships across TS/Rust/Python/PHP/Go without a per-language AST stack).
 *
 * The graph is a *visual hint* the human validates at the IDEIA checkpoint,
 * not a contract — so a fuzzy edge is acceptable; a crash is not.
 *
 * License: MIT (part of DARE CLI).
 */

import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { isTestFile } from './static-analyzer.js';

export type SizeBucket = 'LOW' | 'MED' | 'HIGH';

export interface ModuleInfo {
  /** Stable kebab id derived from the module path. */
  id: string;
  /** Display name (last path segment). */
  name: string;
  /** Path relative to the project root (POSIX separators). */
  path: string;
  /** Code files in the module, relative to root (POSIX separators). */
  files: string[];
  fileCount: number;
  testFileCount: number;
  loc: number;
  size: SizeBucket;
  /** Distinct file extensions present (e.g. ['.ts', '.tsx']). */
  languages: string[];
  /** Ids of sibling modules this module imports from. */
  depends_on: string[];
}

export interface ModuleGraph {
  root: string;
  /** How module boundaries were chosen — surfaced to the user for transparency. */
  strategy: string;
  modules: ModuleInfo[];
}

// ── Config ────────────────────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.next',
  'coverage', '.turbo', 'out', '__pycache__', '.venv', 'venv', '.idea',
  '.vscode', '.cache', 'tmp', '.dart_tool', 'Pods', 'DerivedData',
]);

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go',
  '.php', '.rb', '.java', '.kt', '.cs', '.swift', '.vue', '.svelte',
]);

/** LOC thresholds for the size bucket (drives the diagram color legend). */
const SIZE_THRESHOLDS = { low: 400, high: 2000 };

/** Conventional directories whose immediate subdirectories are modules. */
const CONVENTION_ROOTS = [
  'src/modules', 'src/features', 'src/domains', 'src/packages',
  'app/Modules', 'app/Domains', 'apps', 'services', 'packages', 'crates', 'libs',
];

// ── Public API ──────────────────────────────────────────────────────────────

export interface DetectModulesOptions {
  /** Restrict the result to these module ids/names (the `--modules` flag). */
  only?: string[];
}

export async function detectModules(
  root: string,
  opts: DetectModulesOptions = {},
): Promise<ModuleGraph> {
  const { dirs, strategy } = await pickModuleDirs(root);

  let modules: ModuleInfo[] = [];
  for (const relDir of dirs) {
    const mod = await analyzeModule(root, relDir);
    if (mod && mod.fileCount > 0) modules.push(mod);
  }

  // Whole-project fallback when the cascade found nothing useful.
  if (modules.length === 0) {
    const whole = await analyzeModule(root, '.');
    if (whole && whole.fileCount > 0) modules = [whole];
  }

  await resolveDependencies(root, modules);

  if (opts.only && opts.only.length > 0) {
    const wanted = new Set(opts.only.map((s) => s.toLowerCase()));
    modules = modules.filter(
      (m) => wanted.has(m.id.toLowerCase()) || wanted.has(m.name.toLowerCase()),
    );
    // Drop edges pointing at filtered-out modules.
    const present = new Set(modules.map((m) => m.id));
    for (const m of modules) m.depends_on = m.depends_on.filter((d) => present.has(d));
  }

  return { root, strategy, modules };
}

// ── Boundary selection (the cascade) ───────────────────────────────────────────

async function pickModuleDirs(
  root: string,
): Promise<{ dirs: string[]; strategy: string }> {
  // 1. Declared workspaces (strongest signal).
  const ws = await workspaceGlobs(root);
  if (ws.patterns.length > 0) {
    const dirs: string[] = [];
    for (const p of ws.patterns) dirs.push(...(await expandGlob(root, p)));
    const real = await keepDirsWithCode(root, dedup(dirs));
    if (real.length > 0) return { dirs: real, strategy: ws.strategy };
  }

  // 2. Convention directories: first one that exists → its subdirs are modules.
  for (const conv of CONVENTION_ROOTS) {
    const abs = path.join(root, conv);
    if (await isDir(abs)) {
      const subdirs = await childDirs(abs, root);
      const real = await keepDirsWithCode(root, subdirs);
      if (real.length > 0) return { dirs: real, strategy: `convention:${conv}/*` };
    }
  }

  // 3. `src/` subdirectories.
  const srcAbs = path.join(root, 'src');
  if (await isDir(srcAbs)) {
    const subdirs = await childDirs(srcAbs, root);
    const real = await keepDirsWithCode(root, subdirs);
    if (real.length >= 2) return { dirs: real, strategy: 'src-subdirs' };
  }

  // 4. Top-level directories of the repo.
  const topDirs = await childDirs(root, root);
  const real = await keepDirsWithCode(root, topDirs);
  if (real.length > 0) return { dirs: real, strategy: 'top-level' };

  return { dirs: [], strategy: 'whole-project' };
}

interface WorkspaceGlobs {
  patterns: string[];
  strategy: string;
}

async function workspaceGlobs(root: string): Promise<WorkspaceGlobs> {
  // pnpm
  const pnpmPath = path.join(root, 'pnpm-workspace.yaml');
  if (await fs.pathExists(pnpmPath)) {
    try {
      const doc = yaml.load(await fs.readFile(pnpmPath, 'utf-8')) as {
        packages?: string[];
      };
      if (Array.isArray(doc?.packages)) {
        return { patterns: doc.packages, strategy: 'pnpm-workspace' };
      }
    } catch {
      /* fall through */
    }
  }

  // npm / yarn workspaces in package.json
  const pkgPath = path.join(root, 'package.json');
  if (await fs.pathExists(pkgPath)) {
    const pkg = await fs.readJSON(pkgPath).catch(() => ({}));
    const ws = pkg.workspaces;
    const patterns = Array.isArray(ws) ? ws : Array.isArray(ws?.packages) ? ws.packages : [];
    if (patterns.length > 0) return { patterns, strategy: 'npm-workspaces' };
  }

  // Cargo workspace members
  const cargoPath = path.join(root, 'Cargo.toml');
  if (await fs.pathExists(cargoPath)) {
    const content = await fs.readFile(cargoPath, 'utf-8').catch(() => '');
    const m = /\[workspace\][\s\S]*?members\s*=\s*\[([^\]]*)\]/.exec(content);
    if (m) {
      const patterns = [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
      if (patterns.length > 0) return { patterns, strategy: 'cargo-workspace' };
    }
  }

  return { patterns: [], strategy: '' };
}

/** Expand a workspace glob with a single `*` segment (e.g. `packages/*`). */
async function expandGlob(root: string, pattern: string): Promise<string[]> {
  const clean = pattern.replace(/\\/g, '/').replace(/\/$/, '');
  const parts = clean.split('/');
  const starIdx = parts.findIndex((p) => p.includes('*'));

  if (starIdx === -1) {
    // Literal path.
    return (await isDir(path.join(root, clean))) ? [clean] : [];
  }

  const baseRel = parts.slice(0, starIdx).join('/');
  const rest = parts.slice(starIdx + 1);
  const baseAbs = path.join(root, baseRel);
  if (!(await isDir(baseAbs))) return [];

  const out: string[] = [];
  for (const child of await childNames(baseAbs)) {
    const candidateRel = [baseRel, child, ...rest].filter(Boolean).join('/');
    if (await isDir(path.join(root, candidateRel))) out.push(candidateRel);
  }
  return out;
}

// ── Per-module analysis ────────────────────────────────────────────────────────

async function analyzeModule(root: string, relDir: string): Promise<ModuleInfo | null> {
  const absDir = path.join(root, relDir);
  if (!(await isDir(absDir))) return null;

  const files = await walkCodeFiles(absDir, root);
  if (files.length === 0) return null;

  let loc = 0;
  let testFileCount = 0;
  const exts = new Set<string>();
  for (const rel of files) {
    if (isTestFile(rel)) testFileCount++;
    exts.add(path.extname(rel));
    loc += await countLines(path.join(root, rel));
  }

  const name = relDir === '.' ? path.basename(root) : path.basename(relDir);
  return {
    id: toId(relDir, root),
    name,
    path: toPosix(relDir),
    files,
    fileCount: files.length,
    testFileCount,
    loc,
    size: bucketForLoc(loc),
    languages: [...exts].sort(),
    depends_on: [],
  };
}

function bucketForLoc(loc: number): SizeBucket {
  if (loc < SIZE_THRESHOLDS.low) return 'LOW';
  if (loc > SIZE_THRESHOLDS.high) return 'HIGH';
  return 'MED';
}

// ── Dependency inference ───────────────────────────────────────────────────────

const IMPORT_PATTERNS: RegExp[] = [
  /\bimport\b[^'"`]*?from\s*['"`]([^'"`]+)['"`]/g, // ES import ... from '...'
  /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g, // dynamic import('...')
  /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g, // CommonJS require('...')
  /\bexport\b[^'"`]*?from\s*['"`]([^'"`]+)['"`]/g, // re-export ... from '...'
  /\bfrom\s+([.\w]+)\s+import\b/g, // Python from x import y
];

async function resolveDependencies(root: string, modules: ModuleInfo[]): Promise<void> {
  // Map workspace package names → module id (for bare-specifier imports).
  const pkgNameToId = new Map<string, string>();
  for (const m of modules) {
    const pkgJson = path.join(root, m.path, 'package.json');
    if (await fs.pathExists(pkgJson)) {
      const pkg = await fs.readJSON(pkgJson).catch(() => ({}));
      if (typeof pkg.name === 'string') pkgNameToId.set(pkg.name, m.id);
    }
  }

  // Sort module paths longest-first so prefix matching picks the deepest module.
  const byPathDesc = [...modules].sort((a, b) => b.path.length - a.path.length);
  const findModuleByPath = (relPath: string): ModuleInfo | undefined => {
    const norm = toPosix(relPath);
    return byPathDesc.find(
      (m) => m.path !== '.' && (norm === m.path || norm.startsWith(m.path + '/')),
    );
  };

  for (const mod of modules) {
    const deps = new Set<string>();
    for (const rel of mod.files) {
      const specs = await extractImports(path.join(root, rel));
      for (const spec of specs) {
        const target = resolveSpec(spec, rel, root, pkgNameToId, findModuleByPath);
        if (target && target !== mod.id) deps.add(target);
      }
    }
    mod.depends_on = [...deps].sort();
  }
}

function resolveSpec(
  spec: string,
  fromRel: string,
  root: string,
  pkgNameToId: Map<string, string>,
  findModuleByPath: (relPath: string) => ModuleInfo | undefined,
): string | null {
  // Relative import → resolve against the importing file's directory.
  if (spec.startsWith('.')) {
    const abs = path.resolve(path.dirname(path.join(root, fromRel)), spec);
    const rel = path.relative(root, abs);
    if (rel.startsWith('..')) return null; // escapes the project
    return findModuleByPath(rel)?.id ?? null;
  }
  // Bare specifier matching a workspace package name.
  if (pkgNameToId.has(spec)) return pkgNameToId.get(spec)!;
  // Scoped/sub-path package (e.g. `@scope/pkg/sub`) → try the package root.
  for (const [pkgName, id] of pkgNameToId) {
    if (spec === pkgName || spec.startsWith(pkgName + '/')) return id;
  }
  return null;
}

async function extractImports(absFile: string): Promise<string[]> {
  const content = await fs.readFile(absFile, 'utf-8').catch(() => '');
  if (!content) return [];
  const specs: string[] = [];
  for (const re of IMPORT_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m[1]) specs.push(m[1]);
    }
  }
  return specs;
}

// ── Filesystem helpers ─────────────────────────────────────────────────────────

async function walkCodeFiles(absDir: string, root: string): Promise<string[]> {
  const out: string[] = [];
  async function recurse(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })) as fs.Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        await recurse(path.join(dir, entry.name));
      } else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))) {
        out.push(toPosix(path.relative(root, path.join(dir, entry.name))));
      }
    }
  }
  await recurse(absDir);
  return out.sort();
}

async function countLines(absFile: string): Promise<number> {
  const content = await fs.readFile(absFile, 'utf-8').catch(() => '');
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

async function childDirs(absDir: string, root: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of await childNames(absDir)) {
    out.push(toPosix(path.relative(root, path.join(absDir, name))));
  }
  return out;
}

async function childNames(absDir: string): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = (await fs.readdir(absDir, { withFileTypes: true })) as fs.Dirent[];
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !IGNORE_DIRS.has(e.name) && !e.name.startsWith('.'))
    .map((e) => e.name);
}

async function keepDirsWithCode(root: string, relDirs: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const rel of relDirs) {
    const files = await walkCodeFiles(path.join(root, rel), root);
    if (files.length > 0) out.push(rel);
  }
  return out;
}

async function isDir(abs: string): Promise<boolean> {
  try {
    return (await fs.stat(abs)).isDirectory();
  } catch {
    return false;
  }
}

// ── Misc helpers ────────────────────────────────────────────────────────────────

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

function toId(relDir: string, root: string): string {
  const base = relDir === '.' ? path.basename(root) : relDir;
  return toPosix(base)
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function dedup(arr: string[]): string[] {
  return [...new Set(arr)];
}
