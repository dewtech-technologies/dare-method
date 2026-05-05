/**
 * Build the upstream context block injected into a child task's prompt.
 *
 * Each parent contributes a snippet capped at `parent_context_chars` chars
 * (per the canonical `dare-dag.yaml` `limits` block). The snippet is the tail
 * of the parent's output — that's where the most decision-relevant content
 * tends to sit for AI agents (final answer, file paths, conclusions).
 *
 * The output is deterministic and self-describing so the child can locate
 * each parent's contribution.
 */
import type { DagTask } from '../run_dag.js';

export interface StitchContextInput {
  task: DagTask;
  parents: DagTask[];
  parentContextChars: number;
}

const HEADER = '## Upstream context';

export function stitchParentContext({
  parents,
  parentContextChars,
}: StitchContextInput): string {
  if (parents.length === 0) return '';
  if (parentContextChars <= 0) return '';

  const blocks: string[] = [HEADER, ''];
  for (const parent of parents) {
    const snippet = takeTail(parent.output ?? '', parentContextChars);
    blocks.push(`### From parent: ${parent.id} — ${parent.title}`);
    if (snippet.trim().length === 0) {
      blocks.push('_(no captured output)_');
    } else {
      blocks.push(snippet);
    }
    blocks.push('');
  }
  return blocks.join('\n');
}

/**
 * Compose the final prompt sent to a runner: the task's `subtask_prompt`
 * concatenated with the upstream context block (when present).
 */
export function composePrompt(input: StitchContextInput): string {
  const ctx = stitchParentContext(input);
  if (ctx.length === 0) return input.task.subtask_prompt;
  return `${input.task.subtask_prompt.trim()}\n\n${ctx}`.trimEnd() + '\n';
}

function takeTail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `…${text.slice(text.length - maxChars + 1)}`;
}
