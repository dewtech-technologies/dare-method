import type { DiscoveredPattern } from '../../utils/pattern-detector.js';
import type { ModuleInfo } from '../../utils/module-detector.js';
import type { ConventionExtractOptions, PatternsAstExtractResult } from './types.js';
import { scanConventionFiles } from './scan.js';
import { walkScannedFile } from './parse-file.js';

const DEFAULT_MAX_BYTES = 1_048_576;

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

function modulesForFile(modules: readonly ModuleInfo[], file: string): string[] {
  const norm = toPosix(file);
  return [
    ...new Set(
      modules
        .filter((m) => norm.startsWith(`${toPosix(m.path)}/`) || norm === toPosix(m.path))
        .map((m) => m.id),
    ),
  ].sort();
}

function pushPattern(
  map: Map<string, DiscoveredPattern>,
  pattern: DiscoveredPattern,
): void {
  const existing = map.get(pattern.id);
  if (!existing) {
    map.set(pattern.id, pattern);
    return;
  }
  const mergedEvidence = [...existing.evidence];
  for (const e of pattern.evidence) {
    if (!mergedEvidence.some((x) => x.file === e.file && x.line === e.line)) {
      mergedEvidence.push(e);
    }
  }
  map.set(pattern.id, {
    ...existing,
    frequency: Math.max(existing.frequency, pattern.frequency),
    coverage: Math.max(existing.coverage, pattern.coverage),
    evidence: mergedEvidence,
  });
}

/** AST walk for pattern mining — Nest modules, controller DI, Zod validation. */
export async function extractPatternsWithAst(
  opts: ConventionExtractOptions,
): Promise<PatternsAstExtractResult> {
  const maxBytes = opts.maxFileBytes ?? DEFAULT_MAX_BYTES;
  const scanned = await scanConventionFiles(opts.root, opts.files, maxBytes);
  const map = new Map<string, DiscoveredPattern>();
  let parsedAny = false;
  const totalRelevant = scanned.length || 1;

  for (const file of scanned) {
    const mods = modulesForFile(opts.modules, file.rel);
    const walked = await walkScannedFile(file, (node) => {
      const text = node.text;
      const isController = /\.controller\.(ts|js)$/i.test(file.rel) || /@Controller\s*\(/.test(text);

      if (/@Module\s*\(\s*\{/.test(text)) {
        pushPattern(map, {
          id: 'structural-idiom:nest-module',
          kind: 'structural-idiom',
          description: 'NestJS @Module decorator',
          frequency: 1,
          coverage: 1 / totalRelevant,
          evidence: [{ file: file.rel, line: node.startPosition.row + 1 }],
          modules: mods,
          marker: 'confirmed',
        });
      }

      if (isController && /constructor\s*\([\s\S]*:\s*\w+Service\b/.test(text)) {
        pushPattern(map, {
          id: 'call-idiom:controller-service',
          kind: 'call-idiom',
          description: 'Controller constructor injects *Service',
          frequency: 1,
          coverage: 1 / totalRelevant,
          evidence: [{ file: file.rel, line: node.startPosition.row + 1 }],
          modules: mods,
          marker: 'confirmed',
        });
      }

      if (/z\.object\s*\(/.test(text)) {
        pushPattern(map, {
          id: 'call-idiom:schema-validation',
          kind: 'call-idiom',
          description: 'Zod schema validation (z.object)',
          frequency: 1,
          coverage: 1 / totalRelevant,
          evidence: [{ file: file.rel, line: node.startPosition.row + 1 }],
          modules: mods,
          marker: 'confirmed',
        });
      }
    });
    if (walked) parsedAny = true;
  }

  return {
    slice: { patterns: [...map.values()] },
    astAvailable: parsedAny,
  };
}
