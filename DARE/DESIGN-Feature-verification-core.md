# Feature Design: Núcleo de Verificação Confiável (Reliable Verification Core)

> Gerado seguindo o próprio Método DARE (Fase D — Design). Artefato para **revisão humana**
> antes de avançar ao `/dare-blueprint`. License: MIT (parte do DARE Method).
>
> **Base de evidências:** cada decisão é fundamentada por papers catalogados em
> `pesquisas-estrategicas/papers-dare/` (cards + `knowledge-graph.json`). IDs de ideia
> (`idea-1`,`idea-2`,`idea-3`,`idea-9`,`idea-11`) e de task (`kb-task-*`) casam com o relatório
> `DARE-METHOD-Analise-e-Proposta.md` e com a base de conhecimento.

## Contexto no Projeto Existente

O coração do DARE é o **Ralph Loop** (`packages/cli/src/dag-runner/ralph-loop.ts` + `commands/execute.ts`):
a IA implementa uma task, roda os **Validation Gates** (build + test + lint + type-check) e itera até
ficarem verdes. Hoje o critério de "concluído" é **"os testes passam"**. A pesquisa de fronteira mostra
que isso é insuficiente em três frentes:

1. **"Testes passam" ≠ "correto".** Em SWE-Bench Verified, **~1 em 5 patches** "resolvidos" no topo é
   semanticamente errado e só passa porque a suíte é fraca — fortalecer com *slicing* + mutação adversarial
   derruba o top agent de **78.8% → 62.2%** (−16.6 pp) e rejeita **19.78%** dos patches antes aceitos
   (`idea-1`, arXiv:2603.00520; reforço: 2507.06920, 2602.10522).
2. **O loop itera demais.** O *debugging* satura tipicamente em **≤3 iterações**; 15 tentativas extras após
   a 5ª rendem só **+2.4%**. Um *fresh start* (reset de contexto) no ponto de saturação melhorou **todos** os
   6 modelos testados **e reduziu tokens** (`idea-3`, arXiv:2506.18403, 2304.05128). O DARE hoje usa um cap
   fixo de tentativas — e até o número desse cap é contraditório na própria doc (`ralph-loop.md`).
3. **O DARE não se mede.** Não há harness que diga o *solve-rate* do método por release — qualquer regressão
   de qualidade é invisível (`idea-9`, arXiv:2310.06770, 2512.18470).

Além disso, o DARE **já possui** uma capacidade subexplorada: o runner roda tasks em **git worktrees isolados**
(`dare-dag-run-parallel`). Isso habilita, quase de graça, **best-of-N**: gerar N candidatos por task e
selecionar o melhor por um verificador — técnica que leva GSM8K de **73% → 93.4%** com gerador fixo
(`idea-2`, arXiv:2408.15240, 2502.20379).

Esta feature transforma o gate binário atual em um **Núcleo de Verificação Confiável**: o "verde" passa a
significar *correto e robusto*, não apenas *passou na suíte que existia*.

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | Gate detecta patches que passam em testes fracos | Taxa de rejeição em fixture de "patches sabidamente errados" (mutantes não mortos) | ≥ 90% rejeitados |
| O-02 | Mutation testing como parte do gate | `mutation score` mínimo configurável por stack, bloqueando DONE abaixo do limiar | score ≥ 70% (default, ajustável) |
| O-03 | Testes fail-to-pass como spec executável antes do código | % de tasks com suíte fail-to-pass válida registrada antes do Execute | ≥ 80% das tasks elegíveis |
| O-04 | Best-of-N eleva qualidade usando worktrees existentes | Δ pass-rate do candidato selecionado vs. single-shot em suite de fixtures | +10 pp (alinhado à literatura) |
| O-05 | Ralph Loop decay-aware reduz desperdício sem perder eficácia | Tokens/​task vs. baseline, mantendo solve-rate | −15% tokens, solve-rate ≥ baseline |
| O-06 | Harness SWE-bench/Fix·Rate por release | `solve-rate` + `Fix·Rate` calculados no CI a cada release; regressão falha o gate | publicado todo release; regressão > 3 pp = ❌ |
| O-07 | (SHOULD) Pré-ranqueamento execution-free reduz custo de execução | % de candidatos descartados antes do gate caro, sem perder o melhor | −30% execuções de teste |

## Stakeholders

| Papel | Pessoa/Time | Interesse principal |
|---|---|---|
| Autor do método | Wanderson / Dewtech | Coerência com a filosofia DARE; diferencial defensável vs. concorrentes |
| Usuário (dev) | Adotantes do DARE CLI/IDE | "Verde" confiável; menos retrabalho por patch errado que passou |
| Mantenedores CLI | Dewtech | Reuso do runner/worktrees; testabilidade; sem nova dívida técnica |
| Pesquisa/Estratégia | Dewtech | Métrica de solve-rate defensável; base científica rastreável |

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | Gate de **mutation testing** plugável por stack (Stryker p/ JS-TS, mutmut p/ Python, cargo-mutants p/ Rust, Infection p/ PHP) | MUST | `dare execute --complete` roda mutação na área tocada; bloqueia DONE se `mutation score < limiar` configurado em `dare.config.json` |
| RF-02 | Geração de **testes fail-to-pass antes da implementação** (a partir da task/DESIGN), versionados como spec executável | MUST | Existe artefato `EXECUTION/task-NNN.tests.*` que **falha** contra o código vazio e é exigido pelo gate (`idea-1`) |
| RF-03 | Verificação de que os **testes não foram enfraquecidos** pelo executor (anti-trapaça) | MUST | Gate compara cobertura/asserções antes×depois; reprova se a suíte foi relaxada (slicing + mutação, arXiv:2603.00520) |
| RF-04 | Modo **best-of-N** no runner: gera N candidatos por task em worktrees isolados e seleciona por verificador | SHOULD | `dare execute --best-of N` produz N worktrees, aplica o seletor (RF-05) e promove 1; demais descartados/arquivados (`idea-2`) |
| RF-05 | **Seletor por verificador** (ensemble de gates como aspectos: test, lint, type, mutation) com voto | SHOULD | Seleção escolhe o candidato Pareto-dominante; empate resolvido por mutation score (arXiv:2502.20379) |
| RF-06 | **Política decay-aware** do Ralph Loop: detectar saturação (mesma assinatura de falha / curva de decaimento) e disparar *fresh-start* (reset de contexto), *re-plan* ou **escalonar ao humano** | MUST | Substitui o cap fixo; configurável `loop.policy: decay`; regra de abort **canônica e única** (resolve a contradição de `ralph-loop.md`) (`idea-3`) |
| RF-07 | **Harness de regressão** `dare bench`: roda um conjunto de tarefas-fixture fim-a-fim e reporta `solve-rate` e `Fix·Rate` | MUST | `dare bench --suite fixtures/` emite JSON + tabela; `Fix·Rate(i)=#fail-to-pass que passam/|fail-to-pass|`, zerado se algum pass-to-pass regredir (arXiv:2512.18470) |
| RF-08 | Integração do harness no **CI por release** com gate de regressão | MUST | Workflow falha se `solve-rate` cair > limiar vs. release anterior (`idea-9`) |
| RF-09 | (COULD) **Verificador execution-free** opcional para pré-ranquear candidatos antes do gate caro | COULD | `--prerank` ordena candidatos; reportar AUC/ECE em fixtures; nunca substitui o gate, só prioriza (arXiv:2512.21919) (`idea-11`) |
| RF-10 | Telemetria do gate: registrar no GraphRAG (nós/arestas) o resultado de cada verificação por task | SHOULD | `dare graph` mostra `task --verified_by--> gate` com mutation score e veredito |

## Requisitos Não-Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Performance** — mutation testing é caro; deve rodar incremental (só na área tocada pela task) | Overhead do gate < 3× o tempo de teste normal da task; suporte a timeout/limite de mutantes |
| RNF-02 | **Custo** — best-of-N multiplica tokens; N default conservador e budget-aware | N default = 3; respeitar orçamento de tokens; abortar cedo em decaimento (O-05) |
| RNF-03 | **Manutenibilidade** — gates plugáveis via registry, sem god-file | Cada ferramenta de mutação é um adapter isolado; cobertura de teste do próprio núcleo ≥ 80% |
| RNF-04 | **Observabilidade** — logs estruturados (pino) do gate e do loop; sem `console.log` solto | Cada veredito logado com task id, score, motivo |
| RNF-05 | **Portabilidade** — funciona em Windows (CRLF) e POSIX | Suites de fixture rodam verdes nos dois; sem dependência de shell POSIX |
| RNF-06 | **Compatibilidade** — não quebra projetos sem a config nova | Núcleo é opt-in; ausência de `verification.*` mantém o comportamento atual |

## Requisitos de Segurança

| ID | Requisito | Referência |
|---|---|---|
| RS-01 | Validação de entrada: caminhos de fixtures/worktrees validados (sem `..`/absolutos) reusando `assertRelativeSafe` | OWASP A03; corrige a inconsistência H3 do audit |
| RS-02 | Proteção de dados: artefatos de bench/telemetria não contêm segredos; `.env`/tokens nunca capturados nos logs do gate | OWASP A02 |
| RS-03 | Controle de execução: testes/mutantes gerados rodam **sandboxed**, no worktree isolado, sem rede por padrão | OWASP A01 |
| RS-04 | Dependências (Stryker, mutmut, etc.) auditadas sem CVE HIGH/CRITICAL; gate `pnpm audit --prod` mantido | OWASP A06 |
| RS-05 | Segredos do harness (ex.: dataset/credenciais SWE-bench, modelo verificador) via env vars — nunca em código | OWASP A05 |
| RS-06 | **Sem execução de código arbitrário fora do gate**: o runner não passa conteúdo de task por shell (`spawn` argv, sem `shell:true`) | corrige H2 do audit; pré-requisito do `kb-task-ralph-shell` |
| RS-07 | O verificador execution-free (RF-09) **nunca** autoriza DONE sozinho — é apenas heurística de priorização | evita falso-verde |

## Stack Técnica

| Camada | Tecnologia | Versão/Nota |
|---|---|---|
| CLI / runner | TypeScript + Node | ≥18 (já existente) |
| Test runner | Vitest (núcleo) + runners por stack | já existente |
| Mutation — JS/TS | StrykerJS | a fixar no blueprint |
| Mutation — Python | mutmut / cosmic-ray | adapter |
| Mutation — Rust | cargo-mutants | adapter |
| Mutation — PHP | Infection | adapter |
| Isolamento | git worktrees | já usado por `dare-dag-run-parallel` |
| Grafo / telemetria | GraphRAG backend JSON (seguro) | **evitar Neo4j até C1 corrigido** |
| Harness | dataset estilo SWE-bench (subset próprio + fixtures internas) | A confirmar licenciamento |
| Verificador exec-free (opc.) | modelo externo (API) ou heurística | embrionário — RF-09 COULD |

## Integrações Externas

| Sistema | Tipo | Protocolo | Direção | Dados | Responsável |
|---|---|---|---|---|---|
| Ferramentas de mutação (Stryker etc.) | CLI local | processo filho (argv) | bi | código/relatório de mutantes | DARE CLI |
| Dataset SWE-bench/fixtures | dados | arquivo/HTTP | leitura | tarefas de avaliação | harness `dare bench` |
| CI (GitHub Actions) | pipeline | workflow | saída | solve-rate/Fix·Rate, gate | release.yml/ci.yml |
| Verificador execution-free | modelo | API (A confirmar) | bi | diff/candidatos → score | RF-09 (opcional) |
| IDE skills (Claude/Cursor/Antigravity) | skill | MCP/arquivos | bi | geração de testes/candidatos (camada semântica) | regra da casa: LLM fora do CLI |

## Restrições

- **Regra de ouro da casa:** o **CLI é 100% determinístico**; toda inferência por LLM (gerar testes,
  gerar candidatos best-of-N) vive nas **skills das IDEs**, não no CLI (igual a `design`/`blueprint`/`review`).
  O núcleo orquestra e verifica; não chama LLM diretamente.
- **Multi-stack:** mutação e geração de testes precisam de adapter por linguagem — não há solução única.
- **Custo:** best-of-N e mutation testing são caros; tudo opt-in, com budget e N conservadores.
- **Windows-first dev:** CRLF e ausência de shell POSIX são restrições reais (ver RNF-05).
- **Pré-requisito:** depende de `kb-task-ralph-shell` (RS-06) e idealmente da correção do Neo4j (C1) se telemetria usar grafo.

## Fora do Escopo (v1)

- **Verificação formal** (Dafny/Verus/Lean — `idea-10`): projeto separado; alta complexidade, alvo de fronteira.
- **Treinar** um verificador/reward model próprio (`idea-11` em sua forma RL): v1 só *consome* heurística/modelo externo, não treina (arXiv:2512.21919/2512.18552 ficam como referência).
- **Grafo dual Requisito↔Código** (`idea-4`/`idea-5`): feature irmã, DESIGN próprio.
- **Auto-discovery brownfield** (`idea-7`) e **planejadores especializados** (`idea-8`): fora deste núcleo.
- **Cobrir todas as linguagens** de mutação na v1: começar por JS/TS + Python; demais como SHOULD.

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Mutation testing torna o loop lento demais | Alta | Alto | Incremental (só área tocada), timeout, limite de mutantes, cache; opt-in por task complexa (RNF-01) |
| Testes gerados pelo próprio LLM herdam o viés de erro do gerador (falso-verde) | Alta | Alto | Diversidade/anti-trapaça (RF-03); voto multi-verificador (RF-05); cross-consistency (arXiv:2507.06920, 2602.10522) |
| Best-of-N estoura custo de tokens | Média | Alto | N=3 default, budget-aware, abort por decaimento (RNF-02, O-05) |
| Flaky tests poluem solve-rate/Fix·Rate | Média | Médio | Re-run de confirmação; marcar/segregar flakies no harness |
| Licenciamento/uso do dataset SWE-bench | Média | Médio | Subset próprio de fixtures internas como fallback (Integrações: "A confirmar") |
| Complexidade vira god-file (repetir o débito C3 do audit) | Média | Médio | Adapters isolados + registry + cobertura ≥80% (RNF-03) |
| Verificador exec-free dá falso-verde | Baixa | Alto | RS-07: nunca autoriza DONE sozinho; só prioriza |

## Checklist de Aprovação

- [ ] O problema (gate binário ≠ correção) está corretamente capturado e vale o investimento
- [ ] O escopo (ideas 1,2,3,9,11) está certo — e os itens "Fora do Escopo" são aceitáveis para v1
- [ ] As metas numéricas (O-01…O-07) são realistas e mensuráveis
- [ ] A regra "LLM fora do CLI" foi respeitada na divisão CLI ↔ skills
- [ ] As prioridades MUST/SHOULD/COULD refletem o que importa primeiro
- [ ] Os riscos de **custo** (mutation + best-of-N) estão mitigados o suficiente
- [ ] Stack de mutação por linguagem (Stryker/mutmut/…) está aprovada ou a decidir no Blueprint
- [ ] Pré-requisitos de segurança (RS-06 sem `shell:true`) entram antes ou junto

---

> **Próximo passo:** após aprovação deste DESIGN, rodar `/dare-blueprint` para a Fase Architect
> (decisões arquiteturais, estrutura de pastas, contratos, lista de tasks). Fundamentação por paper
> em `pesquisas-estrategicas/papers-dare/cards/` (grep por `idea-1`,`idea-2`,`idea-3`,`idea-9`,`idea-11`).
