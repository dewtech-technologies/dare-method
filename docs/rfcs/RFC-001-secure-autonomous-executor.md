# RFC-001: Secure Autonomous Executor (`dare execute --agent`)

> **Status:** Accepted
> **Date:** 2026-06-10
> **Author:** Wanderson Leandro (Dewtech Technologies)
> **Target:** v3.9.0 (executor) + v3.10.0 (security gate)
> **License:** MIT (D-001)
> **Research basis:** `papers-dare/` `idea-12` (10 papers, 2026-06-10) — agentic-chain security

---

## 1. Resumo

Hoje o DARE **coordena** o DAG mas não o **executa**: o CLI é determinístico e
LLM-free, e o agente da IDE (Claude Code / Cursor / Antigravity) é o "motor"
humano-no-loop que implementa cada task. Este RFC propõe fechar o Ralph Loop de
ponta a ponta com duas peças desenhadas em conjunto:

1. **Executor headless autônomo** (`dare execute --agent`) — um runner que dirige
   o DAG sozinho, delegando a implementação de cada task a um agente headless
   (via `AgentDriver` plugável) e usando os gates existentes (mutation,
   anti-tamper, best-of-N, formal) como guard-rails.
2. **Gate de segurança da cadeia agêntica** (`dare guard`) — um gate
   determinístico que valida os artefatos que o executor consome (steering files,
   hooks, `PATTERNS.md`, specs de task, saídas de sub-agentes) **antes** de
   chegarem ao modelo, contra prompt injection, unicode imperceptível e
   adulteração.

As duas se exigem mutuamente: um executor autônomo **sem** o gate é perigoso
(consome artefatos não-confiáveis sem supervisão humana); o gate **sem** o
executor é defesa sem ameaça concreta. Juntas entregam de quebra a telemetria de
custo/tokens por task e o gatilho de `REPLAN` da decay policy.

## 2. Motivação

- **Hoje o humano é o gargalo.** O DAG paralelo já reduz o tempo (~75% vs.
  sequencial), mas cada task ainda espera um humano dirigir o agente. Um executor
  autônomo transforma o DARE de *metodologia assistida* em *fábrica
  supervisionada* — o humano aprova o DESIGN/TASKS e revisa o resultado, não cada
  passo.
- **A infraestrutura já existe.** Worktrees de best-of-N (v3.3), decay policy com
  o verbo `REPLAN` (v3.3), gates de verificação (v3.3/v3.8) e telemetria no
  GraphRAG já estão prontos. Falta o componente que *dirige*.
- **Autonomia sem segurança é um risco inaceitável.** No momento em que o agente
  roda desatendido, os artefatos que ele lê viram superfície de ataque crítica.
  A pesquisa do `idea-12` mostra que isso não é teórico: *"Your AI, My Shell"*
  (arXiv 2509.22040) demonstra **84,1% de ASR** envenenando arquivos de regras em
  Cursor/Copilot — exatamente a classe de artefato que o DARE injeta via
  `/steering` e `PATTERNS.md`.

## 3. Threat Model

Esta seção define **contra o quê** o RFC defende. O escopo é deliberadamente
estreito: defender o caso com lastro empírico, e ser explícito sobre o que fica
de fora — segurança que promete demais não é defensável.

### 3.1 Ameaça primária

**Injeção de prompt indireta via artefatos não-confiáveis do repositório,
consumidos pelo executor autônomo**, levando a um destes impactos:

1. **Execução de comando** na máquina (dev ou CI) via hook/shell envenenado — *o
   pior caso*.
2. **Exfiltração de segredos** (`.env`, API keys, tokens).
3. **Inserção de código malicioso** (backdoor) que sobrevive aos gates.
4. **Poluição da cadeia de supply** — commits/PRs maliciosos gerados pelo agente.

### 3.2 Atacante canônico: externo, sem privilégio

Um agente remoto que **influencia o conteúdo do repo mas não tem acesso
confiável**. Vetores concretos:

- abre um **PR** que adiciona/altera um rules/steering file, `PATTERNS.md` ou hook;
- envenena **código/comentários brownfield** que o `dare patterns` vai ingerir;
- controla **conteúdo externo** que o agente busca (URL, doc, dependência);
- envenena a **saída de um sub-agente** que vira input de um passo seguinte
  (best-of-N, multi-task).

### 3.3 Fronteira de confiança (TCB)

| Confiável (TCB) | Semi-confiável | **Não-confiável (dado)** |
|---|---|---|
| Humano que roda `--agent` e aprova DESIGN/TASKS; código do CLI DARE; artefatos em `trustedPaths` **assinados** | O LLM provider (segue instruções, mas é *o ponto vulnerável* por premissa) | `PATTERNS.md`, specs derivadas de input externo, saídas de sub-agente, conteúdo buscado, **todo o código brownfield** |

> **Premissa crítica (ver §5.1, camada 3):** um artefato assinado é confiável
> quanto à **origem e integridade**, **não** quanto ao conteúdo. Assinatura prova
> *quem escreveu* e *que não foi adulterado* — não que está livre de injeção.

### 3.4 Ativos a proteger (ordem de severidade)

1. **Máquina/shell** (RCE via hook envenenado) — severidade máxima.
2. **Segredos** (exfiltração).
3. **Integridade do código** (backdoor que passa nos gates).
4. **Cadeia de supply** (PRs maliciosos gerados pelo agente).

### 3.5 Explicitamente FORA de escopo

- **Insider malicioso com direito de commit+assinatura.** Assinatura prova
  identidade, não impede um humano confiável de ser malicioso. Mitigação =
  *code review*, não este gate.
- **Comprometimento do provider de LLM / dos pesos do modelo.**
- **Compromisso em nível de SO/máquina** (se o atacante já tem shell, o jogo
  acabou antes do DARE).
- **DoS / exaustão de custo como ataque primário** — `--budget-tokens` mitiga como
  efeito colateral (§4.4), não é o foco.

## 4. Proposta — Parte A: Executor autônomo (`dare execute --agent`)

### 4.1 Interface

```bash
dare execute --agent [--max-tasks N] [--budget-tokens N] \
             [--on-fail replan|escalate|stop] [--require-approval rank|none] \
             [--best-of N] [--dry-run]
```

- `--agent` — ativa o modo autônomo (default permanece o modo coordenado atual).
- `--budget-tokens N` — teto de tokens por execução; alimenta a decay policy.
- `--require-approval rank` — pausa para aprovação humana a cada fronteira de
  rank do DAG (default conservador); `none` = totalmente autônomo.
- Demais flags reusam a semântica já existente de `execute`.

### 4.2 Fluxo (por task, dentro do Ralph Loop)

```
pick next ready task (DAG, Kahn)
  → dare guard (Parte B) sobre spec + steering + PATTERNS consumidos
  → agente headless implementa no worktree  (× N se --best-of)
  → gates: build/test/lint → mutation → anti-tamper → (formal se marcado)
  → best-of-N selector (Pareto) escolhe candidato
  → decay policy decide: CONTINUE | FRESH_START | REPLAN | ESCALATE
  → telemetria no GraphRAG (verified_by, proven_by, custo/tokens)
  → mark DONE | FAILED → próxima task
```

O CLI permanece o **orquestrador determinístico**; o LLM fica isolado atrás de
uma fronteira fina (o "agent driver" — §4.3). O motor de decisão (DAG, gates,
decay) **não** chama LLM; só o *driver* da task chama.

### 4.3 Adapter de agente (`AgentDriver`) — o que "LLM-free" significa aqui

**Decisão arquitetural (D-002):** o `AgentDriver` é **internalizado no
`@dewtech/dare-cli`** — sem pacote separado. Isso segue a regra da casa de manter
tudo em um único pacote (CLI + GraphRAG + MCP server + types já convivem assim).

A garantia "LLM-free" **não** é "o pacote não traz SDK de IA"; é:

> **O motor de decisão (DAG, gates, decay, guard) é 100% determinístico. O LLM
> fica confinado ao `AgentDriver` e só é invocado em `--agent` modo não-mock
> (opt-in).**

Implementação que preserva isso sem sujar a instalação:

- O core define a interface `AgentDriver` + os drivers `mock`/`noop`
  (determinísticos, para `--dry-run` e testes — zero rede/LLM).
- O driver real (Claude Agent SDK) é **internalizado**, mas o SDK é declarado como
  **`optionalDependency`** e carregado via **`import()` dinâmico lazy**, apenas
  quando `--agent` roda em modo não-mock.
- Quem nunca usa `--agent` não precisa do SDK instalado; o caminho determinístico
  do CLI nunca importa LLM. Custo aceito: o SDK aparece no manifest como opcional.

### 4.4 Telemetria de custo (cobre o item 7)

Cada task registra tokens de entrada/saída e custo estimado como metadados no nó
da task no GraphRAG. A decay policy passa a decidir **por custo** além de por
tentativas: `FRESH_START`/`ESCALATE` quando `--budget-tokens` se esgota. Com
`--best-of N`, o orçamento é contado sobre **todos os N candidatos** da task, e o
N degrada graciosamente (reduz) sob pressão de orçamento.

## 5. Proposta — Parte B: Gate de segurança (`dare guard`)

Gate determinístico, **LLM-free**, no padrão existente do DARE
(scanner → veredito → exit code → telemetria). Roda como pré-flight do executor e
também isolado (`dare guard <path>`) e no CI.

> **Princípio de design:** a segurança **não** repousa na *detecção* (camadas 1-2,
> best-effort), e sim na **arquitetura** — separação control/data (§5.2) +
> least-privilege + tamper-evidence (camada 3). Detecção apenas *eleva o custo*
> do atacante; as garantias vêm das fronteiras.

### 5.1 Pipeline em camadas

Baseado na síntese do `idea-12` (Gao et al. 2510.05025; Gakh & Bahsi 2506.19109;
Liu et al. 2310.12815):

```
artefato → [1] unicode-audit → [2] scan heurístico → [3] proveniência+integridade → PASS|WARN|FAIL
```

1. **Unicode audit** (determinístico) — detecta/strippa variation selectors,
   zero-width, bidi overrides e homóglifos antes de o agente ler o artefato.
   Defesa direta contra o ataque imperceptível (2510.05025).
2. **Scan heurístico** (YARA/regex) — flagra padrões de injeção (override de
   instruções, comandos shell ocultos, exfiltração). **Recall baixo (~25% em Gakh
   & Bahsi 2506.19109) — esta camada NÃO é garantia, é best-effort.** Combina
   múltiplos sinais (estilo 2-of-N) e nunca é a única linha de defesa; serve para
   *elevar o custo do atacante*, não para "resolver" injeção.
3. **Proveniência + integridade** (SLSA-lite; Atlas 2502.19567) — capability tags
   por artefato `{origin: human|agent|external, trust: signed|unsigned,
   task-id}` + digest SHA-256 e assinatura (ex.: minisign/Ed25519). Garante
   **tamper-evidence e proveniência**, *não* segurança do conteúdo:
   - adulteração de um artefato assinado → `FAIL` **inegociável** (não contornável
     por ataque adaptativo de texto, cf. 2510.09023);
   - **mas** um artefato assinado-e-envenenado **passa nesta camada** — por isso
     artefatos confiáveis **também** passam pelas camadas 1-2;
   - o risco residual (autor confiável e malicioso) é **fora de escopo** por
     decisão do threat model (§3.5) → tratado por code review.

### 5.2 Trust boundaries control/data (sem dual-LLM)

CaMeL (2503.18813) prova que separar controle de dados zera ataques PI, mas
**exige dual-LLM** — inviável no core LLM-free. Transferimos só o princípio:

| Canal | Artefatos | Permissões |
|-------|-----------|------------|
| **Controle** | `TASKS.md`, steering assinado, hooks pré-aprovados | podem alterar ordem de gates / invocar shell |
| **Dados** | `PATTERNS.md` brownfield, specs de sub-agente, saídas best-of-N | só leitura; passam por scan; **nunca** executados como hook sem re-assinatura |

Esta fronteira é a **garantia real**: conteúdo do canal de dados, mesmo que o scan
falhe em detectá-lo, **não consegue** invocar shell nem reordenar gates.

### 5.3 Interface

```bash
dare guard <path|--staged|--all> [--strict] [--format json] [--sign]
```

- Integra ao `execute --agent` como pré-flight automático por task.
- `--sign` registra proveniência de um artefato confiável (humano).
- Exit codes (estendendo a convenção atual **0/1/3/4/5**, verificada em
  `execute-verification.ts`; note que 3/4/5 são reservados a falhas específicas):
  **`6` = guard-fail**.

**Por que comando novo e não estender `dare review`?** `review` é *anti-stub
pós-implementação* sobre o código **produzido**; `guard` é *pré-consumo* sobre os
artefatos de **entrada**. Inputs diferentes, estágio diferente do ciclo, ameaça
diferente — embora possam compartilhar a plumbing de scanner/telemetria.

### 5.4 Config (`dare.config.json`)

```jsonc
"guard": {
  "enabled": false,            // opt-in, como os demais gates
  "onExecute": true,           // pré-flight no --agent
  "unicode": "strip|block",
  "trustedPaths": [".dare/steering/**"],
  "signing": { "enabled": false, "key": "minisign" }
}
```

## 6. Por que 1 e 4 juntos (e o que cobrem)

| Item | Como este RFC o trata |
|------|------------------------|
| **1** Executor autônomo | Parte A (proposta central) |
| **4** Gate de segurança | Parte B (proposta central) |
| **7** Telemetria de custo | **Coberto** — §4.4, subproduto do executor |
| **3** Replan dinâmico (gatilho) | **Coberto parcial** — §4.2 ativa `REPLAN` em runtime; nested DAGs ficam fora |
| **5** Dashboard | **Alimentado** — gera os dados; visualização é RFC futuro |
| **6** Drift gate | **Barateado** — reusa o padrão de gate da Parte B |
| **8** CI/PR | **Habilitado** — `dare guard` e `--agent` rodam desatendidos no CI |
| **2** Busca semântica | Fora de escopo (trilha paralela) |

## 7. Alternativas consideradas

- **Só o executor, sem o gate (1 sem 4).** Rejeitado: autonomia sem validação de
  artefatos é risco de segurança inaceitável dado o ASR de 84% demonstrado.
- **Gate baseado em LLM (estilo CaMeL dual-LLM).** Rejeitado para o core: latência
  + custo + quebra da garantia determinística/LLM-free. Absorvemos só os
  princípios (capabilities + separação control/data).
- **Pacote separado para o driver de LLM** (ex.: `@dewtech/dare-agent-claude`).
  Rejeitado: contraria a regra da casa de um único pacote (D-002) e seria a peça
  fora do padrão. Internalizamos o driver com SDK como `optionalDependency` +
  lazy `import()` (§4.3) — o determinismo do core é preservado pelo confinamento
  ao driver, não pela ausência do SDK no manifest.
- **SDK do LLM como dependência dura do core.** Rejeitado: forçaria todo usuário
  do CLI determinístico a baixar um SDK de IA. Por isso `optionalDependency`.
- **Confiar no sandbox da IDE.** Insuficiente: o vetor é o *artefato envenenado*,
  não o privilégio de execução — a IDE consome o conteúdo malicioso de qualquer
  forma.

## 8. Riscos e trade-offs

- **Autonomia vs. controle humano.** Mitigado por `--require-approval rank` como
  default conservador e `ESCALATE` da decay policy.
- **Falso-positivo do scan heurístico.** Mitigado pelo nível `WARN` (não bloqueia,
  registra) e pela composição de sinais; nunca o scan como gate único.
- **Segurança que depende de detecção fraca.** Mitigado por design (§5): a garantia
  vem das trust boundaries + tamper-evidence, não do scan de recall ~25%.
- **Custo descontrolado do agente.** Mitigado por `--budget-tokens` + decay
  sensível a custo (§4.4). **Atenção:** `--best-of N` multiplica o custo em ~N× por
  task — o orçamento é contado sobre todos os candidatos e o N degrada sob pressão.
- **Gerência de chaves de assinatura.** Trade-off real; v1 pode começar só com
  digest+proveniência e assinatura opt-in.

## 9. Plano de implementação (faseado)

**Fase 1 — Executor MVP (v3.9.0)**
- `AgentDriver` internalizado: interface + mock/noop no core; driver Claude com SDK
  como `optionalDependency` + lazy `import()` (D-002).
- `dare execute --agent` ligando o loop existente.
- Telemetria de custo/tokens no grafo (item 7).
- Default seguro: `--require-approval rank`.

**Fase 2 — Gate de segurança (v3.10.0)**
- `dare guard`: unicode-audit + scan heurístico + proveniência (digest).
- Trust boundaries control/data; pré-flight no `--agent`; exit code 6.
- Assinatura opt-in.

**Fase 3 — Endurecimento**
- `REPLAN` estrutural em runtime; suíte de regressão de segurança
  (DARE-ChainSec, ver gaps do `idea-12-SUMMARY.md`); integração CI/PR (item 8).

## 10. Questões em aberto

- [x] **Default de `--require-approval`: `rank`** (conservador) — decidido.
- [x] **Assinatura: minisign / Ed25519** (D-003) — decidido. Local-first, zero
      infra, fácil de internalizar; assina *artefatos de orientação*. Complementar
      (não concorrente) à provenance OIDC do `npm publish` (v3.4), que segue
      cuidando da cadeia de *publicação*. cosign/sigstore rejeitado: infra externa
      pesada demais para assinar um arquivo local.
- [ ] `DARE-ChainSec`: construir benchmark próprio agora ou após a Fase 2?
- [ ] `AgentDriver`: streaming de progresso por task → como refletir no `.canvas.md`?

## 11. Referências

- `papers-dare/idea-12-SUMMARY.md` — síntese das técnicas e gaps.
- `papers-dare/cards/2509.22040_*` — Your AI, My Shell (ASR 84,1% em editores).
- `papers-dare/cards/2503.18813_*` — CaMeL (separação control/data).
- `papers-dare/cards/2502.19567_*` — Atlas (proveniência ML).
- `papers-dare/cards/2510.05025_*` — ataque unicode imperceptível.
- `papers-dare/cards/2510.09023_*` — Attacker Moves Second (ataque adaptativo).
- `../DARE-METHOD-Analise-e-Proposta.md` — diferencial GraphRAG↔DAG↔gate.
