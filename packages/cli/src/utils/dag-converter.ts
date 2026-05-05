import { parse } from 'yaml';
import type {
  Complexity,
  Dag,
  DagLimits,
  DagModelMap,
  DagModels,
  DagTask,
  RunnerName,
} from '../dag-runner/run_dag.js';
import { DEFAULT_DAG_LIMITS } from '../dag-runner/run_dag.js';

const KNOWN_RUNNERS: RunnerName[] = ['cursor', 'claude', 'antigravity'];

/**
 * Parse `dare-dag.yaml` content into a Dag object.
 *
 * Accepts both the v2.1 schema (with `limits` and runner-keyed `models`) and
 * the legacy flat schema (`models: { HIGH, MED, LOW }`). Legacy is normalized
 * to the runner-keyed form (replicated under each runner).
 */
export function convertYamlToDag(yamlContent: string): Dag {
  const raw = parse(yamlContent) as Record<string, unknown>;

  const tasks = ((raw.tasks as Record<string, unknown>[]) || []).map(
    (t): DagTask => ({
      id: String(t.id),
      title: (t.title as string) || String(t.id),
      depends_on: Array.isArray(t.depends_on) ? (t.depends_on as string[]) : [],
      complexity: normalizeComplexity(t.complexity),
      subtask_prompt: (t.subtask_prompt as string) || '',
      spec_file: typeof t.spec_file === 'string' ? t.spec_file : undefined,
      status: 'PENDING',
    })
  );

  return {
    title: (raw.title as string) || 'DARE Project',
    version: (raw.version as string) || '1.0.0',
    generated: typeof raw.generated === 'string' ? raw.generated : undefined,
    limits: parseLimits(raw.limits),
    models: parseModels(raw.models),
    tasks,
  };
}

/**
 * Serialize a Dag back to YAML. Uses the canonical v2.1 schema with `limits`
 * and runner-keyed `models`. Status/output/tokens/duration are runtime fields
 * and not emitted.
 */
export function convertDagToYaml(dag: Dag): string {
  const limits = dag.limits ?? DEFAULT_DAG_LIMITS;
  const lines: string[] = [];

  lines.push(`title: "${escapeYamlString(dag.title)}"`);
  lines.push(`version: "${dag.version}"`);
  if (dag.generated) {
    lines.push(`generated: "${dag.generated}"`);
  }
  lines.push('');

  lines.push('limits:');
  lines.push(`  parent_context_chars: ${limits.parent_context_chars}`);
  lines.push(`  task_output_chars: ${limits.task_output_chars}`);
  lines.push(`  timeout_seconds: ${limits.timeout_seconds}`);
  lines.push('');

  lines.push('models:');
  for (const runner of KNOWN_RUNNERS) {
    const m = dag.models[runner];
    if (!m) continue;
    lines.push(
      `  ${runner}:      { HIGH: ${m.HIGH}, MED: ${m.MED}, LOW: ${m.LOW} }`
    );
  }
  lines.push('');

  lines.push('tasks:');
  for (const task of dag.tasks) {
    const deps =
      task.depends_on.length === 0 ? '[]' : `[${task.depends_on.join(', ')}]`;
    lines.push(`  - id: ${task.id}`);
    lines.push(`    title: "${escapeYamlString(task.title)}"`);
    lines.push(`    depends_on: ${deps}`);
    lines.push(`    complexity: ${task.complexity}`);
    if (task.spec_file) {
      lines.push(`    spec_file: ${task.spec_file}`);
    }
    lines.push('    subtask_prompt: |');
    for (const line of (task.subtask_prompt || '').split('\n')) {
      lines.push(`      ${line}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function normalizeComplexity(value: unknown): Complexity {
  if (value === 'LOW' || value === 'MED' || value === 'HIGH') return value;
  return 'MED';
}

function parseLimits(raw: unknown): DagLimits {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DAG_LIMITS };
  const r = raw as Record<string, unknown>;
  return {
    parent_context_chars:
      typeof r.parent_context_chars === 'number'
        ? r.parent_context_chars
        : DEFAULT_DAG_LIMITS.parent_context_chars,
    task_output_chars:
      typeof r.task_output_chars === 'number'
        ? r.task_output_chars
        : DEFAULT_DAG_LIMITS.task_output_chars,
    timeout_seconds:
      typeof r.timeout_seconds === 'number'
        ? r.timeout_seconds
        : DEFAULT_DAG_LIMITS.timeout_seconds,
  };
}

/**
 * Accepts either:
 *   - per-runner: { cursor: { HIGH, MED, LOW }, claude: {...}, antigravity: {...} }
 *   - legacy flat: { HIGH, MED, LOW } — replicated under each known runner
 */
function parseModels(raw: unknown): DagModels {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;

  // Legacy flat schema
  if (isModelMap(r)) {
    const flat = toModelMap(r);
    const expanded: DagModels = {};
    for (const runner of KNOWN_RUNNERS) {
      expanded[runner] = flat;
    }
    return expanded;
  }

  // Per-runner schema
  const out: DagModels = {};
  for (const runner of KNOWN_RUNNERS) {
    const sub = r[runner];
    if (sub && typeof sub === 'object' && isModelMap(sub as Record<string, unknown>)) {
      out[runner] = toModelMap(sub as Record<string, unknown>);
    }
  }
  return out;
}

function isModelMap(obj: Record<string, unknown>): boolean {
  return (
    typeof obj.HIGH === 'string' &&
    typeof obj.MED === 'string' &&
    typeof obj.LOW === 'string'
  );
}

function toModelMap(obj: Record<string, unknown>): DagModelMap {
  return {
    HIGH: String(obj.HIGH),
    MED: String(obj.MED),
    LOW: String(obj.LOW),
  };
}

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
