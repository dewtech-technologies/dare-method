# DARE: um método determinístico-fundamentado e um CLI para desenvolvimento de software assistido por IA com revisão humana no loop

**Wanderson Leandro de Oliveira** — Dewtech Technologies
*Rascunho v0.1 — 2026-05. License: MIT (D-001).*

> **Sobre este documento.** Escrito em duas camadas: serve como **paper técnico**
> (estrutura, contribuições, avaliação) e como **documentação de referência** do método
> DARE e do `@dewtech/dare-cli`. Seções marcadas *(avaliação)* discutem evidência e
> métricas; o restante descreve o desenho e a implementação.

---

## Resumo

Agentes de código baseados em modelos de linguagem (LLMs) já executam tarefas reais em
repositórios, mas dependem de **contexto confiável, critérios de correção e contratos de
comportamento** para modificar sistemas com baixo risco. Na prática, o desenvolvimento
assistido por IA oscila entre dois extremos: o *vibe coding* (rápido, porém caótico e não
auditável) e a especificação tradicional (lenta e que subaproveita a IA). Este trabalho
apresenta o **DARE** (*Design · Architect · Review · Execute*), um método de desenvolvimento
assistido por IA com **checkpoints humanos obrigatórios**, e o **`@dewtech/dare-cli`**, sua
implementação de referência. A principal tese arquitetural do DARE é a **separação em duas
camadas**: uma **camada determinística** (CLI, sem LLM) que extrai e verifica fatos a partir
do código — reproduzível e auditável — e uma **camada semântica** (skills nas IDEs) que delega
ao LLM apenas a inferência que exige julgamento. Sobre essa base, o DARE oferece execução
paralela de tarefas via DAG (algoritmo de Kahn), *validation gates* obrigatórios (build,
teste, lint, auditoria de dependências) no chamado **Ralph Loop**, *gates* anti-stub que
impedem marcar como concluída uma tarefa com código falso, e uma **Suíte Brownfield** que faz
engenharia reversa de projetos legados, extrai suas convenções e planeja migrações com
contratos de paridade comportamental (Gherkin). Posicionamos o DARE em relação à literatura de
engenharia reversa, documentação assistida por LLM e agentes de software, e propomos um
protocolo de avaliação com métricas de paralelismo, confiança, cobertura, rastreabilidade e
custo. Não reivindicamos superioridade empírica ampla; relatamos a evidência exploratória
disponível e o desenho como contribuição.

**Palavras-chave:** desenvolvimento assistido por IA; agentes de código; especificação
executável; engenharia reversa; rastreabilidade; human-in-the-loop; migração de legado.

---

## 1. Introdução

Sistemas de software raramente são apenas coleções de arquivos. Eles concentram regras de
negócio, decisões de arquitetura, exceções operacionais e convenções acumuladas ao longo de
anos. Parte desse conhecimento está explícita (nomes de funções, validações, queries);
outra parte permanece implícita em padrões de implementação, histórico de mudanças e
conhecimento tácito. Quando agentes de IA passam a editar esses sistemas, a ausência de um
**contrato operacional** — o que o sistema faz, por quê, e o que não pode quebrar — faz a
automação operar sobre contexto incompleto e confiança implícita.

O desenvolvimento assistido por IA hoje vive entre dois extremos (Tabela 1). De um lado, o
*vibe coding*: "me dá um código que faça X" mais esperança — rápido para protótipos, caótico
para evoluir, sem auditabilidade do raciocínio. De outro, a especificação tradicional, feita
quase só por humanos — segura, porém lenta e que subaproveita a capacidade da IA.

**Tabela 1. Os dois extremos do desenvolvimento assistido por IA.**

| Vibe Coding | Tradicional |
|---|---|
| "Me dá um código que faça X" + esperança | Especificação detalhada feita só por humanos |
| Rápido pra protótipo, caos pra evoluir | Lento, aproveita pouco a IA |
| Sem auditabilidade do raciocínio | Sem ganho de produtividade real |

O **DARE** preenche esse gap: mantém a velocidade da IA, mas com **estrutura, contexto e
checkpoints humanos**. O reconhecimento técnico subjacente é que agentes de LLM são fortes em
**iteração tática** (escrever e corrigir código até passar nos testes) e fracos em
**planejamento estratégico**. O método aloca cada parte a quem é melhor nela: humanos definem
estratégia (fases Design e Review), a IA executa tática (fases Architect e Execute).

### 1.1 Contribuições

1. **O método DARE** (§3): quatro fases sequenciais com responsabilidades claras e
   *checkpoints* humanos obrigatórios, mais o **Ralph Loop** — ciclo de auto-correção
   pós-execução governado por *validation gates*.
2. **Arquitetura de duas camadas** (§4): a separação entre uma **camada determinística**
   (CLI, sem LLM, reproduzível) e uma **camada semântica** (skills com LLM). É a tese central:
   *o que pode ser verificado por máquina não deve depender de um modelo probabilístico.*
3. **Execução paralela com gates** (§4–§5): DAG por algoritmo de Kahn, *gates* de
   build/teste/lint/auditoria e *gates* anti-stub que tornam "concluído" um **fato verificável**
   e não uma opinião.
4. **Suíte Brownfield** (§6): `reverse`, `dna` e `migrate` levam o método a projetos legados,
   com **confiança ancorada no determinístico** e extração **agnóstica de framework**,
   contrastando com abordagens *all-agent*.
5. **Protocolo de avaliação** (§7) com métricas de paralelismo, confiança, cobertura,
   rastreabilidade e custo.

---

## 2. Trabalhos relacionados

**Agentes de código e fluxos multi-agente.** Ferramentas como assistentes de IDE e agentes
autônomos já executam tarefas em repositórios reais, mas operam melhor quando recebem
interfaces e contexto próprios. O DARE não compete com o agente: ele *orquestra* o agente da
IDE (Cursor, Claude Code, Antigravity), que continua sendo o executor — sem chaves de API
adicionais nem custo de inferência extra.

**Desenvolvimento dirigido por especificação (spec-driven).** Representações intermediárias,
documentação em nível de repositório e geração de especificações continuam centrais para
entender, comparar e manter software. O DARE materializa isso como uma **cadeia de artefatos**
versionáveis (DESIGN → BLUEPRINT → TASKS → DAG → EXECUTION) com aprovação humana entre fases.

**Engenharia reversa de documentação com LLM.** O framework **Reversa** (Macedo & da Costa,
*arXiv:2605.18684*, 2026) converte software legado em especificações operacionais para agentes,
com um pipeline multi-agente e três mecanismos notáveis: marcação explícita de confiança,
rastreabilidade código↔spec e preservação de *gaps* para validação humana. O DARE absorve
esses mecanismos (§6), mas com uma diferença fundamental de desenho: enquanto a Reversa é
**100% agente** — e seu índice de confiança é, por reconhecimento dos próprios autores,
**auto-avaliado pelo LLM sem auditoria externa** — o DARE computa confiança e extrai fatos
**deterministicamente**, reservando o LLM para o que de fato exige inferência. A marcação de
confiança em três estados e a paridade Gherkin descritas em §6 são absorções *clean-room*
desses conceitos (sem reúso de código), com crédito ao trabalho original.

**Posicionamento.** O DARE não deve ser comparado por volume de texto gerado, mas por
**utilidade, rastreabilidade, incerteza explícita e capacidade de guiar ações subsequentes** —
tanto em greenfield quanto em brownfield.

---

## 3. O método DARE

DARE é o acrônimo de quatro fases sequenciais (Figura 1, conceitual):

```
1. DESIGN     →  2. ARCHITECT  →  3. REVIEW   →  4. EXECUTE
   o quê/por quê   o como          aprova        implementa
   (humano)        (IA propõe)     (humano)      (IA + Ralph Loop)
   ↓ DESIGN.md     ↓ BLUEPRINT.md  ↓ ✓ aprovação ↓ código + testes ✓
```

**Tabela 2. As quatro fases.**

| Fase | O que faz | Quem | Saída | Tempo típico |
|------|-----------|------|-------|--------------|
| 1. **Design** | define *o quê* e *por quê* | Humano (IA auxilia) | `DARE/DESIGN.md` | 15–30 min |
| 2. **Architect** | decide *como* (arquitetura) | IA propõe, humano valida | `DARE/BLUEPRINT.md` | 5–15 min |
| 3. **Review** | aprova/ajusta antes de gastar tokens | Humano | ✓ aprovação explícita | 5–10 min |
| 4. **Execute** | implementa tarefa a tarefa | IA | código + testes verdes | varia |

**Princípio central:** humanos pensam estratégia (fases 1 e 3), a IA executa tática (fases 2 e
4); cada transição passa por um *checkpoint* explícito. Não é Waterfall: pode-se iterar entre
fases, apenas não se pode pulá-las.

### 3.1 Ralph Loop

O **Ralph Loop** é o ciclo de **auto-correção pós-execução** dentro da fase Execute. A IA
implementa a tarefa, roda os *validation gates* e, em caso de falha, lê o erro, corrige e
repete — até todos os gates passarem.

```
implementa task → roda gates → PASS? → DONE
                              ↘ FAIL → lê erro, corrige, repete  ⟲
```

**Validation gates obrigatórios** antes de marcar `DONE`:

1. **Build** — compila sem erros (`cargo build`, `npm run build`, `py_compile`, etc.).
2. **Test** — suíte completa, com *assertions* reais (não `expect(true).toBe(true)`).
3. **Lint** — linter/formatter sem *warnings*.
4. **Audit** — ao tocar dependências: `npm audit` / `cargo audit` / `pip-audit` /
   `composer audit`; CVE HIGH/CRITICAL **bloqueia** o DONE.

**Critérios de parada.** Tudo verde → DONE. O mesmo erro 3+ vezes → impasse semântico, humano
intervém. Tentativa #7 → provável defeito de arquitetura: voltar ao Architect. *(avaliação)*
A Dewtech reporta, de uso interno, ~30% das tarefas passando de primeira e ~50% em 2–3
iterações; 7+ é sinal de problema arquitetural. Esses números são observacionais e ainda não
foram validados em estudo controlado.

### 3.2 Quando voltar atrás

O método define regressões explícitas: Ralph travando repetidamente → volte ao Architect;
BLUEPRINT crescendo demais → volte ao Design. A frase-guia é: *"sem gates, 'concluído' vira
opinião, não fato."*

---

## 4. Arquitetura do DARE CLI

O `@dewtech/dare-cli` é um pacote Node.js único (CLI `dare`, servidor MCP, engine GraphRAG e
DAG runner). Ele expõe 18 comandos (Tabela 3) e **nunca chama um LLM**: a inteligência é
delegada ao agente da IDE em que o usuário já está autenticado.

### 4.1 A tese das duas camadas

A decisão de desenho mais importante do DARE é a separação:

- **Camada determinística (CLI).** Faz *parsing*, contagem e análise estática sobre os
  arquivos. Mesma entrada → mesma saída. É **reproduzível, gratuita, rápida e auditável**.
  Exemplos: detectar fronteiras de módulo, contar LOC, construir o grafo de imports, parsear
  *migrations*/ORM, contar marcadores de confiança, validar o DAG.
- **Camada semântica (skills).** Vive nas *implementations* das IDEs (Antigravity, Claude
  Code, Cursor) e delega ao LLM apenas o que exige julgamento: inferir propósito, descrever
  fluxos, escrever regras de negócio, redigir cenários de paridade.

A consequência prática é **"confiança por construção"**: um fato extraído pelo CLI (com
`arquivo:linha`) é verdadeiro por *construção*, não por auto-avaliação de um modelo. Essa é a
distinção central frente a abordagens *all-agent*.

### 4.2 Comandos do CLI

**Tabela 3. Comandos do `dare` (18).**

| Família | Comandos |
|---|---|
| Bootstrap / projeto | `new`, `init`, `bootstrap`, `discover`, `welcome`, `info` |
| Brownfield | `reverse`, `dna`, `migrate` |
| Método | `design`, `blueprint`, `execute` |
| Orquestração | `dag`, `graph`, `validate` |
| Qualidade | `review`, `refine` |
| Manutenção | `update`, `skill` |

O *entry point* (`src/bin/dare.ts`, framework `commander`) registra cada subcomando; a
distribuição de skills por IDE é sincronizada no *build* (§4.5).

### 4.3 DAG runner — execução paralela

A partir do BLUEPRINT aprovado, o método fatia o trabalho em tarefas com dependências
(`dare-dag.yaml`). O runner usa o **algoritmo de Kahn** para ordenar topologicamente e atribuir
*ranks*: tarefas no mesmo rank podem rodar **em paralelo**. O CLI não executa as tarefas — ele
ordena, compõe o prompt de cada tarefa com o contexto dos pais, registra transições de estado
(`PENDING → RUNNING → DONE/FAILED/SKIPPED`), faz *cascade-skip* quando um pai falha e atualiza
um *canvas* ao vivo. *(avaliação)* A Dewtech reporta uma redução de ~280 → ~70 minutos
(≈75%) em um fluxo de referência ao passar de execução sequencial para paralela; é uma medida
ilustrativa, não um *benchmark* controlado.

### 4.4 GraphRAG, MCP e gates de qualidade

- **GraphRAG.** Um grafo de conhecimento (SQLite/JSON/Neo4j) é populado conforme as tarefas
  concluem (nós de task/arquivo/schema/endpoint; arestas `depends_on`/`implements`/…),
  permitindo consultas de contexto.
- **Servidor MCP de contexto.** Opcional; expõe *queries* de arquitetura/task/dependência.
  *(avaliação)* Reporta-se ~95% de economia de tokens frente a reler arquivos inteiros —
  número a confirmar empiricamente.
- **Gates anti-stub.** `dare review` detecta deterministicamente "fake completeness":
  `TODO`/`FIXME`, *stubs* (`throw new Error('not implemented')`, `todo!()`,
  `NotImplementedError`), funções vazias, retorno-fantasma, *mocks* fora de testes. `dare
  refine` mede complexidade e propõe quebra de tarefas grandes. Ambos têm camada determinística
  (regex) e camada semântica (skill).

### 4.5 Distribuição multi-IDE

A **fonte da verdade** das skills é o diretório `implementations/{claude,cursor,antigravity}`.
No *build*, um *script* de sincronização copia para `packages/cli/templates/ide/*`, que é
empacotado no npm e instalado no projeto do usuário por `dare init`/`dare discover`. Cada skill
existe em formato nativo de cada IDE (slash-command, *rule* `.mdc`, `SKILL.md`), totalizando
**32 skills × 3 IDEs = 96 arquivos** em paridade.

---

## 5. A cadeia de artefatos

O DARE materializa o método em arquivos versionáveis sob `DARE/`:

```
DARE/
├── DESIGN.md        ← Fase 1 — requisitos (o quê/por quê), sem arquitetura
├── BLUEPRINT.md     ← Fase 2 — arquitetura (como): diagrama, modelo de dados, contratos
├── TASKS.md         ← visão humana das tarefas (checkboxes, dependências)
├── dare-dag.yaml    ← grafo de máquina (ids, depends_on, complexity, status)
└── EXECUTION/
    └── task-NNN.md  ← spec executável por tarefa (gates + contrato anti-stub)
```

Cada artefato carrega um **contrato anti-stub**: o BLUEPRINT exige, para cada
endpoint/função/job, assinatura completa, *schema* de request/response, validações concretas
(a regex, não "validar email") e *edge cases*. A razão é direta: *"se um endpoint fica genérico
aqui, o agente que implementar será forçado a inventar — e produzirá mocks e esqueletos."* O
fatiamento em tarefas só ocorre **após a aprovação humana** do BLUEPRINT (fase Review).

---

## 6. Extensão Brownfield: entender, documentar e migrar legado

O método nasceu *greenfield-first*. A **Suíte Brownfield** o estende para projetos existentes,
preservando a tese determinística.

### 6.1 `dare reverse` — engenharia reversa (Fase 0)

Varre o código (sem alterá-lo), detecta fronteiras de módulo (workspaces → convenção → `src/`
→ *top-level*), mede tamanho por LOC e infere o grafo de dependências por *imports*. Gera:
`DARE/IDEIA.md` (pré-arquitetura com mapa de módulos em Mermaid), `REVERSE/module-*.md`
(mini-spec por módulo), `reverse-facts.json` e `architecture.excalidraw`. A skill `/dare-reverse`
preenche a parte semântica (propósito, fluxos via `sequenceDiagram`). É uma **Fase 0**: o humano
revisa a IDEIA e a promove a DESIGN — preservando o *checkpoint* (máquina infere, humano valida).

**Confiança em três estados.** Cada afirmação é marcada 🟢 CONFIRMED (evidência `arquivo:linha`)
· 🟡 INFERRED · 🔴 GAP. Os fatos estruturais já nascem 🟢 pelo CLI. O comando
`dare reverse --report` **conta os marcadores e computa o índice deterministicamente**
((🟢·1 + 🟡·0,5)/total), gerando `confidence-report.md` e a matriz de rastreabilidade
`code-spec-matrix.md`; os 🔴 viram `gaps.md` (classificados por severidade) e `questions.md`.
**Diferença frente ao estado da arte:** o índice é *computado*, não auto-declarado por um LLM.

### 6.2 `dare dna` — convenções do projeto

Enquanto o `reverse` responde *o que* o software é, o `dna` responde *como* o codebase faz as
coisas: extrai tooling de lint/format, convenção de nomenclatura, camadas, framework de teste,
bibliotecas-chave (ORM/HTTP/auth/validação) e convenção de commits → `PROJECT-DNA.md`. Em
legado que não se pode reescrever, isso faz o agente seguir o **padrão da casa**, não o
*default* genérico.

### 6.3 `dare migrate` — migração com paridade

Consome `IDEIA` + `PROJECT-DNA`, herda os *blocking gaps* (🔴) como riscos, e gera um plano de
migração (`MIGRATION.md`: paradigma, estratégia, registro de risco, arquitetura-alvo, cutover)
e **cenários Gherkin de paridade** (`parity/<módulo>.feature`) — o contrato comportamental que
garante que a reimplementação preserve o comportamento legado. Fecha o **loop brownfield**:
`reverse` (o quê) → `dna` (como) → `migrate` (reimplementar com paridade) → `design`/`blueprint`/
`execute` na *stack*-alvo.

### 6.4 Extração agnóstica de framework

A extração determinística do modo `--deep` (ERD, *API surface*, C4) não depende de framework:
parseia **SQL inline** (DDL e tabelas referenciadas em *queries*), **tipos/classes/structs** em
pastas de modelo (PHP/Python/TS/Go/Ruby/Rust → ERD sem ORM) e **rotas multi-dialeto**
(Express/Nest/Fastify, Laravel/Slim/Symfony, FastAPI/Flask/Django, Rails/Sinatra, Gin/stdlib,
Axum). Onde há framework, ele enriquece; onde não há, o *baseline* da linguagem ainda extrai.
*Princípio:* adicionar uma linguagem ao suporte = entregar o *baseline* agnóstico dela, não só
um framework.

---

## 7. Metodologia de avaliação *(avaliação)*

O DARE deve ser avaliado pela **utilidade, rastreabilidade, incerteza explícita e capacidade de
guiar ações** — não por volume de texto. Propomos métricas candidatas:

**Tabela 4. Métricas candidatas.**

| Métrica | O que mede |
|---|---|
| *Speedup* de paralelismo | razão tempo sequencial / tempo DAG paralelo |
| Taxa anti-stub | proporção de tarefas barradas por *stub*/mock/TODO antes do DONE |
| Distribuição de confiança | contagem de 🟢/🟡/🔴 e índice por módulo (determinístico) |
| *Blocking gaps* | nº de 🔴 que impedem reimplementação/migração segura |
| Cobertura | proporção de módulos/entidades/endpoints com spec própria |
| Rastreabilidade | densidade de evidências `arquivo:linha` por afirmação |
| Custo | tokens, nº de interações humanas, tamanho dos artefatos |

**Estado atual da evidência.** O CLI possui **358 testes** automatizados e *build* limpo; as
funcionalidades brownfield foram validadas em *fixtures* controladas (incluindo um projeto PHP
legado sem framework, do qual se extraíram tabelas, classes e rotas). As métricas de
produtividade (≈75% de *speedup*, ≈95% de economia de tokens, distribuição do Ralph Loop) são
**observacionais** e ainda carecem de estudo comparativo controlado contra (i) um único prompt
de documentação sem decomposição, (ii) um agente sem especificações prévias, e (iii)
ferramentas convencionais de análise estática.

---

## 8. Discussão

**A tese determinístico-fundamentada.** A separação em duas camadas não é só estética de
engenharia: ela muda *o significado* de "confiança". Em sistemas *all-agent*, toda afirmação —
inclusive um índice de 97% — é uma estimativa do próprio modelo. No DARE, o que é determinístico
é **verdade por construção** (com a linha exata como evidência), e o LLM é confinado ao que
genuinamente exige inferência, sempre marcado como 🟡/🔴. O resultado é uma especificação
*honesta sobre suas incertezas* — preferível, para manutenção responsável, a uma documentação
fluente que apresenta suposição como fato.

**Custo e reprodutibilidade.** A camada determinística é gratuita e idêntica a cada execução; a
camada semântica varia e custa tokens. Concentrar o esforço de LLM apenas onde ele agrega
fecha um trade-off favorável de custo/auditabilidade.

**Limitações.** (i) A análise é *line/regex-based*, não AST — há falsos positivos/negativos em
dialetos exóticos; o não-parseado é honestamente delegado à skill (🟡). (ii) A cobertura
determinística é mais rica para as linguagens/stacks já suportadas. (iii) As métricas de
produtividade ainda não foram validadas em estudo controlado.

---

## 9. Ameaças à validade

- **Validade interna.** Os números observacionais vêm de uso próprio (Dewtech); pode haver viés
  de seleção e de medição.
- **Validade externa.** A evidência brownfield vem de *fixtures* e de um caso simples; projetos
  grandes e domínios complexos podem se comportar de forma diferente.
- **Validade de constructo.** O índice de confiança mede a *classificação do pipeline*, não a
  precisão factual; um 🟢 indica evidência direta, não correção semântica garantida.

---

## 10. Conclusão e trabalhos futuros

O DARE propõe um caminho intermediário entre o *vibe coding* e a especificação tradicional:
estrutura com checkpoints humanos, execução paralela com *gates*, e uma fronteira nítida entre
o que a máquina verifica e o que o LLM infere. A Suíte Brownfield estende o método a legado com
confiança ancorada no determinístico e migração com paridade comportamental.

**Trabalhos futuros:** geradores de *scaffold* completos por stack; *registry* remoto de skills;
execução distribuída (DARE Cloud) com telemetria; ampliação dos *parsers* determinísticos
(mais linguagens/frameworks, ERD a partir de mais fontes); e um **estudo comparativo
controlado** instanciando o protocolo da §7.

---

## Referências

1. S. O. de Macedo, R. M. da Costa. *Reversa: A Reverse Documentation Engineering Framework for
   Converting Legacy Software into Operational Specifications for AI Agents.* arXiv:2605.18684v1,
   2026.
2. *DARE Method* — repositório e CHANGELOG. Dewtech Technologies, 2026.
   https://github.com/dewtech-technologies/dare-method
3. *Keep a Changelog* (1.1.0) e *Semantic Versioning* (2.0.0).
4. *(a completar)* Literatura de agentes de código, benchmarks de tarefas em repositório,
   geração de documentação e especificação com LLMs, e práticas de descrição de arquitetura
   (C4, ADRs).

---

*Rascunho v0.1 — comentários e revisões bem-vindos. As seções marcadas (avaliação) precisam de
estudo empírico antes de submissão acadêmica formal.*
