# TASKS — Local Semantic Search (GraphRAG híbrido)

> Resumo legível de [dare-dag-semantic-search.yaml](dare-dag-semantic-search.yaml). DAG completo no YAML;
> specs em [`EXECUTION/`](EXECUTION/). Derivado de [BLUEPRINT-Feature-semantic-search.md](BLUEPRINT-Feature-semantic-search.md). License: MIT.

**Branch:** `feat/semantic-search` · **Target:** v3.10.0 · **10 tasks · bloco de IDs 8xx**

---

## Visão Geral

- Total de tasks: **10**
- Rank 0 (paralelo): **3** (`task-801` vetor · `task-803` embedder lazy · `task-808` config).
- Regra de ouro: retrieval **híbrido determinístico**; embeddings ≠ LLM gerativo; runtime via `optionalDependency` lazy (D-002).

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexidade |
|---|---|---|---|
| 1 — Núcleo vetorial + embedder + config | T-801, T-803, T-808 | **sim** (rank 0) | LOW–MED |
| 1/2 — Fusão RRF + gate de arquitetura | T-802, T-804, T-805 | parcial (rank 1) | LOW–MED |
| 3 — Integração híbrida | T-806 | depende de 802/803/805 | HIGH |
| 3 — Indexação incremental | T-807 | depende de 806 | MED |
| N-1 — Auditoria + docs | T-809, T-810 | não | HIGH, LOW |

**Caminho crítico:** `T-801 → T-805 → T-806 → T-807 → T-809 → T-810`

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-801 | graphrag/vector-search.ts — cosine + topK | ⏳ PENDING | — | LOW |
| task-803 | graphrag/embeddings.ts — loadEmbedder lazy | ⏳ PENDING | — | MED |
| task-808 | config — bloco graphrag.semantic (zod) | ⏳ PENDING | — | LOW |
| task-802 | graphrag/hybrid.ts — Reciprocal Rank Fusion | ⏳ PENDING | 801 | MED |
| task-804 | no-heavy-dep-in-core.test.ts (gate arquitetura) | ⏳ PENDING | 803 | LOW |
| task-805 | GraphNode.vector? — persistência do vetor | ⏳ PENDING | 801 | MED |
| task-806 | searchNodes/locate híbrido + fallback + MCP | ⏳ PENDING | 802, 803, 805 | HIGH |
| task-807 | indexação incremental por hash | ⏳ PENDING | 806 | MED |
| task-809 | auditoria N-1 — semantic-regression.test.ts | ⏳ PENDING | 804, 806, 807, 808 | HIGH |
| task-810 | CHANGELOG + docs (semantic) | ⏳ PENDING | 809 | LOW |

---

## Tarefas por Fase

### Fase 1 — Núcleo (rank 0)
- **T-801** `vector-search.ts`: `cosine` + `cosineTopK` (determinístico, sem dep nativa).
- **T-803** `embeddings.ts`: `loadEmbedder` lazy (único `import()` do runtime); `EmbeddingModelMissingError`; runtime em `optionalDependencies`.
- **T-808** config `graphrag.semantic` (zod): `enabled/model/modelHash/rrfK`; default `enabled:false`.

### Fase 1/2 — Fusão + gate
- **T-802** `hybrid.ts`: RRF (keyword + vetor + grafo); fallback keyword se `embedder===null`.
- **T-804** `no-heavy-dep-in-core.test.ts`: falha se runtime de embeddings importado fora de `embeddings.ts`.
- **T-805** `GraphNode.vector?`: persistência aditiva do vetor (BLOB) + `loadVectors`.

### Fase 3 — Integração
- **T-806** `searchNodes`/`locate` ganham branch híbrido sob flag + fallback; `graph_locate` (MCP) idem; keyword inalterado quando desabilitado.
- **T-807** re-embedding incremental por `contentHash` (evita custo).

### Fase N-1 — Auditoria + docs
- **T-809** `semantic-regression.test.ts`: híbrido ≥ keyword (fixture rotulada); fallback sem modelo; no-heavy-dep verde; grafo legado ok; embeddings determinísticos.
- **T-810** CHANGELOG `[3.10.0]` + docs (`graphrag.semantic` + `graph query --semantic`).

---

## Próximas Etapas

1. Revisar este breakdown e o `dare-dag-semantic-search.yaml`.
2. Executar via `/dare-dag-run` (ou `/dare-dag-run-parallel`, dado o rank-0 paralelo) na branch `feat/semantic-search`.
