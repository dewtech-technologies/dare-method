# Feature Design: Brownfield AST — DNA + Patterns (v3.15)

> Gerado seguindo o Método DARE (Fase D — Design). Artefato para **revisão humana**
> antes de `/dare-blueprint`. License: MIT.
>
> **Base de evidências:** v3.14.0 entregou camada `packages/cli/src/ast/` (loader WASM,
> merge, queries P1/P2) integrada em `dare reverse --deep --ast`. `dna-detector.ts` e
> `pattern-detector.ts` permanecem **regex/line-based** (comentários L6–7 e L3–4).
> ROADMAP v3.15+ lista AST em `dare dna` / `dare patterns` como próxima iteração.
>
> **Branch:** `feat/v3.15-brownfield-ast-dna-patterns` · **Target:** v3.15.0 · **Repo base:** v3.14.0

## Contexto no Projeto Existente

### O que já existe (v3.14)

| Componente | Papel | Técnica hoje |
|---|---|---|
| `ast/loader.ts` | Lazy init tree-sitter WASM | Reutilizável |
| `ast/index.ts` | `extractWithAst` para rotas/entidades | tree-sitter walk |
| `utils/dna-detector.ts` | `detectDna()` → `DnaFacts` | Regex / dirs / package.json |
| `utils/pattern-detector.ts` | `detectPatterns()` → `PatternsFacts` | Regex / frequency |
| `commands/dna.ts` | `--check`, `--ai` | Sem `--ast` |
| `commands/patterns.ts` | `--check`, `--inject`, `--ai` | Sem `--ast` |
| Skills `/dare-dna`, `/dare-patterns` | Camada semântica | IDE / `--ai` |

### Problema que a AST resolve (DNA + Patterns)

**DNA** hoje infere arquitetura por **segmentos de path** (`KNOWN_LAYERS`) e bibliotecas por
presença em `package.json` / regex em imports. Falha quando:

- Camadas existem só por **decorators** (`@Injectable`, `@Module`) sem pasta `services/`.
- ORM aparece só em **imports multi-linha** ou alias (`import { Entity } from 'typeorm'` spread).
- DI é **constructor injection** com parâmetros quebrados em várias linhas.

**Patterns** hoje detecta call-idioms por **linha** (`Service` em controller, `z.` / `schema.parse`).
Falha quando:

- Injeção NestJS usa `constructor(\n  private readonly userService: UserService,\n)`.
- Validação Zod usa `z.object({\n  email: z.string(),\n})` — regex de linha perde o idioma.
- `@Module({ imports: [...] })` multi-linha não vira structural-idiom.

### Direção (ROADMAP v3.15+)

> AST em `dare dna` / `dare patterns` (backlog pós-v3.14)

**Reutilizar** a infra AST v3.14 — **não** duplicar loader/grammars. Mesmo princípio:
**regex baseline; AST superset opt-in** via `--ast`.

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | DNA structural mais rico | Fixtures com Nest/DI multi-linha melhoram `architecture.guess` ou `libraries` | ≥3 casos novos |
| O-02 | Patterns call-idiom multi-linha | Fixtures controller+service e zod object passam com `--ast` | ≥4 casos novos |
| O-03 | Zero regressão default | `detectDna` / `detectPatterns` sem `--ast` inalterados | testes existentes verdes |
| O-04 | Core sem LLM | Gate `no-llm-in-core` + `patterns-no-llm` verdes | 0 SDK LLM novo |
| O-05 | Paridade terminal ↔ chat | Skills citam `dare dna --ast` / `dare patterns --ast` | RF-06 |
| O-06 | Facts auditáveis | `dna-facts.json` / `patterns-facts.json` bloco `extraction?` | schema estável |

## Requisitos Funcionais

| ID | Requisito | Prioridade |
|---|---|---|
| RF-01 | `dare dna --ast` — merge híbrido AST ∪ regex em `DnaFacts` | MUST |
| RF-02 | `dare patterns --ast` — merge híbrido AST ∪ regex em `PatternsFacts` | MUST |
| RF-03 | Reuso de `initAstLoader` / grammars existentes (sem novas optionalDeps) | MUST |
| RF-04 | `--ast` sem efeito extra isolado; warn se usado sem contexto (opcional) | SHOULD |
| RF-05 | `--check --ast` preview counts (ast vs regex patterns/layers) | SHOULD |
| RF-06 | Skills `/dare-dna` e `/dare-patterns` citam flags terminal | MUST |

## Requisitos Não-Funcionais

| ID | RNF | Critério |
|---|---|---|
| RNF-01 | Fallback silencioso se WASM ausente | Igual v3.14 — regex-only |
| RNF-02 | Performance | maxFileBytes herdado de AST (1MB default) |
| RNF-03 | Tarball | Sem grammars adicionais; budget ≤ v3.14 + 5% |
| RNF-04 | Determinismo | Zero LLM no core |

## Análise de Impacto

### Novos arquivos

- `packages/cli/src/ast/conventions/types.ts`
- `packages/cli/src/ast/conventions/dna-extract.ts`
- `packages/cli/src/ast/conventions/patterns-extract.ts`
- `packages/cli/src/ast/conventions/merge-facts.ts`
- Testes + fixtures em `ast/conventions/__tests__/`

### Arquivos modificados

- `utils/dna-detector.ts` — `detectDnaDetailed`, opts `{ ast?: boolean }`
- `utils/pattern-detector.ts` — `detectPatternsDetailed`, opts `{ ast?: boolean }`
- `commands/dna.ts` — flag `--ast`
- `commands/patterns.ts` — flag `--ast`
- `docs-site/brownfield.md` — seções DNA/Patterns `--ast`
- Skills `dare-dna`, `dare-patterns` (3 IDEs)
- `CHANGELOG.md`, `ROADMAP.md`, bump **3.15.0**

### O que NÃO alterar

| Arquivo | Motivo |
|---|---|
| `utils/static-analyzer.ts` | Review permanece regex |
| `utils/datamodel.ts` | v3.14 completo; escopo separado |
| `ast/loader.ts` grammars | Sem novas langs nesta release |
| Default sem `--ast` | Compat N-1 |

## Segurança (OWASP / RS)

- **RS-01:** Path confinement — reutilizar `collectAstFiles` / IGNORE_DIRS.
- **RS-04:** Sem LLM no core; facts determinísticos apenas.
- **Input:** Somente leitura do target project (brownfield read-only).

## Restrições

- Não tornar `--ast` default-on em `reverse`/`dna`/`patterns` nesta release (soak v3.16+).
- Não AST em `static-analyzer` / `dare review`.
- Merge de patterns por `id` — AST enriquece evidence com `line` preciso.

## Fora do Escopo (v3.15)

| Item | Fase futura |
|---|---|
| `--ast` default-on global | v3.16+ após soak |
| AST em static-analyzer | backlog |
| GraphRAG ingest AST-specific | v3.16+ |
| Traduções en/es brownfield (se não existirem) | follow-up docs |

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Duplicação lógica AST vs datamodel | Extrair `walkAst` + helpers em `ast/conventions/` |
| Pattern merge duplica ids | Dedupe por `id`; union evidence |
| Regressão DNA/patterns default | `brownfield-ast-dna-patterns-regression.test.ts` |

## Plano de Validação

```powershell
pnpm --filter @dewtech/dare-cli exec vitest run ast-conventions dna patterns brownfield-ast-dna-patterns-regression
pnpm --filter @dewtech/dare-cli exec vitest run no-llm-in-core patterns-no-llm
node scripts/verify-docs-coverage.mjs
pnpm --filter @dewtech/dare-cli build
```

## Definition of Done

- [ ] `dare dna --ast` e `dare patterns --ast` funcionais
- [ ] Default sem `--ast` idêntico ao v3.14
- [ ] Facts JSON com `extraction?` quando `--ast`
- [ ] Docs + skills atualizados
- [ ] CHANGELOG + ROADMAP `[3.15.0]` + bump antes da tag

## Próximas Etapas

1. Revisar e aprovar este DESIGN
2. `/dare-blueprint` → `BLUEPRINT-Feature-brownfield-ast-dna-patterns.md`
3. `/dare-tasks` → DAG bloco **15xx**
4. Executar via `/dare-dag-run-parallel --dag DARE/dare-dag-brownfield-ast-dna-patterns.yaml`

## Decisões Travadas (proposta)

| # | Decisão | Alternativa rejeitada |
|---|---|---|
| D-01 | Reuso loader v3.14 | Novo runtime WASM — duplicação |
| D-02 | `--ast` opt-in | default-on — soak insuficiente |
| D-03 | Escopo DNA + Patterns juntos | Duas releases — overhead de loader |
| D-04 | Merge superset facts | AST-only — perde regex maduro |
| D-05 | Target **v3.15.0** minor | patch — nova superfície CLI |
