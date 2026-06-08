# Feature Design: Agent Hooks + Steering Files

> Gerado seguindo o próprio Método DARE (Fase D — Design). Artefato para **revisão humana**
> antes de avançar ao `/dare-blueprint`. License: MIT (parte do DARE Method).
>
> **Base de evidências:** sem paper. Fundamentação por **competidor** (AWS Kiro — *agent hooks* +
> *steering files*; Agent OS — *standards*) e pela tese de **context engineering just-in-time**
> (injetar a convenção certa no momento certo, em vez de prompt fixo). ID de ideia: **`idea-6`**
> (casa com `DARE-METHOD-Analise-e-Proposta.md`). **Target: v3.6.0** (repo em v3.5.0;
> v3.3.0 verification-core + v3.4.0 security-hardening + v3.5.0 dual-graph já entregues).

## Contexto no Projeto Existente

Hoje o DARE já tem **duas peças** do que esta feature unifica, mas **nenhum mecanismo de eventos**:

1. **Convenções persistentes do projeto já existem** — `dare dna` extrai a *house-style* de forma
   100% determinística (sem LLM) e escreve `DARE/PROJECT-DNA.md`
   (`packages/cli/src/commands/dna.ts:48`; extração em `packages/cli/src/utils/dna-detector.ts:338`
   → linters/formatters/naming/arquitetura/libs/commits; skeleton em
   `packages/cli/src/utils/dna-facts.ts:50`). O PROJECT-DNA é exatamente um *steering file* avant la
   lettre — só que **não é injetado** automaticamente no contexto do agente.

2. **O contexto é exposto às IDEs via MCP** — o servidor lê `BLUEPRINT.md`, `TASKS.md`,
   `dare-dag.yaml` e `dare.config.json` e responde a `POST /context/query`
   (`packages/cli/src/mcp-server/server.ts:55`, `:229`; re-export em
   `packages/cli/src/mcp-server/index.ts:1`). É o canal natural para **injetar steering** —
   mas hoje não há rota que sirva convenções/steering.

3. **Skills são instaladas por IDE** em três layouts distintos: `.claude/commands/*.md`,
   `.cursor/commands/*.md` + `.cursor/rules/*.mdc`, e `.agents/skills/<nome>/SKILL.md`
   (ver `implementations/{claude,cursor,antigravity}/`). A camada semântica (LLM) vive sempre nas
   skills; o CLI é determinístico.

4. **Já existe UM hook — mas só pre-commit e git-only, não disparado por evento de IDE:**
   `packages/cli/templates/hooks/pre-commit-dare-validate:17` roda `dare validate --strict` quando
   artefatos DARE são staged. O exemplo de IDE-hook do Claude
   (`implementations/claude/.claude/settings.example.json:22` — `PostToolUse`/`Write` →
   `echo "...Ralph Loop..."`) prova que o gancho **existe na IDE**, mas é manual, hardcoded e não
   orquestrado pelo DARE.

**O gap competitivo:** Kiro e Agent OS disparam automações por evento (on-save → lint; on-create →
registrar) e injetam *standards* como contexto. O DARE tem as peças (PROJECT-DNA + MCP), mas falta a
**cola**: (a) um modelo declarativo de *hooks por evento* orquestrado pelo CLI e (b) uma camada de
*steering files* que reusa o PROJECT-DNA e é servida via MCP. Esta feature fecha esse gap (`idea-6`).

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | Suportar um conjunto fechado de eventos | Nº de tipos de evento implementados e documentados | ≥ 4 (`on-save`, `on-file-create`, `on-task-complete`, `pre-commit`) |
| O-02 | Steering files reduzem violações de padrão (retrabalho) | Δ violações de lint/naming por task com steering injetado vs. sem, em fixture | −30% violações |
| O-03 | `on-task-complete` dispara `dare review` automaticamente | % de tasks marcadas DONE que passaram por review disparado por hook | ≥ 95% das tasks elegíveis |
| O-04 | PROJECT-DNA reusado como steering base (sem duplicação) | Steering "base" deriva de `PROJECT-DNA.md` existente; zero re-extração de convenções | 1 fonte canônica (`dna-detector`), 0 forks |
| O-05 | Adoção sem fricção (opt-in) | Projetos sem config de hooks mantêm comportamento idêntico ao v3.2.0 | 100% retrocompatível |
| O-06 | Hooks não travam a IDE | p95 do overhead do *dispatch* determinístico do hook (sem a etapa LLM) | < 300 ms |
| O-07 | (SHOULD) Steering com precedência previsível | Resolução de conflito entre múltiplos steering files é determinística e testada | regra de precedência única, coberta por teste |

## Stakeholders

| Papel | Pessoa/Time | Interesse principal |
|---|---|---|
| Autor do método | Wanderson / Dewtech | Paridade competitiva com Kiro/Agent OS; diferencial defensável |
| Usuário (dev) | Adotantes do DARE CLI/IDE | Automação útil sem ruído; convenções aplicadas sem copiar/colar regra |
| Mantenedores CLI | Dewtech | Reuso de `dna-detector` e MCP; sem god-file; sem nova superfície de ataque |
| Mantenedores de skills/IDE | Dewtech | Mesmo contrato de hook funcionando nas 3 IDEs apesar de mecanismos distintos |

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | **Definição declarativa de hooks** em `dare.config.json` (chave `hooks`) ou `.dare/hooks/*.yaml` | MUST | `dare hooks list` enumera os hooks declarados; schema validado; arquivo ausente = zero hooks (opt-in) |
| RF-02 | **Eventos suportados** (conjunto fechado v1): `on-save`, `on-file-create`, `on-task-complete`, `pre-commit` | MUST | Cada evento tem nome canônico, payload documentado e ao menos um exemplo; eventos fora da lista são rejeitados na validação |
| RF-03 | **Ação determinística do hook** = comando da **allowlist** (ex.: `dare validate`, `dare review`, `lint`) — nunca shell arbitrário | MUST | Ação resolve para um binário/subcomando da allowlist (RS-01); `spawn` por argv, `shell:false` |
| RF-04 | **`on-task-complete` → `dare review`** automático | MUST | Marcar task DONE (via MCP `PUT /tasks/:id`, `server.ts:195`) dispara `dare review` da área tocada; resultado registrado (RF-10) |
| RF-05 | **`on-file-create` → registrar no grafo** | SHOULD | Criação de arquivo dispara registro do nó no GraphRAG (`task --touches--> file`), reusando a telemetria existente |
| RF-06 | **Steering files: formato e descoberta** — markdown com front-matter (`scope`, `glob`, `priority`), descobertos em `.dare/steering/*.md` + o `DARE/PROJECT-DNA.md` como base | MUST | `dare steering list` lista arquivos descobertos, seu `scope`/`glob` e a ordem de precedência resolvida |
| RF-07 | **Steering: precedência e resolução de conflito** | MUST | Ordem determinística: PROJECT-DNA (base) < steering global < steering por-glob mais específico; empate por `priority`; documentada e testada (O-07) |
| RF-08 | **Reuso do PROJECT-DNA como steering base** (NÃO duplicar `dna-detector`) | MUST | Steering "base" é derivado de `DARE/PROJECT-DNA.md` (`dna.ts:48`); a extração continua só em `dna-detector.ts` — a feature **lê**, não re-extrai |
| RF-09 | **Injeção de steering via MCP** — nova rota que serve o steering aplicável a um arquivo/escopo | MUST | `GET /steering?file=<rel>` (no `mcp-server/server.ts`) retorna os blocos de steering resolvidos por precedência (RF-07); JSON estável |
| RF-10 | **Hook respeita a regra de ouro** — o CLI orquestra/registra; a etapa que envolve LLM fica na skill da IDE | MUST | O `dispatch` do hook no CLI é determinístico; se a ação precisa de LLM (ex.: "review semântico"), o CLI emite o gatilho e a **skill** executa o raciocínio |
| RF-11 | **`dare hooks` CLI** — `list` / `run <event>` / `validate` | SHOULD | `dare hooks run on-task-complete --task TASK-007` executa o dispatch e retorna exit-code; `validate` checa schema + allowlist |
| RF-12 | **Telemetria do hook** — registrar disparo/resultado no GraphRAG | SHOULD | `dare graph` mostra `hook --triggered_by--> event` e `hook --produced--> verdict` |

## Requisitos Não-Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Não travar a IDE** — dispatch determinístico rápido; ações longas (review LLM) são assíncronas/delegadas à skill | overhead síncrono p95 < 300 ms (O-06) |
| RNF-02 | **Idempotência** — re-disparar o mesmo hook sobre o mesmo estado não produz efeito duplicado | `on-file-create` registra o nó uma única vez; `on-task-complete` não re-revisa estado inalterado (hash/guard) |
| RNF-03 | **Opt-in / retrocompatível** — sem `hooks`/`.dare/steering` o comportamento é o de v3.2.0 | ausência de config = nenhum hook, nenhuma injeção (O-05) |
| RNF-04 | **Observabilidade** — logs estruturados (pino, como em `server.ts:7`); sem `console.log` solto no dispatch | cada disparo logado com evento, ação, alvo, veredito |
| RNF-05 | **Manutenibilidade** — dispatcher e resolvedor de steering isolados; sem god-file | cada handler de evento é um módulo; cobertura do núcleo ≥ 80% |
| RNF-06 | **Portabilidade** — Windows (CRLF) e POSIX; sem dependência de shell POSIX no dispatch | suíte de fixture verde nos dois SOs |

## Requisitos de Segurança

| ID | Requisito | Referência |
|---|---|---|
| RS-01 | **Sem comando arbitrário** — a ação de hook só pode resolver para um item de uma **allowlist** explícita (`dare *`, `lint`, `test`…); qualquer outro valor falha na validação | OWASP A03 (injeção); paridade com a regra "sem `shell:true`" do verification-core |
| RS-02 | **Sem `shell:true`** — execução por `spawn(cmd, argv)` com `shell:false`; payload de evento nunca interpolado em string de shell | OWASP A03 |
| RS-03 | **Steering files validados** — front-matter conforme schema; `glob`/`scope` sanitizados; caminhos relativos sem `..`/absolutos (reusar `assertRelativeSafe` do verification-core) | OWASP A01/A03 |
| RS-04 | **Sem segredos** — steering files e logs de hook não capturam `.env`/tokens; `.env*` jamais lido como steering | OWASP A02/A05 |
| RS-05 | **Hooks de repositório clonado são desarmados por padrão** — config de hooks vinda de um repo de terceiros exige consentimento explícito (não auto-executa em `clone`/`open`) | OWASP A08 (deserialização/confiança); ver Riscos |
| RS-06 | **Allowlist é local e auditável** — definida no projeto, versionada; mudanças aparecem no diff | OWASP A05 |

## Stack Técnica

| Camada | Tecnologia | Versão/Nota |
|---|---|---|
| CLI / dispatcher | TypeScript + Node | ≥18 (já existente) |
| Servidor de contexto | Express + MCP (`mcp-server/server.ts`) | estender com rota `/steering` (RF-09) |
| Config | `dare.config.json` (`server.ts:229`) + `.dare/hooks/*.yaml` + `.dare/steering/*.md` | schema validado (Zod já é dependência do ecossistema) |
| Fonte de convenções | `dna-detector.ts` → `PROJECT-DNA.md` | **reuso**, sem fork (RF-08) |
| Execução de ação | `node:child_process.spawn` argv, `shell:false` | RS-01/RS-02 |
| Grafo / telemetria | GraphRAG backend JSON (seguro) | reuso da telemetria; evitar Neo4j |
| Logs | pino | já usado (`server.ts:7`) |

## Integrações Externas

| Sistema | Mecanismo de hook nativo | Como o DARE integra | Status |
|---|---|---|---|
| **Claude Code** | `settings.json` → `hooks.PostToolUse`/`PreToolUse` por `matcher` (`settings.example.json:22`) | DARE gera entradas que chamam `dare hooks run <event>`; matcher `Write`→`on-save` | **Confirmado** (exemplo já existe) |
| **Cursor** | rules `.cursor/rules/*.mdc` (steering) + comandos `.cursor/commands/*.md` | Steering via rules; hook-on-event nativo do Cursor — **A confirmar** se há gatilho de evento equivalente | **A confirmar** |
| **Antigravity** | skills `.agents/skills/<nome>/SKILL.md` | Steering injetado como contexto da skill; gatilho por evento nativo — **A confirmar** | **A confirmar** |
| **git** | `pre-commit` (`templates/hooks/pre-commit-dare-validate:17`) | `pre-commit` mapeia direto para o hook git já existente | **Confirmado** |
| IDE skills (camada semântica) | MCP / arquivos | CLI emite o gatilho; a skill faz o raciocínio LLM | regra da casa: LLM fora do CLI |

> Como cada IDE expõe eventos de forma diferente, o contrato canônico vive no **DARE** (eventos
> RF-02 + dispatcher); cada IDE recebe um **adapter** fino que traduz seu mecanismo nativo para o
> gatilho `dare hooks run <event>`. Onde a IDE não tiver evento nativo, cai-se em `pre-commit`/manual.

## Restrições

- **Regra de ouro da casa:** o **CLI é 100% determinístico** — ele *orquestra e registra* hooks e
  *resolve* a precedência de steering, mas **não chama LLM**. A execução semântica do hook (ex.: o
  "review" que raciocina sobre o diff) é da **skill** da IDE, igual a `design`/`blueprint`/`review`.
  Hooks determinísticos (lint, validate, registro no grafo) rodam no CLI.
- **Reuso obrigatório:** convenções vêm de `dna-detector.ts`/`PROJECT-DNA.md` — proibido um segundo
  extrator (RF-08).
- **Conjunto fechado de eventos na v1:** nada de eventos definidos pelo usuário (escopo fino).
- **Windows-first dev:** CRLF e ausência de shell POSIX são restrições reais (RNF-06).
- **Opt-in:** a feature é inerte sem config (RNF-03).

## Fora do Escopo (v1)

- **Marketplace / registry de hooks** compartilháveis entre projetos.
- **Hooks remotos** (disparados por webhook/CI externo) — v1 é local à IDE/repo.
- **Eventos definidos pelo usuário** (apenas o conjunto fechado de RF-02).
- **Ações de hook que não estejam na allowlist** (sem escape-hatch para shell arbitrário).
- **Steering com herança entre projetos / monorepo cross-package** — v1 é por projeto.
- **Geração automática de steering por LLM** — v1 reusa PROJECT-DNA + arquivos escritos à mão; a
  síntese semântica fica na skill `/dare-dna`, não no CLI.

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| **Repo malicioso traz hooks que executam código não confiável ao abrir/clonar** | Média | **Crítico** | RS-05: hooks de config não auto-executam; consentimento explícito; RS-01 allowlist; RS-02 sem `shell:true` |
| Divergência entre as 3 IDEs (mecanismos de evento distintos) | Alta | Médio | Contrato canônico no DARE + adapter fino por IDE; "A confirmar" marcado nas Integrações; fallback `pre-commit` |
| Hook travando a IDE (ação síncrona lenta) | Média | Alto | RNF-01: dispatch rápido; ação LLM é assíncrona/delegada à skill (RF-10) |
| Steering duplica/contradiz PROJECT-DNA | Média | Médio | RF-08 reuso único; RF-07 precedência determinística e testada |
| Disparos em loop / efeito duplicado (ex.: review dispara save dispara review) | Média | Alto | RNF-02 idempotência + guard por hash de estado; evitar eventos que se realimentam |
| Steering grande estoura o contexto injetado via MCP | Baixa | Médio | Servir só o steering aplicável ao `file`/`scope` consultado (RF-09), não tudo |
| Allowlist mal configurada bloqueia ações legítimas | Baixa | Baixo | `dare hooks validate` reporta ação fora da allowlist com mensagem acionável |

## Checklist de Aprovação

- [ ] O gap competitivo (Kiro/Agent OS têm hooks+steering; DARE não) está corretamente capturado e vale o investimento
- [ ] O escopo (`idea-6`, conjunto fechado de eventos) está certo e os itens "Fora do Escopo" são aceitáveis para v1
- [ ] As metas (O-01…O-07) são realistas e mensuráveis
- [ ] A regra de ouro (CLI determinístico orquestra; LLM na skill) foi respeitada (RF-10)
- [ ] O **reuso** do PROJECT-DNA/`dna-detector` (sem fork) está garantido (RF-08)
- [ ] A injeção via MCP (`/steering`) e a precedência (RF-07) estão bem definidas
- [ ] Os requisitos de segurança — allowlist (RS-01), sem `shell:true` (RS-02), repo não confiável (RS-05) — entram antes ou junto
- [ ] As lacunas "A confirmar" das IDEs (Cursor/Antigravity) têm dono para resolver no Blueprint

---

> **Próximo passo:** após aprovação deste DESIGN, rodar `/dare-blueprint` para a Fase Architect
> (schema de `hooks`/steering, contrato do dispatcher, rota MCP `/steering`, adapters por IDE,
> allowlist canônica, lista de tasks). Target de release: **v3.3.0**.
