# Feature Design: Local Semantic Search (GraphRAG híbrido)

> Gerado seguindo o próprio Método DARE (Fase D — Design). Artefato para **revisão humana**
> antes de avançar ao `/dare-blueprint`. License: MIT.
>
> **Base de evidências:** fecha o gap declarado do GraphRAG ("keyword-only; embeddings só no DARE Cloud").
> Sem pesquisa nova — técnica conhecida (embeddings + retrieval híbrido). Aplica a regra **D-002**
> (mono-pacote; runtime de embeddings como `optionalDependency` + lazy `import()`).
> Ancoragem verificada em `graphrag/graph-rag.ts:120` (`searchNodes` é **LIKE-based**, não FTS5) e
> `:200` (`locate` por travessia). **Target: v3.12.0** (repo em v3.8.2).

## Contexto no Projeto Existente

O GraphRAG hoje recupera por **keyword puro**: `searchNodes` usa busca `LIKE` (`graph-rag.ts:120`,
comentário "sql.js doesn't support FTS5") e `locate` (`graph-rag.ts:200`) navega o grafo por travessia.
Não há retrieval **semântico** — consultas em linguagem natural que não casam termos literais falham, e o
`graph_locate` (usado pelos agentes via MCP) perde alvos que um humano acharia óbvios.

O roadmap empurra embeddings para o "DARE Cloud", mas dá para ter **busca semântica local** sem cloud e
sem furar a filosofia LLM-free do core: embeddings são um modelo **determinístico** (mesma entrada →
mesmo vetor), não um LLM gerativo. Esta feature adiciona **retrieval híbrido** (keyword + vetor + grafo),
mantendo keyword como default e o modelo de embeddings como dependência **opcional e lazy** (D-002).

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | Recuperação semântica local | Consulta NL sem match literal recupera o nó certo | recall@10 melhora vs. baseline LIKE em fixture |
| O-02 | Híbrido supera keyword sozinho | MRR do híbrido vs. `searchNodes` atual em fixture rotulada | híbrido ≥ keyword em todas as queries de teste |
| O-03 | Core permanece sem dep pesada | Runtime de embeddings nas `dependencies` do core | **0** — só `optionalDependencies` lazy (D-002) |
| O-04 | Degradação graciosa | Sem o modelo instalado, busca continua funcionando | cai para keyword automaticamente, sem erro |
| O-05 | Determinismo | Mesmo texto → mesmo vetor; nenhum LLM gerativo | embeddings determinísticos; core LLM-free preservado |

## Stakeholders

| Papel | Pessoa/Time | Interesse principal |
|---|---|---|
| Autor do método | Wanderson / Dewtech | Fortalece o tripé GraphRAG↔DAG↔gate; melhor `graph_locate` |
| Usuário (dev) | Adotantes do DARE | Busca que entende intenção, não só termo literal |
| Integração IDE | Claude/Cursor/Antigravity | `graph_locate` via MCP recupera melhor → menos contexto desperdiçado |
| Mantenedores CLI | Dewtech | Mono-pacote preservado; opt-in sem inchar instalação |

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | **Geração de embeddings local** — `embed(text): Float32Array` via modelo pequeno (ex.: all-MiniLM ONNX) | MUST | Determinístico; modelo carregado lazy; mesmo texto → mesmo vetor |
| RF-02 | **Persistência de vetores** — embedding por nó armazenado no store do grafo (BLOB) | MUST | `addNode` opcionalmente grava vetor; migração não quebra grafos existentes |
| RF-03 | **Busca vetorial** — cosseno top-k sobre os vetores persistidos | MUST | Sem dep nativa: cosseno em JS sobre vetores carregados (sqlite-vec fica como otimização futura) |
| RF-04 | **Retrieval híbrido** — fundir keyword (LIKE) + vetor + proximidade no grafo | MUST | Reciprocal Rank Fusion; `searchNodes`/`locate` ganham caminho híbrido sob flag |
| RF-05 | **Opt-in + fallback** — semântico só se `graphrag.semantic.enabled` **e** modelo presente | MUST | Sem modelo → log informativo + fallback keyword (O-04); default keyword |
| RF-06 | **Indexação incremental** — embeddar nós novos/alterados em `dare execute --complete`/`graph ingest` | SHOULD | Só re-embedda nó com hash de conteúdo mudado (evita custo) |
| RF-07 | **`dare graph query --semantic`** — flag para forçar caminho híbrido | SHOULD | Resultados rankeados por score fundido; `--format json` expõe scores |
| RF-08 | **`graph_locate` (MCP) usa híbrido** quando habilitado | SHOULD | Agente recupera alvos semânticos; sem regressão quando desabilitado |

## Requisitos Não-Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Mono-pacote (D-002)** | Runtime/modelo de embeddings em `optionalDependencies` + lazy `import()`; core não importa |
| RNF-02 | **LLM-free** | Embeddings ≠ LLM gerativo; motor determinístico (O-05) |
| RNF-03 | **Compat retroativa** | Grafos sem vetores funcionam (busca keyword); schema aditivo |
| RNF-04 | **Performance** | Cosseno em JS aceitável para grafos típicos (≤ ~10⁴ nós); documentar limite e o upgrade sqlite-vec |
| RNF-05 | **Portabilidade** | Modelo ONNX roda em Windows/POSIX; offline após primeiro download |

## Requisitos de Segurança

| ID | Requisito | Mapeamento |
|---|---|---|
| RS-01 | Modelo baixado de fonte verificada (hash pinado) | **A08** integridade de artefato |
| RS-02 | Sem execução de conteúdo indexado | **A03** |
| RS-03 | Vetores/índice confinados ao store do projeto | **A01**; reusa path-safety |

## Stack Técnica

| Camada | Tecnologia | Nota |
|---|---|---|
| Embeddings | modelo pequeno ONNX (ex.: all-MiniLM-L6-v2) via runtime ONNX/transformers.js | **`optionalDependency`** + lazy (D-002) |
| Vetores | BLOB no store atual (sql.js / JSON) + cosseno em JS | sem dep nativa na v1 |
| Fusão | Reciprocal Rank Fusion (keyword + vetor + grafo) | determinístico |
| Busca atual | `graph-rag.ts` `searchNodes` (LIKE) / `locate` (travessia) | estendidos, não substituídos |

## Integrações Externas

| Sistema | Tipo | Direção | Dados | Responsável |
|---|---|---|---|---|
| Registry do modelo ONNX | download | entrada | pesos do modelo (hash pinado) | setup lazy (1ª vez) |
| GraphRAG local | store | bi | vetores por nó | engine |

## Restrições

- **D-002 (mono-pacote):** nada de pacote separado; o runtime de embeddings é `optionalDependency`
  com `import()` lazy, igual ao driver de LLM do executor. Quem não usa semântica não baixa o modelo.
- **LLM-free preservado:** embeddings são determinísticos; o motor de decisão não muda.
- **Sem dep nativa na v1:** cosseno em JS; `sqlite-vec` (extensão nativa) fica documentado como
  otimização futura para grafos grandes, não na v1.
- **Aditivo:** schema do grafo ganha vetor opcional; grafos antigos seguem funcionando (keyword).

## Fora do Escopo (v1)

- **DARE Cloud / índice remoto compartilhado** — continua no roadmap; esta feature é local-first.
- **sqlite-vec / índice ANN nativo** — otimização posterior; v1 usa cosseno em JS.
- **Re-ranqueamento por LLM** — fora; quebraria o LLM-free do core.
- **Embeddings multilíngues grandes** — v1 fixa um modelo pequeno; troca de modelo é config futura.

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Modelo de embeddings infla a instalação | Alta | Médio | `optionalDependency` + lazy; default keyword (D-002/O-03) |
| Cosseno em JS lento em grafos grandes | Média | Médio | Documentar limite (RNF-04); upgrade sqlite-vec como item futuro |
| Download do modelo falha/offline | Média | Médio | Hash pinado + fallback keyword (O-04); cache local após 1ª vez |
| Vetores desatualizados após mudança de código | Média | Médio | Re-embedding incremental por hash (RF-06) |
| Falsa percepção de "IA no core" | Baixa | Médio | Documentar: embeddings são determinísticos, não LLM (O-05) |

## Checklist de Aprovação

- [ ] Retrieval híbrido (keyword + vetor + grafo via RRF) é o recorte certo para v1
- [ ] Cosseno em JS na v1 (sqlite-vec depois) é aceitável dado o tamanho típico de grafo
- [ ] Modelo de embeddings como `optionalDependency` lazy (D-002) é a fronteira aprovada
- [ ] Default keyword + opt-in semântico (com fallback) é a política desejada
- [ ] Escolha do modelo (all-MiniLM ou similar) fica para o blueprint
- [ ] "Fora do escopo" (Cloud, sqlite-vec, re-rank por LLM) é aceitável

---

> **Próximo passo:** após aprovação, rodar `/dare-blueprint` (Fase Architect) — contratos de `embed()`,
> persistência do vetor no store, função de fusão RRF, pontos de extensão em `searchNodes`/`locate`, e o
> carregamento lazy do modelo (espelhando o `AgentDriver`). Target: **v3.12.0**.
