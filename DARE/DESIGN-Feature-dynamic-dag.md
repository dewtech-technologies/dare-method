# Feature Design: Dynamic DAG (nested sub-DAGs + replan estrutural)

> Gerado seguindo o próprio Método DARE (Fase D — Design). Artefato para **revisão humana**
> antes de avançar ao `/dare-blueprint`. License: MIT.
>
> **Base de evidências:** fecha a **Fase 3** do [RFC-001](../docs/rfcs/RFC-001-secure-autonomous-executor.md)
> (item 3 do backlog). Reusa a decay policy (`decideNextAction` → `REPLAN`), o `dare refine --split` e o
> dag-runner existentes. Sem pesquisa nova. **Target: v3.11.0** (repo em v3.9.0).

## Contexto no Projeto Existente

Hoje a decay policy já emite o verbo **`REPLAN`** (`verification/decay/policy.ts`) e o `dare refine
--split` já **quebra** uma task complexa em sub-tasks. Mas o DAG é **flat**: não há como, em runtime,
*inserir* essas sub-tasks como um sub-DAG e continuar a execução. Resultado: `REPLAN` é um veredito sem
mecanismo — o executor autônomo (`dare execute --agent`, v3.9.0) não consegue se replanejar
estruturalmente; só repete ou escala.

Esta feature dá corpo ao `REPLAN`: quando uma task dispara replan (ou excede complexidade), o runner
gera um **sub-DAG** (via `refine`), **splice** no DAG ativo (a task vira pai das sub-tasks) e retoma a
execução respeitando as dependências — tudo determinístico.

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | `REPLAN` vira ação estrutural | Veredito `REPLAN` gera e executa um sub-DAG | **100%** dos REPLAN resolvidos via sub-DAG (vs. só repetir) |
| O-02 | Sub-DAG respeita dependências | Ordem topológica do sub-DAG + reentrada no pai | 0 violações de `depends_on` |
| O-03 | Determinístico (LLM-free) | Splice/topo-sort chamam LLM? | **0** — só o `AgentDriver` da sub-task chama |
| O-04 | Sem loop infinito de replan | Profundidade de aninhamento limitada | replan respeita `maxDepth` (default 2); excedeu → `ESCALATE` |
| O-05 | Compat com DAG flat | Projetos sem replan estrutural | comportamento atual inalterado |

## Stakeholders

| Papel | Pessoa/Time | Interesse principal |
|---|---|---|
| Autor do método | Wanderson / Dewtech | Executor autônomo robusto; fecha a Fase 3 do 1+4 |
| Usuário (dev) | Adotantes do DARE | Tasks complexas se auto-decompõem sem intervenção |
| Mantenedores CLI | Dewtech | Motor determinístico; reuso de refine/decay/dag-runner |

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | **Splice de sub-DAG em runtime** — inserir sub-tasks como filhas da task que deu replan | MUST | A task vira `parent`; sub-tasks executam antes de o pai concluir |
| RF-02 | **Geração via `refine --split`** — o sub-DAG vem do refine determinístico existente | MUST | Reusa `dare refine --split`; não reimplementa a quebra |
| RF-03 | **Reentrada no pai** — após o sub-DAG, a task pai re-tenta/conclui com o contexto das filhas | MUST | Pai re-avaliado por `decideNextAction` após o sub-DAG |
| RF-04 | **Limite de profundidade** — `maxDepth` de aninhamento; excedeu → `ESCALATE` | MUST | Aninhar além de `maxDepth` (default 2) escala ao humano (O-04) |
| RF-05 | **Persistência do DAG dinâmico** — estado do sub-DAG sobrevive a reinício | SHOULD | `state.json`/`dare-dag.yaml` refletem o sub-DAG; `dare execute --status` mostra |
| RF-06 | **Visualização** — `dare dag viz` mostra o aninhamento | SHOULD | sub-DAGs aparecem agrupados sob o pai |
| RF-07 | **Gatilho explícito** — `dare refine <task> --split --apply` injeta o sub-DAG no DAG ativo | SHOULD | Modo manual além do automático via REPLAN |

## Requisitos Não-Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Determinístico** | splice, topo-sort e limite de profundidade sem LLM |
| RNF-02 | **Compat retroativa** | DAG flat funciona sem mudança; nested é opt-in via REPLAN/refine |
| RNF-03 | **Sem ciclos** | splice valida aciclicidade (reusa `dare validate`) |
| RNF-04 | **Idempotência** | re-splice da mesma task não duplica sub-tasks |

## Requisitos de Segurança

| ID | Requisito | Mapeamento |
|---|---|---|
| RS-01 | IDs de sub-task validados (kebab-case, sem colisão) | **A03**; reusa `dare validate` |
| RS-02 | Sub-DAG passa pelo guard (se `guard.onExecute`) | herda o pré-flight do executor (v3.9.0) |

## Stack Técnica

| Camada | Tecnologia | Nota |
|---|---|---|
| Decisão | `decideNextAction` (decay policy) | reuso — REPLAN já existe |
| Quebra | `dare refine --split` | reuso |
| Execução | dag-runner + `dare execute --agent` | estendidos com splice |
| Validação | `dare validate` (aciclicidade, ids) | reuso |

## Integrações Externas

| Sistema | Tipo | Direção | Dados | Responsável |
|---|---|---|---|---|
| GraphRAG | telemetria | escrita | sub-DAG, profundidade, replan count | runner |

## Restrições

- **Reuso, não reinvenção:** refine, decay e dag-runner já existem; esta feature **conecta** os três.
- **Determinístico:** nenhum LLM no splice/topo-sort.
- **Profundidade limitada:** `maxDepth` evita replan infinito (decisão de design, não opcional).
- **Aninhamento de 1 nível por replan:** cada REPLAN gera um sub-DAG; sub-DAGs aninham até `maxDepth`.

## Fora do Escopo (v1)

- **Replanejamento *semântico*** (reescrever o objetivo da task) — só decomposição estrutural via refine.
- **Paralelismo entre sub-DAGs de tasks diferentes** além do que o dag-runner já faz.
- **Edição manual do DAG ao vivo via UI** — fora; só CLI.

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Replan infinito / explosão de sub-tasks | Média | Alto | `maxDepth` + `ESCALATE` ao exceder (O-04) |
| Splice introduz ciclo | Baixa | Alto | Validar aciclicidade no splice (reusa `dare validate`) |
| Estado do DAG dinâmico corrompe em reinício | Média | Médio | Persistir em `state.json`; idempotência de splice (RNF-04) |
| Refine gera quebra ruim | Média | Médio | Refine é determinístico e já testado; humano revê via `--require-approval` |

## Checklist de Aprovação

- [ ] Splice de sub-DAG em runtime (vs. só repetir a task) é o recorte certo
- [ ] `maxDepth` default 2 + `ESCALATE` ao exceder é aceitável
- [ ] Reusar `dare refine --split` para gerar o sub-DAG é a abordagem aprovada
- [ ] Aninhamento estrutural (não semântico) é suficiente para a v1
- [ ] "Fora do escopo" (replan semântico, UI ao vivo) é aceitável

---

> **Próximo passo:** após aprovação, `/dare-blueprint` — representação do sub-DAG, contrato de splice no
> dag-runner, reentrada no pai via `decideNextAction`, e o limite de profundidade. Target: **v3.11.0**.
