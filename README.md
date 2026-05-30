<div align="center">

<img src="docs/assets/dewtech-logo.png" alt="Dewtech" width="120"/>

# DARE Method

### Design. Architect. Review. Execute.

**A structured methodology for AI-assisted software development with mandatory human-in-the-loop reviews.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built by Dewtech](https://img.shields.io/badge/built%20by-Dewtech-0070f3)](https://dewtech.tech)
[![npm](https://img.shields.io/npm/v/@dewtech/dare-cli?label=%40dewtech%2Fdare-cli)](https://www.npmjs.com/package/@dewtech/dare-cli)
[![Cursor IDE](https://img.shields.io/badge/Cursor-IDE-000000?logo=cursor)](implementations/cursor)
[![Antigravity](https://img.shields.io/badge/Antigravity-supported-7928ca)](implementations/antigravity)

> 🚀 **v3.0.0 lançado!** **29 skills em paridade total nas 3 IDEs** (Antigravity, Claude Code, Cursor) + 5 novas skills de stack (NestJS, FastAPI, Go/Gin, MCP Server, Rails). Ver [CHANGELOG](CHANGELOG.md). Licença MIT.

[**Quickstart**](#-quickstart-em-5-minutos) ·
[**Método**](#-o-método) ·
[**Ralph Loop**](#-ralph-loop) ·
[**CLI**](#-dare-cli-pacote-npm) ·
[**Implementações**](#%EF%B8%8F-implementações) ·
[**Comparações**](#%EF%B8%8F-comparações)

</div>

---

## ⚡ Quickstart em 5 minutos

### Opção 1 — Via CLI (recomendado)

```bash
# 1. Instale o CLI globalmente
npm install -g @dewtech/dare-cli

# 2. Inicialize seu projeto de forma interativa
dare init meu-projeto
# → Escolha: Estrutura (Monorepo / Backend / Frontend / MCP Server)
# → Escolha: IDE (Claude Code / Cursor / Antigravity / Hybrid)
# → Escolha: Backend (Rust/Axum, Node/NestJS, Python/FastAPI, PHP/Laravel)
# → Escolha: Frontend (React, Vue, Leptos fullstack, Leptos CSR)
# → [Rust monorepo] Layout: single-crate (crates/server + crates/web) ou multi-crate
# → Escolha: GraphRAG (SQLite, JSON, Neo4j)

# 3. Abra seu projeto e dispare o primeiro comando
cd meu-projeto
dare design "Quero uma API de autenticação JWT"
```

> **Projeto já existe?** Use `dare discover` para instalar o DARE sem tocar no código existente:
> ```bash
> cd meu-projeto-existente
> dare discover
> ```
>
> **Atualizou o CLI globalmente?** Use `dare update` em cada projeto para sincronizar os templates / skills / commands com a versão nova do DARE (sem mexer no seu DESIGN/BLUEPRINT/TASKS):
> ```bash
> npm install -g @dewtech/dare-cli@latest
> cd meu-projeto-dare
> dare update                # interativo, com changelog + confirmação
> dare update --dry-run      # só preview, não escreve
> ```
>
> **Task ficou com mock/stub/TODO escondido?** v2.17+ traz dois gates anti-stub:
> ```bash
> dare review task-034       # detecta TODO/FIXME, stubs, mocks fora de testes, funções vazias
> dare refine task-034 --split  # mede complexidade e propõe quebra em sub-tasks
> ```
> Ative o gate automático no Ralph Loop com `review.onComplete: true` em `dare.config.json` — `dare execute --complete` bloqueia DONE se a review reprovar.

### Opção 2 — Manual (Cursor)

```bash
# 1. Clone o repo
git clone https://github.com/dewtech-technologies/dare-method.git
cd dare-method

# 2. Copie a implementação para o seu projeto
cp -r implementations/cursor/.cursor seu-projeto/
cp implementations/cursor/.cursorrules seu-projeto/

# 3. Abra seu projeto no Cursor e dispare o primeiro comando
/generate-design "Quero uma API de autenticação JWT em Node.js"
```

Pronto. Você está usando DARE.

---

## 🎯 O Problema

O desenvolvimento de software com IA hoje opera em dois extremos:

| Vibe Coding | Tradicional |
|---|---|
| "Me dá um código que faça X" + esperança | Especificação detalhada feita só por humanos |
| Rápido pra protótipo, **caos pra evoluir** | Lento, **aproveita pouco a IA** |
| Sem auditabilidade do raciocínio | Sem ganho de produtividade real |

**DARE preenche o gap entre os dois.** Mantém a velocidade da IA, mas com **estrutura, contexto e checkpoints humanos**.

---

## 🚀 O Método

DARE é o acrônimo de **4 fases sequenciais** com responsabilidades claras:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   1. DESIGN     →  2. ARCHITECT  →  3. REVIEW   →  4. EXECUTE          │
│   ─────────       ─────────────     ─────────      ─────────            │
│   Humano          IA propõe         Humano         IA implementa       │
│   define          arquitetura       valida         + Ralph Loop        │
│   requisitos                        e aprova                            │
│                                                                         │
│   ↓ DESIGN.md     ↓ BLUEPRINT.md    ↓ ✓ approval   ↓ Code + Tests ✓    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

| Fase | O que faz | Quem faz | Saída | Tempo típico |
|------|-----------|----------|-------|--------------|
| **1. Design** | Define **o que** vamos construir e **por quê** | Humano (IA auxilia) | `DARE/DESIGN.md` | 15-30 min |
| **2. Architect** | Decide **como** vamos construir, em arquitetura e tasks | IA propõe, humano valida | `DARE/BLUEPRINT.md` | 5-15 min |
| **3. Review** | Aprova ou ajusta o plano antes de gastar tokens | Humano | ✓ approval explícito | 5-10 min |
| **4. Execute** | Implementa task por task, com **Ralph Loop** rodando até gates passarem | IA | Código + testes verdes | varia |

> 💡 **Princípio central:** humanos pensam estratégia (1 e 3), IA executa tática (2 e 4). Cada transição entre fases passa por checkpoint explícito.

---

## 🤡 Ralph Loop

<div align="center">

<img src="docs/assets/ralph-loop.webp" alt="Ralph Wiggum — I'm in danger" width="320"/>

*"I'm in danger 😄"*

</div>

Inspirado no **Ralph Wiggum** dos Simpsons, o **Ralph Loop** é o ciclo de **auto-correção pós-execução** que acontece dentro da fase 4 (Execute).

A piada esconde uma verdade técnica: agentes de IA são **excelentes em iteração até o objetivo**, mas **ruins em planejamento estratégico**. O Ralph Loop usa essa força. As fases anteriores (Design → Architect → Review) suprem a fraqueza.

### Como funciona

```
┌──────────────────────────────────────────────┐
│  IA implementa task (escreve código)         │
│              ↓                               │
│  Roda os Validation Gates                    │
│    • testes unitários                        │
│    • testes de integração                    │
│    • linter / formatter                      │
│    • type checker                            │
│              ↓                               │
│  ┌─────────────┐   FAIL    ┌──────────────┐  │
│  │  Passou?    │ ────────► │ Lê o erro    │  │
│  └─────────────┘           │ Corrige      │  │
│       PASS                 │ Tenta de novo│  │
│        ↓                   └──────┬───────┘  │
│   ✓ Task done                     │          │
│                                   └─────────┘ ⟲
│                                  Ralph Loop   │
└──────────────────────────────────────────────┘
```

### Por que "Ralph"?

Porque a IA, igual ao Ralph Wiggum, **persiste confiante** mesmo errando. Não desiste até a casa parar de pegar fogo (testes verdes). Não entende inteiramente o porquê — só sabe que precisa fazer passar. E, surpreendentemente, **funciona**.

### Referências externas

- [Ralph Loops: automação iterativa e o novo papel do engenheiro](https://medium.com/@itaifos/ralph-loops-automa%C3%A7%C3%A3o-iterativa-e-o-novo-papel-do-engenheiro-93df8b4e37e5) — Itai Fos (Medium)
- [The greatest AI fix for your bug](https://www.crazystack.com.br/2025-3/the-greatest-ai-fix-for-your-b) — CrazyStack

---

## 🔁 Fluxo completo

```
1. /generate-design "Sua ideia em uma frase"
   └─► DARE/DESIGN.md
       ✋ Você revisa e aprova

2. /generate-blueprint DARE/DESIGN.md
   └─► DARE/BLUEPRINT.md
       ✋ Você revisa e aprova

3. /generate-tasks DARE/BLUEPRINT.md
   └─► DARE/TASKS.md + DARE/EXECUTION/task-001.md, task-002.md…
       ✋ Você revisa e aprova

4. /execute-task task-001
   └─► IA implementa com Ralph Loop até gates passarem
       ✓ Código + testes verdes

5. /execute-task task-002
   └─► repete para cada task

📊 /telemetry-report (opcional)
   └─► Análise de tokens, modelos, custo
```

---

## 🛠️ Implementações

| IDE / Agente | Status | Pasta |
|---|---|---|
| **Claude Code** | ✅ Production-ready | via `dare init` / `dare discover` |
| **Cursor IDE** | ✅ Production-ready | [`implementations/cursor/`](implementations/cursor) |
| **Antigravity** | ✅ Production-ready | [`implementations/antigravity/`](implementations/antigravity) |
| VS Code + Continue | 🔜 Roadmap | — |
| JetBrains AI Assistant | 🔜 Roadmap | — |

Cada implementação tem README próprio com setup detalhado.

---

## 🔌 Skills disponíveis (v3.0.0)

**32 skills em paridade total** nas 3 IDEs. Cada skill existe em formato nativo de cada uma:

| IDE | Diretório | Formato |
|---|---|---|
| Antigravity | `implementations/antigravity/.agents/skills/<name>/SKILL.md` | YAML+markdown |
| Claude | `implementations/claude/.claude/commands/<name>.md` | slash-command markdown |
| Cursor | `implementations/cursor/.cursor/rules/skill-<name>.mdc` | rule frontmatter |

Veja o **[índice completo de skills](docs/skills/INDEX.md)** com tabela cruzada IDE × skill.

### Por categoria

**Método DARE (6) — fases canônicas:**
`dare-design` · `dare-blueprint` · `dare-tasks` · `dare-execute` · `dare-review` · `dare-refine`

**DAG runner (4) — orquestração de tasks paralelas:**
`dare-dag-build` (só regenera yaml) · `dare-dag-run` (só executa) · `dare-dag-runner` (build+run+viz) · `dare-dag-viz` (Excalidraw)

**Transversais (6) — princípios de engenharia que se aplicam a qualquer stack:**
`dare-ax` (Agent Experience) · `dare-layered-design` (4 camadas) · `dare-llm-integration` (providers+cache) · `dare-frontend-design` (componentes+estado) · `dare-realtime` (WS/SSE) · `dare-quality-telemetry` (M-01..M-04 + CI)

**Stack/Tools (8) — escopo específico:**
`dare-bugfix-design` · `dare-feature-design` · `dare-docker` · `dare-security` (OWASP A01-A10) · `dare-telemetry` · `dare-rust-workspace` · `dare-rust-leptos` · `dare-laravel-api`

**Brownfield (3) — projetos legados:**
`dare-reverse` (Fase 0: reconstrói arquitetura módulo a módulo → `IDEIA.md`) · `dare-dna` (extrai convenções → `PROJECT-DNA.md`) · `dare-migrate` (plano de migração + Gherkin de paridade → `MIGRATION/`)

**Stacks novas (5) — adicionadas na v3.0.0:**
`dare-nestjs-api` (Node + NestJS + Prisma) · `dare-fastapi-api` (Python + FastAPI + Pydantic) · `dare-go-gin-api` (Go + Gin/stdlib) · `dare-mcp-server` (MCP TS/Py) · `dare-rails-api` (Ruby Rails 8 + Solid Queue + Action Cable)

---

## 🔌 dare discover — projetos existentes

Instalou o DARE em um projeto que já existe? Use `dare discover`:

```bash
cd meu-projeto-existente
dare discover
```

O CLI detecta automaticamente a stack (NestJS, FastAPI, Laravel, React, Vue, MCP Server…), confirma com você e instala apenas os arquivos DARE — sem tocar no código existente.

```bash
dare discover --check   # só mostra o que detectou, sem instalar
dare discover --dir ./outro-projeto
```

---

## 🔁 dare reverse — engenharia reversa de legado (Fase 0)

Enquanto `dare discover` só detecta a stack e instala os arquivos, `dare reverse` faz
**engenharia reversa do código** para reconstruir a arquitetura **módulo a módulo** — uma
**Fase 0** antes do DESIGN, pensada para projetos legados/brownfield.

```bash
cd meu-projeto-legado
dare reverse
```

O CLI varre o código (sem tocá-lo), detecta as fronteiras de módulo, mede tamanho por LOC e
infere o grafo de dependências, gerando:

```
DARE/
├── IDEIA.md                       ← pré-arquitetura: o QUE é o software, com mapa de módulos
└── REVERSE/
    ├── reverse-facts.json         ← fatos determinísticos
    ├── architecture.excalidraw    ← canvas editável da arquitetura
    └── module-*.md                ← um mini-spec por módulo
```

O `IDEIA.md` traz um **diagrama Mermaid** do mapa de módulos (renderiza nativo no GitHub) com cor
por tamanho (🔵 LOW · 🟠 MED · 🔴 HIGH). Depois, a skill **`/dare-reverse`** na sua IDE preenche
as inferências semânticas (propósito, domínio, fluxos via `sequenceDiagram`). É um **rascunho a
validar**: você revisa o `IDEIA.md` e o promove a `DESIGN.md` com `dare design`.

```bash
dare reverse --check          # só mostra os módulos detectados, sem escrever
dare reverse --modules api,auth   # limita a módulos específicos
dare reverse --no-excalidraw  # pula o canvas .excalidraw
```

**Confiança & rastreabilidade.** A skill `/dare-reverse` marca cada afirmação com 🟢 CONFIRMED
(evidência `arquivo:linha`) · 🟡 INFERRED · 🔴 GAP. Os fatos estruturais já nascem 🟢 (extraídos pelo
scan). Depois de marcar, rode:

```bash
dare reverse --report   # computa o índice de confiança a partir dos marcadores
```

Isso gera `DARE/REVERSE/confidence-report.md` (índice por módulo, **computado deterministicamente** —
não auto-avaliado por LLM) e `DARE/REVERSE/traceability/code-spec-matrix.md`. Os 🔴 viram `gaps.md`
(classificados por severidade) e `questions.md`.

> Fluxo brownfield: `dare reverse` → `/dare-reverse` (marca 🟢🟡🔴) → `dare reverse --report` → revisão humana do `IDEIA.md` → `dare design` → `dare blueprint` → `dare execute`.

---

## 🚚 dare migrate — migração com paridade (Fase 2)

Fecha o loop brownfield: depois de entender o legado (`reverse` + `dna`), o `dare migrate` planeja
uma **reimplementação segura** numa stack-alvo, com **cenários Gherkin de paridade** que garantem que
o comportamento não quebra.

```bash
cd meu-projeto-legado        # após dare reverse (+ /dare-reverse --report)
dare migrate --to go-gin     # ou rust-axum, node-nestjs, python-fastapi, php-laravel, ruby-rails-8…
```

O CLI consome `reverse-facts.json` + `dna-facts.json`, herda os **blocking gaps** (🔴 da Fase 1) como
riscos, e gera:

```
DARE/MIGRATION/
├── MIGRATION.md          ← paradigma, estratégia, risco, arquitetura-alvo, cutover
├── migration-facts.json
└── parity/<módulo>.feature  ← contrato Gherkin de paridade (um por módulo)
```

A skill **`/dare-migrate`** escreve a estratégia (big-bang vs. strangler), trata os blocking gaps,
desenha a arquitetura-alvo alinhada ao DNA e preenche os **cenários de paridade reais** (derivados do
comportamento legado). Os `.feature` viram o **contrato de aceite** da reimplementação.

```bash
dare migrate --check         # mostra origem/alvo/módulos/blocking gaps, sem escrever
```

> Loop completo: `reverse` (o quê) → `dna` (como) → `migrate` (reimplementar com paridade) → `design`/`blueprint`/`execute` na stack-alvo.

---

## 🧬 dare dna — convenções de projeto legado

Enquanto `dare reverse` reconstrói **o QUE** o software é, `dare dna` extrai **COMO** o codebase faz as
coisas — suas convenções. Em legado você não pode reescrever, então o método precisa **se adaptar ao
padrão do projeto**. O `dare dna` persiste essas convenções num ruleset reutilizável.

```bash
cd meu-projeto-legado
dare dna
```

O CLI extrai (sem tocar no código): tooling de lint/format (+ regras-chave do Prettier/EditorConfig),
convenção de nomenclatura por extensão, arquitetura/camadas, framework e cobertura de teste,
bibliotecas-chave (ORM/HTTP/auth/validação) e a convenção de commits (do `git log`). Gera:

```
DARE/
├── PROJECT-DNA.md     ← ruleset de convenções (o agente segue ao trabalhar no projeto)
└── dna-facts.json     ← fatos determinísticos
```

Depois, a skill **`/dare-dna`** transforma os fatos em **regras acionáveis** ("ao criar um controller,
siga X"; "validação sempre via Y") e descreve padrões que o CLI não infere (tratamento de erro,
estilo de teste). Se você já rodou `dare reverse`, o `dna` reaproveita o `reverse-facts.json`.

```bash
dare dna --check          # só mostra as convenções detectadas, sem escrever
dare dna --dir ./outro-projeto
```

---

## 📦 DARE CLI — Pacote npm

O DARE Method está disponível como um **pacote npm único e instalável**: tudo
o que o framework oferece (CLI, servidor MCP, engine GraphRAG, DAG runner)
vem dentro de `@dewtech/dare-cli`. Não há subpacotes para gerenciar.

### Pré-requisitos

#### Para o CLI rodar
- **Node.js 18+** — instala em https://nodejs.org/

#### Para `dare init` scaffoldar a stack escolhida
O `dare init` **executa o scaffold oficial** da stack (`composer create-project`,
`npx degit vitejs/vite/...`, `cargo init`, `go mod init`, `rails new`, etc.).
Você pode escolher de onde a toolchain vem:

| Stack | Toolchain nativo | Imagem Docker (fallback) |
|-------|------------------|---------------------------|
| `ruby-rails-8` | Ruby 3.3+ · Bundler 2+ · Rails 8 — https://www.ruby-lang.org/ | `ruby:3.3-slim` |
| `php-laravel` | PHP 8.2+ · Composer 2+ — https://getcomposer.org/ | `composer:latest` |
| `node-nestjs` | Node 18+ (já vem com `npx`) | `node:20-alpine` |
| `python-fastapi` | Python 3.11+ — https://www.python.org/downloads/ | `python:3.12-slim` |
| `rust-axum` | Rust 1.83+ via rustup — https://www.rust-lang.org/tools/install | `rust:1.83` |
| `go-gin` | Go 1.25+ — https://go.dev/dl/ | `golang:1.25` |
| `go-stdlib` | Go 1.22+ (sem framework — só `net/http`) — https://go.dev/dl/ | `golang:1.25` |
| `react`, `vue` | Node 18+ | `node:20-alpine` |
| `rust-leptos` | Rust 1.83+ (rustup) + **cargo-leptos 0.2.22** | `ghcr.io/dewtech-technologies/dare-rust-leptos:1` |
| `rust-leptos-csr` | Rust 1.83+ (rustup) + **trunk** | `ghcr.io/dewtech-technologies/dare-rust-leptos:1` |
| `mcp-server-node-ts` | Node 18+ | `node:20-alpine` |
| `mcp-server-python` | Python 3.11+ | `python:3.12-slim` |

> **Nota v3.0.0:** `ruby-rails-8` é a única stack com gerador completo em `packages/stacks/`. As demais (php-laravel, node-nestjs, python-fastapi, go-gin, etc.) executam o scaffold oficial do framework + o template de skills DARE por cima. Stacks com gerador próprio em `packages/stacks/` estão no [roadmap v3.1.x](ROADMAP.md#em-desenvolvimento-ativo---v31x).

> **TL;DR:** se você só tem **Docker Desktop**, o `dare init` consegue
> scaffoldar qualquer stack. Se você tem o toolchain nativo, ele é mais
> rápido. Se você tem os dois, escolha o modo no momento do init.

### Instalação

```bash
npm install -g @dewtech/dare-cli
```

### Modos de toolchain (a partir da v2.7.0)

Ao rodar `dare init`, uma pergunta nova aparece:

```
? Toolchain for scaffolding (composer / npm / cargo / python / go):
  ❯ 🤖 Auto — usa nativo se disponível, senão Docker (recomendado)
    🔧 Native only — exige a CLI no PATH (mais rápido, sem pull de imagem)
    🐳 Docker only — sempre usa imagem oficial (hermético, sem instalar nada no host)
```

A resposta é salva em `dare.config.json` (`"toolchain": "auto"`) e usada
em todos os `dare bootstrap` futuros. Override pontual com
`dare bootstrap --toolchain <mode>`.

| Modo | Quando escolher |
|------|-----------------|
| `auto` | Default. Não sabe o que tem instalado, ou trabalha em time misto. |
| `native` | Já tem toolchain instalada. Quer velocidade máxima. |
| `docker` | Não quer instalar PHP/Cargo/Python/Go no host. Quer build hermético. |

> **Caveat — Ralph Loop:** `dare execute --complete` roda os gates
> (`composer dump-autoload`, `php artisan test`, `cargo build`, etc.)
> direto no host, não dentro do container do scaffold. Se você escolheu
> `docker only` sem toolchain nativa, o agente da IDE deve rodar os gates
> via `docker compose exec app <comando>` no container que a primeira
> task (Containerize) cria.

### O que vem incluso

| Componente | Função |
|------------|--------|
| CLI `dare` | `init`, `discover`, `design`, `blueprint`, `execute`, `update`, `review`, `refine` |
| CLI `dare-mcp-server` | Servidor MCP local de contexto (~95% economia de tokens) |
| Engine GraphRAG | Grafo de conhecimento com SQLite + FTS5 |
| DAG Task Runner | Execução paralela de tasks (Kahn's algorithm) |
| Anti-stub gates (v2.17+) | `dare review` detecta mocks/stubs/TODOs; `dare refine` quebra tasks gigantes |

> **Histórico:** até a v1.x existiam 4 pacotes separados (`dare-cli`, `dare-core`,
> `dare-graphrag`, `dare-mcp-server`). A partir da v2.0 todos foram consolidados
> em `@dewtech/dare-cli`. Os 3 pacotes antigos estão deprecated no npm.

### Stacks suportados

**Backend:** Ruby on Rails 8 · Rust/Axum · Node.js/NestJS · Python/FastAPI · PHP/Laravel · Go/Gin · Go/stdlib

**Frontend:** React 18+ · Vue 3+ · Leptos fullstack (Rust SSR+WASM) · Leptos CSR (Rust WASM)

**MCP Server:** TypeScript/Node.js · Python — transports `stdio`, `SSE`, `HTTP Stream`

### Execução paralela com DAG Task Runner

Inspired by [Cursor Cookbook DAG Task Runner](https://github.com/cursor/cookbook), o DARE CLI suporta execução paralela de tasks:

```bash
# Gerar grafo de dependências e executar em paralelo
dare blueprint          # gera BLUEPRINT.md + dare-dag.yaml
dare execute --parallel # executa tasks independentes em paralelo
```

| Modo | Tempo estimado |
|------|----------------|
| Sequencial (anterior) | ~280 minutos |
| Paralelo com DAG | ~70 minutos |
| **Ganho** | **75% mais rápido** |

### Economia de tokens com MCP Server

Em vez de a IA reler o `BLUEPRINT.md` inteiro a cada task, o MCP Server fornece apenas o contexto necessário:

```bash
# Iniciar o servidor MCP local
dare-mcp-server

# A IA consulta contexto via HTTP em vez de reler arquivos
# POST http://localhost:3000/context/query
# { "type": "architecture", "query": "authentication", "limit": 3 }
```

| Método | Tokens usados |
|--------|---------------|
| Reler BLUEPRINT.md completo | ~8.000 tokens |
| Query MCP (5 resultados) | ~400 tokens |
| **Economia** | **~95%** |

---

## 📋 Comandos disponíveis (Cursor)

### Core (DARE)

| Comando | Entrada | Saída |
|---------|---------|-------|
| `/generate-design` | Descrição da feature | `DARE/DESIGN.md` |
| `/generate-blueprint` | `DARE/DESIGN.md` | `DARE/BLUEPRINT.md` |
| `/generate-tasks` | `DARE/BLUEPRINT.md` | `DARE/TASKS.md` + `task-*.md` |
| `/execute-task` | `task-001` | Código + testes ✓ |

### Infraestrutura

| Comando | Saída |
|---------|-------|
| `/generate-dockerfile` | `Dockerfile` + `.dockerignore` |
| `/generate-docker-compose` | `docker-compose.yml` |

### Análise

| Comando | Saída |
|---------|-------|
| `/telemetry-report` | Análise de tokens / modelos / custo |
| `/generate-bugfix-design` | DESIGN específico para correção de bug |
| `/generate-feature-design` | DESIGN específico para feature nova |

---

## 📂 Estrutura de arquivos esperada no seu projeto

Após adotar DARE, seu projeto fica assim:

```
seu-projeto/
├── .cursorrules                  # Regras globais (do DARE)
├── .cursor/
│   ├── commands/                 # Os comandos /generate-*
│   └── rules/                    # Skills (Laravel, Docker, Security, etc.)
│
├── DARE/                         # Pasta de governança do método
│   ├── DESIGN.md                 # ← Fase 1 (humano define)
│   ├── BLUEPRINT.md              # ← Fase 2 (IA propõe, humano valida)
│   ├── TASKS.md                  # ← Visão geral
│   ├── EXECUTION/                # ← Fase 4 (specs por task)
│   │   ├── task-001.md
│   │   ├── task-002.md
│   │   └── …
│   └── TELEMETRY.md              # ← métricas opcionais
│
└── (resto do seu código)
```

---

## ⚖️ Comparações

| Aspecto | DARE | Vibe Coding | BDD | TDD tradicional |
|---|---|---|---|---|
| **Estrutura** | Alta (4 fases) | Nenhuma | Alta | Média |
| **Velocidade inicial** | Média | Alta | Baixa | Baixa |
| **Velocidade longo prazo** | Alta | Cai com complexidade | Alta | Média |
| **Auditabilidade** | Total (DESIGN, BLUEPRINT, TASKS) | Nenhuma | Alta (specs) | Média (testes) |
| **Uso de IA** | Otimizado (fases 2 e 4) | Total mas caótico | Baixo | Baixo |
| **Curva de aprendizado** | Média | Zero | Alta | Alta |
| **Ideal para** | Times sérios com IA | Protótipos rápidos descartáveis | Domínios regulados | Bibliotecas / kernels |

---

## 🏢 Battle-tested

DARE foi desenvolvido durante a construção de produtos reais de IA generativa na **Dewtech** e está em uso ativo em projetos de produção desde 2025. A metodologia evoluiu a partir de problemas concretos de:

- Manter qualidade em codebases que crescem rápido com IA
- Garantir que decisões arquiteturais fiquem registradas e revisitáveis
- Reduzir débito técnico gerado por "Vibe Coding" sem estrutura
- Permitir que membros novos do time entrem rapidamente sem perder contexto

O método **não é um framework experimental** — é o padrão pelo qual a Dewtech entrega software hoje.

---

## 📚 Documentação

- 📖 [Metodologia detalhada](docs/methodology.md)
- 🎭 [Ralph Loop em profundidade](docs/ralph-loop.md)
- 🔄 [Cada uma das 4 fases](docs/phases/)
- 🧩 [Glossário](docs/glossary.md)
- ❓ [FAQ](docs/faq.md)
- ⚖️ [Comparações com outras metodologias](docs/comparisons.md)

---

## 🗺️ Roadmap

Veja o [**ROADMAP.md**](ROADMAP.md) na raiz do repositório com:

- **Shipped** — tudo que está em produção na v3.0.0 (29 skills nas 3 IDEs, stack Ruby on Rails 8, CLI/GraphRAG/MCP/DAG)
- **Em desenvolvimento ativo (v3.1.x)** — stacks de scaffold completas para NestJS/FastAPI/Go-Gin/MCP/Laravel, frontend stacks, registry remoto público
- **Planejado (v3.2.x+)** — VS Code + Continue, JetBrains AI Assistant, Zed Editor, site institucional, DARE Cloud
- **Histórico de releases** — resumo de cada versão da v1.0.0 até a v3.0.0 atual

Detalhes técnicos de cada release ficam no [**CHANGELOG.md**](CHANGELOG.md).

---

## 🤝 Contribuindo

PRs são muito bem-vindos. Veja [CONTRIBUTING.md](CONTRIBUTING.md) pra:

- Adicionar nova implementação (IDE / agente)
- Adicionar nova skill (Python, Go, Rust, mobile, etc.)
- Reportar bugs ou sugerir melhorias na metodologia
- Compartilhar case studies de uso real

---

## 📜 Licença

MIT — veja [LICENSE](LICENSE).

---

## 🚀 Adotando DARE no seu time?

Workshops, consultoria de adoção e cases study customizados disponíveis via Dewtech.

📧 **wanderson@dewtech.tech**
🌐 **https://dewtech.tech**

<div align="center">

Feito com ❤️ pela [Dewtech](https://dewtech.tech) em Belo Horizonte, Brasil 🇧🇷

</div>
