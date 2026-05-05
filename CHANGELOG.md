# Changelog

Todas as mudanças notáveis deste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

> Como esta é uma metodologia (não software executável), versões refletem
> mudanças na **estrutura do método, comandos canônicos e templates**.
> Patches em wording de prompts ou documentação não bumpam major.

## [Unreleased]

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
