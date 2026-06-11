# Feature Blueprint: Local Telemetry Dashboard (`dare dashboard`)

> Derivado de [DESIGN-Feature-telemetry-dashboard.md](DESIGN-Feature-telemetry-dashboard.md).
> Único entregável desta etapa: este BLUEPRINT. Tasks/DAG/specs virão em `/dare-tasks`.
> Branch proposta: `feat/telemetry-dashboard` · Target: **v3.11.0** · License: MIT.
>
> **Base de evidências:** reusa o Express + hardening loopback/token do MCP server (v3.4) e as leituras
> do `KnowledgeGraph`. Ancoragem: `mcp-server/server.ts`, `mcp-server/middleware/{auth,cors,error-handler}.ts`,
> `graphrag/knowledge-graph.ts` (`getStatistics`/`queryNodes`/`getEdges`).

---

## 1. Visão Geral da Arquitetura

### 1.1 Princípio reitor

Dashboard **local-first, read-only, LLM-free**: serve uma página estática (vanilla) + uma API JSON que
**agrega** o GraphRAG existente. Reusa o middleware de segurança do MCP (bind `127.0.0.1` + token). Sem
bundler/framework como dep do core (D-002).

### 1.2 Diagrama

```mermaid
flowchart LR
  cli["dare dashboard --port"]
  app["Express app compartilhado\n(loopback + token, reuso MCP)"]
  api["/api/telemetry (read-only)"]
  agg["telemetry-aggregator"]
  graph[(GraphRAG\nSQLite/JSON)]
  front["templates/dashboard/ (HTML/CSS/JS vanilla)"]
  cli --> app --> api --> agg --> graph
  app --> front
```

### 1.3 Decisões Arquiteturais

| # | Decisão | Alternativas | Justificativa |
|---|---|---|---|
| A-1 | **Extrair app Express compartilhado** (`http/app.ts`) usado por MCP **e** dashboard | duplicar server | DRY; reusa auth/cors/error-handler/bind |
| A-2 | **Reusar middleware do MCP** (auth/bind/helmet) | novo auth | RS-01; hardening v3.4 já testado |
| A-3 | **Front estático em `templates/dashboard/`** (vanilla) | SPA React/Vue | D-002 (sem bundler/framework no core) |
| A-4 | **API read-only `/api/telemetry`** | server-side render | Front desacoplado; testável via JSON |
| A-5 | **Aggregator puro** (`telemetry/aggregator.ts`) | lógica no handler | Testável sem HTTP |
| A-6 | **Estados vazios tratados** | erro | Grafo vazio → aviso "rode dare execute" |

---

## 2. Stack Técnica

| Camada | Tecnologia | Nota |
|---|---|---|
| HTTP | Express (compartilhado MCP/dashboard) | reuso |
| Segurança | `mcp-server/middleware/*` | bind `127.0.0.1` + token (v3.4) |
| Leitura | `KnowledgeGraph` | `getStatistics`/`queryNodes`/`getEdges` |
| Front | HTML/CSS/JS vanilla; SVG p/ gráficos | `templates/dashboard/`; sem dep de build |

---

## 3. Contratos TypeScript

### 3.1 `src/telemetry/aggregator.ts` (NEW)

```ts
import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';

export interface TelemetrySnapshot {
  readonly dag: { total: number; byStatus: Record<string, number>; ranks: number };
  readonly gates: { verified: number; proven: number; mutationAvg?: number };
  readonly cost: { totalUsd: number; totalTokens: number; byTask: Array<{ id: string; usd: number; tokens: number }> };
  readonly bestOfN?: { tasks: number; avgCandidates: number };
  readonly guard?: { pass: number; warn: number; fail: number };
  readonly drift?: { orphanReqs: number; orphanCode: number; stale: number };
  readonly emptyHints: ReadonlyArray<string>;   // ex.: "no tasks — run dare execute"
}

/** Read-only: agrega o grafo num snapshot. Nunca muta. */
export function aggregateTelemetry(graph: KnowledgeGraph): TelemetrySnapshot;
```

- `dag`: lê `state.json` + nós `task`.
- `cost`: soma metadados de custo dos nós `task` (telemetria v3.9.0).
- `gates`: conta arestas `verified_by`/`proven_by`.
- `guard`/`drift`: presentes só se houver dados (opt-in features).

### 3.2 App Express compartilhado — `src/http/app.ts` (NEW; refatora do MCP)

```ts
export interface AppOptions { readonly token: string; readonly projectRoot: string; }
/** Cria o Express com a cadeia de middleware (auth/cors/helmet/error-handler). */
export function createApp(opts: AppOptions): express.Express;
```
> O `mcp-server/server.ts` passa a **montar suas rotas neste app** (refactor sem mudança de contrato MCP).

### 3.3 Rotas do dashboard — `src/dashboard/routes.ts` (NEW)

| Método | Rota | Auth | Resposta |
|---|---|---|---|
| GET | `/dashboard` | loopback/token | HTML estático (`templates/dashboard/index.html`) |
| GET | `/api/telemetry` | loopback/token | `TelemetrySnapshot` (JSON) |
| GET | `/dashboard/assets/*` | loopback/token | estáticos (css/js) confinados a `templates/dashboard/` (path-safety) |

### 3.4 Comando — `src/commands/dashboard.ts` (NEW)

```bash
dare dashboard [--port <n>] [--no-open]
```
- Sobe `createApp` em `127.0.0.1:<port>` (default ex. `4100`); imprime URL + token; abre o navegador (a menos de `--no-open`).
- Registrar no CLI (`bin/dare.ts`) + skill `/dare-dashboard` nas 3 IDEs (paridade — `CLI_COMMANDS`).

### 3.5 Front estático — `templates/dashboard/` (NEW)

- `index.html` + `app.js` + `style.css` vanilla; faz `fetch('/api/telemetry')` e renderiza painéis
  (progresso, gates, custo, best-of-N, guard/drift). Gráficos via SVG inline (sem lib pesada).

---

## 4. Estrutura de Diretórios (mudanças)

```
packages/cli/src/
├── http/app.ts                    # NEW — Express compartilhado (refactor do MCP)
├── telemetry/aggregator.ts        # NEW — aggregateTelemetry (read-only)
├── dashboard/routes.ts            # NEW
├── commands/dashboard.ts          # NEW — dare dashboard
├── bin/dare.ts                    # MODIFY — addCommand(dashboard)
├── mcp-server/server.ts           # MODIFY — usar createApp (sem mudar contrato)
├── __tests__/{aggregator,dashboard-routes}.test.ts  # NEW
packages/cli/templates/dashboard/  # NEW — index.html, app.js, style.css
implementations/{claude,cursor,antigravity}/.../dare-dashboard  # NEW — skill (paridade)
```

---

## 5. Requisitos de Segurança — Rastreabilidade

| RS | Implementação | Teste |
|---|---|---|
| RS-01 | reuso auth/bind do MCP | `dashboard-routes.test.ts` (401 sem token) |
| RS-02 | read-only (nenhuma rota muta) | revisão + teste (sem POST/PUT) |
| RS-03 | sem segredo no payload | `aggregator.test.ts` |
| RS-04 | assets confinados a templates/dashboard (path-safety) | `dashboard-routes.test.ts` |

---

## 6. Plano de Execução (Fases)

### Fase 1 — Aggregator
**DONE:** `aggregateTelemetry` retorna snapshot correto sobre fixtures de grafo (incl. estados vazios).

### Fase 2 — App compartilhado + rotas
**DONE:** `createApp` extraído; MCP montado nele sem mudança de contrato; `/api/telemetry` + `/dashboard` servidos com auth.

### Fase 3 — Comando + front + skill
**DONE:** `dare dashboard` sobe loopback+token, abre browser; front vanilla renderiza painéis; skill `/dare-dashboard` nas 3 IDEs (parity verde).

### Fase N-1 — Auditoria
**DONE:** `dashboard-regression.test.ts`: 401 sem token; read-only; assets confinados; grafo vazio tratado; `parity` + `verify-docs-coverage` verdes.

---

## 7. Validation Gates (Node/TS)

```powershell
cd packages/cli
pnpm exec tsc --noEmit
pnpm exec vitest run aggregator dashboard-routes ide-command-parity
pnpm exec eslint src/http src/dashboard src/telemetry
```

## 8. PADRÕES PROIBIDOS (ANTI-STUB)

- Framework/bundler (React/Vue/webpack) como dep do core (quebra D-002).
- Rota do dashboard que **escreve** no grafo/estado (deve ser read-only).
- Bind em `0.0.0.0` sem opt-in (reusar política do MCP).
- Servir assets fora de `templates/dashboard/` (path traversal).
- Adicionar comando sem criar a skill nas 3 IDEs (quebra parity).

## 9. Definition of Done (feature)

- [ ] RF-01..RF-04, RF-07, RF-08 MUST com testes; RF-05/06 SHOULD.
- [ ] Loopback+token reusados; read-only garantido.
- [ ] `/dare-dashboard` nas 3 IDEs (parity verde).
- [ ] CHANGELOG `[3.11.0]` + docs-site (comando) — gate de cobertura de docs verde.
- [ ] `dare review` sem achados HIGH.

---

## Próximas Etapas

1. Revisar/aprovar. 2. `/dare-tasks` → bloco **10xx**. 3. Branch `feat/telemetry-dashboard`.
