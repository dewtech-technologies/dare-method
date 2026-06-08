# Stacks & DNA DARE

DARE genera proyectos **greenfield** a partir de un catálogo de **11 stacks** — 7 backend y 4 de servidores MCP. Cada generador (`StackScaffold`) se registra de forma **lazy** en el registry (`packages/cli/src/stacks/registry.ts`): el módulo solo se carga cuando eliges ese stack, manteniendo `dare --help` frío y rápido.

Independientemente del stack, todo generador entrega el mismo conjunto invariante de 7 artefactos — el **DNA DARE** — validado en un test (`dna.spec.ts`).

## Los 11 stacks

### Backend (7)

| Stack | Status | Framework | Libs principales |
|---|---|---|---|
| `ruby-rails-8` | stable | Rails 8 | rswag (OpenAPI), Action Cable (WS), RFC 7807 Problem Details, ActiveRecord, `rake dare:metrics` |
| `node-nestjs` | stable | NestJS 10 | Prisma + Postgres, JWT auth, Swagger en `/openapi.json`, Throttler (rate limit), class-validator + class-transformer, Pino |
| `python-fastapi` | stable | FastAPI | Pydantic v2, SQLAlchemy 2.0 + Alembic, slowapi (rate limit), uvicorn[standard] |
| `php-laravel` | stable | Laravel 11 | Sanctum + FormRequest, Eloquent, Reverb (WS) + Pail, ThrottleRequests, l5-swagger, LlmProvider (Dummy + OpenAI), Pest |
| `rust-axum` | stable | Axum 0.7 | Tokio, tower-http (CORS/trace) + tower-governor (rate limit), utoipa (OpenAPI), sqlx + Postgres, `axum::extract::ws` |
| `go-gin` | stable | Gin | sqlc + pgx, golang-jwt + bcrypt, gorilla/websocket, `golang.org/x/time/rate`, swag (OpenAPI) |
| `go-stdlib` | stable | net/http 1.22 ServeMux | pgx + schema compatible con sqlc, golang-jwt + bcrypt, `golang.org/x/time/rate`, `github.com/coder/websocket` (filosofía mínimo-deps) |

### MCP — Model Context Protocol (4)

| Stack | Status | SDK / Runtime | Transports |
|---|---|---|---|
| `mcp-node-ts` | stable | `@modelcontextprotocol/sdk` (TypeScript) | stdio · sse · http (Streamable HTTP) |
| `mcp-python` | stable | `mcp[cli]` (FastMCP, Python 3.11+) | stdio · sse · http (vía uvicorn) |
| `mcp-rust` | beta | `rmcp` (SDK oficial de Rust) | stdio · sse · http (vía axum) |
| `mcp-go` | beta | `github.com/mark3labs/mcp-go` (SDK comunitario) | stdio · sse · http |

!!! note "Transport de los MCP"
    Los tres transports vienen juntos en todo generador MCP. El transport efectivo se elige en runtime por la flag `--transport` o por la env `MCP_TRANSPORT`; el generador preselecciona el default del usuario (`opts.mcp.transport`) para que `start` "simplemente funcione".

!!! tip "Ordenación del registry"
    `list()` ordena por categoría (`backend` antes de `mcp`) y luego por id, de forma determinista. `resolve(id)` hace el import lazy y lo memoiza; un id inválido genera `UnknownStackError` con la lista de ids disponibles.

---

## El DNA DARE — 7 artefactos invariantes

Todo `StackScaffold` llama a `emitDefaults()` temprano en `generate()` para satisfacer el contrato de DNA y luego **sobrescribe** cada artefacto con la versión específica del stack. El tipo `DareDnaArtifact` y la constante `DARE_DNA` (en `stacks/types.ts`) listan los 7; el test `dna.spec.ts` falla si alguno falta.

| # | Artefacto (`DareDnaArtifact`) | Qué es | Cómo se garantiza |
|---|---|---|---|
| 1 | **Layered Design** | Separación en capas (handlers/controllers → services → repositories → models) | Estructura emitida por cada generador (común a los 11 stacks). |
| 2 | **`llms.txt`** | Manifiesto para agentes de IA (setup, comandos, endpoints) | `emit('llms-txt')` → `llms.txt`. |
| 3 | **OpenAPI** | Contrato HTTP (`openapi.json` / `/openapi.json` en runtime) | `emit('openapi')` → `openapi.json` (skeleton 3.1.0; el generador sobrescribe). |
| 4 | **`--json`** | Flag de salida JSON en la CLI generada | **Declarativo**: el generador lo declara vía `dnaEmitted`; validado por grep estructural sobre el fuente generado. |
| 5 | **Rate limit** | Middleware de límite por minuto, dirigido por env (`RATE_LIMIT_PER_MIN`) | **Declarativo**: ídem `--json`; validado por grep. |
| 6 | **`.env.example` sin secretos** | Ejemplo de entorno sin credenciales reales | `emit('env-example')` valida cada valor contra `SECRET_PATTERNS` (base64 ≥40, hex ≥32, PEM, `sk-…`, `AKIA…`) y lanza `EnvSecretError` si casa. |
| 7 | **`.dare/skills.yml`** | Registro del skill del stack para el IDE | `emit('skills-yml')` mapea stack → skill (p. ej.: `skill-nestjs-api`, `skill-fastapi-api`; todos los MCP → `skill-mcp-server`). |
| — | **`.github/workflows/dare-ci.yml`** | CI (audit + lint + test) | `emit('github-ci')` → workflow con jobs audit/lint/test (placeholders por ecosistema). |

!!! info "Declarativo vs. emitido"
    Cinco artefactos son **emitidos** en disco (`llms-txt`, `openapi`, `env-example`, `skills-yml`, `github-ci`). Dos — `cli-json-flag` (la flag `--json`) y `rate-limit` — son **declarativos**: el generador retorna que los satisfizo en `dnaEmitted`, y `dna.spec.ts` lo confirma vía grep sobre el código generado. `emitDefaults()` retorna el conjunto completo `DARE_DNA` (los 7).

### Protección de secretos en `.env.example`

`validateEnvExample()` recorre el archivo línea a línea, ignora comentarios/líneas vacías y rechaza cualquier **valor** que case con un patrón de secreto:

```ts
export const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /[A-Za-z0-9+/]{40,}={0,2}/,            // base64 ≥40 chars (provável chave)
  /[a-f0-9]{32,}/,                       // hex ≥32 chars (hash / chave)
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----/, // bloco PEM
  /sk-[A-Za-z0-9]{40,}/,                 // chave estilo OpenAI
  /AKIA[0-9A-Z]{16}/,                    // AWS access key
];
```

Los valores-placeholder (`replace-me-in-prod`, `postgresql://user:pass@localhost...`) pasan; los secretos reales hacen fallar el build con `EnvSecretError` apuntando a la línea.

---

## Toolchain (`auto` / `native` / `docker`)

Todo generador recibe un `ScaffoldOpts.toolchain` del tipo `ToolchainMode`:

| Modo | Comportamiento |
|---|---|
| `native` | Usa las herramientas instaladas localmente (Node, Python, Rust, Go, etc.). |
| `docker` | Empaqueta la toolchain en contenedor — sin depender de lo que hay en la máquina. |
| `auto` | Decide entre `native` y `docker` según el entorno. |

Cada `generate()` recibe además: `dir` (directorio destino ya creado y vacío), `projectName` (slug kebab-case), `features` (subconjunto del `DARE_DNA`, default = los 7), `llm` opcional (providers), `realtime` opcional (`ws`/`sse`), `mcp` (transport — obligatorio para la categoría `mcp`) e `isMonorepo`. Retorna `ScaffoldResult`: `filesWritten`, `postInstallSteps` (comandos a ejecutar a continuación), `warnings` y `dnaEmitted` (los artefactos DNA satisfechos — comprobados por `dna.spec.ts`).

```mermaid
flowchart TD
    G[generate&#40;opts&#41;] --> E[emitDefaults&#40;&#41;<br/>7 artefactos DNA]
    E --> O[overlay específico del stack<br/>OpenAPI real, llms.txt, etc.]
    O --> R[ScaffoldResult<br/>filesWritten · postInstallSteps · dnaEmitted]
    R --> V[dna.spec.ts valida los 7]
```
