# Feature Design: `dare reverse` — Engenharia Reversa para Brownfield

> Gerado seguindo o próprio Método DARE (Fase D). Artefato de design para revisão humana
> antes da implementação. License: MIT (parte do DARE Method).

## Contexto no Projeto Existente

O DARE Method hoje é **greenfield-first**: a cadeia de artefatos nasce direto no `DESIGN.md`.
Para projetos **legados / brownfield** existem apenas mecanismos parciais:

- **`dare discover`** — faz *fingerprint da stack* (lê `package.json`, `Cargo.toml`, `composer.json`,
  etc.) e instala os arquivos DARE **sem ler o código de verdade**. Termina instruindo o humano a
  rodar `dare design "descreva o que o projeto faz"` — ou seja, o DESIGN do legado é escrito do zero.
- **`/dare-feature-design`** e **`/dare-bugfix-design`** — fazem análise de contexto, mas **escopadas
  a uma mudança pontual**; nunca reconstroem a visão arquitetural completa do projeto.

**Não existe** nenhum passo que reconstrua a visão arquitetural inteira de um codebase existente.
Não há conceito de "ideia", "pré-arquitetura" ou "DNA" — o espaço conceitual está livre.
`dare reverse` preenche essa lacuna como uma **Fase 0 / brownfield**.

## Objetivos da Feature

- [O-01] Rodar `dare reverse` em **qualquer repositório** e reconstruir a arquitetura **módulo a módulo**
  sem tocar no código-fonte (read-only sobre o projeto-alvo).
- [O-02] Gerar uma **Fase 0** de artefatos: `DARE/IDEIA.md` (índice/pré-arquitetura) +
  `DARE/REVERSE/module-*.md` (mini-spec por módulo), que o humano revisa e promove a `DESIGN.md`.
- [O-03] Embutir **diagramas** nos artefatos: mapa de módulos (mermaid + excalidraw, determinístico)
  e fluxos de execução "como a coisa funciona" (mermaid, semântico).
- [O-04] **Zero LLM no CLI**: a camada CLI é 100% determinística; a inferência semântica fica na
  skill `/dare-reverse` das IDEs (regra de ouro da casa, igual a `design`/`blueprint`/`review`).
- [O-05] **Reuso máximo**: aproveitar `project-detector`, `static-analyzer` e o motor de diagramas
  já existente (generalizado em `renderGraph`).

## Stakeholders

| Papel | Pessoa/Time | Interesse |
|---|---|---|
| Autor do método | Wanderson / Dewtech | Coerência com a filosofia DARE; adoção em legado |
| Usuário (dev) | adotantes do DARE | Onboarding rápido de projeto legado no método |
| Mantenedores CLI | Dewtech | Reuso, testabilidade, sem dívida técnica |

## Decisões Travadas (com o autor)

| # | Decisão | Escolha |
|---|---|---|
| D-1 | Granularidade | `IDEIA.md` (índice/visão geral) **+** pasta `REVERSE/module-*.md` (mini-spec por módulo) |
| D-2 | Modelo de artefato | `IDEIA.md` como **Fase 0 nova** pré-DESIGN; humano valida → semeia DESIGN. Preserva o checkpoint human-in-the-loop |
| D-3 | Escopo v1 | **Só `reverse`** (o comando `dna` fica para depois). Sem `--promote` nesta versão |
| D-4 | Reuso de diagramas | **Generalizar** o motor para `renderGraph(nodes, edges, opts)` com `status` opcional; `dag viz` e `reverse` passam a chamá-lo |
| D-5 | Diagramas default | Mermaid **sempre embutido** no markdown + `architecture.excalidraw` gerado por padrão (`--no-excalidraw` para pular) |

## A Cadeia Brownfield que isto cria

```
projeto legado qualquer
   │  dare reverse            ← máquina INFERE (tático)
   ▼
IDEIA.md + REVERSE/module-*.md + architecture.excalidraw
   │  [revisão humana]        ← checkpoint human-in-the-loop (estratégico)
   ▼
DESIGN.md  →  dare blueprint  →  BLUEPRINT.md  →  dare-dag.yaml  →  dare execute
```

`IDEIA.md` = rascunho **inferido pela máquina**; `DESIGN.md` = verdade **validada pelo humano**.

## Arquitetura (duas camadas — regra de ouro)

### Camada A — CLI determinística (nunca chama LLM)
1. `detectProject()` → stack/estrutura (reúso direto de `utils/project-detector.ts`).
2. **Detecção de módulos** (`utils/module-detector.ts`, peça nova): fronteiras por workspaces /
   `Cargo.toml` members / `app/*` / `src/modules/*` / top-level dirs sob `src`. Grafo de dependências
   entre módulos por análise de imports. Bucket de tamanho por LOC → `LOW|MED|HIGH` (reaproveita a
   paleta de cores existente como legenda de tamanho).
3. Por módulo, `runStaticAnalysis()` → arquivos, classificação test/prod, contagens.
4. Regex de domínio por stack: modelo de dados (CREATE TABLE / models ORM) e superfície de API (rotas).
5. Emite `DARE/REVERSE/reverse-facts.json` (fonte de fatos) + **esqueletos** de `IDEIA.md` e
   `module-*.md` (inventário preenchido; seções semânticas marcadas `<!-- AGENT: ... -->`).

### Camada B — Skill `/dare-reverse` (agente da IDE)
Lê `reverse-facts.json` + abre os arquivos-chave de cada módulo → **infere** propósito, domínio,
responsabilidades, fluxos → preenche `IDEIA.md` e cada `module-*.md`, incluindo:
- `flowchart TD` de fluxo de request/dados do sistema no `IDEIA.md`;
- `sequenceDiagram` "como o módulo funciona" em cada `module-*.md`.

## Artefatos Gerados

```
DARE/
├── IDEIA.md                       ← índice/pré-arquitetura
└── REVERSE/
    ├── reverse-facts.json         ← fatos determinísticos (consumido pela skill)
    ├── architecture.excalidraw    ← canvas editável do mapa de módulos
    ├── module-01-<nome>.md
    ├── module-02-<nome>.md
    └── ...
```

### Diagramas por artefato
| Artefato | Diagrama | Gerado por |
|---|---|---|
| `IDEIA.md` | `graph LR` mapa de módulos + `flowchart` fluxo do sistema | CLI (mapa) + Skill (fluxo) |
| `REVERSE/architecture.excalidraw` | canvas editável da arquitetura | CLI (`renderGraph` excalidraw) |
| `REVERSE/module-*.md` | `sequenceDiagram` "como o módulo funciona" | Skill |

## Superfície de CLI

```bash
dare reverse                      # varre o cwd
dare reverse -d ./caminho         # diretório alvo
dare reverse --check              # só mostra módulos detectados, não escreve
dare reverse --modules api,auth   # limita a módulos específicos
dare reverse --no-excalidraw      # pula a geração do .excalidraw
```

## Análise de Impacto

### Novos Arquivos
- `packages/cli/src/commands/reverse.ts` — o comando (espelha `discover.ts`)
- `packages/cli/src/utils/module-detector.ts` — detecção de módulos + grafo de deps
- `packages/cli/src/utils/graph-renderer.ts` — núcleo genérico `renderGraph` (mermaid/dot/excalidraw)
- `packages/cli/src/utils/reverse-facts.ts` — orquestra scan → facts.json + geradores de esqueleto
- `implementations/claude/.claude/commands/dare-reverse.md`
- `implementations/cursor/.cursor/rules/skill-reverse.mdc`
- `implementations/antigravity/.agents/skills/dare-reverse/SKILL.md`
- Testes: `module-detector`, `graph-renderer`, `reverse` (fixtures de mini-projeto legado)

### Arquivos Modificados
- `packages/cli/src/bin/dare.ts` — registra `reverseCommand` (após `discover`)
- `packages/cli/src/utils/excalidraw-renderer.ts` — `renderDagExcalidraw` delega ao núcleo genérico
- `packages/cli/src/commands/dag.ts` — `renderDagMermaid`/`renderDagDot` delegam ao núcleo genérico
- `README.md` + `docs/skills/INDEX.md` — documentar o novo comando/skill

### NÃO alterar
- Saída dos renderers do DAG: `dag-viz.test.ts` e `excalidraw-renderer.test.ts` devem permanecer
  **verdes byte a byte** (subgraphs, `classDef`/`class`, ícones de status, cores, posições).
- `dare discover` permanece como está (fingerprint de stack). `reverse` é complementar.

## Segurança Específica

- **Read-only no projeto-alvo:** `reverse` nunca escreve fora de `DARE/`. Nunca modifica código.
- **Sem exfiltração:** toda análise é local; nenhum conteúdo de código sai da máquina (CLI não chama rede/LLM).
- **Path traversal:** resolver e validar `--dir`/`--modules` contra o root; ignorar `node_modules`,
  `.git`, `target`, `dist`, `vendor` na varredura.

## Estratégia de Testes

- `module-detector.test.ts` — fixtures: monorepo pnpm, app Laravel `app/*`, crate Rust multi-member,
  projeto flat `src/*`. Verifica fronteiras e grafo de deps.
- `graph-renderer.test.ts` — núcleo genérico (mermaid inline-style, excalidraw geometry).
- Garantir `dag-viz.test.ts` + `excalidraw-renderer.test.ts` continuam verdes após o refactor.
- Ralph Loop antes de DONE: `pnpm build && pnpm test && pnpm lint`.

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Refactor dos renderers quebra saída do DAG | Média | Alto | Renderers do DAG delegam mas mantêm estilo "class/status"; testes existentes como gate |
| Detecção de módulos imprecisa em layouts exóticos | Média | Médio | Heurística em cascata + fallback; seção "⚠️ Incertezas" no IDEIA para o humano corrigir |
| Excesso de falso-positivo em imports cross-módulo | Baixa | Baixo | Grafo é dica visual, não contrato; humano valida no checkpoint |

## Fora do Escopo (v1)

- Comando `dare dna` / `PROJECT-DNA.md` (extração de convenções) — **follow-up planejado**.
- `dare reverse --promote` (semear DESIGN.md a partir da IDEIA aprovada) — follow-up.
- AST real por linguagem — mantemos a abordagem regex/line-based da casa.

## Próximas Etapas

1. Revisar e aprovar este Feature Design.
2. Implementar na ordem: `graph-renderer` → refactor DAG (gate de testes) → `module-detector`
   → `reverse.ts` + facts + esqueletos → skills nas 3 IDEs → testes + docs.
3. Rodar Ralph Loop completo e abrir PR.
