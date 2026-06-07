import { createHash } from 'node:crypto';

function normalizeStderr(stderr: string): string {
  let normalized = stderr.toLowerCase();
  normalized = normalized.replace(
    /\/(?:[\w.-]+\/)+[\w.-]+/g,
    '<path>',
  );
  normalized = normalized.replace(
    /[a-z]:\\(?:[\w.-]+\\)+[\w.-]*/gi,
    '<path>',
  );
  normalized = normalized.replace(
    /\d{4}-\d{2}-\d{2}t[\d:.]+z?/g,
    '<ts>',
  );
  normalized = normalized.replace(/\b[0-9a-f]{8,}\b/g, '<hex>');
  normalized = normalized.replace(/:\d+:/g, ':<line>:');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

/** Stable 8-hex failure signature for saturation detection (RF-06). */
export function failureSignature(input: {
  readonly failedAspect: string;
  readonly stderr: string;
}): string {
  const normalized = normalizeStderr(input.stderr);
  const payload = `${input.failedAspect}\n${normalized}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 8);
}
