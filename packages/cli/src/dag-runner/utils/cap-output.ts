/**
 * Cap a task's captured output at `task_output_chars` chars (per the
 * canonical `dare-dag.yaml` `limits` block).
 *
 * Capping applies to the in-memory `output` that gets:
 *  1. stitched as upstream context for downstream tasks
 *  2. shown on the canvas / logs
 *
 * The full output (if larger) is returned as-is to the caller so it can
 * decide whether to persist the original elsewhere — capping is for the
 * runner's bookkeeping, not for the underlying API call.
 */

const TRUNCATION_NOTICE = '…[truncated by DARE — output_cap reached]';

export function capOutput(text: string, maxChars: number): string {
  if (maxChars <= 0) return '';
  if (text.length <= maxChars) return text;

  const room = Math.max(0, maxChars - TRUNCATION_NOTICE.length);
  return text.slice(0, room) + TRUNCATION_NOTICE;
}
