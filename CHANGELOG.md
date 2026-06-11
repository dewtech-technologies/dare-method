# Changelog

Todas as mudanças notáveis deste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

> Como esta é uma metodologia (não software executável), versões refletem
> mudanças na **estrutura do método, comandos canônicos e templates**.
> Patches em wording de prompts ou documentação não bumpam major.

## [3.11.0] — Unreleased

Release **Dynamic DAG** — replan estrutural com sub-DAGs aninhados em runtime (compõe o release 3.11.0 junto de dashboard + ci-pr).

> Trocar `Unreleased` pela data ao publicar.

### ✨ Adicionado — Dynamic DAG

- **`REPLAN` → splice de sub-DAG** — veredito `REPLAN` da decay policy gera sub-tasks via `refine --split` e insere no DAG ativo em runtime; a task pai retoma após as filhas concluírem.
- **`verification.loop.maxDepth`** — teto de profundidade de aninhamento (default `2`); excedeu → `ESCALATE` (sem inserir).
- **`dare refine <task-id> --split --apply`** — modo manual: injeta o sub-DAG no DAG ativo e persiste em `dare-dag.yaml` + `.dare/state.json` (requer `--split`).
- **`dare dag viz` agrupa sub-DAGs** — tasks com `__parentId` aparecem em `subgraph Sub-DAG: <pai>` (Mermaid/DOT/Excalidraw); DAG flat inalterado quando não há nesting.

## [3.10.0] — 2026-06-10

Release **Drift Gate** + **Local Semantic Search** — detecção de drift spec↔código e retrieval híbrido no GraphRAG.

### ✨ Adicionado — Drift gate

- **`dare graph drift`** — subcomando que detecta `orphan-requirement`, `orphan-code` e `stale` via travessia do grafo (zero LLM).
- **Exit code 7** — drift acima dos limiares com `--strict`.
- **`drift` em `dare.config.json`** — opt-in (`enabled:false`); `maxOrphanReqs`, `maxOrphanCode`, `failOnStale`, `ignore[]`.
- **`contentHash` + `ingestedAt`** no ingest de requirements — habilita detecção de stale sem custo no gate.

### ✨ Adicionado — Busca semântica local

- **Retrieval híbrido** — keyword + vetor + proximidade no grafo via RRF (`graphrag/hybrid.ts`).
- **`graphrag.semantic`** — opt-in (`enabled:false`); `model`, `modelHash`, `rrfK`.
- **`@xenova/transformers`** como `optionalDependency` com import lazy em `embeddings.ts` (core LLM-free preservado).
- **`dare graph query --semantic`** — força caminho híbrido quando runtime presente; fallback keyword se modelo ausente.
- **Indexação incremental** — re-embed só quando `contentHash` muda.

## [3.9.0] — Unreleased

Release **Secure Autonomous Executor** — modo autônomo no orquestrador (motor determinístico, LLM
confinado ao driver) **+ gate de segurança** da cadeia agêntica. Entregue como um único minor
(consolida o que o planejamento chamou de executor 3.9 + guard 3.10).

> Trocar `Unreleased` pela data ao publicar. Próximo release (drift-gate + semantic-search) = **3.10.0**.

### ✨ Adicionado — Executor autônomo

- **`dare execute --agent`** — loop autônomo por rank com `AgentDriver` plugável (`mock`/`noop`/`claude`).
- **Flags** — `--budget-tokens`, `--require-approval rank|none`, `--on-fail replan|escalate|stop`, `--dry-run` (mockDriver).
- **`@anthropic-ai/sdk`** como `optionalDependency` com import lazy (único ponto autorizado no `src/`).
- **`BudgetTracker`** — soma custo de todos os candidatos best-of-N (A-4).
- **Telemetria de custo** — metadados no nó `task` do GraphRAG (`inputTokens`, `outputTokens`, `costUsd`, `model`, `attempts`).
- **Gate de arquitetura** — `no-llm-in-core.test.ts` impede regressão de imports de SDK no core.

### ✨ Adicionado — Gate de segurança da cadeia agêntica

- **`dare guard`** (comando CLI + skill `/dare-guard` nas 3 IDEs) — unicode-audit (strip/block), scan heurístico, proveniência Ed25519/minisign-compat e trust boundaries control/data.
- **Exit code 6** — artefato com verdict `FAIL` (ou `WARN` com `--strict`).
- **Pré-flight no `dare execute --agent`** — pipeline completo antes de cada task quando `guard.enabled` e `guard.onExecute`.
- **`guard` em `dare.config.json`** — opt-in (`enabled:false` por default); `trustedPaths`, `unicode`, `signing`.

## [3.8.2] — 2026-06

Patch de **processo/documentação**. Padroniza a regeneração da doc no release e fecha os "esquecimentos" recorrentes (banner do README, `UPDATE-MANIFEST`) com gates determinísticos.

### ✨ Processo
- **Gate de cobertura de docs** (`scripts/verify-docs-coverage.mjs`, no CI/job `lint`): **falha** se um comando do CLI ou bloco de config do `dare.config.json` novo **não estiver documentado** em `docs-site/` — impossível mergear feature sem doc.
- **Redeploy automático da documentação no release**: `docs.yml` agora dispara via `workflow_run` ao concluir o **"Publish to npm"** — toda tag `v*` republica o site MkDocs.
- **Playbook + template de release-docs** (`DARE/RELEASE-DOCS-PLAYBOOK.md`, `DARE/templates/task-release-docs.template.md`): toda release inclui uma task `docs-regen` que regenera `docs-site/` (pt/en/es) + README raiz + README do CLI a partir do código.

### 🐛 Corrigido
- Blocos de config `review` e `refine` (emitidos pelo `project-generator`) estavam ausentes de `docs-site/configuration.md` — documentados (achado pelo novo gate de cobertura).

## [3.8.1] — 2026-06

Patch de manutenção do **`dare update`**. O `UPDATE-MANIFEST.json` parava na v3.3.0 — então projetos existentes que rodavam `dare update` para v3.4.0→v3.8.0 **não recebiam** os comandos/skills nem os blocos de config novos (o `dare update` é 100% manifest-driven). Esta release faz o **backfill** do manifesto.

### 🐛 Corrigido
- **`dare update` agora entrega tudo das v3.4→v3.8 a projetos existentes**: `dare-bench` (v3.3, faltava), `dare-hooks` + `dare-steering` (v3.6), `dare-patterns` (v3.7) e a `dare-graph` atualizada (v3.5) nas 3 IDEs; + os blocos de config `hooks`/`steering` (v3.6) e `verification.formal` (v3.8) via migrations `add-hooks-steering-defaults` e `add-formal-defaults`. Todos os `templateSource` validados (0 paths quebrados).

## [3.8.0] — 2026-06

Release **Formal Verification Gate** — gate opt-in que PROVA (não só testa) módulos críticos marcados (sem LLM no CLI).

### ✨ Adicionado

- Aspecto **`formal`** no `runner.ts` (extensão do verification-core v3.3.0) — gate **OPT-IN ESTRITO em dois níveis**
  (`verification.formal.enabled` + marcação por módulo `@dare-formal`/`config.modules`).
- **Dafny default** (82,2% vs. Verus 44,3% vs. Lean 26,8% — Vericoding); Verus/Lean como backends opcionais (SHOULD).
- Flags **`--formal`** / **`--no-formal`** / **`--formal-backend <dafny|verus|lean>`**.
- **Degradação graciosa** via `isAvailable()`; **exit 5** quando a toolchain está ausente em módulo MARCADO
  (nunca pula gate em silêncio).
- **Anti-bypass** — rejeita `assume(false)`/`ensures true`/vazamento MESMO com exit 0 do solver.
- Fluxo **NL-opaco** (Dafny-as-IL: humano valida só a tradução NL); telemetria `task --proven_by--> formal-gate`.

### 📝 Notas

- Opt-in ESTRITO: ausência do bloco `verification.formal` OU de marcação ⇒ comportamento idêntico a v3.7.0 (RNF-01/02).
- **Toolchain externa NÃO é dep do CLI** (Dafny/Z3/Verus/Lean instalados no projeto-alvo — zero CVE herdado, RS-05).
- Nenhum LLM no CLI: o solver externo decide a prova; a IDE/skill formaliza/itera o reparo (PREFACE).

## [3.7.0] — 2026-06

Release **Brownfield Discovery** — auto-discovery determinístico de padrões + planejadores leves (sem LLM no CLI).

### ✨ Adicionado

- Comando **`dare patterns`** — auto-discovery determinístico de padrões implícitos do legado
  (`inferred-layer`, `naming-idiom`, `structural-idiom`, `call-idiom`, `implicit-decision`) com evidência
  `arquivo:linha`; flags `--check` / `--dir` / `--modules` / `--inject`.
- **`PATTERNS.md`** — skeleton com marcadores `<!-- AGENT -->` (reusável/injetável), seção `## ⚠️ Incertezas`
  para gaps 🔴; `patterns-facts.json` (fatos serializados).
- Grafo: nós `pattern` + arestas `evidenced_by` (pattern→file) e `exhibits` (module→pattern);
  `dare graph query --type pattern`.
- **`PATTERNS.md`** como 2ª fonte-base de steering ao lado de `PROJECT-DNA.md` (A-7).
- **`dare design --interactive`** — questionário de planejamento **determinístico** (fatos+gaps).
- Personas leves Analyst/PM (`/dare-design`) + Architect (`/dare-blueprint`) — planejamento, **1 passagem
  sequencial, SEM runtime multi-agente** (cautela de custo MetaGPT 31k vs 19k tokens).

### 📝 Notas

- Opt-in puro: ausência de `patterns-facts.json` / `PATTERNS.md` ⇒ comportamento idêntico a v3.6.0.
- `dna` / `reverse` permanecem byte-a-byte inalterados — `patterns` **estende**, não reescreve.
- Nenhum LLM no CLI: detector determinístico extrai fatos; inferência/personas vivem nas skills das IDEs.

## [3.6.0] — 2026-06

Release **Agent Hooks + Steering Files** — hooks determinísticos com trust gate + steering por precedência via MCP.

### ✨ Adicionado

- **Agent Hooks:** eventos fechados (`on-save`, `on-file-create`, `on-task-complete`, `pre-commit`),
  allowlist canônica, dispatcher `spawn shell:false` + argv, trust gate (`trusted:false` opt-in / `--trust`),
  idempotência por hash de estado, telemetria via grafo.
- Comandos `dare hooks list|run|validate` e `dare steering list|show`.
- **Steering files:** reuso de `PROJECT-DNA.md` como base + precedência determinística
  (base → project → glob → priority → path).
- Rota MCP `GET /steering?file=<rel>` servindo steering às 3 IDEs.
- Adapters: Claude `settings.json` (on-save) + git `pre-commit` (universal).

### 📝 Notas

- Hooks **nativos** de Cursor/Antigravity **adiados** para versão futura (§0); fallback
  `pre-commit` + `dare hooks run <event>` manual; steering dessas IDEs via MCP.
- Opt-in: ausência de bloco `hooks`/`steering` = comportamento idêntico a v3.5.0.
- Nenhum LLM no CLI (RF-10): dispatch só emite gatilho; raciocínio na skill da IDE.

## [3.5.0] — 2026-06

Release **Dual Graph** — grafo dual requisito↔código determinístico (sem LLM no CLI).

### ✨ Adicionado

- Grafo dual: nós `code_symbol` + `requirement`; arestas `affects` + `derives_from`.
- Extração determinística de símbolos (`graphrag/code-index.ts`) e parser de requisitos
  (`graphrag/requirement-ingest.ts`).
- Travessia tipada BFS com limites (`graphrag/traverse.ts`): `traverse` + `locate`.
- Comandos `dare graph owners|impact|trace|locate`.
- Localização opcional pré-patch no Ralph Loop (`graph.locateBeforePatch`).
- MCP tools `graph_locate` / `graph_map_requirement` / `graph_traverse`.
- `dare graph viz` com subgraphs por camada (Requirements / Code).

### 🐛 Corrigido

- Neo4j (C1): leituras Cypher reais + writes com flush; erro de query propaga.

### 📝 Notas

- Backend Neo4j permanece atrás de gate `neo4j.experimental: true` até C1 ser verificado em CI.
- Nenhum LLM no caminho de ingestão/travessia.

## [3.4.0] — 2026-06

Release **Security Hardening** — superfície MCP endurecida, validação de `dare init` e supply-chain no CI.

### Security (breaking)

- **MCP:** autenticação Bearer obrigatória fora de loopback; bind default `127.0.0.1` (`DARE_MCP_BIND`); token gerado no boot (`DARE_MCP_TOKEN`).
- **`dare init`:** validação estrita do nome do projeto — rejeita traversal, paths absolutos e maiúsculas.
- **Erros MCP:** corpos 5xx sanitizados (sem paths absolutos nem stack no JSON de resposta).

### CI / Supply-chain

- ESLint bloqueante no CI (`pnpm --filter @dewtech/dare-cli lint`).
- Gate de cobertura Vitest com baseline em `KNOWN-COV-BASELINE.md`.
- `npm publish --provenance` via OIDC no workflow de release.
- GitHub Actions pinadas por commit SHA + `scripts/verify-actions-pinned.mjs`.

### Added

- Middleware MCP: `auth.ts`, `cors.ts`, `error-handler.ts`; `helmet` no `server.ts`.
- `path-safety.ts`: `resolveSafePath` / `PathEscapeError` para confinamento de I/O.
- Variáveis `DARE_MCP_*` documentadas no README e `SECURITY.md`.

## [3.3.0] — 2026-06

Release **Reliable Verification Core** — núcleo determinístico de verificação pós-Ralph Loop (opt-in via `dare.config.json#verification`).

### ✨ Adicionado

- **`verification/**` — mutation (Stryker/mutmut/cargo-mutants/Infection), fail-to-pass, anti-tamper, type-check, decay policy, best-of-N (worktrees + Pareto), prerank exec-free, telemetria GraphRAG (`gate` + `verified_by`).**
- **`dare execute --verify` / `--no-verify` / `--full-mutation` / `--verdict-json` / `--best-of` / `--policy` / `--prerank`** — flags BLUEPRINT 5.1.1; exit codes 0/1/3/4.
- **`dare bench`** — harness determinístico de fixtures (`Fix·Rate`, solve-rate, baseline + regressão > 3pp).
- **`exec/safe-spawn.ts`** — spawn argv `shell:false`, env saneado (RS-06).
- **Bloco `verification` em novos projetos** (`enabled: false`) + migration `add-verification-defaults` (UPDATE-MANIFEST 3.3.0).

### 🐛 Corrigido

- **RS-06:** `ralph-loop.ts` migrado para argv explícito; zero `shell:true` no núcleo de produção.

### 📝 Notas

- Verificação é **opt-in** (RNF-06): ausência do bloco `verification` mantém comportamento clássico build/test/lint.

## [3.2.0] — 2026-06

Release focada na **qualidade dos artefatos de brownfield** (`dare reverse` / `dare dna`). Até a v3.1, os artefatos gerados eram quase só esqueleto: `IDEIA.md` e as specs de módulo continham placeholders `<!-- AGENT -->` em vez de dados reais coletados da aplicação. Agora a camada determinística (sem LLM) **roda por padrão** e renderiza dados reais (endpoints + entidades) nos artefatos; o agente da IDE apenas enriquece a semântica em cima de fatos concretos.

### ✨ Adicionado — paridade de comandos CLI ↔ IDE (`/dare-*`)

- **Todo comando do `dare` CLI agora é invocável na IDE como `/dare-<comando>`**, nas três IDEs suportadas (Claude Code, Cursor, Antigravity). Antes, vários comandos só existiam no terminal — e no **Cursor** os comandos de metodologia tinham nomes divergentes (`/generate-design`, `/execute-task`, `/review-task`…) e `reverse`/`dna`/`migrate` existiam apenas como `rules` passivas (não invocáveis). Agora os 18 comandos (`init`, `bootstrap`, `discover`, `reverse`, `dna`, `migrate`, `design`, `blueprint`, `execute`, `graph`, `dag`, `validate`, `info`, `update`, `review`, `refine`, `skill`, `welcome`) têm skill/command `dare-*` idêntico nas 3 IDEs.
- **Cursor normalizado para a convenção `/dare-*`**: comandos renomeados (`generate-*`/`*-task`/`run-dag`/`dag-viz`/`telemetry-report` → `dare-*`) e `reverse`/`dna`/`migrate` promovidos de regra para comando invocável.
- **Teste de consistência `ide-command-parity.test.ts`** trava o contrato: se um comando novo for adicionado ao CLI sem o skill correspondente nas 3 IDEs, o build falha.
- Comandos operacionais gerados a partir de uma spec única (`scripts/gen-runner-commands.mjs`) para garantir consistência entre as IDEs.

### ✨ Adicionado — coleta determinística

- **Coleta determinística por padrão no `dare reverse`.** `extractDataModel()` agora roda em todo `reverse` (antes só com `--deep`), e o modelo extraído é injetado em `IDEIA.md` e nas specs de módulo. Os artefatos passam de esqueleto para tabelas reais de **Superfície de API** e **Modelo de Dados**.
- **`reverse-facts.json` registra contagens** de `api.endpoints` e `api.entities` coletados.

### 🐛 Corrigido — extração determinística (`utils/datamodel.ts`)

- **Prefixo `@Controller` composto na rota.** Rotas NestJS agora resolvem o path completo (`@Controller('users')` + `@Get(':id')` → `GET /users/:id`), incluindo `@Controller()` vazio e decorators sem argumento (`@Get()`).
- **Entidades `@Entity` sem relações agora são coletadas.** `parseOrm` só fazia `push` quando havia relação detectada — classes de entidade só-colunas (TypeORM/Eloquent/etc.) eram descartadas. Agora a marca de entidade já confirma o push, e os campos (`@Column`/propriedades) são extraídos junto.
- **DTOs e value shapes deixam de contar como entidades.** Filtro por sufixo (`Dto`, `Request`, `Response`, `Input`, `UseCase`, `Mapper`, …) e por arquivo (`*.dto.ts`), além de heurística PascalCase.
- **Palavras-chave SQL deixam de virar entidade.** `CASCADE`, `SET`, `NULL`, etc. são filtradas de refs de FK, preservando nomes de tabela em minúsculas (`produtos`, `pedidos`).

## [3.1.1] — 2026-06

### 🐛 Corrigido

- **Comandos brownfield (`dare reverse`, `dare dna`, `dare migrate`) agora instalam os slash-commands/skills da IDE.** Antes só a camada CLI rodava; o agente da IDE não tinha o `/dare-reverse`, `/dare-dna` etc. instalado, então a 2ª camada do workflow (inferência semântica) não existia — o passo "Run /dare-reverse in your IDE" apontava para um comando inexistente. Novo helper `ensureDareSkills(targetDir)`: se `dare.config.json` existe, refresca os arquivos da IDE configurada (idempotente); se não, instala para todas as IDEs (Cursor + Antigravity + Claude) e grava um `dare.config.json` mínimo. Pulado em modo `--check` (read-only). `dare init`/`discover` já instalavam.

[3.1.1]: https://github.com/dewtech-technologies/dare-method/releases/tag/v3.1.1

## [3.1.0] — 2026-06

Release focada na **correção do bug bloqueante de distribuição** (404 no `npm install -g`) e na **completação da paridade de stacks** prometida na v3.0.0. Todos os scaffolders agora vivem **dentro** do `@dewtech/dare-cli` — um único tarball publicável, zero pacotes workspace de stack.

### 🐛 Corrigido

- **`npm install -g @dewtech/dare-cli` agora funciona.** O `dependencies` declarava `"@dewtech/dare-stack-ruby-rails-8": "workspace:*"`, protocolo que só o pnpm resolve dentro do monorepo; o npm batia no registry público e o pacote nunca havia sido publicado (erro 404). Resolução: o stack Rails foi **internalizado** no CLI e a entrada de `dependencies` removida.
- **Rails scaffolder agora funciona em Node 20 ESM.** `import * as fs from 'fs-extra'` quebrava com `fs.readFile is not a function`; corrigido para default import.

### ✨ Adicionado — 11 stacks com gerador completo internalizado

Todas as 11 stacks têm scaffolder próprio em `packages/cli/src/stacks/<id>/` + templates em `packages/cli/templates/stacks/<id>/`, todas com Layered Design e DNA DARE:

**Backend (6 novos + 1 internalizado):**

- `node-nestjs` — NestJS 10 + Prisma + Swagger + Throttler + JWT
- `python-fastapi` — FastAPI + Pydantic v2 + SQLAlchemy + Alembic + python-jose + slowapi
- `php-laravel` — Laravel 11 + Sanctum + FormRequest + Reverb + Pail + l5-swagger
- `rust-axum` — Axum + Tower + utoipa + jsonwebtoken + argon2 + sqlx
- `go-gin` — Gin + sqlc + swag + golang-jwt + gorilla/websocket
- `go-stdlib` — net/http 1.22 (sem framework) + sqlc + coder/websocket
- `ruby-rails-8` — internalizado de `packages/stacks/`; enriquecido com `.env.example` + jobs `audit`/`lint` no CI para conformar ao DNA

**MCP Server (4 variantes, transports `stdio`/`sse`/`http` via `--transport`):**

- `mcp-node-ts` — `@modelcontextprotocol/sdk`
- `mcp-python` — `mcp[cli]` (FastMCP)
- `mcp-rust` (beta) — `rmcp`
- `mcp-go` (beta) — `mark3labs/mcp-go`

### ✨ Adicionado — DNA DARE como gate de CI

`packages/cli/src/stacks/__tests__/dna.spec.ts` itera sobre todos os stacks registrados e valida 7 artefatos invariantes:

1. `llms.txt` na raiz
2. `openapi.json` (ou rota servida)
3. flag `--json` no entrypoint CLI do app
4. `.env.example` sem segredos (regex contra base64/hex/PEM/openai/aws)
5. rate limit configurado (lib idiomática por stack)
6. `.dare/skills.yml` referenciando a skill
7. `.github/workflows/dare-ci.yml` com jobs `audit`/`lint`/`test`

Stack que não emita os 7 falha no CI. Gate de completude exige exatamente **7 backend + 4 MCP = 11 stacks**.

### ⚠️ Breaking changes

- **`dare new` removido.** Usado para Rails (`dare new myapp --stack rails`); substituir por `dare init myapp --stack ruby-rails-8`. Sem deprecação, sem alias. Tratado como correção do bug do 404 + completação da paridade prometida, mantendo bump **minor** (v3.1.0).
- **`@dewtech/dare-stack-ruby-rails-8` deixou de ser publicado.** Quem dependia diretamente desse pacote npm migra para o `@dewtech/dare-cli` (o scaffolder é parte do CLI agora).

### 📁 Mudanças estruturais

- `packages/stacks/` **removido por completo**. Único pacote workspace: `@dewtech/dare-cli`.
- `packages/cli/src/stacks/` — registry lazy + 11 scaffolders + DNA emitter + template engine.
- `packages/cli/templates/stacks/` — templates por stack (ERB/Jinja2/Handlebars/Tera/.tpl).
- `pnpm-workspace.yaml` — entrada `packages/stacks/*` removida.
- `packages/cli/package.json` — `files` inclui `templates/**`; `version` 3.1.0.

### 🔐 Segurança

- CI: `pnpm audit --prod --audit-level=high` (audita o que de fato é publicado). Dev-CVEs documentados em `KNOWN-CVES.md`.
- CI: job `gitleaks` sobre `templates/stacks/**` com `.gitleaks.toml` (allowlist de placeholders).
- DNA gate: sub-specs `env-example-no-secrets` e `github-ci-has-audit-job` para os 11 stacks.

### 📊 Métricas

- Tarball `@dewtech/dare-cli` publicado: **~720 KB** compactado (limite 3 MB).
- Suite: **1159 testes** verdes no monorepo; **0 HIGH/CRITICAL** em dependências de produção.

[3.1.0]: https://github.com/dewtech-technologies/dare-method/releases/tag/v3.1.0

## [3.0.0] — 2026-05

Release **major** focada em **paridade total entre IDEs**, **expansão de cobertura de stacks** e a **Suíte Brownfield** (engenharia reversa, DNA e migração de projetos legados). Sem breaking change funcional.

### ✨ Adicionado — Suíte Brownfield (projetos legados)

Leva o DARE de *greenfield-first* a também **entender, documentar e migrar projetos legados**. Três comandos novos + dois modos do `reverse`, no padrão da casa (CLI determinístico + skill semântica + Ralph Loop). Mecanismos de incerteza/migração inspirados no framework **Reversa** (Macedo & da Costa, *arXiv:2605.18684*, MIT) — absorção **clean-room**, sem copiar código.

**Comandos novos:**

- **`dare reverse`** — engenharia reversa (Fase 0): detecta fronteiras de módulo, mede tamanho por LOC, infere o grafo de dependências. Gera `DARE/IDEIA.md` (pré-arquitetura + mapa de módulos em Mermaid), `REVERSE/module-*.md`, `reverse-facts.json` e `architecture.excalidraw`. Flags `--check`, `--modules`, `--no-excalidraw`.
- **`dare dna`** — extrai as **convenções** do codebase (lint/format, nomenclatura, camadas, framework de teste, libs ORM/HTTP/auth/validação, convenção de commits) → `PROJECT-DNA.md` + `dna-facts.json`. O agente passa a seguir o padrão da casa, não o default genérico.
- **`dare migrate --to <stack>`** — plano de **migração com paridade**: consome `IDEIA` + `DNA`, herda os *blocking gaps* (🔴) como riscos, e gera `MIGRATION.md` (paradigma, estratégia, risco, arquitetura-alvo, cutover) + **cenários Gherkin de paridade** (`parity/<módulo>.feature`).

**Modos do `dare reverse`:**

- **`--report`** — **confiança 3-estados** por claim (🟢 CONFIRMED com evidência `arquivo:linha` · 🟡 INFERRED · 🔴 GAP), com índice **computado deterministicamente** a partir dos marcadores (não auto-avaliado por LLM). Gera `confidence-report.md` + `traceability/code-spec-matrix.md`; os 🔴 viram `gaps.md` e `questions.md`.
- **`--deep`** — extração profunda: **ERD** (`erd.md`), **API surface** (`api-surface.md`), **C4** (component determinístico + context/container via skill) e skeletons de `domain-rules.md` / `state-machines.md` / `permissions.md`.
- **Framework-agnostic por linguagem:** o `--deep` funciona em **qualquer projeto** de uma linguagem suportada, com ou sem framework — SQL inline (DDL + tabelas de queries), tipos/classes/structs em pastas de modelo (PHP/Python/TS/Go/Ruby/Rust → ERD sem ORM) e rotas multi-dialeto (Express/Nest/Fastify · Laravel/Slim/Symfony · FastAPI/Flask/Django · Rails/Sinatra · Gin/stdlib · Axum). Provado em PHP legado sem Laravel.

**3 skills brownfield novas** (paridade nas 3 IDEs): `dare-reverse`, `dare-dna`, `dare-migrate`.

### ✨ Adicionado — 29 skills em paridade nas 3 IDEs

Todas as skills DARE agora existem nas 3 implementations (Antigravity, Claude Code, Cursor) com formato nativo de cada uma. Veja o [índice completo](docs/skills/INDEX.md).

**6 Skills transversais (NEW como skill de IDE)** — antes existiam só como bibliotecas em `packages/skills/`, agora também em cada IDE:

- `dare-ax` — Agent Experience: `llms.txt`, OpenAPI, `--json` flags, rate limits (métricas M-01 a M-04)
- `dare-layered-design` — Arquitetura em 4 camadas (Handler → Service → Repository → Model) com gate de violação
- `dare-llm-integration` — Providers LLM, cache de prompt, rate limit, templates versionados
- `dare-frontend-design` — Componentes, state management, error boundaries, design system first
- `dare-realtime` — WebSocket/SSE, reconnect automático, subscription manager
- `dare-quality-telemetry` — Métricas de qualidade, detecção de regressão, GitHub Actions gates

**5 Skills de stack novas** — backend completo da apresentação v2.17 finalmente em forma de skill:

- `dare-nestjs-api` — Node.js + NestJS + Prisma + Swagger
- `dare-fastapi-api` — Python + FastAPI + Pydantic + uvicorn
- `dare-go-gin-api` — Go + Gin/stdlib + sqlc
- `dare-mcp-server` — MCP Server (TypeScript ou Python, stdio/SSE/HTTP)
- `dare-rails-api` — Ruby + Rails 8 + Solid Queue + Action Cable

**Skills do DAG agora granulares e paritárias nas 3 IDEs:**

- `dare-dag-build` — só regenerar `dare-dag.yaml` a partir do BLUEPRINT existente
- `dare-dag-run` — só executar grafo já aprovado (sem regenerar)
- `dare-dag-runner` — wrapper agregador: build + run + viz num único comando
- `dare-dag-viz` — diagrama Excalidraw com cores por complexidade e status

**Lacunas históricas preenchidas:**

- `dare-bugfix-design` agora no Claude (antes só Antigravity + Cursor)
- `dare-feature-design` agora no Claude
- `dare-docker` agora no Antigravity + Claude (antes só Cursor)
- `dare-security` agora no Antigravity (antes só Claude + Cursor)
- `dare-telemetry` agora no Antigravity + Claude (antes só Cursor)
- `dare-laravel-api` agora no Antigravity + Claude
- `dare-rust-leptos` agora no Antigravity + Cursor

### 🐛 Corrigido

- Limpeza de referências obsoletas de licença em arquivos de skill — DARE é MIT (D-001), sempre foi e continua sendo
- `banner.ts`: tipo de fonte do `figlet` (`Fonts` → `FontName`) que travava o `tsc`
- Build do pacote workspace `@dewtech/dare-stack-ruby-rails-8` (gera `dist/`, resolve o import do comando `new`) — `pnpm build` passa limpo de ponta a ponta

### 📁 Mudanças estruturais

- **+53 arquivos novos** em `implementations/` (+11.681 linhas)
- Cada skill nova inclui seção "Quando NÃO usar" + "Equivalência entre IDEs" para navegação cruzada
- Paridade nominal: **32/32 skills × 3 IDEs = 96 arquivos de skill** (29 da paridade inicial + 3 brownfield; antes era ~38 com sobreposição parcial)
- Novos utils determinísticos no CLI: `module-detector`, `dna-detector`, `confidence`, `migration`, `datamodel`, e renderer de grafo generalizado (`graph-renderer`, compartilhado por `dag viz` e `reverse`). Cobertura: **358 testes**
- Novo: [`docs/skills/INDEX.md`](docs/skills/INDEX.md) com tabela cruzada IDE × skill
- Novo: [`ROADMAP.md`](ROADMAP.md) na raiz, alinhado com D-005

### Migração de v2.17.x → v3.0.0

```bash
# 1. Atualize o CLI
npm install -g @dewtech/dare-cli@3.0.0

# 2. Em cada projeto DARE existente, sincronize skills/comandos
cd meu-projeto-dare
dare update            # adiciona as skills novas; preserva DESIGN/BLUEPRINT/TASKS
```

Sem breaking change funcional. Toda skill que existia antes continua existindo (só ganhou irmãs nas outras IDEs).

---

## [2.17.0] — 2026-05

Release grande, **três frentes complementares** que resolvem três problemas reais identificados em uso:

1. Devs com versão antiga do DARE não conseguiam puxar melhorias sem regenerar projeto
2. Tasks marcadas DONE com código mockado, stubs e esqueletos de função (inegociável — destrói o valor do método)
3. Tasks grandes demais forçando o agente a "inventar" pra preencher os vazios

### ✨ Adicionado — Comando `dare update`

Sincroniza projetos existentes com a versão atual do CLI — sem reescrever artefatos do dev (`DESIGN.md`, `BLUEPRINT.md`, `TASKS.md`, `dare-dag.yaml`):

```bash
$ npm install -g @dewtech/dare-cli@latest
$ cd meu-projeto-dare
$ dare update                  # interativo, com changelog + confirmação
$ dare update --dry-run        # preview
$ dare update --yes            # CI: aplica, mantém customizações
$ dare update --force          # sobrescreve até customizações (perigoso)
$ dare update --target 2.17.0  # versão específica
```

**Recursos:**

- 📋 **Changelog declarativo:** `templates/UPDATE-MANIFEST.json` lista changes (added/modified/removed/renamed) + migrations por release
- 🎯 **Filtro por IDE:** Cursor não recebe templates Antigravity e vice-versa; hybrid recebe os dois
- 🔍 **Detecção de customizações:** SHA-256 sobre cada arquivo — se o dev editou, pergunta (`keep` / `replace`)
- 💾 **Backup automático:** `.dare/backup-<from-version>/` antes de aplicar
- ♻️ **Migrações de schema:** declarativas no manifest, transformam `dare.config.json` (renames, novos campos) sem perder dados

### ✨ Adicionado — Comando `dare review <task-id>` (anti-stub gate)

Audita uma task implementada cruzando spec ↔ código real. Detecta os padrões que o build/test/lint não pegam:

**Camada estática (regex, determinística):**

- `TODO` / `FIXME` / `XXX` / `HACK` em comentários
- Stubs explícitos: `throw new Error('not implemented')`, `unimplemented!()`, `todo!()`, `raise NotImplementedError`, `panic!('not implemented')`
- Funções vazias: `function x() {}`, `def x(): pass`, `fn x() {}`, `def x(): ...`
- Retorno-fantasma: `return null/undefined/{}/[]` como única statement de função pública
- Mocks **fora** de testes: `jest.fn()`, `vi.mock()`, `sinon.stub()`, `MagicMock()`, `mockReturnValue` em `src/` de produção
- Comentários-placeholder: `// implement later`, `# stub`, `// fixme implement`

**Camada semântica (opt-in via `--from-agent`):**

A IDE agent re-lê spec + implementação e emite um `SemanticVerdict` JSON. O CLI funde estática + semântica num único veredito.

```bash
# Manual:
dare review task-034 --strict
dare review task-034 --files src/auth/login.ts --format json
dare review task-034 --from-agent .dare/verdict.json
```

**Skills nas 3 IDEs** que produzem o verdito semântico:
- Claude Code: `/dare-review task-034`
- Cursor: `/review-task task-034`
- Antigravity: skill `dare-review`

**Gate opt-in no Ralph Loop:** com `review.onComplete: true` em `dare.config.json`, `dare execute --complete <id>` bloqueia DONE se a review falhar (cascade-skip dependentes, igual gate de teste).

### ✨ Adicionado — Comando `dare refine <task-id>` (anti-monstro)

Mede complexidade de uma task e propõe quebra quando ela ficou grande demais:

**Heurística determinística:**

- Sinais: # arquivos a criar/modificar, # funções/endpoints declarados, # testes esperados, # dependências, keywords pesadas (`refactor`/`migrate`/`integrate`/`multiple`/`audit`)
- Score → bucket: LOW (0-5) | MED (6-12) | HIGH (13-20) | CRITICAL (21+)
- Thresholds configuráveis em `refine.thresholds`

**Split proposal:**

`--split` agrupa os arquivos por diretório raiz e gera sub-tasks `task-034a`, `task-034b`, ... cada uma ≤ 4 arquivos por default. A IDE agent (skills `dare-refine` / `refine-task`) refina o split semanticamente: por camada, por endpoint, por feature, refactor-then-feature, migration-then-code.

```bash
dare refine task-034                  # mede e reporta
dare refine task-034 --split          # também propõe quebra
dare refine task-034 --split --apply  # marca task original como SPLIT em TASKS.md
dare refine task-034 --strict         # exit 2 se HIGH/CRITICAL (CI-friendly)
```

### 🔥 Reforço inegociável — Anti-Stub Contract nos prompts de geração

Tasks com `subtask_prompt` ou spec genéricos forçam o agente a inventar. Os prompts agora forçam especificação executável:

**No `/dare-blueprint` / `/generate-blueprint`:**

Para **cada** endpoint, função pública, evento ou job — assinatura completa, request/response shape por status code, validações enumeradas (não "validar email" — a regex), edge cases (input vazio, duplicado, expirado), side effects (tabelas/filas/caches tocados em ordem), exemplos concretos (payload real, response real).

**No `/dare-tasks` / `/generate-tasks`:**

Cada `subtask_prompt` deve incluir caminhos exatos, assinaturas tipadas, validações específicas, edge cases enumerados, lista de testes esperados. Cada `EXECUTION/task-<id>.md` deve ter Definition of Done anti-stub explícito.

**No `TASK-SPEC-template.md` (3 IDEs):**

Nova seção **PADRÕES PROIBIDOS** lista o que `dare review` reprova. DoD obrigatório passa a incluir "`dare review <task-id>` passou" antes de marcar DONE.

### 🔧 Mudança — Campo `version` no `dare.config.json` agora rastreia release DARE

Antes da v2.17, `dare init` escrevia um `version: "0.1.0"` hardcoded que nada lia nem atualizava. Agora rastreia a versão do DARE com que o projeto foi inicializado/atualizado pela última vez:

```jsonc
// Antes (zombie):
{ "version": "0.1.0" }

// Depois (significativo):
{
  "version": "2.17.0",
  "updatedAt": "2026-05-16T...",
  "review": { "onComplete": true, "strict": false },
  "refine": { "thresholds": { "low": 5, "med": 12, "high": 20 } }
}
```

Migrações cuidam de projetos pré-2.17 automaticamente (`unify-version-field` + `add-review-refine-defaults`). Versão do app do dev continua no lugar canônico: `package.json`, `Cargo.toml`, `composer.json`.

### 🧪 Testes

- `update.test.ts` — 16 testes (version-compare, changeAppliesToIde, buildUpdatePlan, resolveProjectVersion)
- `review.test.ts` — 27 testes (isTestFile, parseFilesFromSpec, detectores estáticos, runStaticAnalysis, runReview end-to-end)
- `refine.test.ts` — 12 testes (levelFromScore, analyzeTaskComplexity, proposeSplit)
- Suite total: **175 testes** passando

### 📂 Arquivos novos

```
packages/cli/src/commands/
  ├── update.ts
  ├── review.ts
  └── refine.ts

packages/cli/src/utils/
  ├── UpdateDetector.ts       (planejamento puro)
  ├── UpdateApplier.ts        (backup, write, conflict, migrations)
  ├── version-compare.ts      (semver minimal)
  ├── ReviewRunner.ts         (orquestra spec → files → analyzer)
  ├── static-analyzer.ts      (detectores regex + multi-line)
  └── complexity-analyzer.ts  (heurística + proposeSplit)

packages/cli/src/types/
  ├── UpdateManifest.types.ts
  ├── Review.types.ts
  └── Refine.types.ts

packages/cli/templates/
  └── UPDATE-MANIFEST.json    (atualizar a cada release)

implementations/claude/.claude/commands/
  ├── dare-review.md          (skill semântica)
  └── dare-refine.md          (skill de split)

implementations/cursor/.cursor/commands/
  ├── review-task.md
  └── refine-task.md

implementations/antigravity/.agents/skills/
  ├── dare-review/SKILL.md
  └── dare-refine/SKILL.md
```

### 📝 Modificados

- Prompts de blueprint nas 3 IDEs (Anti-Stub Contract)
- Prompts de tasks nas 3 IDEs (Anti-Stub Contract)
- TASK-SPEC-template.md nas 3 IDEs (seção 7 PADRÕES PROIBIDOS + DoD expandido)
- `src/commands/execute.ts` (gate opt-in `maybeRunReviewGate` antes de markDone)
- `src/utils/project-generator.ts` (init grava `review` + `refine` defaults)

---

## [2.16.0] — 2026-05

### ✨ Adicionado — Visualização Excalidraw para DAG

Novo formato de visualização para `dare dag viz` com **Excalidraw** — editor visual interativo:

```bash
dare dag viz --format excalidraw
# → Gera: DARE/dag-graph.excalidraw
# → Abra em: https://excalidraw.com
```

**Recursos:**
- 🎨 **Color-coding automático:**
  - Por complexidade: LOW (azul) | MED (laranja) | HIGH (rosa)
  - Por status: PENDING (cinza) | RUNNING (azul tracejado) | DONE (verde) | FAILED (vermelho) | SKIPPED (cinza escuro)
  
- 🏊 **Swim lanes por rank:** Tasks em mesmo nível podem rodar em paralelo (posicionamento automático)

- ↔️ **Setas de dependência:** Cinza normal, vermelha se source falhou, tracejada se RUNNING

- 🎯 **Interativo:** Zoom, pan, anotar, exportar PNG/SVG para slides/docs

**Design Tokens:** Veja `docs/DESIGN-TOKENS-EXCALIDRAW.md` para cores, tipografia e layout

**Skills IDE:**
- Claude Code: `/dare-dag-viz`
- Cursor: `/dare-dag-viz`
- Antigravity: `/dare-dag-viz`

**Exemplo completo:** `packages/cli/templates/DARE-dag-example.yaml` (7 tasks com ranks e dependências)

**Implementação:**
- `packages/cli/src/utils/excalidraw-renderer.ts` — Conversor DAG → Excalidraw JSON
- `packages/cli/src/commands/dag.ts` — Integração com CLI (já suportava Mermaid + DOT)
- `packages/cli/src/utils/excalidraw-renderer.test.ts` — 13 testes unitários

Formatos alternativos ainda suportados: `--format mermaid` | `--format dot`

---

## [2.15.0] — 2026-05

### Corrigido — Package names corretos por crate em monorepo Rust
`dare init` com layout Rust monorepo (Axum + Leptos) gerava `name = "<project-name>"` em todos os
crates membros, causando colisão de nomes dentro do workspace (`ars-server` e `ars-web` com o mesmo
package name). Agora cada crate recebe seu nome correto:
- Layout `single`: `crates/server` → `name = "server"`, `crates/web` → `name = "web"`
- Layout `multi`: `crates/{prefix}-server` → `name = "{prefix}-server"`, etc.

### Corrigido — `Cargo.lock` removido após `cargo fetch` em bootstraps Leptos
`bootstrapLeptosFullstack` e `bootstrapLeptosCsr` chamam `cargo fetch` ao final, que criava
`Cargo.lock` dentro do crate membro antes do workspace root existir. O arquivo é agora removido
automaticamente quando `isMonorepo: true`, mantendo apenas o `Cargo.lock` na raiz do workspace.

## [2.14.0] — 2026-05

### Corrigido — Templates `generate-blueprint` e `dare-blueprint` não sincronizados
Os arquivos de template instalados por `dare init` (`packages/cli/templates/ide/`) estavam desatualizados
em relação ao código-fonte (`implementations/`). O sync agora propaga corretamente o fix de phase
separation: `/generate-blueprint` e `/dare-blueprint` geram somente `BLUEPRINT.md`, bloqueando
geração de tasks sem aprovação humana.

## [2.13.0] — 2026-05

### Corrigido — `/dare-blueprint` e `/generate-blueprint` geram apenas `BLUEPRINT.md`
Os comandos de blueprint violavam a separação de fases do DARE: geravam BLUEPRINT + TASKS + DAG
sem aprovação humana. Agora geram **somente** `DARE/BLUEPRINT.md` e instruem explicitamente a rodar
`/dare-tasks` / `/generate-tasks` após revisão e aprovação do blueprint.

### Corrigido — `Cargo.lock` removido de crates membros do workspace
`cargo init` cria `Cargo.lock` em crates binários mesmo com `--vcs none`. O arquivo era incorretamente
incluído nos membros do workspace, violando a regra Cargo: apenas o workspace root deve ter `Cargo.lock`.
`dare init` agora remove o `Cargo.lock` automaticamente dos crates membros após o scaffold.

### Adicionado — Prompt `cratePrefix` no `dare init` para layout multi-crate
Projetos Rust monorepo com layout `multi` agora perguntam um prefixo curto para os crates
(ex: `"ars"` → `ars-core / ars-server / ars-web / ars-cli`), evitando nomes verbosos como
`ai-runtime-securyti-rasp-server`. O CLI sugere automaticamente as iniciais do slug do projeto.

## [2.12.0] — 2026-05

### Adicionado — Workspace layout single vs multi-crate no `dare init`
Novo prompt no `dare init` para projetos Rust monorepo (Axum + Leptos): escolha entre
`single` (`crates/server` + `crates/web`) ou `multi` (`{name}-core / {name}-server / {name}-web / {name}-cli`).

### Adicionado — `/dare-security` (novo slash command Claude Code)
Guia completo de segurança com OWASP A01–A10, exemplos de código por stack (Rust/Node/Python/PHP),
supply chain, gestão de secrets, headers de segurança e prompt injection para projetos com LLM.

### Melhorado — Templates DESIGN, BLUEPRINT e TASK-SPEC reestruturados
- `DESIGN-template.md`: seções RF/RNF/RS numeradas, stakeholders, matriz de integrações,
  riscos com probabilidade/impacto/mitigação, métricas de sucesso mensuráveis, checklist de aprovação.
- `BLUEPRINT-template.md`: fases com critério de DONE verificável, validation gates por stack
  incluindo auditoria de dependências, controles de segurança mapeados, estratégia de 4 tipos de testes.
- `TASK-SPEC-template.md`: objetivo como estado observável, seção obrigatória de segurança (6 pontos),
  validation gates com build + test + lint + audit.

### Melhorado — Ralph Loop expandido com auditoria de dependências
`/dare-execute` agora inclui passo 5.4: `npm audit --audit-level=high` / `cargo audit` / `pip-audit` /
`composer audit` toda vez que a task adicionar ou atualizar dependências. CVE HIGH ou CRITICAL = task FAILED.
Passo 5.5: verificação de secrets antes de commitar.

### Melhorado — `skill-security.mdc` completamente reescrita
OWASP A01–A10 com exemplos de código reais por stack; A06 (Dependências Vulneráveis) com comandos
por stack e gate obrigatório no Ralph Loop; supply chain (detect-secrets, lockfiles, CI pins);
prompt injection para projetos com LLM; headers de segurança HTTP obrigatórios em produção.

### Corrigido — Estrutura Rust monorepo usa `crates/server` + `crates/web`
`dare init` com Rust/Axum + Leptos (fullstack ou CSR) agora gera a estrutura Cargo workspace correta:
`crates/server/` e `crates/web/` (ou `crates/{name}-{tipo}/` no layout multi-crate) em vez de
`backend/` + `frontend/` (convenção npm, não Rust).

### Corrigido — `--vcs none` em crates membros de workspace
`cargo init` dentro de um monorepo Cargo agora usa `--vcs none` para não criar um `.git` aninhado
que quebra o workspace e o histórico do repositório pai.

## [2.11.0] — 2026-05

### Adicionado — Stacks `rust-leptos` e `rust-leptos-csr`
Suporte completo a Leptos 0.7 no `dare init`:

- **`rust-leptos`** — fullstack SSR + hidratação com `cargo-leptos` 0.2.22 + Axum. Gera:
  `Cargo.toml` workspace com `crates/server` (Axum) + `crates/web` (Leptos), `.cargo/config.toml`
  (WASM target apenas para `crates/web`, **sem** `[build] target` global),
  `main.rs` Axum com `LeptosOptions`, componente `App` com routing.
- **`rust-leptos-csr`** — CSR puro (WASM sem SSR) com `trunk`. Gera:
  `Cargo.toml` com features `csr`, `index.html` Trunk-compatible, `Trunk.toml`.

#### Toolchain nativa requerida
| Stack | Native | Docker fallback |
|-------|--------|-----------------|
| `rust-leptos` | Rust 1.83+ + `cargo install cargo-leptos --version 0.2.22` | `ghcr.io/dewtech-technologies/dare-rust-leptos:1` |
| `rust-leptos-csr` | Rust 1.83+ + `cargo install trunk` | `ghcr.io/dewtech-technologies/dare-rust-leptos:1` |

#### Ralph Loop por modo
```bash
# fullstack (cargo-leptos):
cargo leptos build --release && cargo test --workspace && cargo clippy --all-features -- -D warnings

# CSR (trunk):
trunk build --release && cargo test --workspace && cargo clippy --all-features -- -D warnings
```

### Adicionado — Skill `/dare-rust-leptos`
Guia completo para desenvolvimento Leptos: decisão CSR vs fullstack, idioms Leptos 0.7
(`#[component]`, signals, `Resource`, `Action`, `Show`, `For`, `#[server]`), tipos compartilhados
com `cfg_attr`, configuração de workspace misto (WASM + native), antipatterns a evitar.
Inclui 3 templates de task prontos para projetos Leptos.

| IDE | Arquivo |
|-----|---------|
| Cursor | `.cursor/rules/skill-rust-leptos.mdc` |
| Antigravity | `.agents/skills/dare-rust-leptos/SKILL.md` |
| Claude Code | `.claude/commands/dare-rust-leptos.md` (`/dare-rust-leptos`) |

## [2.10.0] — 2026-05

### Adicionado — Tipo de projeto `mcp-server`
Nova opção na estrutura do `dare init` para criar servidores MCP (Model Context Protocol):

```
? Project structure:
    Monorepo (backend + frontend)
    Backend only
    Frontend only
  ❯ MCP Server
```

Prompts específicos para MCP:
- **Linguagem:** TypeScript/Node.js ou Python
- **Transport:** `stdio` (CLI tools, agentes locais) · `SSE` (integrações web) · `HTTP Stream` (streamable HTTP)
- **Capabilities:** Tools · Resources · Prompts (checkbox múltiplo)

#### Templates gerados por combinação
| Linguagem | Transport | O que vem |
|-----------|-----------|-----------|
| TypeScript | stdio | `src/index.ts` com `StdioServerTransport` + tool de exemplo |
| TypeScript | SSE | Express + `SSEServerTransport` + CORS |
| TypeScript | HTTP Stream | Express + `StreamableHTTPServerTransport` + sessões |
| Python | stdio | `main.py` com `stdio_server()` + FastMCP |
| Python | SSE | FastMCP com `sse_app()` |
| Python | HTTP Stream | FastMCP com `streamable_http_app()` |

#### Próximos passos gerados automaticamente
```bash
dare design "Descreva o que este MCP server expõe"
dare blueprint
dare execute --parallel
npx @modelcontextprotocol/inspector python main.py  # ou npm run inspect
```

### Adicionado — `dare discover` detecta projetos MCP existentes
`dare discover` agora reconhece projetos MCP a partir de:
- `package.json` com `@modelcontextprotocol/sdk`
- `requirements.txt` / `pyproject.toml` com `mcp` ou `fastmcp`

### Melhorado — Suporte Claude Code
- `CLAUDE.md` gerado com seções de stack específicas (Rust/Axum, NestJS, FastAPI, Laravel, Leptos)
- `.claude/commands/` com todos os slash commands DARE
- `.claude/settings.json` com hooks do Ralph Loop
- Slash commands disponíveis: `/dare-design`, `/dare-blueprint`, `/dare-execute`, `/dare-tasks`,
  `/dare-rust-workspace`, `/dare-dag-run`

## [2.9.0] — 2026-05

### Adicionado — Skill `rust-workspace` (decisão + migração)
Nova skill nos 3 IDEs que orienta o agente a:

1. **Decidir na fase Design/Blueprint** se um projeto Rust nasce
   single-crate ou em workspace multi-crate (com critérios objetivos:
   nº de binários, sistemas externos, tamanho de equipe, deploy
   independente).
2. **Propor plano de migração em PRs incrementais** quando um projeto
   single-crate maduro está doendo (build lento, fronteiras erodidas,
   workers acoplados ao API server).

#### Cenário A — Decisão na fase Design/Blueprint

Critérios para escolher single-crate (todos verdadeiros) vs workspace
(qualquer um verdadeiro):

| Single-crate quando | Workspace quando |
|---------------------|-------------------|
| 1 binário | ≥ 2 binários (API + worker, API + admin) |
| < 30 arquivos `.rs` | Múltiplos sistemas externos (3+) |
| 1–2 sistemas externos | Deploy independente (k8s, scaling separado) |
| Equipe ≤ 2 devs | Fronteiras arquiteturais críticas (domain puro) |
| Sem deploy independente | Equipe ≥ 3 devs em paralelo |

A skill traz layout convencional para workspace (`<p>-domain`,
`<p>-services`, `<p>-api`, `<p>-worker-X`, …), template de `Cargo.toml`
raiz com `workspace.dependencies` centralizadas, e diagrama Mermaid do
grafo de dependências para incluir no BLUEPRINT.md.

#### Cenário B — Migração de single-crate para workspace

Sintomas para detectar a hora de migrar:
- `src/` > 30 arquivos ou > 6 subpastas top-level
- `tokio::spawn(worker)` no mesmo processo do API
- `cargo build` incremental > 10s
- Conflitos de merge frequentes
- Quer expor SDK/cliente como crate publicável

Plano em **4 PRs incrementais** (nunca big-bang):

1. **Workers** — `src/workers/` → `crates/<p>-worker-<X>/` (binário próprio)
2. **Integrators** — `src/integrators/` → `crates/<p>-integrators/` (lib)
3. **Domain** — `src/models/` + `src/dto/` → `crates/<p>-domain/` (deps mínimas)
4. **API + workspace root** — `Cargo.toml` raiz vira `[workspace]` puro

Cada PR passa por `cargo build/test/clippy --workspace` + smoke E2E
antes de mergear. Antipatterns mapeados (big-bang, crate `common`,
granularidade demais, refactor + migração no mesmo PR).

#### Onde está a skill

| IDE | Arquivo |
|-----|---------|
| Cursor | `.cursor/rules/skill-rust-workspace.mdc` |
| Antigravity | `.agents/skills/dare-rust-workspace/SKILL.md` |
| Claude Code | `.claude/commands/dare-rust-workspace.md` (slash `/dare-rust-workspace`) |

#### Quando NÃO migrar (a skill também alerta)

- Projeto < 30 arquivos, 1 binário, 1 dev
- Sprint crítico em curso
- Sem sinais reais de dor (build < 5s, sem conflitos, sem segundo binário planejado)

Migração tem custo. A skill orienta o agente a propor migração apenas
quando o ganho compensa.

## [2.8.0] — 2026-05

### Adicionado — Stack `go-stdlib` (Go puro, sem framework)
Nova opção no `dare init` para APIs em Go usando **apenas a biblioteca
padrão** — `net/http`, `encoding/json`, `log/slog`, `net/http/httptest`.
Coexiste com a stack `go-gin` existente; o usuário escolhe.

```
? Backend stack:
    🦀 Rust / Axum
    🟢 Node.js / NestJS
    🐍 Python / FastAPI
    🐘 PHP / Laravel
    🐹 Go / Gin
  ❯ 🐹 Go / stdlib (no framework, net/http only)
```

#### O que vem no scaffold

```
cmd/api/main.go               # http.NewServeMux + middleware chain
internal/handlers/
  ├─ health.go                # GET /healthz
  └─ health_test.go           # httptest puro, sem mocks externos
internal/middleware/
  ├─ logger.go                # slog estruturado por request
  └─ recover.go               # converte panics em 500
go.mod                        # ZERO dependências externas
```

Roteamento usa a sintaxe nova do Go 1.22+:

```go
mux.HandleFunc("GET /api/v1/users/{id}", handlers.GetUser)
mux.HandleFunc("POST /api/v1/users", handlers.CreateUser)
// path params via r.PathValue("id")
```

#### Por que adicionar essa stack

A stdlib do Go cobre 90% do que frameworks oferecem desde a 1.22 (pattern
matching no `ServeMux`, com método HTTP e path params). Para times que
preferem zero dependências, compilação rápida e controle total, essa
stack é mais idiomática que `go-gin`.

| | `go-gin` | `go-stdlib` |
|--|----------|-------------|
| Roteamento | `r.GET("/users/:id", h)` | `mux.HandleFunc("GET /users/{id}", h)` |
| Bind JSON | `c.BindJSON(&dto)` | `json.NewDecoder(r.Body).Decode(&dto)` |
| Middleware | `r.Use(mw)` | `Logger(Recover(mux))` |
| go.mod | ~30 deps transitivas | 0 deps |
| Velocidade | Excelente | Excelente |

#### Ralph Loop
Mesmos gates que `go-gin`:
```
go build ./...
go test ./...
go vet ./...
```

#### Skill stack-specific
Skill `skill-go-stdlib.mdc` orienta o agente IA a:
- NÃO adicionar framework (Gin/Echo/Chi/Fiber) — defeats the purpose
- Usar `r.PathValue("id")` para path params (Go 1.22+)
- Compor middleware como funções wrapping `http.Handler`
- Usar `log/slog` (stdlib) em vez de Zap/Logrus
- Para SQL: `database/sql` + sqlx ou pgx; nada de ORM
- Tests com `net/http/httptest` + table-driven

## [2.7.1] — 2026-05

### Corrigido — `dare init` falhava com `go-gin` em modo Docker
A imagem Docker para Go estava em `golang:1.22`. O `gin@latest` (v1.12)
foi atualizado e exige Go ≥ 1.25, então `go get github.com/gin-gonic/gin@latest`
falhava com:

```
github.com/gin-gonic/gin@v1.12.0 requires go >= 1.25.0
(running go 1.22.12; GOTOOLCHAIN=local)
```

**Fix:** atualizada a imagem Docker para `golang:1.25` e o hint para
"Install Go 1.25+". Hosts com Go nativo precisam de 1.25+; quem usa
Docker é transparente.

| Antes | Depois |
|-------|--------|
| `golang:1.22` | `golang:1.25` |
| Native hint: "Install Go 1.22+" | Native hint: "Install Go 1.25+" |

## [2.7.0] — 2026-05

A v2.6.x ficou em desenvolvimento e nunca foi publicada — todas as
correções e features dela estão consolidadas aqui na 2.7.0.

### Adicionado — Escolha de toolchain no `dare init` e `dare bootstrap`
Novo prompt no `dare init` (e flag `--toolchain` no `dare bootstrap`) com
três modos:

| Modo | Comportamento |
|------|---------------|
| `auto` (default) | Usa CLI nativo se estiver no PATH; senão cai em Docker |
| `native` | Exige o CLI nativo no PATH (composer / npm / cargo / python / go); falha se não tiver |
| `docker` | Sempre usa a imagem Docker oficial, mesmo com nativo disponível (toolchain hermética) |

A escolha fica salva em `dare.config.json` (`"toolchain": "auto"`) e é
reutilizada pelo `dare bootstrap`. O `dare bootstrap --toolchain <mode>`
permite override pontual.

```bash
dare init meu-projeto                       # interativo, escolhe modo
dare bootstrap --toolchain docker           # roda scaffold via Docker num projeto existente
dare bootstrap --toolchain native --force   # força nativo, ignora dirty checks
```

### Corrigido — `dare init` travava em projetos React/Vue
O `npm create vite@latest .` travava silenciosamente porque o
`create-vite` (v9+) tem prompts interativos que não dá para suprimir só
com `--template` (`Use Rolldown-Vite?`, package manager, etc). Quando o
subprocess herda stdin de um contexto não-TTY, ele fica preso esperando
input.

**Fix:** trocamos para `npx -y degit vitejs/vite/packages/create-vite/template-<react-ts|vue-ts> .`
que clona o **mesmo template oficial** direto do repositório do Vite,
sem nenhum prompt. Em seguida, `npm install` para popular `node_modules`
e deixar a stack pronta para o Ralph Loop.

`bootstrapFrontend` agora também chama `tryRenameNpmProject` no fim, então
o `package.json` já vem com o nome do seu projeto em vez do placeholder
`vite-project`.

### Corrigido — `dare init` falhava na stack Python no Windows
O comando `.venv\Scripts\pip.exe install --upgrade pip` falha no Windows
porque o pip não consegue substituir o próprio `pip.exe` enquanto está
em execução. O próprio pip imprime: *"To modify pip, please run
`python.exe -m pip install --upgrade pip`"*.

**Fix:** todas as chamadas de pip agora vão via `python -m pip` em vez
de `pip` direto, tanto em `python-fastapi` quanto em `mcp-server-python`.
Funciona idêntico em Windows, macOS e Linux.

### Corrigido — Erro críptico quando o diretório do projeto não está vazio
Quando uma execução anterior de `dare init` falhava no meio (ex.: timeout
no `composer create-project`, `pip install` interrompido), o diretório
ficava com arquivos parciais. A próxima tentativa caía dentro do scaffold
oficial e gerava erro críptico (`Project directory "/app/." is not empty`
do Composer; `directory not empty` do `cargo init`).

**Fix:** o CLI agora valida o diretório de destino **antes** de invocar o
scaffold e aborta com mensagem clara apontando 3 caminhos: remover o
diretório, escolher outro nome, ou usar `dare bootstrap --force`.
Tolera-se `.git/` e `.gitkeep` para não atrapalhar quem inicializa o repo
antes do `dare init`.

## [2.6.1] — 2026-05

### Corrigido — `dare init` travava em projetos React/Vue
O `npm create vite@latest .` da v2.6.0 travava silenciosamente porque o
`create-vite` (v9+) tem prompts interativos que não dá para suprimir só
com `--template`: pede nome do projeto, package manager, e às vezes o
"Use Rolldown-Vite?" experimental. Quando o subprocess herda stdin de um
contexto não-TTY, ele fica preso esperando input.

**Fix:** trocamos para `npx degit vitejs/vite/packages/create-vite/template-<react-ts|vue-ts> .`
que clona o **mesmo template oficial** direto do repositório do Vite, sem
nenhum prompt. Em seguida, `npm install` para popular `node_modules` e
deixar a stack pronta para o Ralph Loop.

Side-effect bom: `bootstrapFrontend` agora também chama
`tryRenameNpmProject` no fim, então o `package.json` já vem com o nome
do seu projeto em vez do placeholder `vite-project`.

### Corrigido — `dare init` falhava na stack Python no Windows
O comando `.venv\Scripts\pip.exe install --upgrade pip` falha no Windows
porque o pip não consegue substituir o próprio `pip.exe` enquanto está
em execução. O próprio pip imprime: *"To modify pip, please run
`python.exe -m pip install --upgrade pip`"*.

**Fix:** todas as chamadas de pip agora vão via `python -m pip` em vez
de `pip` direto, tanto em `python-fastapi` quanto em `mcp-server-python`.
Funciona idêntico em Windows, macOS e Linux.

### Corrigido — Erro críptico quando o diretório do projeto não está vazio
Quando uma execução anterior de `dare init` falhava no meio (ex.: timeout
no `composer create-project`, `pip install` interrompido), o diretório
ficava com arquivos parciais. A próxima tentativa caía dentro do scaffold
oficial e gerava erro críptico (`Project directory "/app/." is not empty`
do Composer; `directory not empty` do `cargo init`; etc).

**Fix:** o CLI agora valida o diretório de destino **antes** de invocar o
scaffold e aborta com mensagem clara apontando 3 caminhos: remover o
diretório, escolher outro nome, ou usar `dare bootstrap --force`.
Tolera-se `.git/` e `.gitkeep` para não atrapalhar quem inicializa o repo
antes do `dare init`.

## [2.6.0] — 2026-05

### Adicionado — Fallback Docker automático no `dare init` e `dare bootstrap`
Quando a toolchain nativa da stack escolhida não está no PATH, o CLI
detecta o Docker e roda o scaffold dentro da imagem oficial — sem nenhuma
flag, sem perguntar nada. O usuário só precisa ter **uma** das duas:

| Stack | Native | Docker fallback |
|-------|--------|-----------------|
| `php-laravel` | `composer` | `composer:latest` |
| `node-nestjs`, `react`, `vue`, `mcp-node-ts` | `npm`/`npx` | `node:20-alpine` |
| `python-fastapi`, `mcp-python` | `python` | `python:3.12-slim` |
| `rust-axum` | `cargo` | `rust:1.83` |
| `go-gin` | `go` | `golang:1.25` (atualizado na 2.7.1) |

Comportamento:

```bash
$ dare init my-api    # escolheu php-laravel mas não tem composer
⚠  composer not found on PATH — falling back to Docker (composer:latest).
  $ docker run --rm -v ".:/app" -w /app composer:latest create-project laravel/laravel:^11 .
  ...
```

Detalhes da implementação:
- Caminho de bind-mount adaptado por OS (Windows usa forward slashes; Unix
  passa `--user $(id -u):$(id -g)` para evitar arquivos owned por root).
- Imagens `composer:latest` (ENTRYPOINT = composer) e shell-based
  (`node`/`python`/`rust`/`golang`) tratadas com lógica distinta — no
  primeiro caso, só passamos os argumentos; no segundo, prefixamos o
  comando.
- Se nem nativo nem Docker estão disponíveis, falha fast com mensagem
  apontando para os dois caminhos.

### Documentação — Pré-requisitos no README
README do CLI ganhou seção **Prerequisites** explícita listando:
- Node.js (sempre — para o CLI rodar)
- Toolchain nativa **OU** Docker para a stack escolhida
- Tabela de imagens Docker fallback por stack
- Nota sobre Ralph Loop precisar da mesma toolchain disponível em runtime

## [2.5.0] — 2026-05

Versão que fecha 3 lacunas estruturais identificadas em uso real:

### Adicionado — Stack `go-gin`
Nova stack de backend para APIs em Go com Gin Web Framework. Vem com:
- Estrutura `cmd/api/main.go` + `internal/handlers/` + `internal/middleware/`
- Endpoint `/healthz` funcionando + teste básico (`health_test.go`)
- Dependências: `gin-gonic/gin`, `joho/godotenv`
- Ralph Loop: `go build ./...` → `go test ./...` → `go vet ./...`

### Mudado (BREAKING) — `dare init` agora roda o scaffold oficial da stack
Em vez de copiar um template fake mínimo, `dare init` invoca o scaffold
oficial da stack escolhida. Quando o comando termina, você tem um projeto
**executável** — com `vendor/`, `node_modules/`, `target/` e tudo o mais
que o framework precisa.

| Stack | Comando |
|-------|---------|
| `php-laravel` | `composer create-project laravel/laravel:^11 .` + `sanctum` + `jwt-auth` + `pint`/`larastan` |
| `node-nestjs` | `npx @nestjs/cli new . --strict --skip-git --package-manager npm` |
| `react` | `npm create vite@latest . -- --template react-ts` + `npm install` |
| `vue` | `npm create vite@latest . -- --template vue-ts` + `npm install` |
| `python-fastapi` | `python -m venv .venv` + `pip install -r requirements.txt` |
| `rust-axum` | `cargo init` + `Cargo.toml` com axum/sqlx/tokio + `cargo fetch` |
| `go-gin` | `go mod init` + `go get gin/godotenv` + starter `cmd/api/main.go` + `internal/handlers/` + `go mod tidy` |
| `mcp-server-node` | `npm init` + `@modelcontextprotocol/sdk` |
| `mcp-server-python` | `python -m venv .venv` + `pip install mcp[cli]` |

Detecção pré-vôo: se a ferramenta não está no PATH (`composer`/`npm`/`cargo`/
`python`), `dare init` falha **com erro claro** apontando para o link de
instalação. Não há fallback para template fake.

Flag `--skip-bootstrap` (e `skipBootstrap: true` na API programática) para
usar em CI/testes sem toolchain. O `.gitignore` agora **mescla** os entries
DARE com os gerados pelo scaffold em vez de sobrescrever.

### Adicionado — `dare bootstrap`
Comando para rodar o scaffold em projeto **existente** (criado em versões
anteriores ou com `--skip-bootstrap`). Lê `dare.config.json`, recusa rodar
se detectar artefatos do framework já no diretório (`vendor/`,
`composer.lock`, `node_modules/`, `Cargo.lock`, etc) — `--force` para
forçar.

### Mudado (BREAKING) — Ralph Loop é executado **em toda task**
`dare execute --complete <id>` agora roda **automaticamente** os 3 gates
da stack do projeto **antes** de marcar a task como DONE:

```
build  → composer dump-autoload  /  npm run build  /  cargo build
test   → php artisan test         /  npm test       /  cargo test
lint   → ./vendor/bin/pint --test /  npm run lint   /  cargo clippy
```

- Se **todos** passarem → task vira DONE.
- Se **algum** falhar → task vira FAILED com `task.error` contendo o gate
  que falhou + stderr capturado (até 4000 chars). Exit code 1.
- **Não há flag para pular** o Ralph Loop. Não há config para customizar
  os comandos. É hardcoded por stack.
- Tasks legítimas que falham (ex.: ainda sem ambiente, ou tests
  intencionalmente quebrados) ficam visíveis como FAILED — você corrige
  o código e chama `--complete` de novo, ou `--reset` antes para zerar
  o histórico do graph.

A stack vem de `dare.config.json`. MCP server tem mapeamento próprio
(`mcp-server-node-ts` / `mcp-server-python`).

### Mudado — Template default das tasks
- `task-001` agora é **"Containerize app (Dockerfile + docker-compose)"** —
  sem container/runtime, o Ralph Loop não tem onde rodar.
- A última task **deixa de ser "Ralph Loop final"**. Esse antipattern foi
  removido — Ralph Loop é gate por task, não fase final.
- Tasks de teste agora prompts explícitos: "tests com assertions reais —
  `assertTrue(true)` quebra o gate".

### Mudado — Skills nos 3 IDEs
Cursor (`skill-dag-runner.mdc`, `generate-tasks.md`), Antigravity
(`dare-dag-runner/SKILL.md`) e Claude (`dare-blueprint.md`) ganharam:

- Seção explícita "Ralph Loop é AUTOMÁTICO e OBRIGATÓRIO".
- Antipatterns proibidos: "Ralph Loop final", `assertTrue(true)`, "Setup
  project" antes de containerizar.
- Ordem recomendada: Container → Schema → Endpoints → Auth → Tests reais.

### Adicionado — testes
- `ralph-loop.test.ts`: 11 testes (gates por stack, resolveStackFromConfig
  com mcp/backend/frontend, error path).
- E2E valida: scaffold em modo `skipBootstrap`; novo template de tasks
  (Containerize, sem Ralph Loop final); Ralph Loop bloqueia DONE quando
  ambiente não está pronto; `dare bootstrap` registrado.
- **Total: 109 testes passando** (era 97, +12).

### Como migrar projetos existentes (criados em ≤ v2.4.x)
Em vez de recriar com `dare init`, use o novo `dare bootstrap`:

```bash
cd seu-projeto
dare bootstrap     # scaffolda Laravel/Nest/Vite por cima dos arquivos DARE
```

A skill `dare-tasks` também foi atualizada — re-rode `/generate-tasks`
para o agente regenerar `dare-dag.yaml` sem `Ralph Loop final` e com
`Containerize app` como `task-001`.

## [2.4.1] — 2026-05

### Adicionado — `dare dag viz` (visualização do DAG estático)
Renderiza `dare-dag.yaml` como diagrama Mermaid ou DOT, **agrupado por
rank** (subgraphs) e **colorido por status** das tasks (PENDING / RUNNING /
DONE / FAILED / SKIPPED). Permite visualizar o plano de execução **antes**
de executar qualquer task.

```bash
dare dag viz                              # Mermaid no stdout
dare dag viz -o DARE/dag-graph.mmd        # arquivo Mermaid
dare dag viz -f dot -o DARE/dag-graph.dot # DOT (Graphviz)
```

Como renderizar:
- **Mermaid:** Cursor / VS Code com extensão "Markdown Preview Mermaid
  Support", GitHub renderiza nativo, ou cole em https://mermaid.live
- **DOT:** `dot -Tsvg DARE/dag-graph.dot -o graph.svg` (Graphviz local)
  ou cole em https://dreampuf.github.io/GraphvizOnline

### Mudado — `dare blueprint` agora gera `DARE/dag-graph.mmd` automaticamente
O scaffold do `dare blueprint` cria/atualiza `DARE/dag-graph.mmd` (Mermaid)
junto com os outros artefatos. Esse arquivo **é regenerado a cada execução**
do blueprint (ao contrário dos outros, que são preservados se já existirem)
— afinal, ele tem que refletir o estado atual do YAML.

### Mudado — Skills atualizadas
- Cursor `generate-tasks.md`, Antigravity `dare-tasks/SKILL.md` e
  Claude `dare-blueprint.md` ganharam uma instrução explícita: depois de
  preencher o `dare-dag.yaml` real, rodar `dare dag viz -o DARE/dag-graph.mmd`
  para o usuário visualizar o grafo antes de executar.

### Testes
- 9 novos testes cobrindo `renderDagMermaid` (subgraphs, edges, classes
  de status, ícones) e `renderDagDot` (digraph, nós, arestas, fillcolor
  por status).
- E2E valida que `dare blueprint --force` cria `dag-graph.mmd`, que
  `dare dag viz` aceita `--format`/`--output`, e que o Mermaid reflete
  o status atualizado depois de um `--complete`.
- **Total: 97 testes passando** (era 88, +9).

## [2.4.0] — 2026-05

### Adicionado — `dare info`
Comando read-only que reúne diagnóstico do projeto DARE em uma tela:
versão do CLI, plataforma, presença/ausência de cada artefato canônico
(`dare.config.json`, `DARE/DESIGN.md`, `BLUEPRINT.md`, `dare-dag.yaml`,
`TASKS.md`, `.canvas.md`, `dare-graph.yml`, `.dare/state.json`), backend
ativo do GraphRAG e progresso por status das tasks.

### Adicionado — `dare validate`
Checagem estática do `dare-dag.yaml` adequada para pre-commit hooks e CI:
- ids únicos e em kebab-case
- `depends_on` referenciando ids existentes
- detecção de ciclos (Kahn's traversal)
- subtask_prompt não vazio (warning)
- ao menos 2 tasks no rank 0 (warning)
- `--strict` faz warnings virarem erros

Template de hook em `templates/hooks/pre-commit-dare-validate` para copiar
para `.git/hooks/pre-commit` ou usar com husky.

### Adicionado — Parser de `endpoint`/`schema`/`component`
A ingestão automática do graph agora detecta no `--output` da task:
- **Endpoints HTTP:** `POST /api/...`, `GET /api/...`, etc. → nó `endpoint`
- **Schemas SQL/migration:** `CREATE TABLE x`, `Schema::create('x', ...)` → nó `schema`
- **Componentes UI:** `<UserForm />`, `class UserForm extends Component`,
  `export default function UserForm` → nó `component`

Heurísticas conservadoras para reduzir false positives. Cada nó detectado
recebe aresta `implements` da task que o criou.

### Adicionado — Backend Neo4j
`Neo4jGraph` que fala com Neo4j via HTTP API (`/db/{database}/tx/commit`)
— **sem driver Bolt externo**, usa apenas `fetch` nativo do Node 18+.
Configure em `dare-graph.yml`:

```yaml
backend: neo4j
neo4j:
  url: http://localhost:7474
  database: dare
  username: neo4j
  password: secret
  # auth: "Bearer <token>"   # alternativa
```

`MERGE` por id em vez de duplicar — re-execução é idempotente.

### Adicionado — `dare execute --watch`
Modo loop interativo: o CLI fica observando `.dare/state.json` e re-imprime
as próximas tasks ready toda vez que o estado muda. Combina bem com o
agente da IDE — basta deixar o `--watch` rodando em um terminal lateral
enquanto o agente dispara `--complete`/`--fail`.

### Mudado
- Template de `dare-graph.yml` para Neo4j atualizado: HTTP em vez de Bolt
  (usa porta 7474, não 7687).

### Testes
- `validate.test.ts` — 5 cenários (válido, ids duplicados, depends_on
  inexistente, ciclo, kebab-case).
- `factory.test.ts` — 6 cenários (defaults, sqlite custom, json, neo4j
  básico/bearer, validação de URL ausente).
- `graph-ingest.test.ts` — +9 testes para endpoints, schemas, componentes
  e os parsers individuais.
- **Total: 88 testes passando** (era 66, +22).

## [2.3.1] — 2026-05

### Adicionado
- `dare graph query <termo> --type <tipo>` — filtro opcional por tipo de nó
  (`task`, `file`, `schema`, `endpoint`, `component`, `entity`, `concept`).

### Corrigido
- `dare execute --reset <id>` agora também remove o nó `task:<id>` do graph,
  evitando metadata stale (status DONE/FAILED antigo) depois de um retry.
  Os nós `file` permanecem — a remoção é cirúrgica, só na task resetada.
- `JsonGraph` usa `flushSync` para gravar em disco — elimina race condition
  no CI Linux quando duas mutações acontecem em sequência rápida (afetava o
  teste `persists state across instances` no GitHub Actions).

## [2.3.0] — 2026-05

### Adicionado — comando `dare graph`
- `dare graph stats` — totais e breakdown por tipo de nó/edge.
- `dare graph query <termo>` — busca por label/description (LIKE).
  Suporta `-l/--limit`.
- `dare graph viz [-f mermaid|dot] [-o file]` — exporta o grafo em Mermaid
  ou DOT (ideal para colar em Markdown ou rodar com Graphviz).
- `dare graph ingest` — re-sync explícito a partir do `dare-dag.yaml` +
  `.dare/state.json` atual.

### Adicionado — backend JSON do GraphRAG (`JsonGraph`)
Implementação alternativa que persiste o grafo em arquivo JSON único,
sem dependência nativa (não usa sql.js). Útil para projetos pequenos ou
ambientes restritos. Selecionado quando `dare-graph.yml` declara
`backend: json`.

### Adicionado — interface comum `KnowledgeGraph`
Contrato implementado tanto por `GraphRAG` (SQLite) quanto por `JsonGraph`.
A factory `createGraph()` lê `dare-graph.yml` e devolve a instância correta.

### Adicionado — ingestão automática do DAG
Toda vez que `dare execute --complete` ou `--fail` é chamado, o orquestrador:
- Cria nó `task` com status, complexity, tokens, duration.
- Cria arestas `depends_on` espelhando o DAG.
- Para tasks DONE: parseia o `--output` em busca de paths e cria nós
  `file` + arestas `implements`.
- Em caso de FAILED, faz cascade-skip e ingere os SKIPPED também.

### Mudado — Neo4j ainda não implementado
Selecionar `backend: neo4j` em `dare-graph.yml` retorna erro explicativo
pedindo para usar `sqlite` ou `json`. Implementação completa fica para
um release futuro.

### Testes
- 5 testes para `JsonGraph` (upsert, search, edge cleanup, persistência,
  stats).
- 6 testes para `extractFilePaths` e `ingestTask` (path detection,
  task node, depends_on edges, file nodes, FAILED handling, PENDING skip).

## [2.2.0] — 2026-05

### Mudado (BREAKING) — `dare execute` virou orquestrador puro
A versão anterior chegou a embarcar adapters de SDK (`@anthropic-ai/sdk`,
`@cursor/sdk`, `@google/generative-ai`) que exigiam `ANTHROPIC_API_KEY`,
`CURSOR_API_KEY` e `ANTIGRAVITY_API_KEY`. **Foi um erro de design.** A IDE
do usuário (Cursor / Antigravity / Claude Code) já é o executor — está
autenticada na conta do usuário e lê as skills automaticamente. Não faz
sentido o CLI duplicar billing chamando outra API.

A v2.2.0 corrige isso:

- **Removidos:** `@anthropic-ai/sdk`, `@cursor/sdk`, `@google/generative-ai`.
- **Removidas todas as env vars** (`ANTHROPIC_API_KEY`, `CURSOR_API_KEY`,
  `ANTIGRAVITY_API_KEY`, `GOOGLE_API_KEY`).
- `dare execute` deixou de ser executor. Agora é orquestrador:
  - `dare execute --next` — imprime as tasks ready do rank atual com prompt
    completo (já com snippets de até 2000 chars dos outputs dos pais).
  - `dare execute --complete <id> --output "..."` — marca DONE, faz cap do
    output em 4000 chars e ingere no GraphRAG.
  - `dare execute --fail <id> --reason "..."` — marca FAILED + cascade-skip
    automático nos descendentes.
  - `dare execute --reset <id>` — volta uma task para PENDING (retry).
  - `dare execute --status` (default) — sumário + canvas.

A IDE faz o trabalho real (lê o prompt de `--next`, executa, registra com
`--complete`/`--fail`). O CLI atualiza `DARE/.canvas.md` e o `dare-graph`
automaticamente a cada mudança de estado.

### Adicionado — utilitários reaproveitados
- `dag-runner/utils/stitch-context.ts` — compõe o prompt do filho com
  snippet (tail) de até `parent_context_chars` chars de cada pai.
- `dag-runner/utils/cap-output.ts` — cap do output em `task_output_chars`
  com aviso de truncamento.

### Adicionado — orquestrador (`dag-runner/run_dag.ts`)
- `computeRanks()` — Kahn's algorithm.
- `nextExecutableTasks()` — devolve tasks PENDING cujo `depends_on` está DONE.
- `applyCascadingSkip()` — propaga SKIPPED para descendentes de FAILED/SKIPPED.
- `buildTaskPrompt()` — `subtask_prompt` + Upstream context.
- `markRunning/Done/Failed` — transições idempotentes; `Done`/`Failed`
  ingerem no GraphRAG quando configurado.
- `renderCanvas()` — atualiza `DARE/.canvas.md`.

### Mudado — skills nos 3 IDEs
- `.cursor/rules/skill-dag-runner.mdc`, `.agents/skills/dare-dag-runner/SKILL.md`
  e `.claude/commands/dare-dag-run.md` foram reescritos para refletir o
  novo loop: `dare execute --next` → executar → `dare execute --complete/--fail`.
- Toda menção a env vars de SDK foi removida.

### Removido
- 3 adapters (`adapters/{claude,cursor,antigravity}.ts`).
- `dag-runner/utils/timeout.ts` (sem função no fluxo orquestrado).
- Erros `MissingApiKeyError` e `AdapterCallError`.
- Testes de adapters.

### Testes
- Mantidos os utilitários (cap-output, stitch-context).
- Adicionados testes de orquestração (`orchestrator.test.ts`):
  ranks, `nextExecutableTasks`, `applyCascadingSkip`, `markDone/markFailed`,
  cap do output, `buildTaskPrompt`.

## [2.1.0] — 2026-05

### Adicionado — Skills DAG nos 3 IDEs
- **Cursor:** `.cursor/rules/skill-dag-runner.mdc` — regras de construção do
  grafo (depends_on mínimo, complexity, prompt self-contained, limites
  2000/4000/600s, canvas).
- **Cursor:** `.cursor/commands/run-dag.md` — slash `/run-dag` que orquestra
  `dare execute --parallel`.
- **Antigravity:** `.agents/skills/dare-dag-runner/SKILL.md` — equivalente.
- **Claude:** `.claude/commands/dare-dag-build.md` — regenera só o
  `dare-dag.yaml` a partir do BLUEPRINT.
- **Claude:** `.claude/commands/dare-dag-run.md` — slash `/dare-dag-run`.

### Mudado — `/generate-tasks` agora gera 3 artefatos
As skills de geração de tasks (Cursor `generate-tasks.md`, Antigravity
`dare-tasks/SKILL.md`, Claude `dare-blueprint.md`) passam a produzir
**simultaneamente**:

1. `DARE/TASKS.md` — tabela master humana
2. `DARE/dare-dag.yaml` — grafo executável pelo CLI
3. `DARE/EXECUTION/task-<id>.md` — uma spec detalhada por task

### Mudado — schema canônico do `dare-dag.yaml`
- Novo bloco `limits` com `parent_context_chars` (2000), `task_output_chars`
  (4000), `timeout_seconds` (600).
- `models` agora é mapeado **por runner** (`cursor`, `claude`, `antigravity`),
  cada um com `HIGH/MED/LOW`.
- Tasks aceitam `spec_file: EXECUTION/task-<id>.md` apontando para a spec
  detalhada.
- Schema legado (flat `models: {HIGH,MED,LOW}`) ainda é aceito pelo parser
  e normalizado automaticamente.

### Mudado — `dare blueprint` (CLI)
- Agora gera os 4 artefatos como esqueleto (BLUEPRINT, dare-dag.yaml com
  schema novo, TASKS.md, 5 specs em EXECUTION/).
- Por padrão **preserva arquivos existentes** (use `--force` para sobrescrever).
- O preenchimento real do conteúdo continua sendo do agente IA via slash
  commands / skills.

### Adicionado — testes
- 7 novos testes para `convertYamlToDag` / `convertDagToYaml` cobrindo schema
  novo (limits, per-runner models, spec_file), schema legado (flat models)
  e round-trip. **34/34 testes passando.**

## [2.0.0] — 2026-05

### Mudado (BREAKING)
- **Pacote único:** `@dewtech/dare-core`, `@dewtech/dare-graphrag` e
  `@dewtech/dare-mcp-server` foram unificados em `@dewtech/dare-cli`.
  Instalar `@dewtech/dare-cli` agora dá acesso a tudo — não há subpacotes
  para gerenciar nem subpaths para importar.
  - Os 3 pacotes antigos estão deprecated no npm.
  - Motivo: eliminar o version-sync hell entre pacotes interdependentes.
- **Versão única:** todo o monorepo passa a versionar pelo `@dewtech/dare-cli`.
  Sem mais bumps em cascata; uma versão, um publish.
- **Scripts internos do monorepo:** removidos `pnpm mcp` e `pnpm graphrag`
  do `package.json` raiz (apontavam para pacotes que não existem mais).

### Adicionado
- Binário adicional `dare-mcp-server` distribuído junto com `dare`.
- `implementations/claude/` como fonte da verdade para Claude Code
  (`CLAUDE.md`, slash commands, settings).
- `dare-graph.yml` gerado pelo `dare init` conforme backend escolhido
  (sqlite | json | neo4j); preserva edição manual do usuário.
- Sync automático no build (`scripts/sync-implementations.ts`).

### Corrigido
- `dare --version` agora lê dinamicamente do `package.json` (era hardcoded).
- Geração de `.cursor/commands/` e `.agents/skills/` que produzia stubs vazios.
- Testes do GraphRAG agora usam arquivo temporário (sql.js exige disco).
- Texto em `CLAUDE.md` template orientava `@dewtech/dare-graphrag` standalone;
  agora aponta para os comandos `dare graph` (planejados na v2.3).

### Notas de migração
**Para usuários do CLI:** nenhuma mudança. `dare init`, `dare design`,
`dare blueprint`, `dare execute` funcionam idênticos. Só atualize:

```bash
npm uninstall -g @dewtech/dare-cli
npm install -g @dewtech/dare-cli@latest
```

**Para projetos gerados pelo `dare init`:** nenhuma mudança no código.
Os projetos não importam pacotes `@dewtech/*` — eram CLIs/templates puros.

## [Unreleased - histórico legado]

### Adicionado
- Estrutura inicial pública do repositório
- README polido com posicionamento, comparação com Vibe Coding/BDD/TDD, e seção dedicada ao Ralph Loop
- Imagem do Ralph Wiggum ilustrando o Ralph Loop
- Logo Dewtech no hero
- Reorganização em `implementations/cursor/` e `implementations/antigravity/` autocontidos
- Documentação canônica em `docs/` (methodology, ralph-loop, phases, glossary, faq, comparisons)
- Arquivos de governança (LICENSE MIT, CONTRIBUTING, SECURITY)

## [1.0.0] — 2026-04

### Adicionado
- **Método DARE** com 4 fases (Design → Architect → Review → Execute)
- **Ralph Loop** como ciclo de auto-correção pós-execução
- **Implementação Cursor** com 9 comandos:
  - Core: `/generate-design`, `/generate-blueprint`, `/generate-tasks`, `/execute-task`
  - Infra: `/generate-dockerfile`, `/generate-docker-compose`
  - Análise: `/telemetry-report`
  - Especializados: `/generate-bugfix-design`, `/generate-feature-design`
- **Implementação Antigravity** com 6 skills equivalentes
- **Skills (Cursor)**: Laravel API, Docker, Security, Telemetry
- **Templates** universais: DESIGN, BLUEPRINT, TASKS, TASK-SPEC, TELEMETRY
- **Exemplos** em Laravel + Vue
- **Script** de análise de telemetria (`scripts/analyze-telemetry.py`)
- **Setup automatizado** via `setup-projeto.sh` / `setup-projeto.bat`

[Unreleased]: https://github.com/dewtech-technologies/dare-method/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/dewtech-technologies/dare-method/releases/tag/v1.0.0
