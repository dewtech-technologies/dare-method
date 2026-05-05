import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { convertYamlToDag } from '../utils/dag-converter.js';
import { ingestDag } from '../dag-runner/graph-ingest.js';
import { loadAndApplyState } from '../dag-runner/state-store.js';
import { createGraph, loadGraphConfig } from '../graphrag/index.js';
import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';

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
] as const;
type KnownNodeType = (typeof KNOWN_NODE_TYPES)[number];

graphCommand
  .command('query <term>')
  .description('Search nodes whose label/description contains <term>')
  .option('-l, --limit <n>', 'Maximum results', '10')
  .option('-t, --type <type>', `Restrict to a node type (${KNOWN_NODE_TYPES.join(' | ')})`)
  .action(async (term: string, options: { limit: string; type?: string }) => {
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
      const all = graph.searchNodes(term, rawLimit);
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
  .command('ingest')
  .description('Re-sync the graph from the current dare-dag.yaml + state')
  .option('--dag <file>', 'Path to dare-dag.yaml', 'DARE/dare-dag.yaml')
  .action(async (options: { dag: string }) => {
    const cwd = process.cwd();
    const dagPath = path.resolve(cwd, options.dag);
    if (!(await fs.pathExists(dagPath))) {
      console.error(chalk.red(`❌ ${options.dag} not found.`));
      process.exit(1);
    }

    const dag = convertYamlToDag(await fs.readFile(dagPath, 'utf-8'));
    await loadAndApplyState(dag, path.resolve(cwd, '.dare/state.json'));

    await withGraph(async (graph) => {
      ingestDag(graph, dag);
      const stats = graph.getStatistics();
      console.log(
        chalk.green(
          `✅ Re-ingested ${dag.tasks.length} tasks. Graph now has ${stats.totalNodes} nodes / ${stats.totalEdges} edges.`,
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
    graph?.close();
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

function renderMermaid(nodes: NodeLite[], edges: EdgeLite[]): string {
  const lines: string[] = ['graph LR'];
  for (const n of nodes) {
    const safeId = sanitizeMermaidId(n.id);
    const label = `${n.label}\\n[${n.type}]`.replace(/"/g, '&quot;');
    lines.push(`  ${safeId}["${label}"]`);
  }
  for (const e of edges) {
    const src = sanitizeMermaidId(e.sourceId);
    const tgt = sanitizeMermaidId(e.targetId);
    lines.push(`  ${src} -- ${e.type} --> ${tgt}`);
  }
  return lines.join('\n');
}

function renderDot(nodes: NodeLite[], edges: EdgeLite[]): string {
  const lines: string[] = ['digraph DARE {', '  rankdir=LR;', '  node [shape=box];'];
  for (const n of nodes) {
    const id = JSON.stringify(n.id);
    const label = JSON.stringify(`${n.label}\n[${n.type}]`);
    lines.push(`  ${id} [label=${label}];`);
  }
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
