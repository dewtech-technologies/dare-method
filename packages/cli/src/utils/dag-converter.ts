import { parse } from 'yaml';
import type { Dag, DagTask } from '../dag-runner/run_dag.js';

/**
 * Convert dare-dag.yaml content to Dag object
 */
export function convertYamlToDag(yamlContent: string): Dag {
  const raw = parse(yamlContent) as Record<string, unknown>;

  const tasks = (raw.tasks as Record<string, unknown>[]).map((t) => ({
    id: t.id as string,
    title: (t.title as string) || t.id as string,
    depends_on: (t.depends_on as string[]) || [],
    complexity: (t.complexity as DagTask['complexity']) || 'MED',
    subtask_prompt: (t.subtask_prompt as string) || '',
    status: 'PENDING' as const,
  }));

  return {
    title: (raw.title as string) || 'DARE Project',
    version: (raw.version as string) || '1.0.0',
    models: (raw.models as Record<string, string>) || {},
    tasks,
  };
}

/**
 * Convert Dag object back to YAML string
 */
export function convertDagToYaml(dag: Dag): string {
  const lines = [
    `title: "${dag.title}"`,
    `version: "${dag.version}"`,
    ``,
    `models:`,
    ...Object.entries(dag.models).map(([k, v]) => `  ${k}: "${v}"`),
    ``,
    `tasks:`,
  ];

  for (const task of dag.tasks) {
    lines.push(`  - id: ${task.id}`);
    lines.push(`    title: "${task.title}"`);
    lines.push(`    depends_on: [${task.depends_on.map((d) => `"${d}"`).join(', ')}]`);
    lines.push(`    complexity: ${task.complexity}`);
    lines.push(`    subtask_prompt: |`);
    task.subtask_prompt.split('\n').forEach((l) => lines.push(`      ${l}`));
    lines.push('');
  }

  return lines.join('\n');
}
