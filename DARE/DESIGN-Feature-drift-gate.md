# Feature Design: Drift Gate (spec ↔ código)

> Gerado seguindo o próprio Método DARE (Fase D — Design). Artefato para **revisão humana**
> antes de avançar ao `/dare-blueprint`. License: MIT.
>
> **Base de evidências:** reusa o **grafo dual Requisito↔Código** (v3.5) e o **padrão de gate** do DARE
> (scanner → veredito → exit code → telemetria). Sem pesquisa nova — é engenharia sobre o que já existe.
> Ancoragem verificada em `graphrag/types.ts` (NodeType `requirement`/`code_symbol`; EdgeType
> `implements`/`affects`/`derives_from`) e no comando `dare graph owners|impact|trace` (v3.5).
> **Target: v3.11.0** (repo em v3.8.2; depende do executor v3.9 / guard v3.10 apenas no tempo, não em código).

## Contexto no Projeto Existente

O grafo dual (v3.5) já liga `requirement` ↔ `code_symbol` via `implements`/`affects`, e `dare graph
owners|impact|trace` já navega essas relações. **Mas não há gate que reprove o desalinhamento.** Hoje o
DARE consegue *responder* "qual código implementa o requisito X", porém não *vigia* três formas de drift:

1. **Requisito órfão** — `requirement` sem nenhum `implements`/`affects` de entrada → spec não implementada.
2. **Código órfão** — `code_symbol` sem `implements` para qualquer `requirement` → código que não rastreia a nenhum requisito.
3. **Requisito obsoleto (stale)** — `requirement` cujo conteúdo mudou **depois** do código ligado → a implementação ficou para trás da spec (ou vice-versa).

Esta feature adiciona `dare graph drift` — um gate determinístico que detecta os três casos e pode
bloquear no CI, fechando o loop "spec é fonte de verdade" que o grafo dual só media.

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | Detectar requisitos não implementados | Requisitos sem `implements`/`affects` de entrada são reportados | **100%** dos órfãos listados |
| O-02 | Detectar código sem rastro de requisito | `code_symbol` sem `implements` para requisito reportado | **100%** dos órfãos de código listados |
| O-03 | Detectar requisito alterado pós-implementação | Mudança de hash do requisito após o código ligado → flag `stale` | **100%** dos staless detectados quando há timestamp/hash |
| O-04 | Gate plugável no CI | `dare graph drift --strict` falha o build com drift acima do limiar | exit ≠ 0 determinístico |
| O-05 | Determinismo (LLM-free) | Execução do gate chama LLM? | **0** — só travessia de grafo |

## Stakeholders

| Papel | Pessoa/Time | Interesse principal |
|---|---|---|
| Autor do método | Wanderson / Dewtech | Fechar o loop spec↔código; diferencial GraphRAG↔DAG↔gate |
| Usuário (dev) | Adotantes do DARE | Saber o que da spec não foi feito / código sem rastro |
| Mantenedores CLI | Dewtech | Gate determinístico no padrão existente; reuso do grafo dual |
| CI/Qualidade | Dewtech | Bloquear merge com drift acima do limiar |

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | **`dare graph drift`** — comando que reporta os 3 tipos de drift | MUST | Lista órfãos de requisito, órfãos de código e staless; saída legível + `--format json` |
| RF-02 | **Detecção de requisito órfão** — `requirement` sem `implements`/`affects` de entrada | MUST | Travessia reusa `getEdges(id,'in')`; lista cada requisito sem cobertura |
| RF-03 | **Detecção de código órfão** — `code_symbol` sem `implements` para requisito | MUST | Lista símbolos sem rastro; ignora allowlist configurável (ex.: entrypoints, gerados) |
| RF-04 | **Detecção de stale** — requisito alterado após o código ligado | SHOULD | Compara hash do `requirement` (metadado) vs. marca de tempo/hash do código ligado; flag `stale` |
| RF-05 | **`--strict` + exit code** — falhar quando drift > limiar | MUST | Drift acima do limiar → `process.exit(7)` (estende 0/1/3/4/5/6) |
| RF-06 | **Limiar configurável** — bloco `drift` em `dare.config.json` | MUST | `drift.enabled/maxOrphanReqs/maxOrphanCode/failOnStale/ignore[]` lidos (zod) |
| RF-07 | **Telemetria no grafo** — registrar resultado do drift | SHOULD | Nó/aresta de gate (`verified_by`) para auditoria; reusa `addNode/addEdge` |
| RF-08 | **Escopo por módulo** — `--modules <list>` para rodar parcial | COULD | Restringe a travessia a subárvore do grafo |

## Requisitos Não-Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Determinístico (LLM-free)** | Só travessia de grafo; nenhuma inferência |
| RNF-02 | **Opt-in** | `drift.enabled:false` default; sem regressão de comportamento |
| RNF-03 | **Performance** | Travessia O(V+E) sobre o grafo existente; sem recomputar o grafo |
| RNF-04 | **Compat com backends** | Funciona em SQLite/JSON (Neo4j conforme suporte de leitura) |

## Requisitos de Segurança

| ID | Requisito | Mapeamento |
|---|---|---|
| RS-01 | Validação de entrada de `--modules`/paths | **A03**; reusar path-safety existente |
| RS-02 | Sem execução de conteúdo do grafo | **A03**; gate só lê/traverssa |
| RS-03 | Segredos fora de logs do gate | **A09** |

## Stack Técnica

| Camada | Tecnologia | Nota |
|---|---|---|
| Travessia | `graphrag/*` (`KnowledgeGraph`, `getEdges`, `traverse`) | reuso v3.5 |
| Comando | `commander` — subcomando de `dare graph` | junto de `owners/impact/trace` |
| Config | zod (bloco `drift`) | já dependência |
| Hash de requisito | `node:crypto` SHA-256 (metadado no nó `requirement`) | nativo |

## Integrações Externas

| Sistema | Tipo | Direção | Dados | Responsável |
|---|---|---|---|---|
| GraphRAG local | travessia | leitura | nós requirement/code_symbol + arestas | gate |
| CI (GitHub Actions) | gate | leitura | veredito de drift | pipeline |

## Restrições

- **Reuso, não reinvenção:** usa o grafo dual existente; não re-extrai código nem requisitos.
- **Determinístico:** nenhum LLM (RNF-01).
- **Stale depende de metadado:** RF-04 só funciona se o `requirement` carregar hash/timestamp; quando
  ausente, degrada para WARN "stale indeterminável", não FAIL.
- **Exit code 7** reservado (após 6 do guard).

## Fora do Escopo (v1)

- **Auto-correção do drift** (gerar a implementação faltante) — só detecta e reporta.
- **Re-extração do grafo** — assume grafo populado por `dare execute --complete`/`dare reverse`.
- **Drift semântico** (requisito e código divergem em *significado*, não em existência) — exigiria LLM; fora.
- **UI/dashboard** — visualização é o item 5 do backlog, RFC próprio.

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Falso-positivo de código órfão (entrypoints, gerados) | Alta | Médio | `drift.ignore[]` allowlist; default cobre padrões comuns |
| Stale indetectável sem hash no requisito | Média | Médio | Degradar para WARN; popular hash no ingest do grafo dual (tarefa de blueprint) |
| Grafo desatualizado gera drift falso | Média | Médio | Documentar pré-requisito de grafo fresco; `dare graph drift` avisa se grafo vazio/velho |
| Limiar mal calibrado trava CI | Média | Baixo | Baseline inicial + introdução gradual (como o coverage gate da v3.4) |

## Checklist de Aprovação

- [ ] Os 3 tipos de drift (req órfão, código órfão, stale) são o recorte certo para v1
- [ ] `dare graph drift` como subcomando de `dare graph` (vs. comando top-level) é a ergonomia desejada
- [ ] Exit code 7 para drift-fail é a alocação aprovada
- [ ] Stale degradar para WARN quando falta hash é aceitável na v1
- [ ] Allowlist `drift.ignore[]` para código órfão legítimo é suficiente
- [ ] "Fora do escopo" (auto-correção, drift semântico, dashboard) é aceitável

---

> **Próximo passo:** após aprovação, rodar `/dare-blueprint` (Fase Architect) — contratos de travessia
> reusando `getEdges`/`traverse`, estrutura do subcomando `graph drift`, schema `drift` no config, e a
> populção de hash do `requirement` no ingest. Target: **v3.11.0**.
