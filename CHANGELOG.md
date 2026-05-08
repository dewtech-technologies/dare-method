# Changelog

Todas as mudanças notáveis deste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

> Como esta é uma metodologia (não software executável), versões refletem
> mudanças na **estrutura do método, comandos canônicos e templates**.
> Patches em wording de prompts ou documentação não bumpam major.

## [Unreleased]

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
