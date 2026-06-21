# Feature Blueprint: Brownfield AST (tree-sitter no `reverse --deep`)

> Derivado de [DESIGN-Feature-brownfield-ast.md](DESIGN-Feature-brownfield-ast.md).
> Único entregável desta etapa: este BLUEPRINT. Tasks/DAG/specs em `/dare-tasks`.
> Branch: `feat/v3.14-brownfield-ast` · Target: **v3.14.0** · License: MIT.
>
> **Base de evidências:** reusa `commands/reverse.ts`, `utils/datamodel.ts` (regex L5–8),
> `utils/reverse-facts.ts`, `utils/confidence.ts`, `ai/pipeline.ts` (reverse `--ai`),
> `ai/parity.ts`. Ancoragem: v3.13.0 @ monorepo CLI-only; brownfield `--deep` já shipped
> (DESIGN-Feature-reverse-deep). **Não toca** `static-analyzer.ts` (review permanece regex).

---

## 1. Visão Geral da Arquitetura

### 1.1 Princípio reitor

**Regex é o baseline; AST é superset opt-in.** `extractDataModel()` continua produzindo o
mesmo `DataModel` quando `--ast` está ausente. Com `--ast`, uma camada tree-sitter (WASM)
extrai rotas e classes ORM com precisão estrutural; o resultado **mergeia** com regex + parsers
SQL/Prisma existentes — nunca substitui o que já funciona. Zero LLM no core.

### 1.2 Diagrama

```mermaid
flowchart TB
  subgraph cmd["dare reverse"]
    flags["--deep [--ast] [--check] [--ai]"]
  end
  subgraph extract["extractDataModel(root, opts)"]
    sql["parseSql · parsePrisma<br/>(regex dedicado — inalterado)"]
    regex["parseRegexLegacy<br/>(ENDPOINT_PATTERNS · ORM heuristics)"]
    ast["ast/extractWithAst<br/>(web-tree-sitter + WASM grammars)"]
    merge["ast/mergeDataModels<br/>(dedupe superset)"]
    flags --> extract
    extract --> sql
    extract --> regex
    extract --> ast
    sql --> merge
    regex --> merge
    ast --> merge
  end
  merge --> dm["DataModel"]
  dm --> art["erd.md · api-surface.md · reverse-facts.json"]
  art -.semântico.-> skill["/dare-reverse · dare reverse --ai"]
```

### 1.3 Decisões Arquiteturais

| # | Decisão | Alternativas | Justificativa |
|---|---|---|---|
| A-1 | **`--ast` opt-in** na v3.14.0 | default-on day-1 | D-02; soak perf/tarball antes de flip |
| A-2 | **Merge superset** AST ∪ regex ∪ SQL/Prisma | AST-only | D-04; SQL/Prisma parsers maduros |
| A-3 | **`web-tree-sitter` + WASM** grammars | native `tree-sitter` bindings | D-03; npm global cross-platform |
| A-4 | **Lazy loader** com fallback silencioso | hard dep | RNF-01; install base não quebra |
| A-5 | **Escopo só `extractDataModel`** | AST em dna/patterns/review | D-01/D-06; escopo controlado |
| A-6 | **Artefatos inalterados** (paths/schema md) | novo formato ERD | O-06; skill/CI estáveis |
| A-7 | **`extraction` em reverse-facts.json** | log-only | RF-06; auditável no `--report` |
| A-8 | **Path confinement + maxFileBytes** | parse anything | RS-01/RS-04 |

---

## 2. Stack Técnica

| Camada | Tecnologia | Nota |
|---|---|---|
| Orquestração | `commands/reverse.ts` | flag `--ast`; repassa opts |
| Extração legacy | `utils/datamodel.ts` | regex + SQL + Prisma (EXTEND opts) |
| AST nova | `packages/cli/src/ast/*` (NEW) | loader, merge, queries por lang |
| Parser runtime | `web-tree-sitter` | WASM init once per process |
| Grammars P1 | `@tree-sitter/typescript`, `python`, `php` (pin) | optionalDependencies |
| Grammars P2 | go, ruby, rust grammar packages | SHOULD; fallback regex |
| Facts | `utils/reverse-facts.ts` | + bloco `extraction?` |
| Enrichment | `ai/pipeline.ts` | deep flag já existe; sem change funcional |
| Testes | vitest + fixtures multi-linha | `ast/` + `brownfield-ast-regression` |
| Docs | `docs-site/brownfield.md` (+ en/es) | seção `--ast` |

---

## 3. Contratos TypeScript

### 3.1 `src/ast/types.ts` (NEW)

```ts
export type AstLanguageId =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'php'
  | 'go'
  | 'ruby'
  | 'rust';

export interface AstLoaderStatus {
  readonly available: boolean;
  readonly reason?: string; // wasm load fail, optional dep missing
  readonly loadedLanguages: ReadonlyArray<AstLanguageId>;
}

export interface AstExtractOptions {
  readonly root: string;
  readonly languages?: ReadonlyArray<AstLanguageId>;
  readonly maxFileBytes?: number; // default 1_048_576
}

export interface ExtractionMeta {
  readonly mode: 'regex' | 'hybrid';
  readonly astEnabled: boolean;
  readonly astLanguages: ReadonlyArray<AstLanguageId>;
  readonly astAvailable: boolean;
  readonly regexFallback: boolean;
  readonly astEndpoints: number;
  readonly regexEndpoints: number;
  readonly astEntities: number;
  readonly regexEntities: number;
}
```

### 3.2 `src/ast/loader.ts` (NEW)

```ts
/** Lazy-init web-tree-sitter once; load WASM grammar by language id. */
export async function initAstLoader(): Promise<AstLoaderStatus>;

export async function loadGrammar(lang: AstLanguageId): Promise<Grammar | null>;
```

**Comportamento:**
- Primeira chamada: `Parser.init()` + cache de grammars carregadas.
- Falha (optional dep ausente, WASM corrupto): `available: false`, `reason` descritivo; **nunca throw** para o caller de `extractDataModel` — cai para regex-only.

### 3.3 `src/ast/index.ts` (NEW) — facade

```ts
import type { DataModel } from '../utils/datamodel.js';
import type { AstExtractOptions, ExtractionMeta } from './types.js';

export interface AstExtractResult {
  readonly model: DataModel;
  readonly meta: Pick<ExtractionMeta, 'astEndpoints' | 'astEntities' | 'astLanguages' | 'astAvailable'>;
}

/** Parse source files under root with tree-sitter queries; empty model if loader unavailable. */
export async function extractWithAst(opts: AstExtractOptions): Promise<AstExtractResult>;
```

### 3.4 `src/ast/merge.ts` (NEW)

```ts
import type { DataModel, Entity, Endpoint } from '../utils/datamodel.js';

/** Dedupe endpoints by (method, normalizedRoute); entities by (name, source file). Prefer AST source on tie. */
export function mergeDataModels(
  regexModel: DataModel,
  astModel: DataModel,
): DataModel;

export function normalizeRoute(route: string): string;
```

**Regras de dedupe:**
- Endpoint key: `METHOD + ' ' + normalizeRoute(route)` (lowercase method, trim slashes).
- Entity key: `name` (PascalCase/table) — merge fields/relations por união; `source` lista ambos se divergirem.
- Ordenação estável: entities por `name`, endpoints por `(method, route)` (RNF-03).

### 3.5 `src/ast/languages/*.ts` (NEW) — queries por linguagem

```ts
// languages/typescript.ts
export const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** Tree-sitter queries: NestJS decorators, Express app.get/post, @Controller prefix. */
export function extractFromTree(source: string, relPath: string): Partial<DataModel>;
```

P1 queries mínimas (MVP):

| Linguagem | Endpoints | Entidades |
|---|---|---|
| TS/JS | `@Get/@Post`, `router.get`, `@Controller` prefix multi-linha | `@Entity`, `extends Model`, class body fields |
| Python | `@app.get`, `@router.post`, Flask `@bp.route` | `class X(Base)`, SQLAlchemy `Column` |
| PHP | `Route::get`, `$router->get`, attributes `#[Get]` | `extends Model`, `$fillable` |

P2 (best-effort): Go `r.GET`, Ruby `get '/x'`, Rust `.route(`.

### 3.6 `src/utils/datamodel.ts` (EXTEND)

```ts
export interface ExtractDataModelOptions {
  readonly ast?: boolean;
  readonly astLanguages?: ReadonlyArray<AstLanguageId>;
  readonly maxFileBytes?: number;
}

export interface ExtractDataModelResult {
  readonly model: DataModel;
  readonly extraction?: ExtractionMeta;
}

export async function extractDataModel(
  root: string,
  opts?: ExtractDataModelOptions,
): Promise<DataModel>; // backward compat — wraps .model

export async function extractDataModelDetailed(
  root: string,
  opts?: ExtractDataModelOptions,
): Promise<ExtractDataModelResult>;
```

**Pipeline interno:**
1. Sempre roda parsers SQL/Prisma + regex legacy → `regexModel`.
2. Se `opts.ast`: `extractWithAst` → `mergeDataModels(regexModel, astModel)`.
3. Retorna `extraction` meta quando `ast: true`.

### 3.7 `src/utils/reverse-facts.ts` (EXTEND)

```ts
export interface ReverseFacts {
  // ... existing fields ...
  extraction?: ExtractionMeta; // present when reverse ran with --ast
}
```

### 3.8 `src/commands/reverse.ts` (EXTEND)

```ts
interface ReverseOptions {
  // ... existing ...
  ast?: boolean;
}

// CLI:
//   dare reverse --deep --ast
//   dare reverse --deep --check --ast   → preview counts, no write
```

**Regras CLI:**
- `--ast` sem efeito extra se não `--deep` (warn + ignore, ou exige `--deep` — prefer **warn** para DX).
- `--check --ast`: imprime `extraction` summary (endpoints/entities ast vs regex).

---

## 4. Mudanças por Arquivo

| Arquivo | Ação | Conteúdo |
|---|---|---|
| `ast/types.ts` | NEW | ids, opts, `ExtractionMeta` |
| `ast/loader.ts` | NEW | lazy WASM init + grammar cache |
| `ast/index.ts` | NEW | `extractWithAst` facade |
| `ast/merge.ts` | NEW | dedupe superset |
| `ast/languages/typescript.ts` | NEW | P1 queries |
| `ast/languages/python.ts` | NEW | P1 queries |
| `ast/languages/php.ts` | NEW | P1 queries |
| `ast/languages/go.ts` | NEW | P2 queries |
| `ast/languages/ruby.ts` | NEW | P2 queries |
| `ast/languages/rust.ts` | NEW | P2 queries |
| `ast/__tests__/*.test.ts` | NEW | merge + per-lang fixtures |
| `utils/datamodel.ts` | EDIT | opts + hybrid pipeline; export `ExtractDataModelOptions` |
| `commands/reverse.ts` | EDIT | `--ast` flag + facts `extraction` |
| `utils/reverse-facts.ts` | EDIT | tipo `ReverseFacts.extraction` |
| `packages/cli/package.json` | EDIT | `web-tree-sitter` + grammar optionalDeps |
| `__tests__/datamodel.test.ts` | EDIT | garantir default sem opts inalterado |
| `__tests__/brownfield-ast-regression.test.ts` | NEW | N-1 regex path locked |
| `docs-site/brownfield.md` (+ en/es) | EDIT | `--ast` section |
| `implementations/**/dare-reverse*` | EDIT | terminal equivalente `--deep --ast` |
| `CHANGELOG.md`, `ROADMAP.md` | EDIT | `[3.14.0]` |

**Explicitamente FORA:**

| Arquivo | Motivo |
|---|---|
| `utils/static-analyzer.ts` | D-06; review permanece regex |
| `utils/dna-detector.ts` | v3.15+ backlog |
| `commands/patterns.ts` | v3.15+ backlog |

---

## 5. Dependências npm (proposta)

```json
{
  "optionalDependencies": {
    "web-tree-sitter": "^0.25.0",
    "tree-sitter-typescript": "^0.23.0",
    "tree-sitter-python": "^0.23.0",
    "tree-sitter-php": "^0.23.0",
    "tree-sitter-go": "^0.23.0",
    "tree-sitter-ruby": "^0.23.0",
    "tree-sitter-rust": "^0.23.0"
  }
}
```

**Packaging:** grammars WASM copiadas para `dist/ast/grammars/` no build (`tsc` + script copy) para
`npm pack` offline. Gate CI: tarball size ≤ v3.13 + 10%.

---

## 6. Fixtures de teste (MVP)

Cada fixture prova ganho AST sobre regex (≥5 novos casos — O-01):

| ID | Cenário | Regex hoje | AST espera |
|---|---|---|---|
| F-01 | NestJS `@Get()` + `@Controller('api/v1')` em linhas separadas | miss ou route errada | `GET /api/v1` |
| F-02 | Express `router.get(\n  '/users/:id',` multi-linha | miss | `GET /users/:id` |
| F-03 | FastAPI `@router.get(\n  "/items",` | miss | `GET /items` |
| F-04 | Laravel `Route::middleware(...)->get('/x',` chain | miss | `GET /x` |
| F-05 | TypeORM `@Entity()` class com fields indentados | parcial | entidade + fields |
| F-06 | Prisma + SQL regression | inalterado | parsers legacy intactos |

---

## 7. Plano de Validação (Gates)

| Gate | Comando | Critério |
|---|---|---|
| Build | `pnpm --filter @dewtech/dare-cli build` | 0 erros tsc |
| Unit — merge | `vitest run ast-merge` | dedupe correto |
| Unit — P1 langs | `vitest run ast-typescript ast-python ast-php` | F-01..F-05 verdes |
| Unit — datamodel default | `vitest run datamodel` | byte-compat sem `--ast` |
| Regressão N-1 | `vitest run brownfield-ast-regression` | regex path locked |
| Core | `vitest run no-llm-in-core` | 0 SDK LLM novo |
| Brownfield cmd | `vitest run reverse` | `--deep` smoke |
| Tarball budget | `npm pack --dry-run` | ≤ +10% vs v3.13 baseline |
| Docs | `node scripts/verify-docs-coverage.mjs` | exit 0 |
| Paridade IDE | `vitest run ide-command-parity` | dare-reverse cita `--ast` |

---

## 8. Sequenciamento (fases → bloco 14xx)

1. **Fundação AST** — `ast/types`, `loader`, `merge`; deps optional; loader fallback test.
2. **Integração datamodel** — `extractDataModelDetailed`, pipeline híbrido; default inalterado.
3. **CLI wiring** — `reverse --ast`, `reverse-facts.extraction`, `--check` preview.
4. **Linguagens P1** — typescript, python, php (+ fixtures multi-linha).
5. **Linguagens P2** — go, ruby, rust (paralelo após P1 merge estável).
6. **Regressão N-1** — `brownfield-ast-regression.test.ts` + tarball gate.
7. **Docs & release** — brownfield.md, skills, CHANGELOG/ROADMAP, bump **3.14.0**.

**Caminho crítico:** `loader + merge → datamodel integration → P1 typescript → regression → release`

**Paralelo possível (rank):** python + php após typescript queries base; P2 langs após P1.

---

## 9. Superfície CLI (final)

```bash
# Default v3.13 behavior (unchanged)
dare reverse --deep

# Hybrid AST + regex superset
dare reverse --deep --ast

# Preview extraction stats without writing
dare reverse --deep --check --ast

# Semantic enrichment (unchanged contract)
dare reverse --deep --ast --ai --json
```

---

> **Próximo passo:** `/dare-tasks` — decompor em tasks atômicas (bloco de IDs **14xx**), gerar
> `dare-dag-brownfield-ast.yaml` e os specs `EXECUTION/task-14xx-*.md`. Target: **v3.14.0**.
