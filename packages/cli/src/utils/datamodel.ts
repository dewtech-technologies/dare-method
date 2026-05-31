/**
 * Deterministic data-model (ERD) + API-surface extraction for
 * `dare reverse --deep` (Phase 3 brownfield).
 *
 * Line/regex-based — no AST — matching the rest of the CLI. Covers the common
 * cases (SQL migrations, Prisma, light ORM relations, and routes for
 * Express/Nest/Laravel/FastAPI/Gin); anything it can't parse is left for the
 * `/dare-reverse` skill to complete (marked 🟡).
 *
 * Concept inspired by the Reversa Architect/Detective agents
 * (Macedo & da Costa, arXiv:2605.18684, 2026) — clean-room, deterministic.
 *
 * License: MIT (part of DARE CLI).
 */

import fs from 'fs-extra';
import path from 'path';

export interface EntityField {
  name: string;
  type: string;
}
export interface EntityRelation {
  to: string;
  kind: string; // belongs-to | has-many | references | relation
}
export interface Entity {
  name: string;
  fields: EntityField[];
  relations: EntityRelation[];
  source: string; // `path:line`
}
export interface Endpoint {
  method: string;
  route: string;
  source: string; // `path:line`
}
export interface DataModel {
  entities: Entity[];
  endpoints: Endpoint[];
}

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.next',
  'coverage', '.turbo', 'out', '__pycache__', '.venv', 'venv', '.cache', 'tmp',
]);

const SCAN_EXT = new Set([
  '.sql', '.prisma', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.py', '.php', '.rb', '.go',
]);

interface ScanFile {
  rel: string;
  content: string;
}

async function collectFiles(root: string): Promise<ScanFile[]> {
  const out: ScanFile[] = [];
  async function recurse(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })) as fs.Dirent[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        await recurse(path.join(dir, e.name));
      } else if (e.isFile() && SCAN_EXT.has(path.extname(e.name))) {
        const abs = path.join(dir, e.name);
        const content = await fs.readFile(abs, 'utf-8').catch(() => '');
        if (content) out.push({ rel: toPosix(path.relative(root, abs)), content });
      }
    }
  }
  await recurse(root);
  return out;
}

export async function extractDataModel(root: string): Promise<DataModel> {
  const files = await collectFiles(root);
  const entities: Entity[] = [];
  const endpoints: Endpoint[] = [];

  for (const f of files) {
    const base = path.basename(f.rel);
    const lower = f.rel.toLowerCase();

    if (base === 'schema.prisma') entities.push(...parsePrisma(f));
    if (f.rel.endsWith('.sql') || lower.includes('/migrations/')) entities.push(...parseSql(f));
    if (/\.(ts|js|php|rb|py)$/.test(f.rel)) entities.push(...parseOrm(f));

    endpoints.push(...parseEndpoints(f));
  }

  return { entities: dedupeEntities(entities), endpoints: dedupeEndpoints(endpoints) };
}

// ── Parsers: entities ──────────────────────────────────────────────────────

/** Prisma scalar types — uppercase but NOT relations to other models. */
const PRISMA_SCALARS = new Set([
  'Int', 'BigInt', 'String', 'Boolean', 'DateTime', 'Float', 'Decimal', 'Bytes', 'Json',
]);

function parsePrisma(f: ScanFile): Entity[] {
  const out: Entity[] = [];
  const lines = f.content.split(/\r?\n/);
  let cur: Entity | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^\s*model\s+(\w+)\s*\{/.exec(line);
    if (m) {
      cur = { name: m[1], fields: [], relations: [], source: `${f.rel}:${i + 1}` };
      out.push(cur);
      continue;
    }
    if (cur) {
      if (/^\s*\}/.test(line)) {
        cur = null;
        continue;
      }
      const fld = /^\s*(\w+)\s+(\w+)(\[\])?/.exec(line);
      if (fld) {
        const type = fld[2];
        // A field whose type is a non-scalar model name is a relation.
        if (/^[A-Z]/.test(type) && !PRISMA_SCALARS.has(type)) {
          cur.relations.push({ to: type, kind: fld[3] ? 'has-many' : 'relation' });
        } else {
          cur.fields.push({ name: fld[1], type: type + (fld[3] ?? '') });
        }
      }
    }
  }
  return out;
}

function parseSql(f: ScanFile): Entity[] {
  const out: Entity[] = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"\[]?(\w+)[`"\]]?\s*\(([\s\S]*?)\)\s*;/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(f.content)) !== null) {
    const line = f.content.slice(0, m.index).split(/\r?\n/).length;
    const name = m[1];
    const body = m[2];
    const fields: EntityField[] = [];
    const relations: EntityRelation[] = [];
    for (const raw of body.split(',')) {
      const col = raw.trim();
      const fk = /FOREIGN\s+KEY[^)]*\)\s*REFERENCES\s+[`"\[]?(\w+)/i.exec(col);
      if (fk) {
        relations.push({ to: fk[1], kind: 'references' });
        continue;
      }
      const c = /^[`"\[]?(\w+)[`"\]]?\s+([A-Za-z]+)/.exec(col);
      if (c && !/^(PRIMARY|FOREIGN|UNIQUE|KEY|CONSTRAINT|INDEX|CHECK)$/i.test(c[1])) {
        fields.push({ name: c[1], type: c[2].toLowerCase() });
      }
    }
    out.push({ name, fields, relations, source: `${f.rel}:${line}` });
  }
  return out;
}

function parseOrm(f: ScanFile): Entity[] {
  const out: Entity[] = [];
  const lines = f.content.split(/\r?\n/);
  // TypeORM @Entity class / Eloquent extends Model / ActiveRecord < ApplicationRecord / SQLAlchemy(Base)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let name: string | null = null;
    if (/@Entity\b/.test(l)) {
      // class on this or a following line
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const cm = /class\s+(\w+)/.exec(lines[j]);
        if (cm) { name = cm[1]; break; }
      }
    } else {
      const cm =
        /class\s+(\w+)\s+extends\s+Model\b/.exec(l) || // Eloquent
        /class\s+(\w+)\s*<\s*ApplicationRecord\b/.exec(l) || // ActiveRecord
        /class\s+(\w+)\s*<\s*ActiveRecord::Base\b/.exec(l) ||
        /class\s+(\w+)\s*\(\s*Base\s*\)/.exec(l); // SQLAlchemy
      if (cm) name = cm[1];
    }
    if (!name) continue;

    const entity: Entity = { name, fields: [], relations: [], source: `${f.rel}:${i + 1}` };
    // Scan the next ~40 lines for relations.
    for (let j = i + 1; j < Math.min(i + 40, lines.length); j++) {
      const rel =
        /\b(belongsTo|hasMany|hasOne|belongsToMany)\s*\(\s*([A-Za-z_]\w*)/.exec(lines[j]) ||
        /\b(belongs_to|has_many|has_one)\s+:(\w+)/.exec(lines[j]) ||
        /@(ManyToOne|OneToMany|OneToOne|ManyToMany)\s*\(\s*\(\)\s*=>\s*(\w+)/.exec(lines[j]) ||
        /relationship\(\s*["'](\w+)["']/.exec(lines[j]);
      if (rel) {
        const to = rel[2] ?? rel[1];
        const kind = (rel[1] || 'relation').toString();
        entity.relations.push({ to: capitalize(to.replace(/Model$|::class/g, '')), kind: normalizeKind(kind) });
      }
    }
    if (entity.relations.length > 0) out.push(entity);
  }
  return out;
}

// ── Parsers: endpoints ─────────────────────────────────────────────────────

const ENDPOINT_PATTERNS: RegExp[] = [
  /@(Get|Post|Put|Patch|Delete|Options|Head)\(\s*['"`]([^'"`]*)['"`]/g, // NestJS decorators
  /\b(?:app|router|r|route|api)\.(get|post|put|patch|delete|options|head)\(\s*['"`]([^'"`]+)['"`]/g, // Express/Gin-js
  /Route::(get|post|put|patch|delete|options|any|match)\(\s*['"]([^'"]+)['"]/g, // Laravel
  /@(?:app|router)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g, // FastAPI
  /\.(GET|POST|PUT|PATCH|DELETE)\(\s*"([^"]+)"/g, // Go/Gin
];

function parseEndpoints(f: ScanFile): Endpoint[] {
  const out: Endpoint[] = [];
  const lines = f.content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const re of ENDPOINT_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(lines[i])) !== null) {
        out.push({ method: m[1].toUpperCase(), route: m[2], source: `${f.rel}:${i + 1}` });
      }
    }
  }
  return out;
}

// ── Renderers ───────────────────────────────────────────────────────────────

export function renderErd(model: DataModel, generatedAt: string): string {
  const { entities } = model;
  const lines: string[] = [
    '# ERD — modelo de dados reconstruído',
    '',
    `*Gerado: ${generatedAt}*`,
    '',
    '> 🟢 Extraído deterministicamente de migrations/Prisma/ORM (com evidência `arquivo:linha`).',
    '> Relações ou entidades não-explícitas no schema devem ser completadas pela skill (🟡).',
    '',
  ];

  if (entities.length === 0) {
    lines.push('_(nenhuma entidade detectada em migrations/Prisma/ORM — complete via `/dare-reverse`.)_', '');
  } else {
    lines.push('```mermaid', 'erDiagram');
    for (const e of entities) {
      for (const r of e.relations) {
        lines.push(`  ${erd(e.name)} ||--o{ ${erd(r.to)} : "${r.kind}"`);
      }
    }
    for (const e of entities) {
      if (e.fields.length === 0) continue;
      lines.push(`  ${erd(e.name)} {`);
      for (const f of e.fields.slice(0, 20)) lines.push(`    ${sanitizeType(f.type)} ${f.name}`);
      lines.push('  }');
    }
    lines.push('```', '');
    lines.push('| Entidade | Campos | Relações | Evidência |', '|---|---|---|---|');
    for (const e of entities) {
      const fields = e.fields.length ? e.fields.map((f) => f.name).slice(0, 8).join(', ') : '—';
      const rels = e.relations.length ? e.relations.map((r) => `${r.kind}→${r.to}`).join(', ') : '—';
      lines.push(`| ${e.name} | ${fields} | ${rels} | \`${e.source}\` |`);
    }
    lines.push('');
  }

  lines.push('---', '*DARE Method — Fase 3 brownfield (ERD determinístico). License: MIT.*');
  return lines.join('\n') + '\n';
}

export function renderApiSurface(model: DataModel, generatedAt: string): string {
  const { endpoints } = model;
  const lines: string[] = [
    '# API Surface — endpoints reconstruídos',
    '',
    `*Gerado: ${generatedAt}*`,
    '',
    '> 🟢 Extraído deterministicamente de rotas (Express/Nest/Laravel/FastAPI/Gin), com evidência.',
    '',
  ];
  if (endpoints.length === 0) {
    lines.push('_(nenhum endpoint detectado — complete via `/dare-reverse` se houver API.)_', '');
  } else {
    lines.push('| Método | Rota | Origem |', '|---|---|---|');
    for (const e of endpoints) lines.push(`| ${e.method} | \`${e.route}\` | \`${e.source}\` |`);
    lines.push('');
  }
  lines.push('---', '*DARE Method — Fase 3 brownfield (API surface determinístico). License: MIT.*');
  return lines.join('\n') + '\n';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dedupeEntities(entities: Entity[]): Entity[] {
  const byName = new Map<string, Entity>();
  for (const e of entities) {
    const key = e.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, e);
    } else {
      // Merge fields/relations from multiple sources.
      for (const f of e.fields) if (!existing.fields.some((x) => x.name === f.name)) existing.fields.push(f);
      for (const r of e.relations) if (!existing.relations.some((x) => x.to === r.to && x.kind === r.kind)) existing.relations.push(r);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function dedupeEndpoints(endpoints: Endpoint[]): Endpoint[] {
  const seen = new Set<string>();
  const out: Endpoint[] = [];
  for (const e of endpoints) {
    const key = `${e.method} ${e.route}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.sort((a, b) => (a.route + a.method).localeCompare(b.route + b.method));
}

function erd(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
}
function sanitizeType(t: string): string {
  return t.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'field';
}
function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
function normalizeKind(k: string): string {
  const map: Record<string, string> = {
    belongsTo: 'belongs-to', belongs_to: 'belongs-to', ManyToOne: 'belongs-to',
    hasMany: 'has-many', has_many: 'has-many', OneToMany: 'has-many', belongsToMany: 'many-to-many', ManyToMany: 'many-to-many',
    hasOne: 'has-one', has_one: 'has-one', OneToOne: 'has-one',
  };
  return map[k] ?? 'relation';
}
function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}
