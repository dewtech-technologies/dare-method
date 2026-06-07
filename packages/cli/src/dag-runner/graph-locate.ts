import fs from 'node:fs';
import path from 'node:path';
import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';
import type { DagTask } from './run_dag.js';

export interface GraphLocateConfig {
  readonly enabled: boolean;
  readonly hops?: number;
  readonly limit?: number;
}

const QN_SEED_RE = /\b[\w./-]+::\w+\b/g;
const PATH_SEED_RE = /\b[\w./-]+\.(?:ts|tsx|js|py|go|rs|php|java|kt|cs)\b/g;
const MAX_SEEDS = 5;

export function loadGraphLocateConfig(cwd: string): GraphLocateConfig {
  const configPath = path.join(cwd, 'dare.config.json');
  if (!fs.existsSync(configPath)) {
    return { enabled: false, hops: 3, limit: 5 };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const graph = (raw.graph ?? {}) as Record<string, unknown>;
    return {
      enabled: graph.locateBeforePatch === true,
      hops: typeof graph.locateHops === 'number' ? graph.locateHops : 3,
      limit: typeof graph.locateLimit === 'number' ? graph.locateLimit : 5,
    };
  } catch {
    return { enabled: false, hops: 3, limit: 5 };
  }
}

export function extractSeedsFromPrompt(prompt: string): string[] {
  const found = new Set<string>();
  for (const m of prompt.matchAll(QN_SEED_RE)) found.add(m[0]!);
  for (const m of prompt.matchAll(PATH_SEED_RE)) found.add(m[0]!);
  return [...found].sort().slice(0, MAX_SEEDS);
}

export function buildLocateContext(
  graph: KnowledgeGraph,
  task: DagTask,
  config: GraphLocateConfig,
): string | undefined {
  if (!config.enabled) return undefined;
  if (graph.getStatistics().totalNodes === 0) return undefined;

  const seeds = extractSeedsFromPrompt(task.subtask_prompt);
  if (seeds.length === 0) return undefined;

  const merged = new Map<string, { label: string; score: number }>();

  try {
    for (const seed of seeds) {
      const result = graph.locate(seed, {
        hops: config.hops ?? 3,
        limit: config.limit ?? 5,
      });
      for (const c of result.candidates) {
        const label =
          c.node.type === 'code_symbol'
            ? String(c.node.metadata?.qualifiedName ?? c.node.label)
            : String(c.node.metadata?.path ?? c.node.label);
        const prev = merged.get(c.node.id);
        if (!prev || c.score > prev.score) {
          merged.set(c.node.id, { label, score: c.score });
        }
      }
    }
  } catch {
    return undefined;
  }

  if (merged.size === 0) return undefined;

  const lines = ['## Graph locate (deterministic)', 'Candidates:'];
  const sorted = [...merged.entries()].sort((a, b) => {
    if (b[1].score !== a[1].score) return b[1].score - a[1].score;
    return a[0].localeCompare(b[0]);
  });
  for (const [, { label, score }] of sorted) {
    lines.push(`- ${label} (score ${score.toFixed(2)})`);
  }
  return lines.join('\n');
}
