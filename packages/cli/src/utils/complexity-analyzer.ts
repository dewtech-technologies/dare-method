/**
 * Deterministic complexity heuristic for `dare refine`.
 *
 * Scans a task spec for signals that correlate with implementation effort
 * and aggregates them into a single score → bucket. The breakdown is
 * preserved so the CLI / agent can explain *why* a task scored high.
 *
 * Signals (weights tuned empirically — start conservative; bump as we learn):
 *   - Files to create/modify (1 each, cap at 10)
 *   - Public functions/endpoints declared in spec (1.5 each, cap at 10)
 *   - Test cases listed (0.5 each, cap at 8)
 *   - Inbound dependencies in dare-dag.yaml (0.5 each, no cap)
 *   - "Heavy" keywords in prompt/spec (+2 each: refactor, migrate, integrate,
 *     multiple, audit, replace, rewrite, parallelize, cross-cutting)
 *   - HIGH complexity declared by author (+3 baseline)
 *
 * Buckets:
 *   0–5    → LOW
 *   6–12   → MED
 *   13–20  → HIGH       ← recommends split
 *   21+    → CRITICAL   ← strongly recommends split
 *
 * The thresholds are tunable via `dare.config.json#refine.thresholds` (see
 * Frente 4) — defaults below.
 */

import fs from 'fs-extra';
import path from 'path';
import { findSpecFile, parseFilesFromSpec } from './ReviewRunner.js';
import type {
  ComplexityLevel,
  ComplexityReport,
  ComplexitySignal,
  ProposedSubtask,
  SplitProposal,
} from '../types/Refine.types.js';

// ── Default thresholds & weights ─────────────────────────────────────────────

export interface ComplexityThresholds {
  low: number;
  med: number;
  high: number;
}

export const DEFAULT_THRESHOLDS: ComplexityThresholds = {
  low: 5,
  med: 12,
  high: 20,
};

/** Maximum contribution from any single signal — keeps the score bounded. */
const SIGNAL_CAPS = {
  files: 10,
  functions: 10,
  tests: 8,
};

/** Weights per occurrence. */
const WEIGHTS = {
  perFile: 1,
  perFunction: 1.5,
  perTest: 0.5,
  perDependency: 0.5,
  heavyKeyword: 2,
  authorDeclaredHigh: 3,
};

/** Keywords that historically correlate with "this is bigger than it looks". */
const HEAVY_KEYWORDS = [
  'refactor',
  'refatorar',
  'migrate',
  'migrar',
  'migração',
  'integrate',
  'integrar',
  'integração',
  'multiple',
  'múltiplos',
  'audit',
  'auditar',
  'replace',
  'substituir',
  'rewrite',
  'reescrever',
  'parallelize',
  'paralelizar',
  'cross-cutting',
  'orchestrate',
  'orquestrar',
];

// ── Signal extractors ────────────────────────────────────────────────────────

/**
 * Count public functions/endpoints declared in the spec. We look at:
 *   - "Implementar `POST /…`" style mentions
 *   - "função `name()`" / "function `name()`"
 *   - Code-fence assinaturas (`fn x() -> ...`, `function x()`, `def x()`)
 *
 * Imperfect, but consistent — the test for refinement is "does this slope
 * up monotonically with effort?", not "is this exact?".
 */
function countDeclaredFunctions(specMarkdown: string): number {
  const patterns: RegExp[] = [
    // HTTP verbs inside backticks: `POST /auth/login`, `GET /users/:id`
    /`(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/[^`]+`/gi,
    // Function-like in backticks: `name()`, `name(arg: Type)`
    /`\w+\s*\([^)]*\)`/g,
    // Inline `fn x(...)` / `function x(...)` / `def x(...)` / `func x(...)`
    /\b(function|fn|func|def|method)\s+\w+\s*\(/g,
  ];
  let total = 0;
  for (const re of patterns) {
    const matches = specMarkdown.match(re);
    if (matches) total += matches.length;
  }
  // Deduplicate-ish: a single endpoint may match both verb pattern and code-block.
  // Halve to avoid double-counting; floor so a single hit still counts as 1.
  return Math.max(1, Math.floor(total / 2));
}

/**
 * Count test cases listed in the spec. We look at checkbox-style entries
 * under the "Testes" / "Testing" section and `should_*` / `it(...)` names.
 */
function countDeclaredTests(specMarkdown: string): number {
  const patterns: RegExp[] = [
    /^\s*-\s*\[\s*\]\s*(Teste|Test)\b/gim,
    /\bshould_[a-z_]+/g,
    /\bit\(['"]/g,
  ];
  let total = 0;
  for (const re of patterns) {
    const matches = specMarkdown.match(re);
    if (matches) total += matches.length;
  }
  return total;
}

/** Count occurrences of heavy keywords (case-insensitive, word-boundary). */
function countHeavyKeywords(specMarkdown: string): number {
  const lower = specMarkdown.toLowerCase();
  let total = 0;
  for (const kw of HEAVY_KEYWORDS) {
    const re = new RegExp(`\\b${kw.toLowerCase()}\\b`, 'g');
    const matches = lower.match(re);
    if (matches) total += matches.length;
  }
  return total;
}

/** Parse `**Complexidade:** HIGH` or similar from the spec header. */
function authorDeclaredHigh(specMarkdown: string): boolean {
  return /\*\*Complexidade:\*\*\s*HIGH/i.test(specMarkdown);
}

// ── Bucket selection ─────────────────────────────────────────────────────────

export function levelFromScore(
  score: number,
  thresholds: ComplexityThresholds = DEFAULT_THRESHOLDS,
): ComplexityLevel {
  if (score <= thresholds.low) return 'LOW';
  if (score <= thresholds.med) return 'MED';
  if (score <= thresholds.high) return 'HIGH';
  return 'CRITICAL';
}

// ── Main entry: complexity report ────────────────────────────────────────────

export interface AnalyzeOptions {
  /** Override default thresholds (e.g. from dare.config.json#refine). */
  thresholds?: ComplexityThresholds;
  /** Extra `depends_on` count from `dare-dag.yaml` (optional — caller resolves). */
  dependsOnCount?: number;
}

/**
 * Build a complexity report for a single task. Returns `null` if the spec
 * can't be found, so the caller can produce a user-friendly error.
 */
export async function analyzeTaskComplexity(
  taskId: string,
  projectRoot: string,
  options: AnalyzeOptions = {},
): Promise<ComplexityReport | null> {
  const specPath = await findSpecFile(projectRoot, taskId);
  if (!specPath) {
    return {
      taskId,
      specPath: null,
      score: 0,
      level: 'LOW',
      recommendsSplit: false,
      signals: [
        { kind: 'no-spec', weight: 0, detail: 'Spec não encontrada — refinamento ignorado.' },
      ],
    };
  }

  const md = await fs.readFile(specPath, 'utf-8');
  const projectRelSpec = path.relative(projectRoot, specPath).replace(/\\/g, '/');

  const fileCount = parseFilesFromSpec(md).length;
  const fnCount = countDeclaredFunctions(md);
  const testCount = countDeclaredTests(md);
  const kwCount = countHeavyKeywords(md);
  const deps = options.dependsOnCount ?? 0;
  const high = authorDeclaredHigh(md);

  const signals: ComplexitySignal[] = [];

  if (fileCount > 0) {
    const w = Math.min(fileCount, SIGNAL_CAPS.files) * WEIGHTS.perFile;
    signals.push({
      kind: 'files',
      weight: w,
      detail: `${fileCount} arquivo(s) a criar/modificar`,
    });
  }
  if (fnCount > 0) {
    const w = Math.min(fnCount, SIGNAL_CAPS.functions) * WEIGHTS.perFunction;
    signals.push({
      kind: 'functions',
      weight: w,
      detail: `${fnCount} função(ões)/endpoint(s) público(s)`,
    });
  }
  if (testCount > 0) {
    const w = Math.min(testCount, SIGNAL_CAPS.tests) * WEIGHTS.perTest;
    signals.push({
      kind: 'tests',
      weight: w,
      detail: `${testCount} teste(s) declarado(s)`,
    });
  }
  if (deps > 0) {
    signals.push({
      kind: 'dependencies',
      weight: deps * WEIGHTS.perDependency,
      detail: `${deps} dependência(s) (depends_on)`,
    });
  }
  if (kwCount > 0) {
    signals.push({
      kind: 'keywords',
      weight: kwCount * WEIGHTS.heavyKeyword,
      detail: `${kwCount} palavra-chave(s) "pesada(s)" (refactor/migrate/integrate/...)`,
    });
  }
  if (high) {
    signals.push({
      kind: 'author-high',
      weight: WEIGHTS.authorDeclaredHigh,
      detail: 'Spec já declarada como HIGH pelo autor',
    });
  }

  signals.sort((a, b) => b.weight - a.weight);

  const score = signals.reduce((acc, s) => acc + s.weight, 0);
  const level = levelFromScore(score, options.thresholds ?? DEFAULT_THRESHOLDS);
  const recommendsSplit = level === 'HIGH' || level === 'CRITICAL';

  return {
    taskId,
    specPath: projectRelSpec,
    score,
    level,
    recommendsSplit,
    signals,
  };
}

// ── Split proposal ───────────────────────────────────────────────────────────

/**
 * Produce a coarse split proposal. The algorithm:
 *   1. Group files by top-level directory (e.g. `src/auth/*` vs `tests/*`
 *      vs `migrations/*`).
 *   2. Each group becomes a candidate sub-task. If a group has more than
 *      `maxFilesPerSubtask` files, split it further alphabetically.
 *   3. Generate suffixed ids: `task-034a`, `task-034b`, ...
 *
 * Intentionally not too clever — the IDE agent (via the `dare-refine` skill)
 * is expected to refine this with semantic awareness. The CLI proposal is
 * a sane default that gets it 70% of the way there.
 */
export function proposeSplit(
  taskId: string,
  files: string[],
  options: { maxFilesPerSubtask?: number } = {},
): SplitProposal {
  const maxFiles = options.maxFilesPerSubtask ?? 4;

  if (files.length === 0) {
    return {
      originalTaskId: taskId,
      subtasks: [],
      notes:
        'Nenhum arquivo listado na spec — split automático impossível. ' +
        'Adicione a tabela "ARQUIVOS A CRIAR / MODIFICAR" ou rode `/dare-refine <id>` para o agente sugerir.',
    };
  }

  // Group by top-level directory (or first 2 segments if same root).
  const groups = new Map<string, string[]>();
  for (const f of files) {
    const parts = f.split('/');
    const key = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  const subtasks: ProposedSubtask[] = [];
  let suffixIdx = 0;
  for (const [groupKey, groupFiles] of groups) {
    // Split overlarge groups alphabetically.
    const sorted = [...groupFiles].sort();
    const chunks: string[][] = [];
    for (let i = 0; i < sorted.length; i += maxFiles) {
      chunks.push(sorted.slice(i, i + maxFiles));
    }
    for (const chunk of chunks) {
      const suffix = String.fromCharCode(97 + suffixIdx); // a, b, c, ...
      suffixIdx++;
      subtasks.push({
        id: `${taskId}${suffix}`,
        title: `${taskId}${suffix}: ${groupKey}`,
        files: chunk,
        rationale: `Slice de ${groupKey} (${chunk.length} arquivo(s)) — cabe em uma conversa.`,
        estimatedLevel: chunk.length >= maxFiles ? 'MED' : 'LOW',
      });
    }
  }

  return {
    originalTaskId: taskId,
    subtasks,
    notes:
      `Split proposto em ${subtasks.length} sub-task(s) agrupando por diretório raiz. ` +
      `Cada slice fica ≤ ${maxFiles} arquivos. Revise: o agrupamento por diretório é uma heurística — ` +
      `o agente pode reorganizar se o domínio sugerir slices melhores.`,
  };
}
