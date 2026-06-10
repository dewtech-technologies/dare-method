# Feature Blueprint: Drift Gate (spec ↔ código)

> Derivado de [DESIGN-Feature-drift-gate.md](DESIGN-Feature-drift-gate.md).
> Único entregável desta etapa: este BLUEPRINT. Tasks/DAG/specs virão em `/dare-tasks`.
> Branch proposta: `feat/drift-gate` · Target: **v3.11.0** · License: MIT.
>
> **Base de evidências:** reusa o grafo dual (v3.5) e o padrão de gate. Ancoragem verificada em
> `graphrag/types.ts` (NodeType `requirement`/`code_symbol`; EdgeType `implements`/`affects`/`derives_from`),
> `graphrag/knowledge-graph.ts` (`getEdges`/`traverse`/`queryNodes`), comando `dare graph` (v3.5).

---

## 1. Visão Geral da Arquitetura

### 1.1 Princípio reitor

Gate **100% determinístico** — só travessia do grafo existente, zero LLM. A garantia: detectar os 3
tipos de drift por presença/ausência de arestas + comparação de hash. Reusa o padrão
scanner → veredito → exit code → telemetria.

### 1.2 Diagrama

```mermaid
flowchart LR
  graph[(GraphRAG\nrequirement + code_symbol)]
  det["detectDrift(graph, cfg)"]
  o1["orphan-requirement\n(sem implements/affects in)"]
  o2["orphan-code\n(sem implements out)"]
  o3["stale\n(hash req mudou pós-código)"]
  rep["DriftReport"]
  cmd["dare graph drift"]
  graph --> det --> o1 & o2 & o3 --> rep --> cmd
  cmd -->|drift > limiar & --strict| ex7["exit 7"]
  cmd -->|telemetria| graph
```

### 1.3 Decisões Arquiteturais

| # | Decisão | Alternativas | Justificativa |
|---|---|---|---|
| A-1 | **`detectDrift` puro** (`graphrag/drift.ts`), sem efeitos | lógica dentro do comando | Testável isolado; reusável por CI e MCP |
| A-2 | **Subcomando `dare graph drift`** | comando top-level `dare drift` | Coerência com `graph owners/impact/trace` (v3.5) |
| A-3 | **Orphan via `getEdges(id, 'in'/'out')`** | query SQL custom | Reusa o contrato `KnowledgeGraph`; agnóstico de backend |
| A-4 | **Stale por hash do `requirement` em metadado** | diff de texto on-the-fly | Determinístico e barato; popular hash no ingest |
| A-5 | **Allowlist `drift.ignore[]`** para órfãos legítimos | sem allowlist | Entrypoints/gerados não são "código órfão" real |
| A-6 | **Exit code 7 = drift-fail** (após 6 do guard) | reusar 1 | Convenção de códigos específicos do DARE |
| A-7 | **Stale degrada para WARN** sem hash | falhar duro | Grafos legados não têm hash; não quebrar |

---

## 2. Stack Técnica

| Camada | Tecnologia | Nota |
|---|---|---|
| Travessia | `KnowledgeGraph` (`getEdges`, `queryNodes`, `traverse`) | reuso v3.5 |
| Comando | `commander` — subcomando de `dare graph` | junto de owners/impact/trace |
| Config | zod (bloco `drift`) | já dep |
| Hash | `node:crypto` SHA-256 | nativo |

---

## 3. Contratos TypeScript

### 3.1 `src/graphrag/drift.ts` (NEW)

```ts
import type { KnowledgeGraph } from './knowledge-graph.js';

export type DriftKind = 'orphan-requirement' | 'orphan-code' | 'stale';

export interface DriftFinding {
  readonly kind: DriftKind;
  readonly nodeId: string;
  readonly label: string;
  readonly detail: string;            // ex.: "requirement RF-07 has no implementing code_symbol"
}

export interface DriftReport {
  readonly findings: ReadonlyArray<DriftFinding>;
  readonly counts: Record<DriftKind, number>;
  readonly staleIndeterminate: number; // sem hash → WARN (A-7)
}

export interface DriftConfig {
  readonly enabled: boolean;
  readonly maxOrphanReqs: number;
  readonly maxOrphanCode: number;
  readonly failOnStale: boolean;
  readonly ignore: ReadonlyArray<string>;  // globs de code_symbol a ignorar (A-5)
}

export function detectDrift(graph: KnowledgeGraph, cfg: DriftConfig): DriftReport;
```

**Algoritmo (determinístico):**
- **orphan-requirement:** para cada `queryNodes('requirement')`, se `getEdges(id,'in')` não tem nenhuma
  aresta `implements` nem `affects` vinda de um `code_symbol` → finding.
- **orphan-code:** para cada `queryNodes('code_symbol')` não casando `cfg.ignore`, se `getEdges(id,'out')`
  não tem `implements` para um `requirement` → finding.
- **stale:** para cada `requirement` com metadado `contentHash` **e** com código ligado, comparar o hash
  atual vs. o registrado; se o requisito mudou após o código (timestamp/hash) → finding `stale`. Sem
  `contentHash` no nó → incrementar `staleIndeterminate` (WARN, A-7).

### 3.2 `dare graph drift` — `commands/graph.ts` (MODIFY)

```bash
dare graph drift [--strict] [--format json] [--modules <list>]
```

| Aspecto | Valor |
|---|---|
| Saída default | relatório legível agrupado por `kind` + contagens |
| `--format json` | `DriftReport` |
| Veredito | `counts.orphan-requirement > maxOrphanReqs` OU `orphan-code > maxOrphanCode` OU (`failOnStale` && stale>0) → drift-fail |
| Exit | drift-fail + `--strict` → `process.exit(7)`; senão exit 0 (só reporta) |
| `--modules` | restringe a travessia (RF-08) |

### 3.3 Config `dare.config.json` — bloco `drift`

```jsonc
"drift": {
  "enabled": false,
  "maxOrphanReqs": 0,
  "maxOrphanCode": 0,
  "failOnStale": false,
  "ignore": ["**/index.ts", "**/*.generated.*", "**/bin/**"]
}
```

### 3.4 População de `contentHash` no ingest (MODIFY)

No ingest de `requirement` (`graphrag/requirement-ingest.ts`), gravar `metadata.contentHash =
sha256(requirementText)` e `metadata.ingestedAt`. Habilita o stale (A-4) sem custo de runtime no gate.

---

## 4. Estrutura de Diretórios (mudanças)

```
packages/cli/src/
├── graphrag/
│   ├── drift.ts                    # NEW — detectDrift + tipos
│   ├── requirement-ingest.ts       # MODIFY — popular contentHash/ingestedAt
│   └── __tests__/drift.test.ts     # NEW
├── commands/
│   └── graph.ts                    # MODIFY — subcomando drift
├── verification/config.ts          # MODIFY — bloco drift (zod)
dare.config.json (template)         # MODIFY
```

---

## 5. Requisitos de Segurança — Rastreabilidade

| RS | Implementação | Teste |
|---|---|---|
| RS-01 | validação de `--modules`/globs (path-safety) | `drift.test.ts` |
| RS-02 | gate só lê/traverssa (sem exec) | revisão |
| RS-03 | sem segredo em log | `drift.test.ts` |

---

## 6. Plano de Execução (Fases)

### Fase 1 — `detectDrift` + tipos
**DONE:** `drift.ts` detecta os 3 kinds em fixtures de grafo; `staleIndeterminate` quando falta hash.

### Fase 2 — Ingest de hash
**DONE:** `requirement-ingest.ts` grava `contentHash`/`ingestedAt`; grafos novos habilitam stale.

### Fase 3 — Comando + config
**DONE:** `dare graph drift` com `--strict`/`--format`/`--modules`; exit 7; bloco `drift` (zod) com default `enabled:false`.

### Fase N-1 — Auditoria
**DONE:** `drift-regression.test.ts`: 3 kinds corretos em fixture; allowlist respeitada; exit 7 só com `--strict`; determinístico (sem LLM).

---

## 7. Validation Gates (Node/TS)

```powershell
cd packages/cli
pnpm exec tsc --noEmit
pnpm exec vitest run drift
pnpm exec eslint src/graphrag/drift.ts src/commands/graph.ts
```

## 8. PADRÕES PROIBIDOS (ANTI-STUB)

- Detecção por lista hardcoded em vez de travessia real do grafo.
- Stale "sempre false" quando falta hash (deve contar `staleIndeterminate`).
- Comando que ignora `--strict`/limiar.
- Reimplementar travessia em vez de usar `getEdges`/`queryNodes`.

## 9. Definition of Done (feature)

- [ ] RF-01..RF-06 MUST com testes; RF-07/08 SHOULD/COULD implementados ou ticket.
- [ ] Exit 7 reservado e testado.
- [ ] `dare graph drift` determinístico (sem LLM).
- [ ] CHANGELOG `[3.11.0]`; subcomando documentado; paridade de skills se exposto como `/dare-*`.
- [ ] `dare review` sem achados HIGH.

---

## Próximas Etapas

1. Revisar/aprovar este Blueprint.
2. `/dare-tasks` → `TASKS-drift-gate.md` + `dare-dag-drift-gate.yaml` + `EXECUTION/`.
3. Branch `feat/drift-gate` → implementação.
