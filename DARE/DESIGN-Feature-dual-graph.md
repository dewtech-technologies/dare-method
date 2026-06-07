# Feature Design: Grafo Dual Requisito↔Código

> Gerado seguindo o próprio Método DARE (Fase D — Design). Artefato para **revisão humana**
> antes de avançar ao `/dare-blueprint`. License: MIT (parte do DARE Method).
>
> **Base de evidências:** cada decisão é fundamentada por papers catalogados em
> `pesquisas-estrategicas/papers-dare/` (cards + `knowledge-graph.json`). Os IDs de ideia
> (`idea-4`, `idea-5`) casam com a base de conhecimento; o achado **C1** vem do audit do GraphRAG.
> Target release: **v3.5.0** (repo em v3.4.0; v3.3.0 verification-core + v3.4.0 security-hardening já entregues).

## Contexto no Projeto Existente

O DARE já tem um **GraphRAG** com três backends intercambiáveis por trás de uma interface única
`KnowledgeGraph` (`packages/cli/src/graphrag/knowledge-graph.ts:19`): `sqlite` (`GraphRAG`/sql.js),
`json` (`JsonGraph`) e `neo4j` (`Neo4jGraph`), selecionados em `graphrag/factory.ts:81` a partir de
`dare-graph.yml`. O esquema é uma **união fechada** (`graphrag/types.ts:1-2`):

```ts
type NodeType = 'task' | 'file' | 'schema' | 'endpoint' | 'component' | 'entity' | 'concept';
type EdgeType = 'depends_on' | 'implements' | 'uses' | 'references' | 'related_to' | 'contains' | 'extends';
```

Hoje o grafo é populado **só** pela ingestão de DAG (`dag-runner/graph-ingest.ts`): para cada task
DONE cria um nó `task`, arestas `depends_on` espelhando o DAG e nós `file`/`endpoint`/`schema`/`component`
extraídos por **heurística de regex sobre o output da task** (`graph-ingest.ts:64-132`, `extractFilePaths`).
Ou seja: o nó "file" é o caminho-string mencionado no log, **não** uma entidade de código real
(função/classe/método). O grafo **não liga spec↔código**: não existem nós de requisito
(DESIGN/BLUEPRINT) nem rastreabilidade "este requisito é implementado por estes símbolos de código".

Três lacunas concretas motivam esta feature:

1. **O grafo não conhece o código.** Antes de o Ralph Loop editar, não há passo de **localização guiada
   por grafo** — o agente navega às cegas. LocAgent mostra que travessia tipada multi-hop num grafo de
   `{directory, file, class, function}` + `{contain, import, invoke, inherit}` leva file-level Acc@5 a
   **92.7%** (Qwen-32B ft) / **94.16%** (Claude-3.5) e **+12%** no resolve de issues (Pass@10
   33.58%→37.59%), com indexação em poucos segundos e custo ~86% menor (`idea-5`, arXiv:2503.09089).
2. **Não há grafo dual.** GraphCodeAgent (a **referência canônica** do dual) liga um Requirement Graph a
   um Structural-Semantic Code Graph por mapeamento `file_path::name` e tira disso **+43.81%** relativo no
   DevEval Pass@1 (GPT-4o), maior justamente em código não-standalone com deps cross-file (`idea-4`,
   arXiv:2504.10046). CodexGraph confirma que um **schema task-agnostic em Neo4j+Cypher** generaliza por
   benchmarks sem embeddings (`idea-4`, arXiv:2408.03910).
3. **O backend Neo4j está quebrado (achado C1).** `Neo4jGraph` é **write-only**: as escritas usam
   `void this.runMany([...])` — disparam e descartam a Promise sem `await` (`neo4j-graph.ts:85`, `:122`,
   `:142`), enquanto **toda leitura** (`getNode`, `queryNodes`, `searchNodes`, `getEdges`,
   `getNodeDependencies`, `getStatistics`, `exportToJson`) lê **apenas do cache em memória**
   (`neo4j-graph.ts:97-203`). Resultado: erros de Cypher são engolidos, e reabrir o processo perde tudo
   (o cache nasce vazio e nunca é hidratado do servidor). O backend é, na prática, um `JsonGraph` sem
   persistência confiável — a Stack da feature irmã já recomenda "**evitar Neo4j até C1 corrigido**".

Esta feature adiciona a **camada de código** ao grafo (nós de símbolo extraídos **deterministicamente**),
a **rastreabilidade requisito↔código** (arestas novas), o **passo de localização antes do Execute**, e
**conserta o C1** (leituras Cypher reais + `await` + propagação de erro) ou, se não couber em v3.3.0,
fecha o Neo4j atrás de um gate `experimental` explícito.

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | Grafo conhece símbolos de código, não só caminhos-string | % de arquivos suportados cujos símbolos (func/classe/método) viram nós `code_symbol` na ingestão | ≥ 90% dos símbolos top-level dos arquivos tocados |
| O-02 | Consulta de propriedade "quem é dono deste arquivo/símbolo" | `dare graph owners <path>` lista tasks/requisitos que implementam o nó | responde em **< 200 ms** (backend json/sqlite, repo ≤ 10k nós) |
| O-03 | Análise de impacto "dado um arquivo, o que é afetado" | `dare graph impact <path>` lista requisitos + tasks alcançáveis via `affects`/`implements` multi-hop | retorna o conjunto correto em fixture com **recall = 100%**, **< 500 ms** |
| O-04 | Localização guiada por grafo antes de editar | candidato de localização (nós-alvo) gerado por travessia tipada antes do patch no Ralph Loop | top-k contém o alvo em **≥ 85%** das fixtures (alinhado a Acc@5 de LocAgent) |
| O-05 | Neo4j deixa de ser write-only (conserto C1) | teste de integração: escrever → **fechar processo** → reabrir → ler o mesmo nó/aresta do servidor | leitura **bate** com o gravado; **0** Promises não-aguardadas no backend |
| O-06 | Erros de Cypher deixam de ser silenciosos | erro do servidor em qualquer operação propaga e falha o comando | **100%** dos erros 4xx/5xx + `errors[]` viram exceção observável |
| O-07 | Sincronia spec↔código rastreável | dado um requisito, `dare graph trace <req>` chega ao código via `implements`/`affects` | meta-path requisito→task→símbolo resolvido em **≤ 3 hops** |

## Stakeholders

| Papel | Pessoa/Time | Interesse principal |
|---|---|---|
| Autor do método | Wanderson / Dewtech | Diferencial defensável (grafo dual citável por papers); coerência com a filosofia DARE |
| Usuário (dev) | Adotantes do DARE CLI/IDE | "Onde eu mexo?" respondido pelo grafo; impacto de mudança visível antes de editar |
| Mantenedores CLI | Dewtech | Conserto do Neo4j sem regressão; extração determinística reusando `static-analyzer`; sem god-file |
| Skills das IDEs | Claude/Cursor/Antigravity | Localização multi-hop consumível via MCP; mapeamento RG→código exposto como ferramenta |
| Pesquisa/Estratégia | Dewtech | Rastreabilidade requisito↔código defensável cientificamente (idea-4/idea-5) |

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | Novos `NodeType` de nível-código na união fechada: `code_symbol` (função/classe/método) e `requirement` (nó de DESIGN/BLUEPRINT/task de spec) | MUST | `graphrag/types.ts` estende o union; interfaces `CodeSymbolNode` (com `path`, `symbol`, `kind: 'function'\|'class'\|'method'`, `qualifiedName`) e `RequirementNode` adicionadas; `KNOWN_NODE_TYPES` em `commands/graph.ts:48` atualizado |
| RF-02 | Novos `EdgeType` de rastreabilidade: `implements` (já existe) reusado p/ requisito→símbolo, mais `affects` (mudança em A impacta B) e `derives_from` (requisito-filho ↔ requisito-pai) | MUST | `EdgeType` estendido em `types.ts:2`; `getStatistics` conta os novos tipos sem `NaN`; arestas idempotentes por id |
| RF-03 | **Extração determinística** de nós `code_symbol` a partir do `static-analyzer` existente (`utils/static-analyzer.ts`) — sem AST por linguagem, regex line-based como hoje | MUST | Novo extrator reusa `SUPPORTED_EXTENSIONS`/`isTestFile`; produz `qualifiedName` no formato `path::symbol` (estilo `src/imap_utf7.py::decode_utf7` do idea-4); **mesma entrada ⇒ mesma saída** (snapshot test) |
| RF-04 | Ingestão liga `task --implements--> code_symbol` e `requirement --implements--> code_symbol` usando `file_path::name` como índice de mapeamento | MUST | `dag-runner/graph-ingest.ts` cria nós `code_symbol` dos arquivos tocados e arestas; mapeamento por chave `path::name` (idea-4 §3) |
| RF-05 | Ingestão de nós `requirement` a partir de DESIGN/BLUEPRINT/TASKS (IDs `RF-*`/`O-*`/task ids) com arestas `derives_from` espelhando a hierarquia spec→subtask | SHOULD | `dare graph ingest` cria nós `requirement` e arestas `derives_from`; parser determinístico (markdown headings/IDs), sem LLM |
| RF-06 | **Localização guiada por grafo antes do Execute**: travessia tipada multi-hop (BFS por tipo de nó/aresta, direção e nº de hops controláveis) que reúne nós-alvo candidatos | MUST | Função `locate(seedQuery, {hops, nodeTypes, edgeTypes})` retorna nós ranqueados; exposta ao Ralph Loop como passo opcional pré-patch e via MCP (idea-5; ablation LocAgent: Hops=1 corta function-level) |
| RF-07 | Comandos de consulta: `dare graph owners <path>`, `dare graph impact <path>`, `dare graph trace <req>` | MUST | Cada um usa `getEdges`/travessia da interface `KnowledgeGraph`; saída JSON + tabela; respeita as metas O-02/O-03/O-07 |
| RF-08 | **Conserto do Neo4j (C1)**: implementar leituras via Cypher real (`MATCH … RETURN`), aguardar (`await`) todas as escritas e **propagar** erros | MUST | `getNode`/`queryNodes`/`searchNodes`/`getEdges`/`getNodeDependencies`/`getStatistics` rodam Cypher e retornam do servidor; remover todos os `void this.runMany`; `init()` hidrata estado; passa O-05/O-06 |
| RF-09 | **Gate `experimental`** para o Neo4j enquanto C1 não fechar | MUST | Se RF-08 não entrar na release, `createGraph` (`factory.ts:87`) exige `neo4j.experimental: true` em `dare-graph.yml` e emite aviso; default permanece `sqlite`/`json` |
| RF-10 | Localização e mapeamento expostos no **MCP server** como ferramentas (estilo `RGRetrieval` / `DualGraphMapping` / `SSCGTraverse` do idea-4) | SHOULD | `mcp-server/server.ts` registra tools `graph_locate`, `graph_map_requirement`, `graph_traverse`; entrada validada; saída determinística |
| RF-11 | `dare graph viz` distingue visualmente as duas camadas (requisito vs. código) | COULD | Mermaid/DOT (`commands/graph.ts:179`) aplica subgraph/cor por camada; sem quebrar render atual |

## Requisitos Não-Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Performance de consulta** — owners/impact/locate em repo médio | O-02/O-03 (< 200 ms / < 500 ms em json/sqlite); travessia com limite de hops e de fanout para evitar explosão |
| RNF-02 | **Performance de ingestão** — extração de símbolos é incremental | só (re)processa arquivos tocados pela task; indexação no orçamento de "poucos segundos por repo" (idea-5) |
| RNF-03 | **Manutenibilidade** — sem god-file; extrator de símbolos isolado | novo módulo `graphrag/code-index.ts` separado do `static-analyzer`; cobertura ≥ 80% do código novo |
| RNF-04 | **Compatibilidade entre backends** — JSON/sqlite/neo4j respondem igual | os novos métodos de leitura/travessia entram na interface `KnowledgeGraph` e têm a **mesma semântica** nos 3 backends; suíte de contrato roda nos 3 |
| RNF-05 | **Compat retroativa** — grafos antigos não quebram | nós/arestas sem os tipos novos continuam válidos; `nodesByType`/`edgesByType` tolera tipos ausentes; ausência da config nova mantém comportamento atual |
| RNF-06 | **Portabilidade** — Windows (CRLF, `\`) e POSIX | `qualifiedName` normaliza separador para `/` (como `graph-ingest.ts:66`); caminhos comparados case-insensitive só onde já é hoje |
| RNF-07 | **Observabilidade** — operações Neo4j logadas | cada query Cypher loga latência + status; sem `console.log` solto |

## Requisitos de Segurança

| ID | Requisito | Referência |
|---|---|---|
| RS-01 | **Queries Cypher 100% parametrizadas** — sem concatenação de input em Cypher | OWASP A03 — manter o padrão `parameters:{…}` já usado em `neo4j-graph.ts:76-92`; **nenhuma** label/propriedade vinda de input do usuário interpolada na string da query |
| RS-02 | Validação de entrada: `path`/`<req>`/seeds validados (sem `..`, sem caminho absoluto fora do projeto) reusando o helper de path safety | OWASP A03; consistente com a feature irmã (`assertRelativeSafe`) |
| RS-03 | **Sem segredos** em nós/arestas nem em logs do grafo; credenciais Neo4j só via `dare-graph.yml`/env, nunca em código | OWASP A02/A05 — `Neo4jConfig` (`neo4j-graph.ts:31`) já recebe `username`/`password`/`auth` externos |
| RS-04 | Dependências do conserto Neo4j sem CVE HIGH/CRITICAL; manter o "zero driver" via `fetch` nativo (Node 18+) ou justificar driver auditado | OWASP A06 — o backend hoje não puxa driver (`neo4j-graph.ts:6-8`) |
| RS-05 | Resultado de Cypher tratado como **dado não confiável** ao reidratar o cache (validar shape antes de virar `GraphNode`/`GraphEdge`) | OWASP A08 — evita poisoning do grafo por um servidor comprometido |
| RS-06 | A extração de símbolos **lê** arquivos do projeto, **nunca executa** código fonte analisado | OWASP A01 — `static-analyzer` é puramente textual; manter |

## Stack Técnica

| Camada | Tecnologia | Versão/Nota |
|---|---|---|
| CLI / runner | TypeScript + Node | ≥18 (já existente) |
| Interface de grafo | `KnowledgeGraph` (`graphrag/knowledge-graph.ts`) | reusada; recebe métodos de travessia/leitura novos |
| Backend padrão | `sqlite` (sql.js) / `json` (`JsonGraph`) | já existentes; recomendados até C1 fechar |
| Backend Neo4j | Neo4j via **HTTP API** (`/tx/commit`) + Cypher | `neo4j-graph.ts`; consertado em RF-08 (`fetch` nativo, sem driver) |
| Extração de símbolos | `utils/static-analyzer.ts` (regex line-based, multi-linguagem) | reusado; **determinístico**, sem AST por linguagem |
| Índice de mapeamento | chave `file_path::name` | padrão idea-4 (`src/x.ts::Foo.bar`) |
| Visualização | Mermaid / DOT | `commands/graph.ts:179-209` (já existente) |
| Exposição às skills | MCP server | `mcp-server/server.ts` (já existente) |

## Integrações Externas

| Sistema | Tipo | Protocolo | Direção | Dados | Responsável |
|---|---|---|---|---|---|
| Servidor Neo4j | banco de grafo | HTTP API `/db/{db}/tx/commit` (Cypher) | bi | nós/arestas DARE | `Neo4jGraph` (RF-08) |
| IDE skills (Claude/Cursor/Antigravity) | skill | MCP/arquivos | bi | seeds de localização → nós-alvo; mapeamento requisito→código | regra da casa: LLM fora do CLI |
| Arquivos do projeto (DESIGN/BLUEPRINT/TASKS/código) | dados | filesystem (leitura) | entrada | requisitos + símbolos de código | ingestão/extração determinística |

## Restrições

- **Regra de ouro da casa:** o **CLI é 100% determinístico**. A extração de nós `code_symbol` e a
  ingestão de `requirement` são **estáticas/textuais** (regex, parsing de markdown), reusando o
  `static-analyzer`. **Nenhuma** inferência semântica (gerar/anotar requisitos por LLM, arestas de
  similaridade por embeddings) vive no CLI — isso fica nas **skills das IDEs**, expostas via MCP.
- **União fechada:** `NodeType`/`EdgeType` são unions fechadas (`types.ts:1-2`) — adicionar tipo exige
  tocar todos os `Record<NodeType,…>`/`Record<EdgeType,…>` (ex.: `getStatistics`) e o
  `KNOWN_NODE_TYPES` da CLI (`commands/graph.ts:48`). Mudança coordenada, não pontual.
- **Sem AST por linguagem:** o DARE roda em Rust/Go/Python/PHP/Node/TS; uma AST precisa por linguagem
  "explode a árvore de dependências" (comentário em `static-analyzer.ts:7-11`). A extração aceita o
  pequeno falso-positivo do regex, como o resto do analisador já aceita.
- **Não reescrever o GraphRAG:** estender a interface e os backends existentes, não trocar a arquitetura.
- **Windows-first dev:** CRLF e `\` são reais; normalizar separador no `qualifiedName` (RNF-06).

## Fora do Escopo (v1)

- **Embeddings / RAG vetorial / arestas de similaridade semântica** (`semantically-similar` do idea-4):
  exige modelo + limiar ε; é inferência — fica nas skills, não no CLI determinístico.
- **Geração/anotação de requisitos por LLM** (DeepSeek-V2.5 no idea-4): a ressalva do próprio paper é que
  isso é custoso de manter; v1 extrai requisitos só de IDs/headings já escritos nos artefatos DARE.
- **Reescrever o GraphRAG** ou trocar o backend padrão: fora.
- **Community summaries / clustering** do grafo: não nesta versão.
- **Tradutor "write-then-translate" NL→Cypher** (idea-4/CodexGraph §3.2): poderoso, mas é camada de LLM —
  pertence às skills das IDEs, não ao CLI.
- **AST completa por linguagem** (nós de chamada `invoke` resolvidos cross-file como no idea-4 §3.3):
  v1 fica em símbolos top-level via regex; resolução de `invoke`/`import` cross-file é alvo futuro.

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Conserto do Neo4j (C1) introduz regressão ou latência alta (HTTP por query) | Média | Alto | Suíte de contrato nos 3 backends (RNF-04); batch de statements no `/tx/commit`; gate `experimental` (RF-09) mantém default seguro |
| Grafo grande: travessia explode (fanout/hops) | Média | Alto | Limites de hops e fanout (RNF-01); índice por tipo (já há `dare_node_type`, `neo4j-graph.ts:68`); CodexGraph relata OOM em repos grandes — reproduzir o limite em fixture |
| Manter sync spec↔código: código muda e o grafo fica obsoleto | Alta | Médio | Ingestão incremental por task (RNF-02); reingestão idempotente por id; `dare graph ingest` re-sincroniza; ressalva do idea-4 sobre custo de manutenção registrada |
| Extração regex gera falsos `code_symbol` (sem AST) | Média | Médio | Aceito por design (igual `static-analyzer`); snapshot tests (RF-03); símbolos top-level only em v1 |
| Tocar a união fechada quebra `Record<NodeType,…>` em algum backend | Média | Médio | Mudança coordenada + suíte de contrato; `getStatistics` tolerante a tipos ausentes (RNF-05) |
| Cypher injection ao montar queries de travessia | Baixa | Alto | RS-01: tudo parametrizado; labels/props fixas em código, nunca de input |
| Localização vira dependência cara/lenta no Ralph Loop | Baixa | Médio | Passo **opcional** pré-patch; budget de hops; cai para o fluxo atual se o grafo estiver vazio |

## Checklist de Aprovação

- [ ] O problema (grafo não liga spec↔código + Neo4j write-only C1) está corretamente capturado e vale o investimento
- [ ] O escopo (`idea-4`, `idea-5`) está certo — e os itens "Fora do Escopo" (embeddings, NL→Cypher, AST completa) são aceitáveis para v1
- [ ] As metas numéricas (O-01…O-07) são realistas e mensuráveis (latência, recall, top-k, 0 promises soltas)
- [ ] A regra "LLM/semântica fora do CLI" foi respeitada: extração de símbolos e requisitos é determinística
- [ ] A decisão Neo4j está clara: **consertar C1 (RF-08)** OU fechar atrás do gate `experimental` (RF-09)
- [ ] As mudanças na **união fechada** `NodeType`/`EdgeType` estão coordenadas com todos os backends + CLI
- [ ] A compatibilidade entre backends (JSON/sqlite/neo4j) tem suíte de contrato (RNF-04)
- [ ] As prioridades MUST/SHOULD/COULD refletem o que importa primeiro (conserto + localização antes de viz/MCP)

---

> **Próximo passo:** após aprovação deste DESIGN, rodar `/dare-blueprint` para a Fase Architect
> (schema dos nós `code_symbol`/`requirement`, contrato de travessia, Cypher de leitura do Neo4j,
> lista de tasks). Fundamentação por paper em `pesquisas-estrategicas/papers-dare/cards/`
> (grep por `idea-4`, `idea-5`; cards 2504.10046, 2503.09089, 2408.03910).
