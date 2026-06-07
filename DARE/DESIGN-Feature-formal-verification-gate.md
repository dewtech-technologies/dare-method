# Feature Design: Gate de Verificação Formal

> Gerado seguindo o próprio Método DARE (Fase D — Design). Artefato para **revisão humana**
> antes de avançar ao `/dare-blueprint`. License: MIT (parte do DARE Method).
>
> **⚠️ EMBRIONÁRIO / HORIZONTE FUTURO.** Esta feature é **experimental** e de fronteira
> (`idea-10`). Não está amarrada a uma versão: alvo **pós-v3.3**, entregue como **opt-in
> estrito e experimental**. As taxas de verificação formal por LLM ainda são baixas demais
> para qualquer obrigatoriedade — só faz sentido em **módulos pequenos e críticos**.
>
> **Depende de `DESIGN-Feature-verification-core.md`** (Núcleo de Verificação Confiável).
> Esta DESIGN é uma **extensão** dele: o gate formal é **um aspecto adicional** que se pluga
> no mesmo registry de gates do núcleo. Não reespecificamos aqui o gate de mutação, o
> fail-to-pass, o best-of-N nem a política decay-aware do Ralph Loop — tudo isso vem do núcleo.
>
> **Base de evidências:** `pesquisas-estrategicas/papers-dare/cards/`. Papers-âncora:
> CLEVER (arXiv:2505.13938), Vericoding (arXiv:2509.22908), Proof2Silicon/PREFACE
> (arXiv:2509.06239), Dafny-as-IL (arXiv:2501.06283). Ideia: `idea-10`.

## Contexto no Projeto Existente

O **Núcleo de Verificação Confiável** (`DESIGN-Feature-verification-core.md`) endurece o gate
binário do Ralph Loop (`packages/cli/src/dag-runner/ralph-loop.ts`, gates `build`/`test`/`lint`
hoje; mutação + fail-to-pass + best-of-N como aspectos plugáveis no núcleo). Com ele, "verde"
deixa de significar "passou na suíte que existia" e passa a significar **correto e robusto** —
mutação adversarial mata patches que só passavam em testes fracos.

Mas há um teto que nem o núcleo cruza: **"os testes passam" — mesmo robustos a mutação — ainda
não é "PROVADO"**. Testes mostram a *presença* de bugs, nunca a *ausência* (Ariane-5, Shellshock,
CrowdStrike são os exemplos clássicos citados em Vericoding, arXiv:2509.22908). Para um punhado de
**módulos críticos** — segurança, financeiro, *core* algorítmico — a diferença entre "muito bem
testado" e "matematicamente provado contra uma especificação" é exatamente o que importa.

A fronteira de pesquisa mostra que **vericoding** (gerar implementação **+ prova** contra uma spec
formal) já é tratável em escopo fino:

- **Dafny/SMT é hoje ~3× mais tratável que Lean** para LLMs prontos: **Dafny 82,2%** vs.
  **Verus 44,3%** vs. **Lean 26,8%** (model union, Vericoding/arXiv:2509.22908). Verificação pura
  em DafnyBench saltou de **68% (jun/2024) para 96% (model union) em ~1 ano** — a curva é favorável.
- **CLEVER** (arXiv:2505.13938) mostra o teto duro: fim-a-fim *provado* (spec + impl certificadas em
  Lean) ainda é **~0,62% (1/161)** nos melhores modelos. Logo: gate **opcional**, **escopo mínimo**,
  **nunca obrigatório**.
- **PREFACE/Proof2Silicon** (arXiv:2509.06239): reescrever o prompt guiado pelo feedback do
  verificador dá **até +21%** de taxa de verificação **sem fine-tuning** (ex.: Gemini-2-Flash
  33%→55%). Reaproveitável como loop de reparo barato e model-agnostic.
- **Dafny-as-IL** (arXiv:2501.06283): o humano **nunca vê Dafny** — valida só a *tradução em
  linguagem natural* da spec; a consistência é checada por **reconstrução** (estilo Clover).
  Resolve a ponte NL↔formal de forma amigável e mantém a linguagem-alvo livre (Go, Python).

**Diferencial defensável:** nenhum concorrente de agentes de codificação oferece um gate onde
"passar" significa *provado*. Para o DARE, isso é um aspecto de fronteira que se encaixa
naturalmente no registry de gates do núcleo — sem reescrever o núcleo.

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | Para funções **marcadas como críticas**, o gate só passa se a **spec formal verifica** (prova aceita pelo verificador) | % de funções marcadas que só viram DONE com prova aceita | 100% das marcadas (gate bloqueia sem prova) |
| O-02 | Taxa de verificação **alvo** em fixtures Dafny de escopo fino (single-function, <100 LOC) | `verified-rate` em suíte de fixtures internas | ≥ 70% (alinhado a Dafny 82% c/ loop de reparo PREFACE) |
| O-03 | Cobertura **estritamente limitada** aos módulos marcados | % de DONE em módulos **não-marcados** afetados pelo gate formal | 0% (não toca o que não foi marcado) |
| O-04 | Loop de reparo guiado pelo verificador eleva a taxa vs. single-shot | Δ verified-rate com realimentação de erro (estilo PREFACE) vs. uma tentativa | +15 pp (margem conservadora vs. +21% do paper) |
| O-05 | Humano acorda a spec **sem ver o formal** | % de specs críticas confirmadas por tradução NL + reconstrução consistente | ≥ 90% das specs acordadas via NL (Dafny-as-IL) |
| O-06 | Anti-trapaça: nenhuma "prova" passa por bypass | % de padrões de bypass (`assume(false)`, `ensures true`, vazamento de spec) detectados | 100% rejeitados |

## Stakeholders

| Papel | Pessoa/Time | Interesse principal |
|---|---|---|
| Autor do método | Wanderson / Dewtech | Diferencial de fronteira ("provado", não só "testado") defensável vs. concorrentes |
| Usuário (dev) de domínio crítico | Adotantes em segurança/financeiro/core | Garantia formal em módulos sensíveis, sem precisar aprender Dafny |
| Mantenedores CLI | Dewtech | Encaixe limpo como aspecto no registry de gates do núcleo; CLI permanece determinístico |
| Pesquisa/Estratégia | Dewtech | Rastreabilidade científica (`idea-10`); posicionamento de fronteira |
| Mantenedores do núcleo de verificação | Dewtech | Que o gate formal **consuma** o núcleo sem duplicar/forquilhar a lógica de gate |

## Requisitos Funcionais

> Prioridades majoritariamente **SHOULD/COULD** dado o caráter embrionário. O único **MUST**
> é o comportamento opt-in/não-invasivo (nunca degradar projetos que não pediram a feature).

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | **Marcação de módulo/função crítica** — anotação explícita (ex.: tag `@dare-formal` no código ou lista em `dare.config.json`) que ativa o gate formal só naquele alvo | SHOULD | Função sem marcação **nunca** aciona o gate formal; função marcada exige prova aceita antes de DONE |
| RF-02 | **Escolha de backend formal** com **Dafny como alvo pragmático default** | SHOULD | Config `formal.backend: dafny\|verus\|lean`; default `dafny` justificado por **82% vs. Lean 27%** (Vericoding); Verus/Lean ficam disponíveis mas opcionais |
| RF-03 | **Acordo de spec em linguagem natural sem expor o formal** (Dafny-as-IL): a skill formaliza a intenção, devolve ao humano uma **tradução NL** da spec, e itera por conversa até concordância; o Dafny **nunca é mostrado** | SHOULD | A skill apresenta a spec em NL; só prossegue após confirmação humana; checa **consistência por reconstrução** (descrição NL permite reconstruir spec equivalente — estilo Clover, arXiv:2501.06283) |
| RF-04 | **Loop de reparo guiado pelo verificador** (estilo PREFACE): em falha de prova, realimentar a mensagem de erro do verificador para a skill **reformular** o prompt/spec antes do próximo attempt, até `formal.maxRepairIterations` (default 5–7) | SHOULD | Gate captura o erro do verificador e o expõe à skill; loop reusa a **política decay-aware do núcleo** para abortar/escalar; ganho medido em O-04 (arXiv:2509.06239) |
| RF-05 | **Gate formal como aspecto adicional do verification-core** — registra-se no mesmo registry de gates (junto de test/lint/mutation), não cria um runner paralelo | SHOULD | O aspecto formal aparece no pipeline de gates do núcleo; reusa orquestração, telemetria e a política de loop; **não** reimplementa gate algum |
| RF-06 | **Sub-gate anti-trapaça** reusando a detecção de bypass do Vericoding (`assume(false)`, `ensures true`, spec vazada na impl) | SHOULD | Prova com padrão de bypass é **rejeitada** mesmo que o verificador "aceite"; diagnóstico granular spec×impl (CLEVER: certificar spec e impl como obrigações separadas) |
| RF-07 | **Diagnóstico granular spec vs. impl** (CLEVER): reportar se a falha foi *entender o requisito* (spec) ou *implementá-lo* (impl) | COULD | Veredito do gate distingue "spec não certificada" de "impl não satisfaz spec" (arXiv:2505.13938) |
| RF-08 | **Geração de testes adicionais a partir das `ensures`** da spec verificada (Dafny-as-IL) para alimentar a suíte do núcleo | COULD | Spec verificada emite testes extras registrados como artefato; complementa o fail-to-pass do núcleo |
| RF-09 | **Telemetria no GraphRAG** reusando o do núcleo: aresta `task --proven_by--> formal-gate` com backend, verified-rate e veredito | COULD | `dare graph` mostra a prova como evidência ligada à task |

## Requisitos Não-Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Opt-in estrito** — ausência de marcação/`formal.*` mantém comportamento idêntico ao núcleo | Zero impacto em projetos que não ativaram; nenhuma dependência formal exigida por default |
| RNF-02 | **Não bloquear módulos não-marcados** — o gate formal só roda no alvo anotado | Nenhum DONE de módulo não-marcado é atrasado/reprovado pelo aspecto formal |
| RNF-03 | **Custo/tempo da verificação formal** controlados — verificação SMT e loop de reparo são caros | Escopo single-function <100 LOC; timeout por prova; cap de iterações de reparo (RF-04); orçamento de tokens herdado do núcleo |
| RNF-04 | **Manutenibilidade** — backend formal é adapter isolado, sem god-file | Cada backend (Dafny/Verus/Lean) é um adapter plugável; cobertura do próprio aspecto ≥ 80% |
| RNF-05 | **Degradação graciosa** — toolchain ausente não quebra o build | Se o verificador não está instalado, o gate formal é pulado com aviso (em módulo marcado, exige instalação explícita) |
| RNF-06 | **Portabilidade** — funciona onde a toolchain formal roda (Windows/POSIX) | Fixtures verdes onde Dafny/SMT estiver disponível; sem dependência de shell POSIX no orquestrador |

## Requisitos de Segurança

| ID | Requisito | Referência |
|---|---|---|
| RS-01 | **Specs não-computáveis anti-trapaça** — preferir specs em `Prop` com quantificadores (CLEVER), impossíveis de copiar para a implementação; evita prova trivial (retornar 0, vazar spec) | CLEVER (arXiv:2505.13938); OWASP A04 (design inseguro) |
| RS-02 | **Detecção de padrões de bypass** como sub-gate obrigatório quando o gate formal está ativo (`assume(false)`, `ensures true`, vazamento) | Vericoding (arXiv:2509.22908); reforça RF-06 |
| RS-03 | **Sem segredos** — specs, provas, logs do verificador e telemetria nunca contêm `.env`/tokens/credenciais | OWASP A02; herda RS-02 do núcleo |
| RS-04 | **Execução sandboxed** — verificador e código gerado rodam no worktree isolado do núcleo, sem rede por padrão | OWASP A01; herda RS-03 do núcleo |
| RS-05 | **Dependência formal auditada** — toolchain Dafny/SMT instalada e versionada; sem CVE HIGH/CRITICAL | OWASP A06; herda a política de audit do núcleo |
| RS-06 | **A prova não pode ser falsificada pela skill** — o veredito vem do **verificador externo determinístico**, nunca da auto-avaliação do LLM | evita falso-provado |

## Stack Técnica

| Camada | Tecnologia | Versão/Nota |
|---|---|---|
| Orquestração do gate | TypeScript + Node (aspecto no registry do núcleo) | reusa runner/worktrees existentes |
| Backend formal default | **Dafny** + SMT solver (Z3) | **alvo pragmático: 82% vs. Lean 27%** (Vericoding) |
| Backend formal opcional | Verus (Rust) / Lean 4 | COULD; Verus 44%, Lean 27% — habilitados, não default |
| Loop de reparo | realimentação de erro estilo **PREFACE** (heurística, **não** RL na v1) | só consome prompt-repair; não treina (ver Fora do Escopo) |
| Ponte NL↔formal | Dafny-as-IL (spec opaca + tradução NL + consistency check) | a skill conversa em NL; CLI nunca renderiza Dafny ao usuário |
| Telemetria | GraphRAG backend JSON do núcleo | reuso direto |

## Integrações Externas

| Sistema | Tipo | Protocolo | Direção | Dados | Responsável |
|---|---|---|---|---|---|
| Toolchain Dafny + SMT (Z3) | **ferramenta externa local** (NÃO dependência do CLI) | processo filho (argv) | bi | spec/código → veredito + erros | aspecto formal |
| Verus / Lean (opcional) | ferramenta externa local | processo filho (argv) | bi | spec/código → veredito | adapter opcional |
| IDE skills (Claude/Cursor/Antigravity) | skill | MCP/arquivos | bi | formalização de spec, tradução NL, geração de impl+prova, prompt-repair | camada semântica (LLM fora do CLI) |
| CI (GitHub Actions) | pipeline | workflow | saída | verified-rate em fixtures formais | reuso do harness do núcleo |

## Restrições

- **Regra de ouro da casa:** o **CLI é 100% determinístico**. Toda inferência por LLM — formalizar
  a spec, gerar a tradução NL, produzir implementação+prova, reescrever o prompt no reparo — vive
  nas **skills das IDEs**, não no CLI. O CLI **orquestra o verificador externo e lê o veredito**;
  nunca chama LLM nem decide a prova por conta própria.
- **Extensão, não fork:** o gate formal é um **aspecto adicional do verification-core**. Reusa
  registry de gates, orquestração, worktrees, política decay-aware do Ralph Loop e telemetria.
  Não reespecifica nada do núcleo.
- **Toolchain externa não é dependência do CLI:** Dafny/SMT é pré-requisito do *ambiente*, não do
  pacote — degradação graciosa quando ausente (RNF-05).
- **Embrionário/experimental:** entregar atrás de flag, escopo single-function <100 LOC, sem
  qualquer obrigatoriedade global. As taxas fim-a-fim de CLEVER (~0,62%) proíbem gate obrigatório.

## Fora do Escopo (v1)

- **Verificar o codebase inteiro** ou módulos grandes/multi-função: escopo é single-function
  crítica <100 LOC (limite real do estado da arte — Vericoding/CLEVER).
- **Treinar um agente de prompt-repair com RL** (PREFACE em sua forma PPO, ~100h em 2×H100): a v1
  só **consome** o padrão *prompt-repair guiado por feedback do verificador* como heurística;
  não treina nada (arXiv:2509.06239 fica como referência).
- **Síntese de hardware/RTL** (a cadeia Proof2Silicon Dafny→C→RTL): totalmente fora.
- **Tornar o gate formal obrigatório** por release ou para qualquer módulo não-marcado.
- **Verificar a equivalência semântica do código compilado** a partir do Dafny (limitação
  reconhecida em Dafny-as-IL): fora da v1.
- **Backends além de Dafny como default:** Verus/Lean ficam disponíveis (COULD), mas o esforço de
  v1 concentra em Dafny.

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| **Maturidade da toolchain** formal (Dafny/SMT) — instabilidade, timeouts SMT | Média | Alto | Escopo fino <100 LOC; timeout por prova; degradação graciosa (RNF-05); Dafny é o backend mais maduro (82%) |
| **Taxas de verificação baixas** tornam o gate frustrante | Alta | Alto | Opt-in estrito; só módulos marcados; loop de reparo PREFACE (+~15–21%); escapar para o gate do núcleo quando não converge (CLEVER ~0,62% fim-a-fim é o alerta) |
| **Curva de aprendizado** — devs não sabem Dafny | Alta | Médio | Dafny-as-IL: humano só lê/aprova a **tradução NL**, nunca o formal (RF-03) |
| **Custo** (SMT + iterações de reparo + tokens da skill) | Média | Alto | Cap de iterações; orçamento herdado do núcleo; escopo mínimo; opt-in |
| **Falso-provado** por bypass na "prova" | Média | Alto | Sub-gate anti-trapaça (RF-06); specs não-computáveis (RS-01); veredito só do verificador externo (RS-06) |
| **Spec fraca** passa por implementação trivial | Média | Alto | Specs não-computáveis (CLEVER); diagnóstico spec×impl (RF-07); consistency check por reconstrução (RF-03) |
| **Acoplamento indevido** ao núcleo (fork de gate) | Baixa | Médio | RF-05: registrar como aspecto; revisão de arquitetura no Blueprint garante reuso |

## Checklist de Aprovação

- [ ] O problema ("testes passam" ≠ "provado" para módulos críticos) está bem capturado e vale a aposta de fronteira
- [ ] Está claro que esta feature **estende** a verification-core e **não** reespecifica o gate de mutação/TDD/best-of-N
- [ ] O caráter **embrionário/experimental/opt-in** está explícito e as prioridades (majoritariamente SHOULD/COULD) refletem isso
- [ ] **Dafny como default** está justificado pelos números (82% vs. Verus 44% vs. Lean 27%)
- [ ] O fluxo **NL-opaco** (humano não vê o formal, valida tradução + reconstrução) está aceito
- [ ] O **loop de reparo** consome PREFACE como heurística (sem treinar RL na v1)
- [ ] A regra "LLM fora do CLI" foi respeitada (verificador externo decide; skill formaliza/repara)
- [ ] A toolchain formal é tratada como **ferramenta externa**, com degradação graciosa
- [ ] Os itens "Fora do Escopo (v1)" são aceitáveis (sem codebase inteiro, sem RL, sem RTL, sem obrigatoriedade)

---

> **Próximo passo:** após aprovação deste DESIGN — e **depois** de a `verification-core` estar
> estabelecida — rodar `/dare-blueprint` para a Fase Architect (adapter do backend Dafny, contrato
> do aspecto no registry de gates, formato de marcação crítica, protocolo de spec NL-opaca).
> Fundamentação por paper em `pesquisas-estrategicas/papers-dare/cards/` (grep por `idea-10`:
> CLEVER 2505.13938, Vericoding 2509.22908, PREFACE 2509.06239, Dafny-as-IL 2501.06283).
