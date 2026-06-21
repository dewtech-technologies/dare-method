import type { DnaFacts } from '../../utils/dna-detector.js';
import type { DiscoveredPattern, PatternsFacts } from '../../utils/pattern-detector.js';
import type { DnaAstSlice, PatternsAstSlice } from './types.js';

const NEST_LAYER = 'nestjs-module';

function mergeArchitecture(regex: DnaFacts['architecture'], ast: DnaAstSlice): DnaFacts['architecture'] {
  const layers = new Set(regex.detectedLayers.map((l) => l.toLowerCase()));
  for (const layer of ast.extraLayers) layers.add(layer.toLowerCase());

  let guess = regex.guess;
  const hasNest = ast.extraLayers.includes(NEST_LAYER) || layers.has(NEST_LAYER);
  if (hasNest && !guess.includes('Nest')) {
    guess = 'NestJS modular (Controller → Service → Repository)';
  } else if (
    ast.diPatterns.includes('nestjs-constructor-injection') &&
    guess === 'indefinido'
  ) {
    guess = 'Layered (DI / constructor injection)';
  }

  return {
    detectedLayers: [...layers].sort(),
    guess,
  };
}

/** Merge regex DNA facts with AST slice — superset of layers and library hints. */
export function mergeDnaFacts(regex: DnaFacts, ast: DnaAstSlice): DnaFacts {
  const libraries = { ...regex.libraries };
  for (const [k, v] of Object.entries(ast.libraryHints)) {
    if (v && !libraries[k as keyof DnaFacts['libraries']]) {
      libraries[k as keyof DnaFacts['libraries']] = v;
    }
  }

  return {
    ...regex,
    architecture: mergeArchitecture(regex.architecture, ast),
    libraries,
  };
}

function evidenceKey(e: DiscoveredPattern['evidence'][number]): string {
  return `${e.file}:${e.line ?? 0}`;
}

function mergePattern(existing: DiscoveredPattern, incoming: DiscoveredPattern): DiscoveredPattern {
  const seen = new Set(existing.evidence.map(evidenceKey));
  const evidence = [...existing.evidence];
  for (const e of incoming.evidence) {
    const key = evidenceKey(e);
    if (!seen.has(key)) {
      seen.add(key);
      evidence.push(e);
    }
  }
  const modules = [...new Set([...existing.modules, ...incoming.modules])].sort();
  return {
    ...existing,
    frequency: Math.max(existing.frequency, incoming.frequency),
    coverage: Math.max(existing.coverage, incoming.coverage),
    evidence: evidence.slice(0, 8),
    modules,
    marker: 'confirmed',
  };
}

/** Merge regex patterns with AST patterns — dedupe by id, union evidence. */
export function mergePatternsFacts(regex: PatternsFacts, ast: PatternsAstSlice): PatternsFacts {
  const byId = new Map<string, DiscoveredPattern>();
  for (const p of regex.patterns) byId.set(p.id, { ...p, evidence: [...p.evidence], modules: [...p.modules] });
  for (const p of ast.patterns) {
    const existing = byId.get(p.id);
    if (existing) byId.set(p.id, mergePattern(existing, p));
    else byId.set(p.id, { ...p, evidence: [...p.evidence], modules: [...p.modules] });
  }

  const patterns = [...byId.values()].sort((a, b) => {
    const k = a.kind.localeCompare(b.kind);
    return k !== 0 ? k : a.id.localeCompare(b.id);
  });

  return { ...regex, patterns };
}
