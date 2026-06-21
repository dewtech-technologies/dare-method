# Feature Design: Terminal ↔ Chat Parity (assistente de código unificado no terminal)

> Gerado seguindo o próprio Método DARE (Fase D — Design). Artefato para **revisão humana**
> antes de avançar ao `/dare-blueprint`. License: MIT.
>
> **Base de evidências:** continua o trabalho da branch `codex/cli-core-agent-providers`
> (commits `972c80c` Codex driver + skills no core; `5a74f01` camada `dare ai` + `--ai`;
> `793d19c` apply de blueprint/refine). Reusa o `AgentProvider` (codex, claude-code, cursor-cli,
> antigravity-cli, mock), o pipeline `facts → provider → JSON validado → artefato`, o dag-runner,
> guard e GraphRAG existentes. **Target: v3.12.0** (repo em v3.11.0).

## Contexto no Projeto Existente

Hoje o DARE tem **duas formas de acionar a inteligência** de cada fase:

1. **Chat da IDE** — o usuário roda `/dare-reverse`, `/dare-dna`, `/dare-blueprint`, etc. e a LLM
   da IDE (Cursor / Antigravity / Claude Code / Codex) lê os facts determinísticos e **escreve a
   parte semântica** dos artefatos.
2. **Terminal** — `dare reverse`, `dare dna`, … rodam a **heurística determinística** e, desde a
   branch atual, aceitam `--ai` para acionar um `AgentProvider` no terminal.

O problema: **a paridade é parcial e implícita**. Alguns comandos (`reverse`, `dna`, `design`,
`blueprint`, `refine`) já mesclam a saída da IA nos artefatos via `--ai`; outros (`migrate`,
`review`) ainda dependem de sidecar JSON ou de `--from-agent`. Além disso, o `dare execute --agent`
só tem driver real para `codex`, `claude` e `mock` — **`cursor-cli` e `antigravity-cli` existem
como provider de enrichment, mas não como executor de tasks**.

A consequência é que **o comando do terminal NÃO tem, hoje, o mesmo poder do comando no chat da
LLM** para todos os comandos. Esta feature fecha essa lacuna: estabelece um **contrato de paridade**
verificável — para todo comando com fase semântica, `dare <cmd> --ai` produz o **mesmo artefato
final** que a skill `/dare-<cmd>` produziria no chat, usando o mesmo provider configurado.

A filosofia continua **terminal-first**, mas o **chat da IDE permanece um caminho de primeira
classe** (não é descontinuado). O usuário escolhe; os dois convergem para o mesmo resultado.

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | Paridade terminal ↔ chat | Para cada comando semântico, `dare <cmd> --ai` e `/dare-<cmd>` produzem artefato equivalente (mesmas seções preenchidas) | **100%** dos comandos semânticos |
| O-02 | Um único contrato de provider | Todos os comandos usam a mesma interface `AgentProvider` | 1 interface, 0 caminhos paralelos |
| O-03 | Multi-provider real | `codex`, `claude-code`, `cursor-cli`, `antigravity-cli` selecionáveis por flag/config em **enrichment e execução** | 4 providers terminais |
| O-04 | Liberdade de chat preservada | Skills `/dare-*` continuam funcionando sem regressão | 0 skills removidas; parity test verde |
| O-05 | Saída sempre validada | IA nunca grava texto livre como verdade; tudo passa por schema | **0** artefatos sem validação de schema |
| O-06 | Determinismo preservado | Heurística roda sempre; IA é camada opcional por cima | heurística LLM-free em 100% dos comandos |

## Stakeholders

| Papel | Pessoa/Time | Interesse principal |
|---|---|---|
| Autor do método | Wanderson / Dewtech | Terminal com o mesmo poder do chat; liberdade de alternar |
| Usuário (dev) | Adotantes do DARE | Rodar tudo no terminal OU no chat, com resultado idêntico |
| Mantenedores CLI | Dewtech | Um só contrato de provider; menos superfície duplicada |

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | **Contrato de paridade** — para cada comando semântico, `--ai` cobre o que a skill `/dare-<cmd>` faz | MUST | Doc + teste mapeiam comando → seções que a IA deve preencher |
| RF-02 | **Apply completo em todos** — `migrate` e `review` mesclam a saída da IA no artefato final (nível `reverse`) | MUST | `dare migrate --ai` reescreve MIGRATION.md; `dare review --ai` injeta veredito sem `--from-agent` |
| RF-03 | **Drivers de execução multi-provider** — `cursor-cli` e `antigravity-cli` viram `AgentDriver` no `dare execute --agent` | MUST | `dare execute --agent --driver cursor` e `--driver antigravity` rodam ou falham com mensagem clara |
| RF-04 | **Resolução única de provider** — flag `--provider` > `dare.config.json ai.defaultProvider` > default, igual em todos os comandos | MUST | Um helper compartilhado resolve provider; testado |
| RF-05 | **`dare ai doctor` cobre execução** — detecta disponibilidade de cada provider para enrichment E execução | SHOULD | `doctor` lista os 4 providers com status e capacidade |
| RF-06 | **Skills `/dare-*` apontam para `--ai`** — cada skill documenta o equivalente terminal | SHOULD | Skill de cada comando cita `dare <cmd> --ai` como caminho terminal |
| RF-07 | **Modo `--json` em todos os comandos `--ai`** — saída machine-readable para CI/agentes | SHOULD | `dare <cmd> --ai --json` emite resultado estruturado |
| RF-08 | **Fallback explícito** — provider indisponível => erro claro, nunca silêncio ou texto não validado | MUST | Provider ausente sai com exit≠0 e instrução |

## Requisitos Não-Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Determinístico por baixo** | heurística roda e grava facts antes de qualquer IA |
| RNF-02 | **Compat retroativa** | sem `--ai`, comportamento atual inalterado; chat inalterado |
| RNF-03 | **Sem SDK de LLM no core** | só `agent/drivers/claude.ts` pode importar SDK; resto via subprocess (mantém `no-llm-in-core.test.ts` verde) |
| RNF-04 | **Subprocess seguro** | todos os providers usam `safeSpawn` (env sanitizado, timeout, output capado) |
| RNF-05 | **Paridade testável** | teste estende `ide-command-parity` para capacidade, não só existência |

## Requisitos de Segurança

| ID | Requisito | Mapeamento |
|---|---|---|
| RS-01 | Output da IA validado por schema antes de tocar arquivo | **A03**; reusa `ai/schemas.ts` (zod) |
| RS-02 | Subprocess de provider com env sanitizado + timeout | **A05**; reusa `exec/safe-spawn.ts` |
| RS-03 | Artefatos gerados passam pelo guard quando aplicável | herda guard pre-flight do executor |
| RS-04 | Sem vazar API key em prompt/telemetria | provider nunca ecoa env; só passa pelo subprocess |

## Stack Técnica

| Camada | Tecnologia | Nota |
|---|---|---|
| Contrato de provider | `ai/providers.ts` + `ai/registry.ts` | reuso — já existe |
| Pipeline de enrichment | `ai/pipeline.ts` (`runCommandEnrichment`) | estendido p/ migrate/review |
| Schemas | `ai/schemas.ts` (zod) | reuso |
| Execução de task | `agent/drivers/*` + `commands/execute.ts` | + cursor/antigravity drivers |
| Resolução de provider | helper compartilhado (novo) | unifica execute + enrichment |
| Paridade IDE | `implementations/*` + parity test | estendido |

## Integrações Externas

| Sistema | Tipo | Direção | Dados | Responsável |
|---|---|---|---|---|
| Codex CLI | subprocess | bidir | prompt/JSON | `CodexAiProvider` / `codex` driver |
| Claude Code CLI | subprocess | bidir | prompt/JSON | `ClaudeCodeAiProvider` |
| Cursor CLI (`cursor-agent`) | subprocess | bidir | prompt/JSON | `CursorCliAiProvider` / novo driver |
| Antigravity CLI | subprocess | bidir | prompt/JSON | `AntigravityCliAiProvider` / novo driver |
| GraphRAG | telemetria | escrita | provider, tokens, comando | pipeline |

## Restrições

- **Reuso, não reinvenção:** o `AgentProvider` e o pipeline já existem; esta feature **completa a
  cobertura** (migrate/review/execução) e **formaliza o contrato**, não recria a camada.
- **Chat é primeira classe:** nenhuma skill `/dare-*` é removida; o terminal **iguala**, não substitui.
- **Determinístico por baixo:** a heurística sempre roda; a IA é uma camada opcional e validada.
- **Sem automatizar UI de IDE:** integração só via CLI/SDK oficial de cada ferramenta; provider
  indisponível => marcado como tal (nada de roubar token interno ou dirigir a UI).

## Fora do Escopo (v1)

- **Migração para Go/Rust** — permanece adiada (decisão do diagnóstico anterior).
- **Faxina CLI-only** (remover `packages/docs`, `packages/website`) — feature separada.
- **AST profunda no brownfield** — a heurística regex permanece; a IA cobre o gap semântico.
- **SaaS/multi-tenant/billing** — fora; o produto segue local-first.
- **Paralelismo novo entre providers** — usa o que o dag-runner já faz.

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| CLIs de Cursor/Antigravity instáveis ou ausentes | Alta | Médio | Provider faz probe; ausente => `unavailable` + erro claro (RF-08) |
| Divergência terminal vs chat com o tempo | Média | Alto | Teste de paridade por capacidade (RNF-05) trava o contrato |
| IA devolve JSON inválido | Média | Médio | Validação por schema; falha => exit≠0, artefato não tocado (RS-01) |
| Flags de provider divergem entre comandos | Média | Médio | Resolução única num helper compartilhado (RF-04) |
| Quebra de compat para quem usa Claude SDK | Baixa | Alto | Sem `--ai`/sem config nova => caminho atual intacto (RNF-02) |

## Checklist de Aprovação

- [ ] O **contrato de paridade** (terminal `--ai` ≡ chat `/dare-*`) é o recorte certo
- [ ] Completar apply em `migrate` e `review` (nível `reverse`) é prioridade MUST
- [ ] Adicionar `cursor-cli` e `antigravity-cli` como **drivers de execução** é aprovado
- [ ] Manter o chat da IDE como caminho de primeira classe (não descontinuar) é o desejado
- [ ] "Fora do escopo" (Go/Rust, faxina, AST, SaaS) é aceitável para a v1
- [ ] Resolução única de provider (flag > config > default) é a abordagem aprovada

---

> **Próximo passo:** após aprovação, `/dare-blueprint` — desenho do helper de resolução de provider,
> os novos drivers de execução, o apply de migrate/review e o teste de paridade por capacidade.
> Target: **v3.12.0**.
