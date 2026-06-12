import fs from 'node:fs';
import path from 'node:path';
import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';
import type { GraphNode } from '../graphrag/types.js';
import { DEFAULT_STATE_PATH } from '../dag-runner/state-store.js';
import { detectDrift } from '../graphrag/drift.js';
import { DRIFT_DEFAULTS } from '../verification/config.js';

export interface TelemetrySnapshot {
  readonly dag: { total: number; byStatus: Record<string, number>; ranks: number };
  readonly gates: { verified: number; proven: number; mutationAvg?: number };
  readonly cost: {
    totalUsd: number;
    totalTokens: number;
    byTask: Array<{ id: string; usd: number; tokens: number }>;
  };
  readonly bestOfN?: { tasks: number; avgCandidates: number };
  readonly guard?: { pass: number; warn: number; fail: number };
  readonly drift?: { orphanReqs: number; orphanCode: number; stale: number };
  readonly emptyHints: ReadonlyArray<string>;
}

export interface AggregateTelemetryOptions {
  readonly stateFile?: string;
}

const QUERY_LIMIT = 1_000_000;

/** Read-only: agrega o grafo num snapshot. Nunca muta. */
export function aggregateTelemetry(
  graph: KnowledgeGraph,
  opts: AggregateTelemetryOptions = {},
): TelemetrySnapshot {
  const stats = graph.getStatistics();
  const taskNodes = graph.queryNodes('task', QUERY_LIMIT);
  const stateTasks = readStateTasks(resolveStateFile(opts.stateFile));

  const dag = aggregateDag(taskNodes, stateTasks, graph);
  const gates = aggregateGates(stats, graph);
  const cost = aggregateCost(taskNodes);
  const bestOfN = aggregateBestOfN(taskNodes);
  const guard = aggregateGuard(graph);
  const drift = aggregateDrift(graph);
  const emptyHints = buildEmptyHints({ dag, gates, cost, taskNodes });

  return {
    dag,
    gates,
    cost,
    ...(bestOfN ? { bestOfN } : {}),
    ...(guard ? { guard } : {}),
    ...(drift ? { drift } : {}),
    emptyHints,
  };
}

function resolveStateFile(stateFile?: string): string {
  return stateFile ?? path.join(process.cwd(), DEFAULT_STATE_PATH);
}

interface StateTaskEntry {
  status?: string;
  dependsOn?: string[];
}

function readStateTasks(stateFile: string): Record<string, StateTaskEntry> | null {
  try {
    if (!fs.existsSync(stateFile)) return null;
    const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as unknown;
    if (
      typeof raw !== 'object' ||
      raw === null ||
      !('tasks' in raw) ||
      typeof (raw as { tasks: unknown }).tasks !== 'object' ||
      (raw as { tasks: unknown }).tasks === null
    ) {
      return null;
    }
    return (raw as { tasks: Record<string, StateTaskEntry> }).tasks;
  } catch {
    return null;
  }
}

function stripTaskPrefix(nodeId: string): string {
  return nodeId.startsWith('task:') ? nodeId.slice('task:'.length) : nodeId;
}

function taskNodeId(taskId: string): string {
  return taskId.startsWith('task:') ? taskId : `task:${taskId}`;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function aggregateDag(
  taskNodes: GraphNode[],
  stateTasks: Record<string, StateTaskEntry> | null,
  graph: KnowledgeGraph,
): TelemetrySnapshot['dag'] {
  const taskIds = new Set<string>();
  for (const node of taskNodes) taskIds.add(stripTaskPrefix(node.id));
  if (stateTasks) {
    for (const taskId of Object.keys(stateTasks)) taskIds.add(taskId);
  }

  const byStatus: Record<string, number> = {};
  for (const taskId of taskIds) {
    const stateStatus = stateTasks?.[taskId]?.status;
    const graphNode = graph.getNode(taskNodeId(taskId));
    const graphStatus = readString(graphNode?.metadata?.status);
    const status = stateStatus ?? graphStatus ?? 'PENDING';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  const ranks = computeRankCount(taskNodes, stateTasks, graph, [...taskIds]);

  return {
    total: taskIds.size,
    byStatus,
    ranks,
  };
}

function computeRankCount(
  taskNodes: GraphNode[],
  stateTasks: Record<string, StateTaskEntry> | null,
  graph: KnowledgeGraph,
  taskIds: string[],
): number {
  if (taskIds.length === 0) return 0;

  const dependsOn = new Map<string, string[]>();
  for (const taskId of taskIds) dependsOn.set(taskId, []);

  for (const node of taskNodes) {
    const taskId = stripTaskPrefix(node.id);
    const deps = graph
      .getEdges(node.id, 'out')
      .filter((edge) => edge.type === 'depends_on')
      .map((edge) => stripTaskPrefix(edge.targetId));
    dependsOn.set(taskId, deps);
  }

  if (stateTasks) {
    for (const [taskId, entry] of Object.entries(stateTasks)) {
      if (Array.isArray(entry.dependsOn) && entry.dependsOn.length > 0) {
        dependsOn.set(taskId, [...entry.dependsOn]);
      }
    }
  }

  const ranks = new Map<string, number>();
  const getRank = (taskId: string, visited = new Set<string>()): number => {
    if (ranks.has(taskId)) return ranks.get(taskId)!;
    if (visited.has(taskId)) return 0;
    visited.add(taskId);

    const deps = dependsOn.get(taskId) ?? [];
    if (deps.length === 0) {
      ranks.set(taskId, 0);
      return 0;
    }

    const maxDep = Math.max(...deps.map((dep) => getRank(dep, new Set(visited))));
    const rank = maxDep + 1;
    ranks.set(taskId, rank);
    return rank;
  };

  for (const taskId of taskIds) getRank(taskId);

  const rankValues = [...ranks.values()];
  if (rankValues.length === 0) return 0;
  return Math.max(...rankValues) + 1;
}

function aggregateGates(
  stats: ReturnType<KnowledgeGraph['getStatistics']>,
  graph: KnowledgeGraph,
): TelemetrySnapshot['gates'] {
  const verified = stats.edgesByType.verified_by ?? 0;
  const proven = stats.edgesByType.proven_by ?? 0;
  const mutationAvg = aggregateMutationAvg(graph);

  return mutationAvg === undefined
    ? { verified, proven }
    : { verified, proven, mutationAvg };
}

function aggregateMutationAvg(graph: KnowledgeGraph): number | undefined {
  const scores: number[] = [];

  for (const gate of graph.queryNodes('gate', QUERY_LIMIT)) {
    const score = readNumber(gate.metadata?.mutationScore);
    if (score !== undefined) scores.push(score);
  }

  for (const task of graph.queryNodes('task', QUERY_LIMIT)) {
    const verification = task.metadata?.verification as { mutationScore?: number } | undefined;
    const score = readNumber(verification?.mutationScore);
    if (score !== undefined) scores.push(score);
  }

  if (scores.length === 0) return undefined;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function aggregateCost(taskNodes: GraphNode[]): TelemetrySnapshot['cost'] {
  const byTask = taskNodes
    .map((node) => {
      const id = stripTaskPrefix(node.id);
      const usd = readNumber(node.metadata?.costUsd) ?? 0;
      const inputTokens = readNumber(node.metadata?.inputTokens) ?? 0;
      const outputTokens = readNumber(node.metadata?.outputTokens) ?? 0;
      const legacyTokens = readNumber(node.metadata?.tokens) ?? 0;
      const tokens =
        inputTokens + outputTokens > 0 ? inputTokens + outputTokens : legacyTokens;
      return { id, usd, tokens };
    })
    .filter((entry) => entry.usd > 0 || entry.tokens > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  const totalUsd = byTask.reduce((sum, entry) => sum + entry.usd, 0);
  const totalTokens = byTask.reduce((sum, entry) => sum + entry.tokens, 0);

  return {
    totalUsd: Number(totalUsd.toFixed(6)),
    totalTokens,
    byTask,
  };
}

function aggregateBestOfN(taskNodes: GraphNode[]): TelemetrySnapshot['bestOfN'] | undefined {
  const candidateCounts: number[] = [];

  for (const node of taskNodes) {
    const attempts = readNumber(node.metadata?.attempts);
    const bestOf = readNumber(node.metadata?.bestOfN) ?? readNumber(node.metadata?.bestOf);
    const count = bestOf ?? attempts;
    if (count !== undefined && count > 1) candidateCounts.push(count);
  }

  if (candidateCounts.length === 0) return undefined;

  const avgCandidates =
    candidateCounts.reduce((sum, count) => sum + count, 0) / candidateCounts.length;

  return {
    tasks: candidateCounts.length,
    avgCandidates: Number(avgCandidates.toFixed(2)),
  };
}

type GuardCounts = NonNullable<TelemetrySnapshot['guard']>;

function aggregateGuard(graph: KnowledgeGraph): GuardCounts | undefined {
  const counts: GuardCounts = { pass: 0, warn: 0, fail: 0 };
  let found = false;

  for (const node of graph.queryNodes(undefined, QUERY_LIMIT)) {
    const metadata = node.metadata;
    if (!metadata) continue;

    if (metadata.kind === 'guard') {
      const verdict = normalizeGuardVerdict(metadata.verdict);
      if (verdict) {
        found = true;
        counts[verdict] += 1;
      }
    }

    const nested = metadata.guard as { verdict?: unknown } | undefined;
    if (nested && typeof nested === 'object') {
      const verdict = normalizeGuardVerdict(nested.verdict);
      if (verdict) {
        found = true;
        counts[verdict] += 1;
      }
    }
  }

  return found ? counts : undefined;
}

function normalizeGuardVerdict(value: unknown): keyof GuardCounts | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toUpperCase();
  if (normalized === 'PASS') return 'pass';
  if (normalized === 'WARN') return 'warn';
  if (normalized === 'FAIL') return 'fail';
  return undefined;
}

function aggregateDrift(graph: KnowledgeGraph): TelemetrySnapshot['drift'] | undefined {
  const stored = readStoredDrift(graph);
  if (stored) return stored;

  const stats = graph.getStatistics();
  const hasDriftNodes =
    stats.nodesByType.requirement > 0 || stats.nodesByType.code_symbol > 0;
  if (!hasDriftNodes) return undefined;

  const report = detectDrift(graph, { ...DRIFT_DEFAULTS, enabled: true });
  const orphanReqs = report.counts['orphan-requirement'] ?? 0;
  const orphanCode = report.counts['orphan-code'] ?? 0;
  const stale = report.counts.stale ?? 0;

  if (orphanReqs === 0 && orphanCode === 0 && stale === 0) return undefined;

  return { orphanReqs, orphanCode, stale };
}

function readStoredDrift(graph: KnowledgeGraph): TelemetrySnapshot['drift'] | undefined {
  for (const node of graph.queryNodes(undefined, QUERY_LIMIT)) {
    const metadata = node.metadata;
    if (!metadata || metadata.kind !== 'drift') continue;

    const orphanReqs =
      readNumber(metadata.orphanReqs) ??
      readNumber(metadata.orphanRequirements) ??
      readNumber((metadata.counts as { orphanReqs?: number } | undefined)?.orphanReqs);
    const orphanCode =
      readNumber(metadata.orphanCode) ??
      readNumber((metadata.counts as { orphanCode?: number } | undefined)?.orphanCode);
    const stale =
      readNumber(metadata.stale) ??
      readNumber((metadata.counts as { stale?: number } | undefined)?.stale);

    if (orphanReqs === undefined && orphanCode === undefined && stale === undefined) {
      continue;
    }

    return {
      orphanReqs: orphanReqs ?? 0,
      orphanCode: orphanCode ?? 0,
      stale: stale ?? 0,
    };
  }

  return undefined;
}

function buildEmptyHints(args: {
  dag: TelemetrySnapshot['dag'];
  gates: TelemetrySnapshot['gates'];
  cost: TelemetrySnapshot['cost'];
  taskNodes: GraphNode[];
}): string[] {
  const hints: string[] = [];

  if (args.dag.total === 0) {
    hints.push('no tasks — run dare execute');
  }

  if (args.dag.total > 0 && args.gates.verified === 0 && args.gates.proven === 0) {
    hints.push('no verification gates — run dare execute --complete with verification enabled');
  }

  if (args.taskNodes.length > 0 && args.cost.totalUsd === 0 && args.cost.totalTokens === 0) {
    hints.push('no cost telemetry — run dare execute --agent to record token usage');
  }

  return hints;
}
