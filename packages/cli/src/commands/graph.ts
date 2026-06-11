import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { convertYamlToDag } from '../utils/dag-converter.js';
import { ingestDag } from '../dag-runner/graph-ingest.js';
import { ingestRequirements } from '../graphrag/requirement-ingest.js';
import { detectDrift, type DriftConfig, type DriftKind, type DriftReport } from '../graphrag/drift.js';
import { runIncrementalSemanticIndex } from '../graphrag/incremental-index.js';
import { loadAndApplyState } from '../dag-runner/state-store.js';
import { createGraph, loadGraphConfig } from '../graphrag/index.js';
import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';
import type { EdgeType, GraphNode, NodeType } from '../graphrag/types.js';
import { DriftConfigError, parseDriftConfig } from '../verification/config.js';
import { assertRelativeSafe } from '../utils/path-safety.js';
import {
  collectImpact,
  collectOwners,
  formatLocateJson,
  GRAPH_PATH_ERROR,
  GraphPathError,
  traceRequirement,
  TraceFormatError,
  TraceNotFoundError,
} from './graph-queries.js';

/**
 * `dare graph` — query and visualize the project's knowledge graph.
 *
 * The graph is populated automatically by `dare execute --complete/--fail`.
 * Use these subcommands to inspect, search and export it.
 */
export const graphCommand = new Command('graph')
  .description('Inspect and visualize the DARE knowledge graph');

graphCommand
  .command('stats')
  .description('Show node/edge counts and type breakdown')
  .action(async () => {
    await withGraph(async (graph) => {
      const stats = graph.getStatistics();
      console.log(chalk.blue.bold('\n📊 DARE Knowledge Graph\n'));
      console.log(`  Total nodes: ${chalk.cyan(stats.totalNodes)}`);
      console.log(`  Total edges: ${chalk.cyan(stats.totalEdges)}`);

      if (Object.keys(stats.nodesByType).length > 0) {
        console.log(chalk.bold('\n  Nodes by type:'));
        for (const [type, count] of Object.entries(stats.nodesByType)) {
          console.log(`    ${type.padEnd(12)} ${count}`);
        }
      }

      if (Object.keys(stats.edgesByType).length > 0) {
        console.log(chalk.bold('\n  Edges by type:'));
        for (const [type, count] of Object.entries(stats.edgesByType)) {
          console.log(`    ${type.padEnd(12)} ${count}`);
        }
      }

      console.log();
    });
  });

const KNOWN_NODE_TYPES = [
  'task',
  'file',
  'schema',
  'endpoint',
  'component',
  'entity',
  'concept',
  'gate',
  'code_symbol',
  'requirement',
  'pattern',
  'formal-gate',
] as const;
type KnownNodeType = (typeof KNOWN_NODE_TYPES)[number];
type DriftOutputFormat = 'human' | 'json';

const DRIFT_QUERY_LIMIT = 1_000_000;
const DRIFT_FAIL_EXIT = 7;
const DRIFT_KINDS: readonly DriftKind[] = ['orphan-requirement', 'orphan-code', 'stale'];

graphCommand
  .command('query <term>')
  .description('Search nodes whose label/description contains <term>')
  .option('-l, --limit <n>', 'Maximum results', '10')
  .option('-t, --type <type>', `Restrict to a node type (${KNOWN_NODE_TYPES.join(' | ')})`)
  .option('--semantic', 'Use hybrid semantic search (requires graphrag.semantic.enabled + runtime)')
  .action(async (term: string, options: { limit: string; type?: string; semantic?: boolean }) => {
    const limit = parseInt(options.limit, 10) || 10;
    const typeFilter = options.type?.toLowerCase();
    if (typeFilter && !KNOWN_NODE_TYPES.includes(typeFilter as KnownNodeType)) {
      console.error(
        chalk.red(`❌ Unknown node type "${options.type}". Use one of: ${KNOWN_NODE_TYPES.join(', ')}.`),
      );
      process.exit(1);
    }

    await withGraph(async (graph) => {
      // Search wider when filtering by type — we'll trim after filtering.
      const rawLimit = typeFilter ? Math.max(limit * 5, 50) : limit;
      const hybridGraph = graph as KnowledgeGraph & {
        searchNodesHybrid?: (q: string, n: number) => Promise<ReturnType<KnowledgeGraph['searchNodes']>>;
      };
      const all =
        options.semantic && typeof hybridGraph.searchNodesHybrid === 'function'
          ? await hybridGraph.searchNodesHybrid(term, rawLimit)
          : graph.searchNodes(term, rawLimit);
      const results = typeFilter
        ? all.filter((r) => r.node.type === typeFilter).slice(0, limit)
        : all;

      if (results.length === 0) {
        const filterMsg = typeFilter ? ` of type ${typeFilter}` : '';
        console.log(chalk.yellow(`No matches${filterMsg} for "${term}".`));
        return;
      }
      const filterMsg = typeFilter ? ` (type=${typeFilter})` : '';
      console.log(
        chalk.blue.bold(`\n🔎 ${results.length} match(es) for "${term}"${filterMsg}\n`),
      );
      for (const r of results) {
        console.log(`${chalk.cyan(r.node.id)}  ${chalk.gray(`[${r.node.type}]`)}`);
        console.log(`  ${r.node.label}`);
        if (r.snippet) console.log(chalk.gray(`  ${r.snippet}`));
        console.log();
      }
    });
  });

graphCommand
  .command('viz')
  .description('Export the graph to a Mermaid or DOT diagram')
  .option('-f, --format <fmt>', 'Output format: mermaid | dot', 'mermaid')
  .option('-o, --output <file>', 'Write to file (defaults to stdout)')
  .action(async (options: { format: string; output?: string }) => {
    const format = options.format.toLowerCase();
    if (format !== 'mermaid' && format !== 'dot') {
      console.error(chalk.red(`Unsupported format "${options.format}". Use: mermaid | dot.`));
      process.exit(1);
    }

    await withGraph(async (graph) => {
      const { nodes, edges } = graph.exportToJson();
      const rendered = format === 'mermaid' ? renderMermaid(nodes, edges) : renderDot(nodes, edges);

      if (options.output) {
        await fs.writeFile(options.output, rendered);
        console.log(chalk.green(`✅ Wrote ${nodes.length} nodes / ${edges.length} edges to ${options.output}`));
      } else {
        console.log(rendered);
      }
    });
  });

graphCommand
  .command('owners <path>')
  .description('List tasks/requirements that own symbols under <path>')
  .option('--json', 'Emit JSON')
  .option('--limit <n>', 'Maximum owners', '20')
  .action(async (targetPath: string, options: { json?: boolean; limit: string }) => {
    const limit = parseInt(options.limit, 10) || 20;
    await withGraph(async (graph) => {
      try {
        const result = collectOwners(graph, targetPath, limit);
        if (options.json) {
          console.log(JSON.stringify(result));
          return;
        }
        if (result.owners.length === 0) {
          console.log(chalk.yellow(`No owners for "${result.path}".`));
          return;
        }
        console.log(chalk.blue.bold(`\n👤 Owners of ${result.path} (${result.durationMs}ms)\n`));
        for (const o of result.owners) {
          console.log(`${chalk.cyan(o.id)}  ${chalk.gray(`[${o.type}]`)} ${o.label}`);
        }
        console.log();
      } catch (err) {
        if (err instanceof GraphPathError) {
          console.error(GRAPH_PATH_ERROR);
          process.exit(1);
        }
        throw err;
      }
    });
  });

graphCommand
  .command('impact <path>')
  .description('Show tasks/requirements impacted by changes under <path>')
  .option('--json', 'Emit JSON')
  .option('--hops <n>', 'Traversal depth (max 5)', '3')
  .action(async (targetPath: string, options: { json?: boolean; hops: string }) => {
    const hops = parseInt(options.hops, 10) || 3;
    await withGraph(async (graph) => {
      try {
        const result = collectImpact(graph, targetPath, hops);
        if (options.json) {
          console.log(JSON.stringify(result));
          return;
        }
        console.log(chalk.blue.bold(`\n💥 Impact for ${result.path} (${result.durationMs}ms)\n`));
        console.log(`  Tasks: ${result.impacted.tasks.join(', ') || '(none)'}`);
        console.log(`  Requirements: ${result.impacted.requirements.join(', ') || '(none)'}`);
        console.log();
      } catch (err) {
        if (err instanceof GraphPathError) {
          console.error(GRAPH_PATH_ERROR);
          process.exit(1);
        }
        throw err;
      }
    });
  });

graphCommand
  .command('trace <req>')
  .description('Trace requirement/task to code symbols')
  .option('--json', 'Emit JSON')
  .action(async (req: string, options: { json?: boolean }) => {
    await withGraph(async (graph) => {
      try {
        const result = traceRequirement(graph, req);
        if (options.json) {
          console.log(JSON.stringify(result));
          return;
        }
        console.log(chalk.blue.bold(`\n🔗 Trace ${result.req}\n`));
        for (const n of result.path) {
          console.log(`  ${chalk.cyan(n.id)} ${chalk.gray(`[${n.type}]`)}`);
        }
        if (result.symbols.length > 0) {
          console.log(chalk.bold('\n  Symbols:'));
          for (const s of result.symbols) console.log(`    ${s}`);
        }
        console.log();
      } catch (err) {
        if (err instanceof TraceFormatError) {
          console.error(chalk.red('Invalid requirement/task format. Use RF-N, O-N, or task-N.'));
          process.exit(1);
        }
        if (err instanceof TraceNotFoundError) {
          console.error(err.message);
          process.exit(1);
        }
        throw err;
      }
    });
  });

graphCommand
  .command('locate <seed>')
  .description('Locate code symbols/files/tasks from a seed query')
  .option('--json', 'Emit JSON')
  .option('--hops <n>', 'Traversal hops', '3')
  .option('--limit <n>', 'Max candidates', '10')
  .option('--type <t>', 'Filter node types (repeatable)', collectRepeated, [] as string[])
  .option('--edge-type <e>', 'Filter edge types (repeatable)', collectRepeated, [] as string[])
  .action(
    async (
      seed: string,
      options: {
        json?: boolean;
        hops: string;
        limit: string;
        type: string[];
        edgeType: string[];
      },
    ) => {
      const hops = parseInt(options.hops, 10) || 3;
      const limit = parseInt(options.limit, 10) || 10;
      const nodeTypes = options.type.length > 0 ? (options.type as NodeType[]) : undefined;
      const edgeTypes = options.edgeType.length > 0 ? (options.edgeType as EdgeType[]) : undefined;

      await withGraph(async (graph) => {
        try {
          const result = graph.locate(seed, { hops, limit, nodeTypes, edgeTypes });
          if (options.json) {
            console.log(JSON.stringify(formatLocateJson(seed, result)));
            return;
          }
          console.log(chalk.blue.bold(`\n📍 Locate "${seed}"\n`));
          for (const c of result.candidates) {
            console.log(
              `${chalk.cyan(c.node.id)}  score=${c.score.toFixed(2)}  ${chalk.gray(`[${c.node.type}]`)}`,
            );
          }
          console.log();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('..') || msg.includes('relative')) {
            console.error(GRAPH_PATH_ERROR);
            process.exit(1);
          }
          throw err;
        }
      });
    },
  );

graphCommand
  .command('drift')
  .description('Detect requirement/code drift from the graph')
  .option('--strict', 'Exit with code 7 when drift thresholds fail')
  .option('--format <fmt>', 'Output format: human | json', 'human')
  .option('--modules <list>', 'Limit traversal to modules (comma-separated relative paths)')
  .action(async (options: { strict?: boolean; format?: string; modules?: string }) => {
    const format = parseDriftFormat(options.format);
    if (!format) {
      console.error(chalk.red(`Unsupported format "${options.format}". Use: human | json.`));
      process.exit(1);
      return;
    }

    let modules: string[] | undefined;
    try {
      modules = parseDriftModules(options.modules);
    } catch {
      console.error(GRAPH_PATH_ERROR);
      process.exit(1);
      return;
    }

    let driftConfig: DriftConfig;
    try {
      driftConfig = await loadProjectDriftConfig(process.cwd());
    } catch (err) {
      if (err instanceof DriftConfigError) {
        console.error(chalk.red(`❌ ${err.message}`));
        process.exit(1);
        return;
      }
      throw err;
    }

    await withGraph(async (graph) => {
      const targetGraph = modules && modules.length > 0 ? scopeGraphToModules(graph, modules) : graph;
      const report = detectDrift(targetGraph, driftConfig);
      const driftFail = isDriftFailure(report, driftConfig);

      if (format === 'json') {
        console.log(JSON.stringify(report));
      } else {
        printDriftReport(report, driftFail, modules);
      }

      if (driftFail && options.strict) {
        process.exit(DRIFT_FAIL_EXIT);
        return;
      }
    });
  });

graphCommand
  .command('ingest')
  .description('Re-sync the graph from the current dare-dag.yaml + state')
  .option('--dag <file>', 'Path to dare-dag.yaml', 'DARE/dare-dag.yaml')
  .option('--requirements-only', 'Re-parse DESIGN/BLUEPRINT/TASKS only, skip the DAG', false)
  .action(async (options: { dag: string; requirementsOnly?: boolean }) => {
    const cwd = process.cwd();

    if (options.requirementsOnly) {
      await withGraph(async (graph) => {
        const { nodes, edges } = ingestRequirements(graph, cwd);
        await runIncrementalSemanticIndex(graph, cwd);
        const stats = graph.getStatistics();
        console.log(
          chalk.green(
            `✅ Re-ingested requirements (${nodes} nodes / ${edges} edges). ` +
              `Graph now has ${stats.totalNodes} nodes / ${stats.totalEdges} edges.`,
          ),
        );
      });
      return;
    }

    const dagPath = path.resolve(cwd, options.dag);
    if (!(await fs.pathExists(dagPath))) {
      console.error(chalk.red(`❌ ${options.dag} not found.`));
      process.exit(1);
    }

    const dag = convertYamlToDag(await fs.readFile(dagPath, 'utf-8'));
    await loadAndApplyState(dag, path.resolve(cwd, '.dare/state.json'));

    await withGraph(async (graph) => {
      ingestDag(graph, dag);
      const req = ingestRequirements(graph, cwd);
      await runIncrementalSemanticIndex(graph, cwd);
      const stats = graph.getStatistics();
      console.log(
        chalk.green(
          `✅ Re-ingested ${dag.tasks.length} tasks + ${req.nodes} requirement nodes. ` +
            `Graph now has ${stats.totalNodes} nodes / ${stats.totalEdges} edges.`,
        ),
      );
    });
  });

// ─── Helpers ────────────────────────────────────────────────────────────────

async function withGraph(fn: (g: KnowledgeGraph) => Promise<void>): Promise<void> {
  const cwd = process.cwd();
  let graph: KnowledgeGraph | undefined;
  try {
    const config = await loadGraphConfig({ cwd });
    graph = await createGraph(config, { cwd });
    await fn(graph);
  } catch (err) {
    console.error(chalk.red(`❌ ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  } finally {
    await Promise.resolve(graph?.close());
  }
}

interface NodeLite {
  id: string;
  type: string;
  label: string;
}
interface EdgeLite {
  sourceId: string;
  targetId: string;
  type: string;
}

const REQ_LAYER = new Set(['requirement', 'task']);
const CODE_LAYER = new Set(['code_symbol', 'file']);

export function renderMermaid(nodes: NodeLite[], edges: EdgeLite[]): string {
  const lines: string[] = ['graph LR'];
  const reqNodes = nodes.filter((n) => REQ_LAYER.has(n.type));
  const codeNodes = nodes.filter((n) => CODE_LAYER.has(n.type));
  const otherNodes = nodes.filter((n) => !REQ_LAYER.has(n.type) && !CODE_LAYER.has(n.type));

  const emitNode = (n: NodeLite) => {
    const safeId = sanitizeMermaidId(n.id);
    const label = `${n.label}\\n[${n.type}]`.replace(/"/g, '&quot;');
    lines.push(`    ${safeId}["${label}"]`);
    if (REQ_LAYER.has(n.type)) lines.push(`    class ${safeId} requirement`);
    if (CODE_LAYER.has(n.type)) lines.push(`    class ${safeId} code`);
  };

  if (reqNodes.length > 0) {
    lines.push('  subgraph requirements [Requirements]');
    for (const n of reqNodes) emitNode(n);
    lines.push('  end');
  }
  if (codeNodes.length > 0) {
    lines.push('  subgraph code [Code]');
    for (const n of codeNodes) emitNode(n);
    lines.push('  end');
  }
  for (const n of otherNodes) emitNode(n);

  if (reqNodes.length > 0 || codeNodes.length > 0) {
    lines.push('  classDef requirement fill:#cde,stroke:#36c;');
    lines.push('  classDef code fill:#cec,stroke:#3a3;');
  }

  for (const e of edges) {
    const src = sanitizeMermaidId(e.sourceId);
    const tgt = sanitizeMermaidId(e.targetId);
    lines.push(`  ${src} -- ${e.type} --> ${tgt}`);
  }
  return lines.join('\n');
}

export function renderDot(nodes: NodeLite[], edges: EdgeLite[]): string {
  const lines: string[] = ['digraph DARE {', '  rankdir=LR;', '  node [shape=box];'];
  const reqNodes = nodes.filter((n) => REQ_LAYER.has(n.type));
  const codeNodes = nodes.filter((n) => CODE_LAYER.has(n.type));
  const otherNodes = nodes.filter((n) => !REQ_LAYER.has(n.type) && !CODE_LAYER.has(n.type));

  const emitDotNode = (n: NodeLite, indent: string) => {
    const id = JSON.stringify(n.id);
    const label = JSON.stringify(`${n.label}\n[${n.type}]`);
    const color = REQ_LAYER.has(n.type)
      ? 'fillcolor="#ccddff",style=filled'
      : CODE_LAYER.has(n.type)
        ? 'fillcolor="#ccffcc",style=filled'
        : '';
    lines.push(`  ${indent}${id} [label=${label}${color ? `,${color}` : ''}];`);
  };

  if (reqNodes.length > 0) {
    lines.push('  subgraph cluster_requirements {');
    lines.push('    label="Requirements";');
    for (const n of reqNodes) emitDotNode(n, '    ');
    lines.push('  }');
  }
  if (codeNodes.length > 0) {
    lines.push('  subgraph cluster_code {');
    lines.push('    label="Code";');
    for (const n of codeNodes) emitDotNode(n, '    ');
    lines.push('  }');
  }
  for (const n of otherNodes) emitDotNode(n, '  ');

  for (const e of edges) {
    const src = JSON.stringify(e.sourceId);
    const tgt = JSON.stringify(e.targetId);
    const lbl = JSON.stringify(e.type);
    lines.push(`  ${src} -> ${tgt} [label=${lbl}];`);
  }
  lines.push('}');
  return lines.join('\n');
}

function sanitizeMermaidId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function collectRepeated(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function parseDriftFormat(raw?: string): DriftOutputFormat | null {
  const normalized = (raw ?? 'human').trim().toLowerCase();
  if (normalized === 'human' || normalized === 'json') return normalized;
  return null;
}

function parseDriftModules(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  const normalized = parts.map(normalizeModulePath);
  return [...new Set(normalized)].sort();
}

function normalizeModulePath(modulePath: string): string {
  assertRelativeSafe(modulePath);
  const posix = modulePath
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/\/+$/, '');
  return posix.length > 0 ? posix : '.';
}

async function loadProjectDriftConfig(cwd: string): Promise<DriftConfig> {
  const file = path.join(cwd, 'dare.config.json');
  const raw = (await fs.pathExists(file)) ? ((await fs.readJson(file)) as unknown) : {};
  return parseDriftConfig(raw);
}

function isDriftFailure(report: DriftReport, cfg: DriftConfig): boolean {
  return (
    report.counts['orphan-requirement'] > cfg.maxOrphanReqs ||
    report.counts['orphan-code'] > cfg.maxOrphanCode ||
    (cfg.failOnStale && report.counts.stale > 0)
  );
}

function printDriftReport(
  report: DriftReport,
  driftFail: boolean,
  modules?: readonly string[],
): void {
  console.log(chalk.blue.bold('\nGraph Drift Report\n'));
  if (modules && modules.length > 0) {
    console.log(`  Modules: ${modules.join(', ')}`);
  }
  for (const kind of DRIFT_KINDS) {
    console.log(`  ${kind}: ${report.counts[kind]}`);
  }
  if (report.staleIndeterminate > 0) {
    console.log(`  stale-indeterminate: ${report.staleIndeterminate}`);
  }
  console.log(`  verdict: ${driftFail ? 'drift-fail' : 'pass'}`);

  if (report.findings.length === 0) {
    console.log(chalk.green('\nNo drift findings.\n'));
    return;
  }

  const grouped = new Map<DriftKind, Array<(typeof report.findings)[number]>>();
  for (const kind of DRIFT_KINDS) grouped.set(kind, []);
  for (const finding of report.findings) {
    const bucket = grouped.get(finding.kind);
    if (bucket) {
      bucket.push(finding);
    }
  }

  for (const kind of DRIFT_KINDS) {
    const findings = grouped.get(kind) ?? [];
    if (findings.length === 0) continue;
    console.log(chalk.bold(`\n${kind} (${findings.length})`));
    for (const finding of findings) {
      console.log(`  - ${finding.nodeId}: ${finding.detail}`);
    }
  }
  console.log();
}

function scopeGraphToModules(graph: KnowledgeGraph, modules: readonly string[]): KnowledgeGraph {
  const scopedCodeNodeIds = new Set<string>();
  const scopedRequirementIds = new Set<string>();

  for (const node of graph.queryNodes('code_symbol', DRIFT_QUERY_LIMIT)) {
    const candidates = codeSymbolPathCandidates(node);
    const inScope = candidates.some((candidate) =>
      modules.some((modulePrefix) => pathIsUnderModule(candidate, modulePrefix)),
    );
    if (inScope) scopedCodeNodeIds.add(node.id);
  }

  for (const codeNodeId of scopedCodeNodeIds) {
    const linkedEdges = [
      ...graph.getEdges(codeNodeId, 'out'),
      ...graph.getEdges(codeNodeId, 'in'),
    ];
    for (const edge of linkedEdges) {
      if (edge.type !== 'implements' && edge.type !== 'affects') continue;
      const source = graph.getNode(edge.sourceId);
      const target = graph.getNode(edge.targetId);
      if (source?.type === 'requirement') scopedRequirementIds.add(source.id);
      if (target?.type === 'requirement') scopedRequirementIds.add(target.id);
    }
  }

  const allowedNodeIds = new Set<string>([...scopedCodeNodeIds, ...scopedRequirementIds]);
  return createScopedGraphView(graph, allowedNodeIds);
}

function createScopedGraphView(graph: KnowledgeGraph, allowedNodeIds: ReadonlySet<string>): KnowledgeGraph {
  const view = Object.create(graph) as KnowledgeGraph;

  view.getNode = (id: string) => (allowedNodeIds.has(id) ? graph.getNode(id) : null);
  view.queryNodes = (type?: NodeType, limit?: number) => {
    const filtered = graph.queryNodes(type, DRIFT_QUERY_LIMIT).filter((node) =>
      allowedNodeIds.has(node.id),
    );
    return typeof limit === 'number' ? filtered.slice(0, limit) : filtered;
  };
  view.getEdges = (nodeId: string, direction: 'out' | 'in' | 'both' = 'both') => {
    if (!allowedNodeIds.has(nodeId)) return [];
    return graph.getEdges(nodeId, direction).filter((edge) => {
      return allowedNodeIds.has(edge.sourceId) && allowedNodeIds.has(edge.targetId);
    });
  };
  view.exportToJson = () => {
    const exported = graph.exportToJson();
    return {
      nodes: exported.nodes.filter((node) => allowedNodeIds.has(node.id)),
      edges: exported.edges.filter(
        (edge) => allowedNodeIds.has(edge.sourceId) && allowedNodeIds.has(edge.targetId),
      ),
    };
  };

  return view;
}

function codeSymbolPathCandidates(node: GraphNode): string[] {
  const candidates = new Set<string>();
  const metadataPath = node.metadata?.path;
  if (typeof metadataPath === 'string' && metadataPath.length > 0) {
    candidates.add(metadataPath);
  }
  const metadataQualified = node.metadata?.qualifiedName;
  if (typeof metadataQualified === 'string' && metadataQualified.length > 0) {
    candidates.add(metadataQualified.split('::')[0] ?? metadataQualified);
  }
  if (node.id.startsWith('code_symbol:')) {
    candidates.add((node.id.slice('code_symbol:'.length).split('::')[0] ?? node.id).trim());
  }
  return [...candidates].map((candidate) => candidate.replace(/\\/g, '/'));
}

function pathIsUnderModule(candidatePath: string, modulePrefix: string): boolean {
  if (modulePrefix === '.') return true;
  return candidatePath === modulePrefix || candidatePath.startsWith(`${modulePrefix}/`);
}
