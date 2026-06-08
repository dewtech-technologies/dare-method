/**
 * Deterministic pattern mining for brownfield discovery (RF-01).
 * Extracts facts by frequency/co-occurrence — no LLM, read-only on target project.
 */
import fs from 'fs-extra';
import path from 'node:path';
import type { Marker } from './confidence.js';
import type { DnaFacts } from './dna-detector.js';
import { isTestFile, SUPPORTED_EXTENSIONS, inString } from './static-analyzer.js';
import { detectModules, type ModuleInfo } from './module-detector.js';

export type PatternKind =
  | 'inferred-layer'
  | 'naming-idiom'
  | 'structural-idiom'
  | 'call-idiom'
  | 'implicit-decision';

export interface PatternEvidence {
  readonly file: string;
  readonly line?: number;
}

export interface DiscoveredPattern {
  readonly id: string;
  readonly kind: PatternKind;
  readonly description: string;
  readonly frequency: number;
  readonly coverage: number;
  readonly evidence: readonly PatternEvidence[];
  readonly modules: readonly string[];
  readonly marker: Marker;
}

export interface PatternsFacts {
  readonly generatedAt: string;
  readonly fileInventorySource: DnaFacts['fileInventorySource'];
  readonly patterns: readonly DiscoveredPattern[];
}

export interface PatternRuleInput {
  readonly files: readonly string[];
  readonly modules: readonly ModuleInfo[];
  readonly dna: DnaFacts | null;
  readonly readFile: (rel: string) => string | null;
}

export interface PatternRule {
  readonly kind: PatternKind;
  readonly minFrequency: number;
  detect(input: PatternRuleInput): DiscoveredPattern[];
}

const NAMING_SUFFIXES = [
  { suffix: '.service.ts', slug: 'service-suffix', label: '.service.ts' },
  { suffix: '.controller.ts', slug: 'controller-suffix', label: '.controller.ts' },
  { suffix: '.repository.ts', slug: 'repository-suffix', label: '.repository.ts' },
] as const;

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function modulesForFile(modules: readonly ModuleInfo[], file: string): string[] {
  const norm = toPosix(file);
  const hits = modules
    .filter((m) => norm.startsWith(`${toPosix(m.path)}/`) || norm === toPosix(m.path))
    .map((m) => m.id);
  return [...new Set(hits)].sort();
}

function prodFiles(files: readonly string[]): string[] {
  return files.filter(
    (f) => SUPPORTED_EXTENSIONS.has(path.extname(f)) && !isTestFile(f),
  );
}

function makePattern(
  kind: PatternKind,
  slug: string,
  description: string,
  matched: string[],
  totalRelevant: number,
  modules: readonly ModuleInfo[],
  evidenceLimit = 5,
): DiscoveredPattern | null {
  if (matched.length === 0) return null;
  const evidence: PatternEvidence[] = matched.slice(0, evidenceLimit).map((file) => ({
    file: toPosix(file),
  }));
  return {
    id: `${kind}:${slug}`,
    kind,
    description,
    frequency: matched.length,
    coverage: totalRelevant > 0 ? matched.length / totalRelevant : 0,
    evidence,
    modules: [
      ...new Set(matched.flatMap((f) => modulesForFile(modules, f))),
    ].sort(),
    marker: 'confirmed',
  };
}

function detectNamingIdiom(input: PatternRuleInput): DiscoveredPattern[] {
  const relevant = prodFiles(input.files);
  const out: DiscoveredPattern[] = [];
  for (const { suffix, slug, label } of NAMING_SUFFIXES) {
    const matched = relevant
      .filter((f) => toPosix(f).endsWith(suffix))
      .sort();
    const p = makePattern(
      'naming-idiom',
      slug,
      `${matched.length} arquivos usam sufixo ${label}`,
      matched,
      relevant.length,
      input.modules,
    );
    if (p) out.push(p);
  }
  return out;
}

function detectInferredLayer(input: PatternRuleInput): DiscoveredPattern[] {
  const relevant = prodFiles(input.files);
  const segmentCounts = new Map<string, { count: number; files: string[] }>();

  for (const file of relevant) {
    const parts = toPosix(file).split('/').filter(Boolean);
    if (parts.length < 2) continue;
    const segment = parts.slice(0, 2).join('/');
    const entry = segmentCounts.get(segment) ?? { count: 0, files: [] };
    entry.count += 1;
    entry.files.push(file);
    segmentCounts.set(segment, entry);
  }

  const out: DiscoveredPattern[] = [];
  for (const [segment, { count, files }] of segmentCounts) {
    if (count < 2) continue;
    const sorted = [...files].sort();
    const p = makePattern(
      'inferred-layer',
      slugify(segment),
      `${count} arquivos co-ocorrem sob ${segment}/`,
      sorted,
      relevant.length,
      input.modules,
    );
    if (p) out.push(p);
  }
  return out;
}

function isBarrelFile(content: string): boolean {
  const lines = content.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
  if (lines.length === 0) return false;
  return lines.every((l) => /^export\s+.+\s+from\s+['"]/.test(l.trim()));
}

function detectStructuralIdiom(input: PatternRuleInput): DiscoveredPattern[] {
  const barrels: string[] = [];
  for (const file of input.files) {
    const base = path.basename(file);
    if (base !== 'index.ts' && base !== 'index.js') continue;
    const content = input.readFile(file);
    if (content && isBarrelFile(content)) barrels.push(file);
  }
  barrels.sort();
  const p = makePattern(
    'structural-idiom',
    'barrel-index',
    `${barrels.length} barrel files (index re-export)`,
    barrels,
    input.files.length,
    input.modules,
  );
  return p ? [p] : [];
}

function detectCallIdiom(input: PatternRuleInput): DiscoveredPattern[] {
  const out: DiscoveredPattern[] = [];
  const controllerService: PatternEvidence[] = [];
  const validationHits: PatternEvidence[] = [];

  for (const file of prodFiles(input.files)) {
    const norm = toPosix(file);
    const content = input.readFile(file);
    if (!content) continue;
    const lines = content.split('\n');

    if (/\.controller\./i.test(norm)) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (/Service/.test(line) && !inString(line, line.search(/Service/))) {
          controllerService.push({ file: norm, line: i + 1 });
          break;
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const zIdx = line.search(/\bz\.\w+/);
      if (zIdx >= 0 && !inString(line, zIdx)) {
        validationHits.push({ file: norm, line: i + 1 });
        break;
      }
      const parseIdx = line.search(/schema\.parse\s*\(/);
      if (parseIdx >= 0 && !inString(line, parseIdx)) {
        validationHits.push({ file: norm, line: i + 1 });
        break;
      }
    }
  }

  if (controllerService.length >= 2) {
    const files = [...new Set(controllerService.map((e) => e.file))].sort();
    out.push({
      id: 'call-idiom:controller-service',
      kind: 'call-idiom',
      description: `${files.length} controllers referenciam *Service`,
      frequency: files.length,
      coverage: prodFiles(input.files).length > 0 ? files.length / prodFiles(input.files).length : 0,
      evidence: controllerService.slice(0, 5),
      modules: [...new Set(files.flatMap((f) => modulesForFile(input.modules, f)))].sort(),
      marker: 'confirmed',
    });
  }

  if (validationHits.length >= 2) {
    const files = [...new Set(validationHits.map((e) => e.file))].sort();
    out.push({
      id: 'call-idiom:schema-validation',
      kind: 'call-idiom',
      description: `${files.length} arquivos usam validação z./schema.parse`,
      frequency: files.length,
      coverage: prodFiles(input.files).length > 0 ? files.length / prodFiles(input.files).length : 0,
      evidence: validationHits.slice(0, 5),
      modules: [...new Set(files.flatMap((f) => modulesForFile(input.modules, f)))].sort(),
      marker: 'confirmed',
    });
  }

  return out;
}

function countImportMentions(
  input: PatternRuleInput,
  needle: RegExp,
): { count: number; files: string[] } {
  const matched: string[] = [];
  for (const file of prodFiles(input.files)) {
    const content = input.readFile(file);
    if (!content) continue;
    if (needle.test(content)) matched.push(file);
  }
  matched.sort();
  return { count: matched.length, files: matched };
}

function detectImplicitDecision(input: PatternRuleInput): DiscoveredPattern[] {
  const out: DiscoveredPattern[] = [];
  const libs = input.dna?.libraries;

  if (libs?.orm) {
    const { count, files } = countImportMentions(
      input,
      new RegExp(libs.orm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    );
    if (count >= 2) {
      const p = makePattern(
        'implicit-decision',
        `orm-${slugify(libs.orm)}`,
        `ORM dominante: ${libs.orm} em ${count} arquivos`,
        files,
        prodFiles(input.files).length,
        input.modules,
      );
      if (p) out.push(p);
    }
  } else {
    for (const orm of ['prisma', 'typeorm', 'sequelize', 'drizzle']) {
      const { count, files } = countImportMentions(input, new RegExp(orm, 'i'));
      if (count >= 2) {
        const p = makePattern(
          'implicit-decision',
          `orm-${orm}`,
          `ORM dominante: ${orm} em ${count} arquivos`,
          files,
          prodFiles(input.files).length,
          input.modules,
        );
        if (p) out.push(p);
        break;
      }
    }
  }

  if (libs?.http) {
    const { count, files } = countImportMentions(
      input,
      new RegExp(libs.http.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    );
    if (count >= 2) {
      const p = makePattern(
        'implicit-decision',
        `http-${slugify(libs.http)}`,
        `HTTP client dominante: ${libs.http} em ${count} arquivos`,
        files,
        prodFiles(input.files).length,
        input.modules,
      );
      if (p) out.push(p);
    }
  }

  return out;
}

export const PATTERN_RULES: readonly PatternRule[] = [
  { kind: 'naming-idiom', minFrequency: 2, detect: detectNamingIdiom },
  { kind: 'inferred-layer', minFrequency: 2, detect: detectInferredLayer },
  { kind: 'structural-idiom', minFrequency: 1, detect: detectStructuralIdiom },
  { kind: 'call-idiom', minFrequency: 2, detect: detectCallIdiom },
  { kind: 'implicit-decision', minFrequency: 2, detect: detectImplicitDecision },
];

async function loadFileInventory(
  root: string,
  opts?: { modulesOnly?: readonly string[] },
): Promise<{ files: string[]; source: DnaFacts['fileInventorySource']; modules: ModuleInfo[] }> {
  const reverseFacts = path.join(root, 'DARE', 'REVERSE', 'reverse-facts.json');
  if (await fs.pathExists(reverseFacts)) {
    const facts = (await fs.readJson(reverseFacts)) as { modules?: ModuleInfo[] };
    let modules = facts?.modules ?? [];
    if (opts?.modulesOnly?.length) {
      const wanted = new Set(opts.modulesOnly.map((s) => s.toLowerCase()));
      modules = modules.filter(
        (m) => wanted.has(m.id.toLowerCase()) || wanted.has(m.name.toLowerCase()),
      );
    }
    const files = modules.flatMap((m) => m.files ?? []);
    if (files.length > 0) {
      return { files, source: 'reverse-facts', modules };
    }
  }
  const graph = await detectModules(root, {
    only: opts?.modulesOnly?.length ? [...opts.modulesOnly] : undefined,
  });
  return {
    files: graph.modules.flatMap((m) => m.files),
    source: 'module-detector',
    modules: graph.modules,
  };
}

function createReadFile(root: string): (rel: string) => string | null {
  const rootResolved = path.resolve(root);
  return (rel: string): string | null => {
    const norm = toPosix(rel);
    if (norm.startsWith('..') || path.isAbsolute(norm)) return null;
    const abs = path.resolve(rootResolved, norm);
    if (!abs.startsWith(rootResolved + path.sep) && abs !== rootResolved) return null;
    try {
      return fs.readFileSync(abs, 'utf-8');
    } catch {
      return null;
    }
  };
}

function filterAndSort(patterns: DiscoveredPattern[], rules: readonly PatternRule[]): DiscoveredPattern[] {
  const minByKind = new Map(rules.map((r) => [r.kind, r.minFrequency]));
  return patterns
    .filter((p) => {
      const min = minByKind.get(p.kind) ?? 1;
      return p.frequency >= min && p.evidence.length >= 1;
    })
    .sort((a, b) => {
      const k = a.kind.localeCompare(b.kind);
      return k !== 0 ? k : a.id.localeCompare(b.id);
    });
}

export async function detectPatterns(
  root: string,
  dna: DnaFacts | null,
  opts?: { modulesOnly?: readonly string[] },
): Promise<PatternsFacts> {
  const { files, source, modules } = await loadFileInventory(root, opts);
  const input: PatternRuleInput = {
    files,
    modules,
    dna,
    readFile: createReadFile(root),
  };

  const raw: DiscoveredPattern[] = [];
  for (const rule of PATTERN_RULES) {
    raw.push(...rule.detect(input));
  }

  return {
    generatedAt: dna?.generatedAt ?? '1970-01-01T00:00:00.000Z',
    fileInventorySource: source,
    patterns: filterAndSort(raw, PATTERN_RULES),
  };
}
