# Stacks & DNA DARE

O DARE gera projetos **greenfield** a partir de um catálogo de **11 stacks** — 7 backend e 4 de servidores MCP. Cada gerador (`StackScaffold`) é registrado de forma **lazy** no registry (`packages/cli/src/stacks/registry.ts`): o módulo só é carregado quando você escolhe aquela stack, mantendo o `dare --help` frio e rápido.

Independentemente da stack, todo gerador entrega o mesmo conjunto invariante de 7 artefatos — o **DNA DARE** — validado em teste (`dna.spec.ts`).

## As 11 stacks

### Backend (7)

| Stack | Status | Framework | Libs principais |
|---|---|---|---|
| `ruby-rails-8` | stable | Rails 8 | rswag (OpenAPI), Action Cable (WS), RFC 7807 Problem Details, ActiveRecord, `rake dare:metrics` |
| `node-nestjs` | stable | NestJS 10 | Prisma + Postgres, JWT auth, Swagger em `/openapi.json`, Throttler (rate limit), class-validator + class-transformer, Pino |
| `python-fastapi` | stable | FastAPI | Pydantic v2, SQLAlchemy 2.0 + Alembic, slowapi (rate limit), uvicorn[standard] |
| `php-laravel` | stable | Laravel 11 | Sanctum + FormRequest, Eloquent, Reverb (WS) + Pail, ThrottleRequests, l5-swagger, LlmProvider (Dummy + OpenAI), Pest |
| `rust-axum` | stable | Axum 0.7 | Tokio, tower-http (CORS/trace) + tower-governor (rate limit), utoipa (OpenAPI), sqlx + Postgres, `axum::extract::ws` |
| `go-gin` | stable | Gin | sqlc + pgx, golang-jwt + bcrypt, gorilla/websocket, `golang.org/x/time/rate`, swag (OpenAPI) |
| `go-stdlib` | stable | net/http 1.22 ServeMux | pgx + schema sqlc-compatível, golang-jwt + bcrypt, `golang.org/x/time/rate`, `github.com/coder/websocket` (filosofia mínimo-deps) |

### MCP — Model Context Protocol (4)

| Stack | Status | SDK / Runtime | Transports |
|---|---|---|---|
| `mcp-node-ts` | stable | `@modelcontextprotocol/sdk` (TypeScript) | stdio · sse · http (Streamable HTTP) |
| `mcp-python` | stable | `mcp[cli]` (FastMCP, Python 3.11+) | stdio · sse · http (via uvicorn) |
| `mcp-rust` | beta | `rmcp` (Rust SDK oficial) | stdio · sse · http (via axum) |
| `mcp-go` | beta | `github.com/mark3labs/mcp-go` (SDK comunitário) | stdio · sse · http |

!!! note "Transport dos MCP"
    Os três transports vêm juntos em todo gerador MCP. O transport efetivo é escolhido em runtime pela flag `--transport` ou pela env `MCP_TRANSPORT`; o gerador pré-seleciona o default do usuário (`opts.mcp.transport`) para que `start` "simplesmente funcione".

!!! tip "Ordenação do registry"
    `list()` ordena por categoria (`backend` antes de `mcp`) e depois por id, de forma determinística. `resolve(id)` faz o import lazy e memoiza; um id inválido gera `UnknownStackError` com a lista de ids disponíveis.

---

## O DNA DARE — 7 artefatos invariantes

Todo `StackScaffold` chama `emitDefaults()` cedo no `generate()` para satisfazer o contrato de DNA e depois **sobrescreve** cada artefato com a versão específica da stack. O tipo `DareDnaArtifact` e a constante `DARE_DNA` (em `stacks/types.ts`) listam os 7; o teste `dna.spec.ts` falha se algum faltar.

| # | Artefato (`DareDnaArtifact`) | O que é | Como é garantido |
|---|---|---|---|
| 1 | **Layered Design** | Separação em camadas (handlers/controllers → services → repositories → models) | Estrutura emitida por cada gerador (comum às 11 stacks). |
| 2 | **`llms.txt`** | Manifesto para agentes de IA (setup, comandos, endpoints) | `emit('llms-txt')` → `llms.txt`. |
| 3 | **OpenAPI** | Contrato HTTP (`openapi.json` / `/openapi.json` em runtime) | `emit('openapi')` → `openapi.json` (skeleton 3.1.0; gerador sobrescreve). |
| 4 | **`--json`** | Flag de saída JSON na CLI gerada | **Declarativo**: o gerador declara via `dnaEmitted`; validado por grep estrutural no fonte gerado. |
| 5 | **Rate limit** | Middleware de limite por minuto, dirigido por env (`RATE_LIMIT_PER_MIN`) | **Declarativo**: idem `--json`; validado por grep. |
| 6 | **`.env.example` sem segredos** | Exemplo de ambiente sem credenciais reais | `emit('env-example')` valida cada valor contra `SECRET_PATTERNS` (base64 ≥40, hex ≥32, PEM, `sk-…`, `AKIA…`) e lança `EnvSecretError` se casar. |
| 7 | **`.dare/skills.yml`** | Registro do skill da stack para a IDE | `emit('skills-yml')` mapeia stack → skill (ex.: `skill-nestjs-api`, `skill-fastapi-api`; todos os MCP → `skill-mcp-server`). |
| — | **`.github/workflows/dare-ci.yml`** | CI (audit + lint + test) | `emit('github-ci')` → workflow com jobs audit/lint/test (placeholders por ecossistema). |

!!! info "Declarativo vs. emitido"
    Cinco artefatos são **emitidos** em disco (`llms-txt`, `openapi`, `env-example`, `skills-yml`, `github-ci`). Dois — `cli-json-flag` (a flag `--json`) e `rate-limit` — são **declarativos**: o gerador retorna que os satisfez em `dnaEmitted`, e `dna.spec.ts` confirma via grep no código gerado. O `emitDefaults()` retorna o conjunto completo `DARE_DNA` (os 7).

### Proteção de segredos no `.env.example`

`validateEnvExample()` percorre o arquivo linha a linha, ignora comentários/linhas vazias e rejeita qualquer **valor** que case com um padrão de segredo:

```ts
export const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /[A-Za-z0-9+/]{40,}={0,2}/,            // base64 ≥40 chars (provável chave)
  /[a-f0-9]{32,}/,                       // hex ≥32 chars (hash / chave)
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----/, // bloco PEM
  /sk-[A-Za-z0-9]{40,}/,                 // chave estilo OpenAI
  /AKIA[0-9A-Z]{16}/,                    // AWS access key
];
```

Valores-placeholder (`replace-me-in-prod`, `postgresql://user:pass@localhost...`) passam; segredos reais fazem o build falhar com `EnvSecretError` apontando a linha.

---

## Toolchain (`auto` / `native` / `docker`)

Todo gerador recebe um `ScaffoldOpts.toolchain` do tipo `ToolchainMode`:

| Modo | Comportamento |
|---|---|
| `native` | Usa as ferramentas instaladas localmente (Node, Python, Rust, Go, etc.). |
| `docker` | Empacota a toolchain em contêiner — sem depender do que está na máquina. |
| `auto` | Decide entre `native` e `docker` conforme o ambiente. |

Cada `generate()` recebe ainda: `dir` (diretório alvo já criado e vazio), `projectName` (slug kebab-case), `features` (subconjunto do `DARE_DNA`, default = os 7), `llm` opcional (providers), `realtime` opcional (`ws`/`sse`), `mcp` (transport — obrigatório para categoria `mcp`) e `isMonorepo`. Retorna `ScaffoldResult`: `filesWritten`, `postInstallSteps` (comandos a rodar a seguir), `warnings` e `dnaEmitted` (os artefatos DNA satisfeitos — checados por `dna.spec.ts`).

```mermaid
flowchart TD
    G[generate&#40;opts&#41;] --> E[emitDefaults&#40;&#41;<br/>7 artefatos DNA]
    E --> O[overlay específico da stack<br/>OpenAPI real, llms.txt, etc.]
    O --> R[ScaffoldResult<br/>filesWritten · postInstallSteps · dnaEmitted]
    R --> V[dna.spec.ts valida os 7]
```
