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
import type { AstLanguageId, ExtractionMeta } from '../ast/types.js';
import { extractWithAst, mergeDataModels } from '../ast/index.js';

export type { AstLanguageId, ExtractionMeta };

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

export interface ExtractDataModelOptions {
  readonly ast?: boolean;
  readonly astLanguages?: ReadonlyArray<AstLanguageId>;
  readonly maxFileBytes?: number;
}

export interface ExtractDataModelResult {
  readonly model: DataModel;
  readonly extraction?: ExtractionMeta;
}

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.next',
  'coverage', '.turbo', 'out', '__pycache__', '.venv', 'venv', '.cache', 'tmp',
]);

const SCAN_EXT = new Set([
  '.sql', '.prisma', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.py', '.php', '.rb', '.go', '.rs',
]);

/**
 * Directories whose classes/types are treated as domain entities
 * (framework-agnostic). NOTE: `dto`/`dtos` are deliberately excluded — DTOs are
 * API request/response shapes, not persistence entities. Filenames ending in
 * `.entity.*` / `.model.*` are always treated as entities (see extractDataModel).
 */
const DATA_DIR_RE = /(^|\/)(models?|entities|entity|domain|schemas?)\//i;

/** A `*.entity.*` / `*.model.*` file is a persistence entity regardless of dir. */
const ENTITY_FILE_RE = /\.(entity|model)\.(ts|tsx|js|py|php|rb|go|rs)$/i;

/**
 * Names that look like transport/value shapes, not persistence entities.
 * Used to drop false positives that leak in via `domain/` type scans.
 */
const NON_ENTITY_NAME_RE =
  /(Dto|Request|Response|Input|Output|Payload|Params?|Query|Filter|Options?|Props|Config|Args?|Result|Mapper|Factory|Builder|Handler|Service|Controller|Module|Guard|Interceptor|Pipe|Middleware|Resolver|Strategy|Adapter|Port|UseCase|Command|Event|Query)$/;

/** SQL keywords that leak in as "table refs" from DDL clauses. */
const SQL_KEYWORDS = new Set([
  'CASCADE', 'SET', 'NULL', 'DEFAULT', 'RESTRICT', 'ACTION', 'NO', 'KEY',
  'PRIMARY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'INDEX', 'CONSTRAINT', 'TABLE',
  'EXISTS', 'IF', 'AND', 'OR', 'NOT', 'TRUE', 'FALSE',
]);

function looksLikeEntity(name: string): boolean {
  if (name.length < 3) return false; // single/double-char generics like "a"
  if (!/^[A-Z]/.test(name)) return false; // entities are PascalCase
  if (/^[A-Z][A-Z0-9_]*$/.test(name)) return false; // ALL-CAPS → SQL keyword/constant, not a class
  if (SQL_KEYWORDS.has(name.toUpperCase())) return false;
  if (NON_ENTITY_NAME_RE.test(name)) return false;
  return true;
}

interface ScanFile {
  rel: string;
  content: string;
}

async function collectFiles(root: string, maxFileBytes?: number): Promise<ScanFile[]> {
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
        if (maxFileBytes !== undefined) {
          const stat = await fs.stat(abs).catch(() => null);
          if (!stat || stat.size > maxFileBytes) continue;
        }
        const content = await fs.readFile(abs, 'utf-8').catch(() => '');
        if (content) out.push({ rel: toPosix(path.relative(root, abs)), content });
      }
    }
  }
  await recurse(root);
  return out;
}

async function extractDataModelRegex(root: string, maxFileBytes?: number): Promise<DataModel> {
  const files = await collectFiles(root, maxFileBytes);
  const entities: Entity[] = [];
  const endpoints: Endpoint[] = [];

  for (const f of files) {
    const base = path.basename(f.rel);
    const lower = f.rel.toLowerCase();

    // A `*.dto.*` file is never a persistence entity — skip its type scan.
    const isDtoFile = /\.dto\.(ts|tsx|js|py|php|rb)$/i.test(f.rel) || /(^|\/)dtos?\//i.test(lower);

    // High-confidence sources — kept regardless of name casing (SQL tables are
    // often lowercase like `produtos` / `users`).
    if (base === 'schema.prisma') entities.push(...parsePrisma(f));
    entities.push(...parseSql(f)); // CREATE TABLE DDL
    // Table names referenced in queries — drop SQL keywords (CASCADE, SET, …)
    // that leak from DDL clauses, but keep real (lowercase) table names.
    entities.push(...parseSqlTableRefs(f).filter((e) => !SQL_KEYWORDS.has(e.name.toUpperCase())));
    if (/\.(ts|js|php|rb|py)$/.test(f.rel)) entities.push(...parseOrm(f)); // @Entity/Eloquent/…

    // Broad type/class scan: data dirs or *.entity.*/*.model.* files, never a
    // DTO. `*.entity.*` files are trusted; loose `domain/` types are name-filtered
    // to drop transport/value shapes (DTOs, generics, all-caps constants).
    if (!isDtoFile && (DATA_DIR_RE.test(lower) || ENTITY_FILE_RE.test(f.rel))) {
      const typed = parseTypes(f);
      entities.push(...(ENTITY_FILE_RE.test(f.rel) ? typed : typed.filter((e) => looksLikeEntity(e.name))));
    }

    endpoints.push(...parseEndpoints(f));
  }

  return { entities: dedupeEntities(entities), endpoints: dedupeEndpoints(endpoints) };
}

export async function extractDataModelDetailed(
  root: string,
  opts?: ExtractDataModelOptions,
): Promise<ExtractDataModelResult> {
  const regexModel = await extractDataModelRegex(root, opts?.maxFileBytes);

  if (!opts?.ast) {
    return { model: regexModel };
  }

  const astResult = await extractWithAst({
    root,
    languages: opts.astLanguages,
    maxFileBytes: opts.maxFileBytes,
  });

  const merged = mergeDataModels(regexModel, astResult.model);
  const extraction: ExtractionMeta = {
    mode: 'hybrid',
    astEnabled: true,
    astLanguages: astResult.meta.astLanguages,
    astAvailable: astResult.meta.astAvailable,
    regexFallback: !astResult.meta.astAvailable,
    astEndpoints: astResult.meta.astEndpoints,
    regexEndpoints: regexModel.endpoints.length,
    astEntities: astResult.meta.astEntities,
    regexEntities: regexModel.entities.length,
  };

  return { model: merged, extraction };
}

export async function extractDataModel(root: string, opts?: ExtractDataModelOptions): Promise<DataModel> {
  return (await extractDataModelDetailed(root, opts)).model;
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
    // Scan the next ~60 lines for relations AND column/property fields, until
    // the class body closes.
    let depth = 0;
    for (let j = i; j < Math.min(i + 60, lines.length); j++) {
      const lj = lines[j];
      depth += (lj.match(/\{/g) || []).length - (lj.match(/\}/g) || []).length;

      const rel =
        /\b(belongsTo|hasMany|hasOne|belongsToMany)\s*\(\s*([A-Za-z_]\w*)/.exec(lj) ||
        /\b(belongs_to|has_many|has_one)\s+:(\w+)/.exec(lj) ||
        /@(ManyToOne|OneToMany|OneToOne|ManyToMany)\s*\(\s*\(\)\s*=>\s*(\w+)/.exec(lj) ||
        /relationship\(\s*["'](\w+)["']/.exec(lj);
      if (rel) {
        const to = rel[2] ?? rel[1];
        const kind = (rel[1] || 'relation').toString();
        entity.relations.push({ to: capitalize(to.replace(/Model$|::class/g, '')), kind: normalizeKind(kind) });
      } else if (j > i) {
        // Property/column field: `name: type` (TS), optionally @Column-decorated.
        const fm = /^\s*(?:@\w+\([^)]*\)\s*)?(\w+)\??\s*:\s*([\w[\]<>., |]+)/.exec(lj);
        if (fm && !/^(constructor|function|async|public|private|protected|static|get|set)$/.test(fm[1])) {
          entity.fields.push({ name: fm[1], type: fm[2].trim().replace(/[;,].*$/, '') });
        }
      }
      if (j > i && depth <= 0) break; // class body closed
    }
    out.push(entity); // confirmed entity by @Entity / extends Model / etc.
  }
  return out;
}

// ── Parsers: endpoints (multi-dialect, framework-agnostic per language) ──────

/** Per-method patterns where both the verb and the path are captured on one line. */
const ENDPOINT_PATTERNS: RegExp[] = [
  /@(Get|Post|Put|Patch|Delete|Options|Head)\(\s*['"`]([^'"`]*)['"`]/g, // NestJS decorators
  /\b(?:app|router|r|route|api)\.(get|post|put|patch|delete|options|head)\(\s*['"`]([^'"`]+)['"`]/g, // Express/Koa/Fastify
  /Route::(get|post|put|patch|delete|options|any|match)\(\s*['"]([^'"]+)['"]/g, // Laravel
  /@(?:app|router)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g, // FastAPI
  /\.(GET|POST|PUT|PATCH|DELETE)\(\s*"([^"]+)"/g, // Go/Gin/Echo
  /\$\w+->(get|post|put|patch|delete|options|head|map)\(\s*['"]([^'"]+)['"]/g, // PHP Slim/microframeworks
  /\.route\(\s*"([^"]+)"\s*,\s*(get|post|put|patch|delete)\s*\(/g, // Rust/Axum (path THEN method)
];

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

function parseEndpoints(f: ScanFile): Endpoint[] {
  const out: Endpoint[] = [];
  const lines = f.content.split(/\r?\n/);
  const isRuby = f.rel.endsWith('.rb');

  // Class-level route prefix for frameworks that split it from the method
  // decorator: NestJS @Controller('x'), Spring @RequestMapping("/x"). A file
  // usually hosts one controller; we apply its prefix to method-decorator
  // routes (NestJS @Get/@Post …). Full-path frameworks (Express/Laravel/…) are
  // unaffected.
  const ctrlMatch =
    /@Controller\(\s*['"`]([^'"`]*)['"`]/.exec(f.content) ||
    /@RequestMapping\(\s*(?:value\s*=\s*)?['"]([^'"]*)['"]/.exec(f.content);
  const classPrefix = ctrlMatch ? ctrlMatch[1] : '';

  const joinRoute = (prefix: string, route: string): string => {
    const a = prefix.replace(/^\/+|\/+$/g, '');
    const b = route.replace(/^\/+|\/+$/g, '');
    const joined = [a, b].filter(Boolean).join('/');
    return '/' + joined;
  };

  // 1. Per-method, single-line patterns.
  for (let i = 0; i < lines.length; i++) {
    for (const re of ENDPOINT_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(lines[i])) !== null) {
        // Axum captures (path, method); the others capture (method, path).
        const axum = re.source.startsWith('\\.route');
        const method = (axum ? m[2] : m[1]).toUpperCase();
        const rawRoute = axum ? m[1] : m[2];
        // Only NestJS method decorators (first pattern, starts with @Get/@Post)
        // need the controller prefix composed in.
        const isNestDecorator = re.source.startsWith('@(Get');
        const route = isNestDecorator ? joinRoute(classPrefix, rawRoute) : rawRoute;
        out.push({ method, route, source: `${f.rel}:${i + 1}` });
      }
    }
    // Bare NestJS decorators `@Get()` / `@Post()` (no path arg) → controller-root route.
    const bareNest = /@(Get|Post|Put|Patch|Delete|Options|Head)\(\s*\)/.exec(lines[i]);
    if (bareNest) {
      out.push({
        method: bareNest[1].toUpperCase(),
        route: joinRoute(classPrefix, ''),
        source: `${f.rel}:${i + 1}`,
      });
    }
    // Ruby Sinatra / Rails routes.rb: `get '/x'`.
    if (isRuby) {
      const rm = /^\s*(get|post|put|patch|delete|match)\s+['"]([^'"]+)['"]/.exec(lines[i]);
      if (rm) out.push({ method: rm[1].toUpperCase(), route: rm[2], source: `${f.rel}:${i + 1}` });
    }
  }

  // 2. Methods-array dialects (Flask / Symfony attribute): path + methods list → expand.
  const arrayRe = /(?:@\w+\.route|#\[\s*Route)\(\s*['"]([^'"]+)['"][\s\S]{0,80}?methods\s*[:=]\s*\[([^\]]+)\]/g;
  let am: RegExpExecArray | null;
  while ((am = arrayRe.exec(f.content)) !== null) {
    const route = am[1];
    const ln = lineAt(f.content, am.index);
    for (const part of am[2].split(',')) {
      const meth = /([A-Za-z]+)/.exec(part);
      if (meth) out.push({ method: meth[1].toUpperCase(), route, source: `${f.rel}:${ln}` });
    }
  }
  // Flask route without explicit methods → GET.
  const flaskGetRe = /@\w+\.route\(\s*['"]([^'"]+)['"]\s*\)/g;
  let fm: RegExpExecArray | null;
  while ((fm = flaskGetRe.exec(f.content)) !== null) {
    out.push({ method: 'GET', route: fm[1], source: `${f.rel}:${lineAt(f.content, fm.index)}` });
  }

  // 3. Method-less dialects (Django path/re_path/url, Go stdlib HandleFunc) → ANY.
  const anyRe = /(?:\b(?:path|re_path|url)\(\s*r?['"]([^'"]+)['"]|\.HandleFunc\(\s*"([^"]+)")/g;
  let nm: RegExpExecArray | null;
  while ((nm = anyRe.exec(f.content)) !== null) {
    const route = nm[1] ?? nm[2];
    if (route) out.push({ method: 'ANY', route, source: `${f.rel}:${lineAt(f.content, nm.index)}` });
  }

  return out;
}

// ── Parsers: SQL table references (queries without DDL) ──────────────────────

const SQL_PRESENCE_RE = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i;
const SQL_TABLE_REF_RE = /\b(?:from|join|into|update)\s+[`"[]?([a-zA-Z_]\w*)[`"\]]?/gi;
const SQL_STOP = new Set([
  'select', 'where', 'set', 'values', 'dual', 'as', 'on', 'using', 'order', 'group', 'limit', 'having',
]);

function parseSqlTableRefs(f: ScanFile): Entity[] {
  if (!SQL_PRESENCE_RE.test(f.content)) return [];
  const out: Entity[] = [];
  const seen = new Set<string>();
  const lines = f.content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    SQL_TABLE_REF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SQL_TABLE_REF_RE.exec(lines[i])) !== null) {
      const name = m[1];
      const key = name.toLowerCase();
      if (SQL_STOP.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({ name, fields: [], relations: [], source: `${f.rel}:${i + 1}` });
    }
  }
  return out;
}

// ── Parsers: plain types/classes/structs (framework-agnostic, data dirs only) ─

function parseTypes(f: ScanFile): Entity[] {
  const ext = path.extname(f.rel);
  if (ext === '.php') return parsePhpClasses(f);
  if (ext === '.py') return parsePyClasses(f);
  if (ext === '.go') return parseGoStructs(f);
  if (ext === '.ts' || ext === '.tsx') return parseTsTypes(f);
  if (ext === '.rb') return parseRubyClasses(f);
  if (ext === '.rs') return parseRustStructs(f);
  return [];
}

function phpType(t: string): string {
  return t.replace(/^\\+/, '').slice(0, 24) || 'mixed';
}

function parsePhpClasses(f: ScanFile): Entity[] {
  const out: Entity[] = [];
  const lines = f.content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const cm = /\bclass\s+(\w+)/.exec(lines[i]);
    if (!cm) continue;
    const entity: Entity = { name: cm[1], fields: [], relations: [], source: `${f.rel}:${i + 1}` };
    for (let j = i + 1; j < Math.min(i + 80, lines.length); j++) {
      if (/\bclass\s+\w+/.test(lines[j])) break;
      // Constructor-promoted properties.
      for (const p of lines[j].matchAll(/(?:public|private|protected)\s+(?:readonly\s+)?\??([\w\\]+)\s+\$(\w+)/g)) {
        entity.fields.push({ name: p[2], type: phpType(p[1]) });
      }
      // Typed property declarations.
      const pm = /^\s*(?:public|private|protected)\s+(?:readonly\s+)?\??([\w\\]+)\s+\$(\w+)/.exec(lines[j]);
      if (pm) entity.fields.push({ name: pm[2], type: phpType(pm[1]) });
    }
    if (entity.fields.length > 0) out.push(dedupeFields(entity));
  }
  return out;
}

function parsePyClasses(f: ScanFile): Entity[] {
  const out: Entity[] = [];
  const lines = f.content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const cm = /^class\s+(\w+)/.exec(lines[i]);
    if (!cm) continue;
    const entity: Entity = { name: cm[1], fields: [], relations: [], source: `${f.rel}:${i + 1}` };
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\S/.test(lines[j])) break; // dedent to top level → end of class
      const fm = /^\s+(\w+)\s*:\s*([\w[\], .|]+?)(\s*=.*)?$/.exec(lines[j]);
      if (fm && !/^(def|return|if|for|while|with|class)$/.test(fm[1])) {
        entity.fields.push({ name: fm[1], type: fm[2].trim() });
      }
    }
    if (entity.fields.length > 0) out.push(entity);
  }
  return out;
}

function parseGoStructs(f: ScanFile): Entity[] {
  const out: Entity[] = [];
  const re = /type\s+(\w+)\s+struct\s*\{([\s\S]*?)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(f.content)) !== null) {
    const entity: Entity = { name: m[1], fields: [], relations: [], source: `${f.rel}:${lineAt(f.content, m.index)}` };
    for (const raw of m[2].split(/\r?\n/)) {
      const fm = /^\s*([A-Z]\w*)\s+([\w[\]*.]+)/.exec(raw);
      if (fm) entity.fields.push({ name: fm[1], type: fm[2] });
    }
    if (entity.fields.length > 0) out.push(entity);
  }
  return out;
}

function parseTsTypes(f: ScanFile): Entity[] {
  const out: Entity[] = [];
  const re = /(?:interface\s+(\w+)\s*(?:extends\s+[\w<>, ]+)?\{|type\s+(\w+)\s*=\s*\{)([\s\S]*?)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(f.content)) !== null) {
    const name = m[1] ?? m[2];
    const entity: Entity = { name, fields: [], relations: [], source: `${f.rel}:${lineAt(f.content, m.index)}` };
    for (const raw of m[3].split(/\r?\n/)) {
      const fm = /^\s*(\w+)\??\s*:\s*([\w[\]<>., |]+)/.exec(raw);
      if (fm) entity.fields.push({ name: fm[1], type: fm[2].trim().replace(/[;,]$/, '') });
    }
    if (entity.fields.length > 0) out.push(entity);
  }
  return out;
}

function parseRubyClasses(f: ScanFile): Entity[] {
  const out: Entity[] = [];
  const lines = f.content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const cm = /^\s*class\s+(\w+)/.exec(lines[i]);
    if (!cm) continue;
    const entity: Entity = { name: cm[1], fields: [], relations: [], source: `${f.rel}:${i + 1}` };
    for (let j = i + 1; j < Math.min(i + 60, lines.length); j++) {
      if (/^\s*class\s+\w/.test(lines[j])) break;
      const am = /\battr_(?:accessor|reader|writer)\s+(.+)/.exec(lines[j]);
      if (am) for (const sym of am[1].matchAll(/:(\w+)/g)) entity.fields.push({ name: sym[1], type: 'attr' });
    }
    if (entity.fields.length > 0) out.push(entity);
  }
  return out;
}

function parseRustStructs(f: ScanFile): Entity[] {
  const out: Entity[] = [];
  const re = /struct\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(f.content)) !== null) {
    const entity: Entity = { name: m[1], fields: [], relations: [], source: `${f.rel}:${lineAt(f.content, m.index)}` };
    for (const raw of m[2].split(/\r?\n/)) {
      const fm = /^\s*(?:pub\s+)?(\w+)\s*:\s*([\w<>:[\] ]+)/.exec(raw);
      if (fm) entity.fields.push({ name: fm[1], type: fm[2].trim().replace(/,$/, '') });
    }
    if (entity.fields.length > 0) out.push(entity);
  }
  return out;
}

function dedupeFields(e: Entity): Entity {
  const seen = new Set<string>();
  e.fields = e.fields.filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true)));
  return e;
}

// ── Renderers ───────────────────────────────────────────────────────────────

export function renderErd(model: DataModel, generatedAt: string): string {
  const { entities } = model;
  const lines: string[] = [
    '# ERD — modelo de dados reconstruído',
    '',
    `*Gerado: ${generatedAt}*`,
    '',
    '> 🟢 Extraído deterministicamente de SQL (DDL/queries), Prisma, ORMs e tipos/classes/structs '
      + 'em pastas de modelo — independe de framework (com evidência `arquivo:linha`).',
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
