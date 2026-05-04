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
# → Escolha: Frontend (React, Vue)
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

## 📦 DARE CLI — Pacote npm

O DARE Method agora está disponível como um **pacote npm instalável**, com suporte a múltiplos stacks e IDEs.

### Pacotes disponíveis

| Pacote | Descrição | Status |
|--------|-----------|--------|
| [`@dewtech/dare-cli`](packages/cli) | CLI interativo com `dare init`, `dare discover`, `dare design`, `dare blueprint`, `dare execute` | ✅ v0.3.0 |
| [`@dewtech/dare-mcp-server`](packages/mcp-server) | Servidor MCP local para queries de contexto (90% menos tokens) | ✅ v0.3.0 |
| [`@dewtech/dare-graphrag`](packages/graphrag) | Motor de conhecimento gráfico com SQLite + FTS5 | ✅ v0.3.0 |
| [`@dewtech/dare-core`](packages/core) | Tipos e utilitários compartilhados entre os packages | ✅ v0.3.0 |

### Stacks suportados

**Backend:** Rust/Axum · Node.js/NestJS · Python/FastAPI · PHP/Laravel

**Frontend:** React 18+ · Vue 3+

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

### Concluído ✅

- [x] CLI standalone (`dare init`, `dare design`, `dare blueprint`, `dare execute`)
- [x] **`dare discover`** — detecta e instala DARE em projetos existentes sem tocar no código
- [x] **Tipo de projeto `mcp-server`** — templates TypeScript e Python com stdio/SSE/HTTP Stream
- [x] **Suporte ao Claude Code** — `CLAUDE.md`, `.claude/commands/`, `.claude/settings.json` com hooks
- [x] Templates por linguagem: Rust/Axum, Node.js/NestJS, Python/FastAPI, PHP/Laravel
- [x] Templates frontend: React 18+, Vue 3+
- [x] Execução paralela de tasks com DAG Task Runner
- [x] MCP Server local para economia de tokens (90% de redução)
- [x] GraphRAG com SQLite para contexto persistente
- [x] Pacote `@dewtech/dare-core` (tipos compartilhados)
- [x] Publicação no npm registry (`@dewtech/dare-cli`)
- [x] GitHub Actions para CI/CD (build, test, release)
- [x] Monorepo com pnpm workspaces e TypeScript strict

### Próximos passos 🔜

- [ ] Implementação para **VS Code + Continue**
- [ ] Templates para Go e Kotlin
- [ ] Site dedicado em `dare-method.dev`
- [ ] Curso / certificação
- [ ] DARE Cloud (GraphRAG remoto para times)

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
