# Changelog

Todas as mudanças notáveis deste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

> Como esta é uma metodologia (não software executável), versões refletem
> mudanças na **estrutura do método, comandos canônicos e templates**.
> Patches em wording de prompts ou documentação não bumpam major.

## [Unreleased]

## [2.2.0] — 2026-05

### Adicionado — Adapters reais (substituem o placeholder)
- **`@anthropic-ai/sdk`** — adapter `claude` chama `messages.create` com
  `system` prompt do DARE; reporta `tokens` reais.
- **`@cursor/sdk`** — adapter `cursor` usa `Agent.create()` + `agent.send()`
  + `run.wait()` (cookbook DAG runner pattern).
- **`@google/generative-ai`** — adapter `antigravity` usa Gemini com
  `systemInstruction`; aceita `ANTIGRAVITY_API_KEY` ou `GOOGLE_API_KEY`.

### Adicionado — Utilitários do runner
- `dag-runner/utils/stitch-context.ts` — costura snippet (tail) de até
  `parent_context_chars` chars de cada output de pai no prompt do filho.
- `dag-runner/utils/cap-output.ts` — cap o output capturado por task em
  `task_output_chars` com aviso de truncamento.
- `dag-runner/utils/timeout.ts` — `withTimeout()` baseado em `AbortController`.
  Lança `TaskTimeoutError` (timeout) ou `TaskAbortedError` (sinal externo).

### Mudado — `runDag()` agora é dispatcher real
- Usa o adapter correto via factory `getAdapter(runner)`.
- Aplica `limits` (defaults: 2000/4000/600s) por task.
- Cada task recebe `prompt + Upstream context` costurado a partir dos pais.
- **SIGINT/SIGTERM cleanup global** — Ctrl+C aborta todas as tasks em
  voo via AbortController.
- **Cascading skip** — quando um pai falha ou é skipped, descendentes vão
  direto para SKIPPED.

### Mudado — `dare execute` (CLI)
- Novas flags:
  - `--task <id>` — executa apenas a task indicada (bypass paralelismo)
  - `--resume` — pula tasks já DONE/SKIPPED
  - `--runner` aceita `cursor | claude | antigravity` (validado antes de iniciar)
- Exit code 1 quando há FAILED, sugerindo `--resume` após corrigir.

### Adicionado — Erros úteis
- `MissingApiKeyError` — mensagem clara quando a env var do runner falta.
- `AdapterCallError` — encapsula erros do SDK preservando a cause.

### Adicionado — testes
- 9 testes para `utils/` (cap-output, stitch-context, withTimeout).
- 8 testes para adapters (mocks dos 3 SDKs + casos de API key faltando).
- **Total: 51 testes passando.**

### Documentação
- README do CLI documenta env vars (`ANTHROPIC_API_KEY`, `CURSOR_API_KEY`,
  `ANTIGRAVITY_API_KEY`) e exemplos de `dare execute --task` / `--resume`.

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
