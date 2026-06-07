# Feature Design: Inteligência Brownfield (Auto-Discovery + Planejadores Leves)

> Gerado seguindo o próprio Método DARE (Fase D — Design: o **QUÊ** e o **PORQUÊ**).
> Artefato para **revisão humana** antes de avançar ao `/dare-blueprint`. License: MIT (parte do DARE Method).
>
> **Base de evidências:** cada decisão é fundamentada por papers catalogados em
> `pesquisas-estrategicas/papers-dare/` (cards + `knowledge-graph.json`). Cobre **idea-7**
> (minerar "tribal knowledge" / convenções implícitas de legado → conhecimento reusável injetável,
> estilo Agent OS / Reversa; arXiv:2605.18684) e **idea-8** (planejadores especializados leves —
> Analyst / PM / Architect — **só na fase de planejamento**, à la BMAD, **sem** o enxame caro de
> multi-agente em runtime; cautela de custo: MetaGPT arXiv:2308.00352 e survey arXiv:2508.00083).
> Tese única das duas ideias: **tornar o entendimento de legado e o planejamento mais ricos**, sem
> abandonar a regra de ouro "LLM fora do CLI". **Target: v3.3.0** (repo em v3.2.0).

## Contexto no Projeto Existente

A suíte brownfield do DARE já existe e é **determinística**:

- **`dare reverse`** reconstrói **o QUE** o legado é: detecta stack, monta o grafo de módulos
  (`utils/module-detector.ts:24` `ModuleInfo`, `:43` `ModuleGraph`), mede tamanho/LOC e emite
  `DARE/REVERSE/reverse-facts.json` + `IDEIA.md` + `module-*.md` com seções semânticas como
  placeholders `<!-- AGENT -->` (`utils/reverse-facts.ts:174` `renderIdeiaSkeleton`,
  `:352` `renderModuleSpecSkeleton`). Ele já extrai **fatos de primeira classe** — entidades e
  endpoints com evidência `arquivo:linha` (`reverse-facts.ts:120` `renderDataModelSection`,
  `:148` `renderApiSection`) — e já tem **modelo de confiança** 🟢/🟡/🔴 + `--report` no comando
  (`commands/reverse.ts:49`), exatamente o "confirmado/inferido/gap" que o paper Reversa propõe
  como dados de saída (suspeita_2605.18684, idea-7).
- **`dare dna`** extrai **COMO** o codebase faz as coisas: tooling, naming, layering, testing,
  libs e commits (`utils/dna-detector.ts:36` `DnaFacts`, `:204` `computeArchitecture`,
  `:338` `detectDna`) → `DARE/dna-facts.json` + `PROJECT-DNA.md` (`commands/dna.ts:15`).

**Duas lacunas permanecem:**

**(a) O conhecimento extraído não é reusável nem injetável.** Hoje o `dna` detecta camadas via
match de nomes de diretório contra uma lista fixa (`dna-detector.ts:197` `KNOWN_LAYERS`,
`:218` `guess`) e o `reverse` produz um grafo de **tamanho**, não de **padrão**. Não há um
artefato consolidado de **padrões/convenções/decisões implícitas** (idioms recorrentes, camadas
inferidas além da lista, "o jeito que este projeto resolve X") que seja (i) versionável, (ii)
consumível pelas próximas fases (`design`/`blueprint`) e (iii) injetável no grafo de conhecimento /
steering — o que o paper Reversa e o Agent OS chamam de tornar o tribal knowledge **um contrato
de primeira classe** (idea-7). O `PROJECT-DNA.md` é hoje um documento solto, não uma fonte que o
planejamento lê automaticamente.

**(b) As fases Design/Architect não interrogam o humano.** O `dare design` atual só escreve um
esqueleto estático de `DESIGN.md` (`commands/design.ts:15`) e o `dare blueprint` faz scaffold de
tasks-amostra (`commands/blueprint.ts:43` `sampleTasks`). Nenhum deles **faz as perguntas certas**
antes de produzir o artefato. O MetaGPT mostra que o ganho real de codificar SOPs humanos (PM →
Architect) está nas **saídas estruturadas e na decomposição**, não no enxame de agentes conversando
(2308.00352, idea-8) — e o survey reforça "High Operational Costs" como o risco recorrente de
times multi-agente (2508.00083). Esta feature traz **personas de planejamento leves** que
interrogam o humano nas fases Design/Architect, **sem** runtime multi-agente.

Esta feature **estende** `reverse`/`dna` (não os reescreve) e enriquece `design`/`blueprint`.

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | Auto-discovery de **padrões** além do `dna` atual (camadas inferidas, idioms recorrentes, decisões implícitas) | `dare patterns` emite `patterns-facts.json` com ≥ N padrões classificados (frequência + evidência `arquivo:linha`) | ≥ 5 categorias de padrão; ≥ 90% dos itens com evidência rastreável |
| O-02 | Conhecimento brownfield vira **artefato reusável e injetável** | `PATTERNS.md`/`PROJECT-DNA.md` referenciados automaticamente como contexto por `design`/`blueprint` (sem o humano recopiar) | 100% das rodadas de planejamento brownfield carregam o DNA/padrões existentes |
| O-03 | Padrões alimentam o **grafo / steering** | Cada padrão vira nó/aresta no GraphRAG (`pattern --evidenced_by--> arquivo:linha`) | `dare graph` lista os padrões descobertos |
| O-04 | **Planejadores leves** interrogam o humano no Design | `dare design --interactive` (ou a skill) produz lista de perguntas de Analyst/PM **antes** do `DESIGN.md`, derivadas dos fatos | ≥ 80% dos DESIGNs brownfield passam pela rodada de perguntas |
| O-05 | **Architect persona** interroga no Blueprint | Skill `/dare-blueprint` faz perguntas de trade-off arquitetural ancoradas no DNA/padrões antes do scaffold | perguntas citam padrões reais do projeto |
| O-06 | **Custo controlado** (idea-8) | Nº de chamadas LLM por rodada de planejamento; personas rodam **sequencialmente uma vez**, não em loop de troca de mensagens | ≤ 1 passagem por persona; **zero** agentes persistentes em runtime |
| O-07 | (SHOULD) Marcação confiança/gap propagada | Padrões herdam 🟢/🟡/🔴; gaps preservados para validação humana (estilo Reversa) | gaps nunca silenciados; aparecem em "⚠️ Incertezas" |

## Stakeholders

| Papel | Pessoa/Time | Interesse principal |
|---|---|---|
| Autor do método | Wanderson / Dewtech | Coerência com a filosofia DARE; brownfield rico e defensável vs. concorrentes |
| Usuário (dev) | Adotantes do DARE em legado | Planejamento que respeita o projeto real e faz as perguntas certas |
| Mantenedores CLI | Dewtech | Reuso de `module-detector`/`dna-detector`/`static-analyzer`; sem god-file; sem custo de runtime |
| Pesquisa/Estratégia | Dewtech | Evitar o custo MetaGPT documentado; rastreabilidade código↔conhecimento (Reversa) |

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | **(idea-7) Auto-discovery de padrões** determinístico: `dare patterns` minera padrões além do `dna` — camadas/agrupamentos inferidos por co-ocorrência (não só a lista fixa de `dna-detector.ts:197`), idioms recorrentes (ex.: todo controller chama um service; toda rota valida com Zod), e decisões implícitas (ex.: barrel files, sufixos `*.service.ts`) | MUST | Emite `DARE/patterns-facts.json` com cada padrão `{categoria, descrição-fato, frequência, evidência[arquivo:linha]}`; reusa `detectModules`, `dna-facts.json` e `isTestFile` (`static-analyzer.ts:69`); **nunca** chama LLM |
| RF-02 | **Artefato consumível + injetável**: `PATTERNS.md` (esqueleto com `<!-- AGENT -->` para a skill nomear/explicar) + os fatos ficam disponíveis para as próximas fases | MUST | `design`/`blueprint` carregam `dna-facts.json`/`patterns-facts.json` se existirem e os injetam como contexto; o humano não recopia nada |
| RF-03 | **Grafo / steering**: cada padrão descoberto é registrado como nó/aresta no GraphRAG | SHOULD | `pattern --evidenced_by--> arquivo:linha` e `module --exhibits--> pattern`; `dare graph` os lista (O-03) |
| RF-04 | **(idea-8) Personas de planejamento — Analyst & PM** no Design: a skill `/dare-design` carrega fatos (reverse/dna/patterns) e **interroga o humano** com perguntas geradas a partir deles (gaps, ambiguidades, escopo) antes de escrever o `DESIGN.md` | MUST | `dare design --interactive` (CLI determinístico monta o **questionário a partir dos fatos**; a skill conduz a inferência); produz bloco de perguntas + respostas que viram contexto do `DESIGN.md` |
| RF-05 | **(idea-8) Persona Architect** no Blueprint: a skill `/dare-blueprint` faz perguntas de trade-off (camadas, contratos, limites de módulo) **ancoradas no DNA/padrões reais** antes do scaffold de `blueprint.ts:43` | MUST | Perguntas citam padrões detectados (ex.: "este projeto usa Layered C→S→R — manter ou divergir?"); resposta orienta o `BLUEPRINT.md` |
| RF-06 | **Leveza arquitetural** (idea-8): personas são **prompts/templates estruturados sequenciais**, executados **uma vez** na fase de planejamento — sem message pool, sem agentes persistentes, sem loop de troca em runtime | MUST | Cada persona = 1 passagem; nenhuma topologia multi-agente é instanciada em runtime; custo medido em O-06 |
| RF-07 | **Confiança/gaps de primeira classe** (idea-7, Reversa): padrões e respostas das personas herdam 🟢/🟡/🔴; gaps preservados para o humano | SHOULD | Reusa o pipeline de confiança já existente (`commands/reverse.ts:49 --report`, `utils/confidence.ts`); gaps aparecem em "⚠️ Incertezas" |
| RF-08 | **`--check` read-only** em `dare patterns` (espelha `dna.ts:20`/`reverse.ts:46`) | SHOULD | `dare patterns --check` só reporta padrões detectados, não escreve artefatos |
| RF-09 | (COULD) **Injeção em steering nativo** (CLAUDE.md / `.cursorrules`) dos padrões dominantes | COULD | Opt-in `--inject`; segue o follow-up já previsto no DESIGN do `dna` |

## Requisitos Não-Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Custo (idea-8)** — o multi-agente colaborativo tem "High Operational Costs" (survey 2508.00083) e o MetaGPT gasta **31.255 vs 19.292 tokens/tarefa** vs ChatDev (2308.00352, Tabela 1). Mitigar por design: personas **leves, sequenciais, uma passagem, só no planejamento** | ≤ 1 passagem por persona; zero runtime multi-agente; sem loop de mensagens |
| RNF-02 | **Determinismo no CLI** — extração de padrões e montagem de questionário são 100% determinísticas (regra de ouro da casa) | mesma entrada → mesma saída byte a byte; sem rede/LLM no CLI |
| RNF-03 | **Performance** — auto-discovery roda sobre o inventário já existente (`reverse-facts.json`/`module-detector`), sem re-scan caro | reusa inventário quando presente (igual `dna-detector.ts:371` `loadFileInventory`); sem AST |
| RNF-04 | **Manutenibilidade** — detector de padrões isolado, sem god-file; cada categoria de padrão é uma regra plugável | `pattern-detector.ts` modular; cobertura ≥ 80% |
| RNF-05 | **Portabilidade** — Windows (CRLF) e POSIX; normalizar separadores como o resto da suíte | fixtures verdes nos dois |
| RNF-06 | **Compatibilidade** — não quebra `reverse`/`dna` existentes; tudo opt-in | ausência dos novos artefatos mantém o comportamento atual; saídas de `reverse`/`dna` inalteradas |

## Requisitos de Segurança

| ID | Requisito | Referência |
|---|---|---|
| RS-01 | **Read-only no projeto-alvo**: `dare patterns` nunca escreve fora de `DARE/`, nunca modifica código (igual `reverse`/`dna`) | OWASP A01 |
| RS-02 | **Sem exfiltração / sem segredo**: toda análise é local; CLI não chama rede/LLM; nenhum conteúdo de código sai da máquina; `patterns-facts.json` e questionários **não** capturam `.env`/tokens | OWASP A02/A05 |
| RS-03 | **Validação de entrada**: `--dir`/`--modules` resolvidos e validados contra o root (sem `..`/absolutos); ignorar `node_modules`, `.git`, `dist`, `target`, `vendor` na varredura (`module-detector.ts:52` `IGNORE_DIRS`) | OWASP A03 |
| RS-04 | **Injeção em steering opt-in** (RF-09): `--inject` nunca sobrescreve sem confirmação; preserva conteúdo do usuário (manifesto SHA-256, estilo Reversa) | OWASP A08 |
| RS-05 | **Personas não executam código**: as perguntas das personas vivem na skill da IDE; o CLI só monta o questionário determinístico a partir de fatos — nenhuma execução de código arbitrário | OWASP A03 |

## Stack Técnica

| Camada | Tecnologia | Versão/Nota |
|---|---|---|
| CLI / detector | TypeScript + Node | ≥18 (já existente) |
| Inventário de arquivos | `module-detector.ts` / `reverse-facts.json` | reuso direto |
| Classificação test/prod | `isTestFile` (`static-analyzer.ts:69`) | reuso |
| Fatos de convenção | `dna-detector.ts` / `dna-facts.json` | reuso (padrões estendem o DNA) |
| Confiança / gaps | `utils/confidence.ts` + `reverse --report` | reuso |
| Grafo / steering | GraphRAG backend JSON (seguro) | **evitar Neo4j até C1 corrigido** |
| Diagramas (se houver) | `graph-renderer.ts` (`renderGraph`) | reuso |
| Personas (camada semântica) | skills `/dare-design`, `/dare-blueprint` nas IDEs | LLM **fora** do CLI |

## Integrações Externas

| Sistema | Tipo | Protocolo | Direção | Dados | Responsável |
|---|---|---|---|---|---|
| IDE skills (Claude/Cursor/Antigravity) | skill | MCP/arquivos | bi | fatos → padrões nomeados + perguntas das personas (camada semântica) | regra da casa: LLM fora do CLI |
| GraphRAG backend | grafo | JSON local | saída | nós/arestas de padrão | `dare patterns` / `dare graph` |
| Steering nativo (CLAUDE.md/.cursorrules) | arquivo | filesystem | saída (opt-in) | padrões dominantes injetados | RF-09 (COULD) |

> Nenhuma integração de rede no CLI. Todo o brownfield discovery é local e determinístico.

## Restrições

- **Regra de ouro da casa:** o **CLI é 100% determinístico** e extrai **FATOS** (padrões por
  frequência/co-ocorrência, com evidência `arquivo:linha`). Toda **inferência semântica** — nomear
  o padrão, explicar a decisão implícita, conduzir as perguntas das personas — vive nas **skills das
  IDEs** (igual a `reverse-facts.ts` que só deixa `<!-- AGENT -->`). O CLI nunca chama LLM.
- **Planejadores leves só no planejamento (idea-8):** Analyst/PM/Architect rodam **uma vez** nas
  fases Design/Architect, sequencialmente, como prompts estruturados. **Nada** de enxame de agentes
  conversando em runtime — é exatamente o custo que o MetaGPT/survey documentam e que o DARE evita.
- **Estende, não duplica:** padrões reusam `module-detector`/`dna-detector`/`static-analyzer`;
  `reverse`/`dna` continuam intocados em sua saída (RNF-06).
- **Multi-stack via heurística:** padrões são detectados por regex/co-ocorrência (sem AST), como o
  resto da suíte; o grafo de padrões é **dica**, não contrato — o humano valida no checkpoint.
- **Windows-first dev:** CRLF e ausência de shell POSIX são restrições reais (RNF-05).

## Fora do Escopo (v1)

- **Enxame multi-agente persistente em runtime** — **explicitamente evitado** pelo custo
  (MetaGPT 2308.00352 / survey 2508.00083, idea-8). As personas são leves e só no planejamento.
- **Treinar modelos** (classificador de padrões / reward model próprio): v1 só usa heurística
  determinística + a skill existente.
- **AST real por linguagem**: mantém-se a abordagem regex/line-based da casa (igual a
  `module-detector`/`dna-detector`).
- **Migração / cutover** (`dare migrate`, paridade Gherkin do paper Reversa): feature irmã, DESIGN
  próprio.
- **Verificação / mutation / best-of-N**: pertencem ao DESIGN do Núcleo de Verificação Confiável.
- **Injeção automática em CLAUDE.md/.cursorrules** sem opt-in: RF-09 é COULD e sempre opt-in.

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| **Custo de multi-agente** explode (idea-8) | Média | Alto | Personas **leves, sequenciais, 1 passagem, só no planejamento**; zero runtime multi-agente (RF-06, RNF-01, O-06) — o aprendizado-chave do MetaGPT/survey |
| **Auto-discovery gera ruído** (padrões espúrios / falso-positivo) | Alta | Médio | Só reportar padrões acima de limiar de frequência + evidência `arquivo:linha`; herdar 🟢/🟡/🔴 e preservar gaps (RF-07, estilo Reversa); o humano valida no checkpoint |
| Padrão detectado contradiz o default DARE | Média | Médio | DNA/padrões **descrevem**, não enforçam; a persona Architect pergunta "manter ou divergir?" (RF-05) — decisão é do humano |
| Inferência da skill apresenta palpite como fato (perigo Macke & Doyle, citado pelo paper Reversa) | Média | Alto | CLI marca o que é fato (🟢); skill marca inferência (🟡) e gap (🔴); nada de inferência frágil como fato |
| Sobreposição/duplicação com `dna` | Média | Baixo | `patterns` **estende** o `dna` (reusa `dna-facts.json`); categorias novas só onde o `dna` não chega (idioms, decisões implícitas, camadas por co-ocorrência) |
| God-file no detector | Baixa | Médio | Cada categoria de padrão é regra plugável; cobertura ≥ 80% (RNF-04) |

## Checklist de Aprovação

- [ ] O problema (conhecimento brownfield não reusável/injetável + planejamento que não interroga) está bem capturado e vale o investimento
- [ ] O escopo (idea-7 auto-discovery + idea-8 personas leves) está certo e os "Fora do Escopo" são aceitáveis para v1
- [ ] As metas (O-01…O-07) são realistas e mensuráveis
- [ ] A regra "LLM fora do CLI" foi respeitada (CLI extrai fatos; personas/semântica nas skills)
- [ ] O **custo de multi-agente** está mitigado o suficiente (leve, sequencial, só no planejamento — RF-06/RNF-01)
- [ ] `patterns` **estende** e não duplica `reverse`/`dna` (saídas existentes intactas — RNF-06)
- [ ] As prioridades MUST/SHOULD/COULD refletem o que importa primeiro
- [ ] Segurança read-only sobre o projeto-alvo (RS-01…RS-05) está garantida

---

> **Próximo passo:** após aprovação deste DESIGN, rodar `/dare-blueprint` para a Fase Architect
> (decisões arquiteturais, estrutura de pastas, contratos, lista de tasks). Fundamentação por paper
> em `pesquisas-estrategicas/papers-dare/cards/` (grep por `idea-7`, `idea-8`).
> Target **v3.3.0**.
