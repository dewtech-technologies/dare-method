# Feature Design: Secure Autonomous Executor

> Gerado seguindo o próprio Método DARE (Fase D — Design). Artefato para **revisão humana**
> antes de avançar ao `/dare-blueprint`. License: MIT (parte do DARE Method).
>
> **Base de evidências:** esta DESIGN é **research-driven** + **RFC-driven**. A fonte de verdade é
> [`docs/rfcs/RFC-001-secure-autonomous-executor.md`](../docs/rfcs/RFC-001-secure-autonomous-executor.md)
> (Accepted, 2026-06-10). O endurecimento de segurança (Parte B) é fundamentado pela base de papers
> `idea-12` (10 papers): Your AI My Shell (2509.22040), CaMeL (2503.18813), Atlas (2502.19567),
> Unicode imperceptível (2510.05025), Attacker Moves Second (2510.09023).
> Decisões ancoradas em `arquivo:linha` do código real. **Target: v3.9.0 (executor) + v3.10.0 (gate)**
> (repo em v3.8.2).

## Contexto no Projeto Existente

Hoje o `@dewtech/dare-cli` **coordena** o DAG mas não o **executa**: o CLI é determinístico e
LLM-free, e o agente da IDE é o motor humano-no-loop. O `dare execute` já roda o Ralph Loop com
gates e best-of-N, mas espera um humano dirigir cada task.

**1) O executor já tem a infraestrutura — falta quem dirija.**
`commands/execute.ts` orquestra a verificação e sai com o código do veredito
(`execute.ts:384` monta `exitCode: winner.verification.passed ? 0 : 1`; `execute.ts:417` faz
`process.exit(verification.exitCode)`). A convenção de exit codes está em
`commands/execute-verification.ts`: **`0`/`1`** (pass/fail), **`3`** (mutation tool ausente,
`execute-verification.ts:324`), **`4`** (fail-to-pass ausente, `:316`), **`5`** (formal tool
ausente, `:332`). Worktrees de best-of-N, decay policy (`CONTINUE/FRESH_START/REPLAN/ESCALATE`) e
telemetria GraphRAG (`verified_by`/`proven_by`) já existem. **O que falta é o `AgentDriver` que
implementa a task no lugar do humano.**

**2) Os artefatos que o agente consome não têm gate de segurança.**
O MCP server expõe a rota `GET /steering` (`packages/cli/src/mcp-server/`) e o agente lê
`PATTERNS.md` (v3.7), specs de `EXECUTION/task-*.md`, steering files (`.dare/steering/`) e saídas de
sub-agente. Hoks rodam por `spawn shell:false` (`hooks/dispatcher.ts`, argv explícito via
`exec/safe-spawn.ts:131`) — bom contra shell injection, **mas nada valida o conteúdo dos artefatos
antes de chegarem ao modelo**. No momento em que o executor roda desatendido, isso vira a superfície
de ataque crítica: *Your AI, My Shell* (2509.22040) demonstra **84,1% de ASR** envenenando arquivos
de regras em editores agênticos — exatamente a classe `/steering` + `PATTERNS.md`.

Esta feature fecha as duas pontas: transforma o DARE de *metodologia assistida* em *fábrica
supervisionada* (Parte A) e protege a cadeia de artefatos que essa fábrica consome (Parte B).

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | Executor dirige o DAG sem humano por passo | Tasks DONE sem intervenção entre fronteiras de rank | **100%** das tasks de uma fixture executadas com `--require-approval none` |
| O-02 | Motor de decisão LLM-free | Caminho determinístico (DAG/gates/decay/guard) importa LLM? | **0** imports de LLM fora do `AgentDriver`; SDK como `optionalDependency` lazy, só em `--agent` não-mock |
| O-03 | Custo por task observável e limitante | Tokens/custo gravados por task no grafo; `--budget-tokens` respeitado | **100%** das tasks com métrica; execução aborta ao exceder budget |
| O-04 | Gate confina artefato não-confiável ao canal de dados | Artefato do canal de dados consegue invocar shell/reordenar gates | **0** ocorrências (bloqueado por design) |
| O-05 | Adulteração de artefato assinado é detectada | Artefatos `trustedPaths` alterados pós-assinatura | **100%** → `FAIL` (exit 6) |
| O-06 | Unicode imperceptível neutralizado | Payloads com zero-width/bidi/variation selectors em fixtures | **100%** detectados/strippados antes do consumo |
| O-07 | Gate não bloqueia fluxo legítimo | Falso-positivo em artefatos benignos de fixture | Taxa de FP em `FAIL` ≈ **0**; suspeitas vão a `WARN` |
| O-08 | Autonomia é opt-in seguro | Default de `--require-approval` | Default = `rank`; `none` exige flag explícita |

## Stakeholders

| Papel | Pessoa/Time | Interesse principal |
|---|---|---|
| Autor do método | Wanderson / Dewtech | DARE vira runner autônomo seguro; diferencial defensável (IA×Ciber) |
| Usuário (dev) | Adotantes do DARE CLI/IDE | Executar o DAG sozinho sem abrir mão de controle/segurança |
| Integração IDE | Claude Code / Cursor / Antigravity | Continuar consumindo steering/PATTERNS, agora validados |
| Mantenedores CLI | Dewtech | Core LLM-free preservado; gate no padrão existente |
| Security / Compliance | Dewtech | Threat model explícito; defesa em profundidade; tamper-evidence |

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | **`dare execute --agent`** — modo autônomo que dirige o DAG; default permanece o modo coordenado | MUST | Flag liga o loop autônomo; sem a flag, comportamento atual inalterado |
| RF-02 | **Interface `AgentDriver` internalizada** no core — interface + drivers `mock`/`noop` determinísticos | MUST | Caminho determinístico não importa SDK de LLM; `--dry-run` usa mock (corre O-02; D-002) |
| RF-03 | **Driver real internalizado com SDK lazy** — Claude Agent SDK como `optionalDependency` + `import()` dinâmico só em `--agent` não-mock | MUST | Sem o SDK instalado, `--agent` não-mock falha com mensagem clara; quem não usa `--agent` não baixa SDK (D-002) |
| RF-04 | **Telemetria de custo/tokens por task** — entrada/saída/custo como metadados no nó da task | MUST | Cada task executada grava tokens no GraphRAG; consultável por `dare graph` |
| RF-05 | **`--budget-tokens N`** — teto que alimenta a decay policy | MUST | Exceder o budget dispara `FRESH_START`/`ESCALATE`; com `--best-of N` conta todos os candidatos |
| RF-06 | **`--require-approval rank\|none`** — pausa por fronteira de rank (default `rank`) | MUST | `rank` pausa para aprovação a cada rank; `none` totalmente autônomo (corre O-08) |
| RF-07 | **`REPLAN` em runtime** — decay policy aciona re-planejamento da task ao falhar | SHOULD | Veredito `REPLAN` re-deriva a spec/abordagem da task antes de nova tentativa (nested DAG fora do escopo) |
| RF-08 | **`dare guard <path\|--staged\|--all>`** — gate determinístico isolado e como pré-flight | MUST | Roda standalone, no `--agent` (pré-flight por task) e no CI; emite `PASS\|WARN\|FAIL` |
| RF-09 | **Camada unicode-audit** — detecta/strippa zero-width, bidi overrides, variation selectors, homóglifos | MUST | Payloads de fixture (2510.05025) → detectados; modo `strip` higieniza, `block` reprova (corre O-06) |
| RF-10 | **Camada scan heurístico** — YARA/regex p/ override de instrução, shell oculto, exfiltração | SHOULD | Sinais combinados (2-of-N); achados vão a `WARN` por padrão (best-effort, **não** garantia) |
| RF-11 | **Camada proveniência+integridade** — capability tags + digest SHA-256 + assinatura opcional | MUST | Adulteração de artefato assinado → `FAIL`/exit 6 (corre O-05); artefato assinado **também** passa por RF-09/10 |
| RF-12 | **Trust boundaries control/data** — canal de dados não invoca shell nem reordena gates | MUST | Hook/steering do canal de dados sem re-assinatura → não executável (corre O-04) |
| RF-13 | **`dare guard --sign`** — registra proveniência de artefato confiável (humano) | SHOULD | Gera assinatura/digest para paths em `trustedPaths` |
| RF-14 | **Exit code 6 = guard-fail** — estende a convenção 0/1/3/4/5 | MUST | `guard` reprovado → `process.exit(6)`; integrável a `execute`/CI |
| RF-15 | **Config `guard` em `dare.config.json`** — opt-in como os demais gates | MUST | Bloco `guard.enabled/onExecute/unicode/trustedPaths/signing` lido e respeitado |
| RF-16 | **Telemetria do gate no grafo** — veredito por artefato registrado | SHOULD | Nó/aresta de `guard` por artefato consumido (auditoria de disputa) |

## Requisitos Não-Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Core LLM-free inegociável** — motor de decisão (DAG/gates/decay/guard) sem inferência | Nenhuma chamada LLM fora do `AgentDriver`; guard 100% determinístico |
| RNF-02 | **Compat retroativa** — modo coordenado atual inalterado sem `--agent` | Fluxos existentes passam sem mudança; `guard.enabled:false` por default |
| RNF-03 | **Determinismo testável** — `mock`/`noop` driver para CI | Suíte roda sem rede/LLM; resultados reproduzíveis |
| RNF-04 | **Performance do gate** — pré-flight não domina o tempo da task | Overhead do `guard` por artefato < ~50 ms em fixtures típicas |
| RNF-05 | **Portabilidade** — unicode-audit e paths em Windows e POSIX | Reusa normalização de path existente; cobre CRLF/`\` nos testes |
| RNF-06 | **Observabilidade sem vazar segredo** — logs estruturados (pino) | Veredito/custo logados; sem token, sem conteúdo sensível de artefato |
| RNF-07 | **Degradação graciosa de custo** — `--best-of N` sob pressão de budget | N reduz automaticamente; nunca estoura o `--budget-tokens` |

## Requisitos de Segurança

| ID | Requisito | Mapeamento OWASP / threat model |
|---|---|---|
| RS-01 | **Validação de entrada nos artefatos** — todo artefato consumido passa pelo pipeline do guard | **A03 Injection** (LLM01 Prompt Injection); ameaça primária §3.1 do RFC |
| RS-02 | **Separação control/data** — dado não-confiável não vira controle sem re-assinatura | **A01/A04**; garantia arquitetural (não detecção) |
| RS-03 | **Least-privilege do canal de dados** — sem shell/reordenação de gate | **A01 Broken Access Control**; RCE-via-hook é o pior caso §3.4 |
| RS-04 | **Tamper-evidence** — digest+assinatura detecta adulteração de artefato confiável | **A08 Software/Data Integrity** |
| RS-05 | **Proveniência rastreável** — capability tags `{origin, trust, task-id}` por artefato | **A08/A09**; auditoria de disputa |
| RS-06 | **Neutralização de unicode imperceptível** — strip/block antes do consumo | **A03**; ataque 2510.05025 |
| RS-07 | **Segredos via env, nunca em artefato** — token/credenciais do driver fora de prompts | **A05/A02** |
| RS-08 | **Confinamento de custo** — budget como barreira de abuso/exaustão | defesa-em-profundidade (DoS é secundário, §3.5) |
| RS-09 | **Sem `shell:true` no driver/runner** — execução por `spawn` argv | **A03**; reusa `exec/safe-spawn.ts` |

> **Risco residual assumido (fora de escopo, §3.5 do RFC):** autor confiável **e** malicioso com
> direito de assinatura — assinatura prova identidade, não intenção. Mitigação = code review, não
> este gate.

## Stack Técnica

| Camada | Tecnologia | Versão/Nota |
|---|---|---|
| Orquestrador (core) | TypeScript / Node | `@dewtech/dare-cli` existente; **sem** SDK de LLM |
| Interface de agente | `AgentDriver` (interface + mock/noop no core) | novo módulo **internalizado** no `dare-cli` (D-002) |
| Driver de LLM | Claude Agent SDK internalizado | `optionalDependency` + lazy `import()`; só em `--agent` não-mock |
| Gate determinístico | Node + YARA/regex + crypto (SHA-256) | `dare guard`; sem inferência |
| Assinatura | **minisign / Ed25519** (D-003) | local-first, zero infra; complementar à provenance OIDC do publish |
| Telemetria | GraphRAG (SQLite/JSON existente) | nós/arestas de custo e de guard |
| Execução de processo | `exec/safe-spawn.ts` (spawn argv, shell:false) | reuso |
| Testes | Vitest + driver mock | determinístico, sem rede |

## Integrações Externas

| Sistema | Tipo | Protocolo | Direção | Dados | Responsável |
|---|---|---|---|---|---|
| Provider de LLM (Claude) | agente | HTTPS (SDK) | bi | prompt da task + patch | `@dewtech/dare-agent-claude` (opcional) |
| GraphRAG local | telemetria | in-process | escrita | custo/tokens, veredito de guard | core |
| Repositório git (worktrees) | execução | filesystem | bi | candidatos best-of-N | executor |
| CI (GitHub Actions) | gate | processo | leitura | veredito `dare guard` | pipeline |
| Chave de assinatura (minisign) | integridade | local/keystore | leitura | digest/assinatura | guard `--sign` |

## Restrições

- **Regra de ouro da casa:** o **motor de decisão é 100% determinístico** — nenhum LLM no caminho
  de DAG/gates/decay/guard. A autonomia entra **estritamente** atrás do `AgentDriver`. **Tudo é
  internalizado no `@dewtech/dare-cli` (D-002)** — sem pacote adicional, seguindo a regra de
  arquitetura do projeto; o SDK do LLM é `optionalDependency` com lazy `import()`, então o caminho
  determinístico nunca o importa e quem não usa `--agent` não o baixa. "LLM-free" = motor
  determinístico + LLM confinado ao driver opt-in, **não** ausência do SDK no manifest.
- **Opt-in, como os demais gates:** `--agent` e `guard.enabled` são opt-in; o comportamento atual
  (modo coordenado) é o default intocado.
- **Segurança por arquitetura, não por detecção:** a garantia vem das trust boundaries +
  tamper-evidence; o scan heurístico (recall ~25%, 2506.19109) é best-effort e nunca gate único.
- **Threat model fixo (RFC §3):** atacante externo sem privilégio; insider de confiança fora de
  escopo; provider de LLM e SO fora de escopo.
- **Windows-first dev:** unicode-audit e paths cobrem `\`/CRLF (RNF-05).

## Fora do Escopo (v1)

- **Nested DAGs / replan estrutural completo** — RF-07 entrega só o *gatilho* de `REPLAN` em runtime;
  aninhar sub-DAGs é DESIGN própria.
- **Dashboard de telemetria** — esta feature **gera** os dados de custo/guard; a visualização é RFC
  futuro (item 5 do backlog).
- **Drift gate spec↔código** (item 6) — reusa o padrão do guard, mas é feature separada.
- **Integração CI/PR como produto** (item 8) — o guard roda no CI, mas a Action comentando em PR é
  escopo posterior.
- **Busca semântica local** (item 2) — trilha paralela, não toca esta feature.
- **Defesa baseada em LLM (dual-LLM estilo CaMeL)** — rejeitada para o core; só os princípios
  (capabilities + control/data) são absorvidos.
- **Benchmark DARE-ChainSec** — suíte de regressão de segurança fica para a Fase 3 (endurecimento).

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Executor autônomo causa dano sem supervisão | Média | Alto | `--require-approval rank` default + `ESCALATE` da decay; pré-flight `guard` obrigatório |
| Custo descontrolado do agente | Alta | Alto | `--budget-tokens` + decay sensível a custo; `--best-of N` degrada sob pressão (RNF-07) |
| Falsa sensação de segurança pelo scan fraco | Média | Alto | Garantia em trust boundaries + tamper-evidence; scan vai a `WARN`, documentado como best-effort |
| Artefato assinado-e-envenenado passa | Média | Alto | Assinados **também** passam por unicode+scan; risco residual (insider) explicitamente fora de escopo |
| Internalizar o driver acaba importando LLM no caminho determinístico | Média | Alto | SDK como `optionalDependency` + lazy `import()`; teste que falha se algum import de LLM aparecer fora do `AgentDriver` (O-02/D-002) |
| Falso-positivo do guard trava execução legítima | Média | Médio | Default `WARN` (não bloqueia); só `FAIL` em tamper/unicode-block; fixtures de FP |
| Gerência de chave de assinatura | Média | Médio | v1 começa com digest+proveniência; assinatura opt-in (RF-13) |
| Ataque adaptativo contorna o scan | Alta | Médio | 2510.09023: por isso a defesa real é arquitetural, não detecção; tamper-evidence é não-contornável por texto |

## Checklist de Aprovação

- [ ] O recorte em duas partes (executor v3.9.0 + gate v3.10.0) na mesma DESIGN é aceitável
- [x] **Driver internalizado no `dare-cli`** (D-002), SDK `optionalDependency` lazy — aprovado
- [x] **Default `--require-approval rank`** (conservador) — aprovado
- [ ] "Segurança por arquitetura, não detecção" (scan como `WARN` best-effort) é aceito
- [ ] O threat model do RFC §3 (externo sem privilégio; insider fora de escopo) está correto
- [ ] Exit code 6 para guard-fail é a alocação aprovada (convenção 0/1/3/4/5 verificada)
- [x] **Assinatura: minisign / Ed25519** (D-003) — decidido
- [ ] O "Fora do Escopo" (nested DAG, dashboard, drift, CI/PR, semântica, DARE-ChainSec) é aceitável
- [ ] As metas numéricas (O-01…O-08) são realistas e mensuráveis

---

> **Próximo passo:** após aprovação deste DESIGN, rodar `/dare-blueprint` para a Fase Architect
> (interface `AgentDriver` e contrato do pacote opcional; arquitetura das 3 camadas do `guard` e do
> modelo de capabilities/assinatura; pontos de integração no `execute.ts` e na rota `/steering`).
> Target: **v3.9.0** (executor) → **v3.10.0** (gate).
