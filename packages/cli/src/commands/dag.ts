import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { convertYamlToDag } from '../utils/dag-converter.js';
import {
  type Dag,
  type DagTask,
  type TaskStatus,
} from '../dag-runner/run_dag.js';
import {
  DEFAULT_STATE_PATH,
  loadAndApplyState,
} from '../dag-runner/state-store.js';
import {
  renderDagExcalidraw,
  serializeExcalidraw,
} from '../utils/excalidraw-renderer.js';
import {
  renderGraphMermaid,
  renderGraphDot,
  escapeMermaid,
  type GraphNode,
} from '../utils/graph-renderer.js';

/**
 * `dare dag` — inspect and visualize the static task DAG declared in
 * `dare-dag.yaml`. Distinct from `dare graph`, which inspects the populated
 * knowledge graph (only contains tasks already executed).
 */
export const dagCommand = new Command('dag').description(
  'Inspect and visualize the static task DAG (dare-dag.yaml)',
);

dagCommand
  .command('viz')
  .description(
    'Render dare-dag.yaml as a Mermaid, DOT, or Excalidraw diagram with status colors',
  )
  .option('--dag <file>', 'Path to dare-dag.yaml', 'DARE/dare-dag.yaml')
  .option(
    '-f, --format <fmt>',
    'Output format: mermaid | dot | excalidraw',
    'mermaid',
  )
  .option(
    '-o, --output <file>',
    'Write to file (defaults to stdout or DARE/dag-graph.{fmt} for excalidraw)',
  )
  .action(
    async (options: { dag: string; format: string; output?: string }) => {
      const cwd = process.cwd();
      const dagPath = path.resolve(cwd, options.dag);

      if (!(await fs.pathExists(dagPath))) {
        console.error(chalk.red(`❌ ${options.dag} not found.`));
        console.log(chalk.yellow('Run: dare blueprint'));
        process.exit(1);
      }

      const format = options.format.toLowerCase();
      if (format !== 'mermaid' && format !== 'dot' && format !== 'excalidraw') {
        console.error(
          chalk.red(`Unsupported format "${options.format}". Use: mermaid | dot | excalidraw.`),
        );
        process.exit(1);
      }

      const dag = convertYamlToDag(await fs.readFile(dagPath, 'utf-8'));
      await loadAndApplyState(dag, path.resolve(cwd, DEFAULT_STATE_PATH));

      let rendered: string;
      let outputPath = options.output;

      if (format === 'excalidraw') {
        const excalidrawData = renderDagExcalidraw(dag);
        rendered = serializeExcalidraw(excalidrawData);
        // Default output for Excalidraw
        if (!outputPath) {
          outputPath = 'DARE/dag-graph.excalidraw';
        }
      } else {
        rendered =
          format === 'mermaid' ? renderDagMermaid(dag) : renderDagDot(dag);
      }

      if (outputPath) {
        const out = path.resolve(cwd, outputPath);
        await fs.ensureDir(path.dirname(out));
        await fs.writeFile(out, rendered);
        const formatLabel = format === 'excalidraw' ? 'Excalidraw diagram' : `${format} diagram`;
        console.log(
          chalk.green(
            `✅ Generated ${formatLabel} with ${dag.tasks.length} task(s) and ${countEdges(dag)} dependency arrow(s) → ${outputPath}`,
          ),
        );
        if (format === 'excalidraw') {
          console.log(
            chalk.cyan('   Open in https://excalidraw.com or via File → Open'),
          );
        }
      } else {
        console.log(rendered);
      }
    },
  );

// ─── Renderers ───────────────────────────────────────────────────────────────

const STATUS_ICON: Record<TaskStatus, string> = {
  PENDING: '⏳',
  RUNNING: '🔄',
  DONE: '✅',
  FAILED: '❌',
  SKIPPED: '⏭️',
};

const MERMAID_CLASSES = [
  'classDef st_pending fill:#f3f4f6,stroke:#9ca3af,color:#374151;',
  'classDef st_running fill:#dbeafe,stroke:#2563eb,color:#1e3a8a;',
  'classDef st_done fill:#dcfce7,stroke:#16a34a,color:#14532d;',
  'classDef st_failed fill:#fee2e2,stroke:#dc2626,color:#7f1d1d;',
  'classDef st_skipped fill:#e5e7eb,stroke:#6b7280,color:#374151;',
];

const DOT_FILL: Record<TaskStatus, string> = {
  PENDING: '#f3f4f6',
  RUNNING: '#dbeafe',
  DONE: '#dcfce7',
  FAILED: '#fee2e2',
  SKIPPED: '#e5e7eb',
};
const DOT_BORDER: Record<TaskStatus, string> = {
  PENDING: '#9ca3af',
  RUNNING: '#2563eb',
  DONE: '#16a34a',
  FAILED: '#dc2626',
  SKIPPED: '#6b7280',
};

function taskLabelLines(task: DagTask): string[] {
  const status = task.status ?? 'PENDING';
  return [task.id, task.title, `${STATUS_ICON[status]} ${status}`];
}

export function renderDagMermaid(dag: Dag): string {
  const nodes: GraphNode[] = dag.tasks.map((task) => ({
    id: task.id,
    depends_on: task.depends_on,
    labelLines: taskLabelLines(task),
    bg: '',
    stroke: '',
    mermaidClass: `st_${(task.status ?? 'PENDING').toLowerCase()}`,
  }));
  return renderGraphMermaid(nodes, {
    headerComment: `DARE DAG — ${escapeMermaid(dag.title)}`,
    direction: 'LR',
    styling: 'class',
    classDefs: MERMAID_CLASSES,
  });
}

export function renderDagDot(dag: Dag): string {
  const nodes: GraphNode[] = dag.tasks.map((task) => {
    const status = task.status ?? 'PENDING';
    return {
      id: task.id,
      depends_on: task.depends_on,
      labelLines: taskLabelLines(task),
      bg: DOT_FILL[status],
      stroke: DOT_BORDER[status],
    };
  });
  return renderGraphDot(nodes, { name: 'DareDAG' });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function countEdges(dag: Dag): number {
  return dag.tasks.reduce((sum, t) => sum + t.depends_on.length, 0);
}
