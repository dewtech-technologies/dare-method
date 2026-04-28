# DARE — Implementação Cursor IDE

> Implementação do **Método DARE** otimizada para o **[Cursor IDE](https://cursor.com)**, com comandos slash, regras automáticas (`.cursorrules`) e skills por stack.

📖 **Antes de começar:** [README principal do dare-method](../../README.md) explica o método. Este documento foca apenas em **como instalar e usar a implementação Cursor** num projeto.

[Setup rápido](#-setup) ·
[Comandos](#-comandos) ·
[Skills](#-skills) ·
[Estrutura no seu projeto](#-estrutura-no-seu-projeto) ·
[Troubleshooting](#-troubleshooting)

---

## ⚡ Setup

### Opção 1 — Script automático (recomendado)

Da raiz desta pasta (`implementations/cursor/`):

**Windows:**
```bash
setup-projeto.bat C:\caminho\para\seu\projeto
```

**macOS/Linux:**
```bash
chmod +x setup-projeto.sh
./setup-projeto.sh /caminho/para/seu/projeto
```

O script copia `.cursor/`, `.cursorrules`, `templates/`, `examples/` e `scripts/` para o seu projeto, e cria o diretório `DARE/EXECUTION/`.

### Opção 2 — Setup manual

Da raiz desta pasta, copia para o seu projeto:

```bash
cp -r .cursor seu-projeto/
cp .cursorrules seu-projeto/
cp -r templates seu-projeto/
cp -r examples seu-projeto/
cp -r scripts seu-projeto/
mkdir -p seu-projeto/DARE/EXECUTION
```

### Verificar instalação

1. Abre o seu projeto no Cursor: **File → Open Folder**
2. Composer: **Ctrl+I** (Windows/Linux) ou **Cmd+I** (Mac)
3. Digite `/` para listar comandos disponíveis
4. Smoke test: `/generate-design "Teste rápido"`

Se aparecer DESIGN.md em `DARE/`, está funcionando. ✅

---

## 📋 Comandos

### Core (DARE)

| Comando | Entrada | Saída |
|---------|---------|-------|
| `/generate-design` | Descrição da feature | `DARE/DESIGN.md` |
| `/generate-blueprint` | `DARE/DESIGN.md` | `DARE/BLUEPRINT.md` |
| `/generate-tasks` | `DARE/BLUEPRINT.md` | `DARE/TASKS.md` + `task-*.md` |
| `/execute-task` | `task-001` | Código + testes ✓ (com Ralph Loop) |

### Especializados

| Comando | Quando usar |
|---------|-------------|
| `/generate-feature-design` | Feature nova específica (formato otimizado) |
| `/generate-bugfix-design` | Correção de bug com root cause analysis |

### Infraestrutura

| Comando | Saída |
|---------|-------|
| `/generate-dockerfile` | `Dockerfile` otimizado (multi-stage, non-root, healthchecks) |
| `/generate-docker-compose` | `docker-compose.yml` |

### Análise

| Comando | Saída |
|---------|-------|
| `/telemetry-report` | Análise de tokens / modelos / custo |

📖 [Detalhes de cada fase do método →](../../docs/methodology.md)

---

## 🧠 Skills

Skills ensinam o Cursor sobre convenções específicas de stack. **Carregadas automaticamente** quando você abre o projeto.

| Skill | Arquivo | Cobertura |
|-------|---------|-----------|
| **Laravel API** | `.cursor/rules/skill-laravel-api.mdc` | PHP 8.3 + Laravel 11 |
| **Docker** | `.cursor/rules/skill-docker.mdc` | Multi-stage, segurança, otimização |
| **Segurança** | `.cursor/rules/skill-security.mdc` | OWASP Top 10, validação, criptografia |
| **Telemetria** | `.cursor/rules/skill-telemetry.mdc` | Rastreamento de tokens e modelos |
| **Bugfix Design** | `.cursor/rules/skill-bugfix-design.mdc` | Workflow de correção de bug |
| **Feature Design** | `.cursor/rules/skill-feature-design.mdc` | Workflow de feature nova |

### Adicionar skills novas

1. Cria `.cursor/rules/skill-<nome>.mdc` no seu projeto
2. Define convenções, padrões, exemplos de código
3. Cursor carrega automaticamente

📖 Estrutura sugerida: ver [`skill-laravel-api.mdc`](.cursor/rules/skill-laravel-api.mdc) como referência.

---

## 📂 Estrutura no seu projeto (após setup)

```
seu-projeto/
├── .cursorrules                  # Regras globais do DARE (auto-carrega no Cursor)
├── .cursor/
│   ├── commands/                 # 9 comandos /generate-*
│   └── rules/                    # Skills por stack
│
├── DARE/                         # Pasta de governança DARE (gerada conforme você usa)
│   ├── DESIGN.md                 # ← Fase 1
│   ├── BLUEPRINT.md              # ← Fase 2
│   ├── TASKS.md                  # ← visão geral
│   ├── EXECUTION/                # ← Fase 4 (specs por task)
│   │   ├── task-001.md
│   │   └── ...
│   └── TELEMETRY.md              # ← métricas (opcional)
│
├── templates/                    # Esqueletos para os documentos DARE
├── examples/                     # Exemplos de código por stack (referência pra IA)
├── scripts/
│   └── analyze-telemetry.py      # Análise visual da telemetria
│
└── (resto do seu código)
```

---

## 📖 Documentação local desta implementação

Guias específicos do Cursor (estão nesta pasta):

| Documento | Para quê |
|-----------|----------|
| [`SETUP-RAPIDO.md`](SETUP-RAPIDO.md) | Setup em 5 min |
| [`CONFIGURACAO-CURSOR.md`](CONFIGURACAO-CURSOR.md) | Como o Cursor carrega regras e comandos |
| [`REFERENCIA-RAPIDA.md`](REFERENCIA-RAPIDA.md) | Cheat sheet de comandos |
| [`GUIA-DE-USO.md`](GUIA-DE-USO.md) | Exemplo prático completo (To-Do List API) |
| [`GUIA-TELEMETRIA.md`](GUIA-TELEMETRIA.md) | Como rastrear tokens e modelos |

📖 **Documentação canônica do método** (independente de IDE): [`../../docs/`](../../docs/)
- [Metodologia detalhada](../../docs/methodology.md)
- [Ralph Loop em profundidade](../../docs/ralph-loop.md)
- [Cada uma das 4 fases](../../docs/phases/)
- [Glossário](../../docs/glossary.md)
- [FAQ](../../docs/faq.md)
- [Comparações com outras metodologias](../../docs/comparisons.md)

---

## 🔁 Ralph Loop

O comando `/execute-task` aciona o **Ralph Loop**: a IA implementa, roda Validation Gates (testes + lint + type check) e, se algo falhar, **lê o erro, corrige e tenta de novo** até passar. Limite de 6 attempts antes de pedir ajuda humana.

📖 [Ralph Loop em profundidade →](../../docs/ralph-loop.md)

---

## 🛡️ Segurança (OWASP Top 10)

A skill `skill-security` orienta o Cursor a aplicar controles do OWASP Top 10 em todas as fases:

- **Design:** requisitos de segurança explícitos
- **Blueprint:** arquitetura com proteções (auth, rate limit, validação)
- **Tasks:** tasks incluem gates de segurança
- **Execute:** código com práticas anti-injeção, criptografia adequada, etc.

Vulnerabilidades cobertas: A01–A05, A07, A09, A10.

---

## 📊 Stacks suportadas

| Stack | Skill incluída | Examples |
|-------|----------------|----------|
| **Laravel/PHP** | ✅ `skill-laravel-api.mdc` | ✅ |
| **Docker** | ✅ `skill-docker.mdc` | ✅ |
| **Vue.js** | ⚠️ via examples | ✅ (1 componente) |
| Python (FastAPI) | 🔜 roadmap | 🔜 |
| Node.js (NestJS) | 🔜 roadmap | 🔜 |
| Go | 🔜 roadmap | 🔜 |

Quer adicionar uma stack? Veja o [CONTRIBUTING.md](../../CONTRIBUTING.md) na raiz.

---

## 🐛 Troubleshooting

### Comandos `/generate-*` não aparecem
- Confere que `.cursor/commands/` foi copiado pro seu projeto
- Fecha e reabre o Cursor (Composer carrega comandos no boot)
- No Composer, digita `/` — devem listar

### Skills não estão sendo aplicadas
- Confere que `.cursorrules` está na raiz do projeto
- Confere que `.cursor/rules/skill-*.mdc` existe
- Reinicia uma conversa nova no Composer (skills carregam por sessão)

### `/execute-task` falha sem rodar testes
- Verifica que sua stack tem testes configurados (`npm test`, `pytest`, `phpunit`, etc.)
- Confere a seção **Validation Gates** da `task-NNN.md` — comandos precisam ser válidos no ambiente

### Ralph Loop entra em loop infinito
- Limite é 6 tentativas (a IA aborta sozinha)
- Se você notar 4+ tentativas no mesmo erro, pause e revisa o BLUEPRINT — provavelmente há problema de especificação

📖 Mais troubleshooting: [`CONFIGURACAO-CURSOR.md`](CONFIGURACAO-CURSOR.md) seção **Troubleshooting**.

---

## 🔗 Links

- [Repo dare-method principal](../../README.md)
- [Cursor IDE — Documentação oficial](https://cursor.com/docs)
- [Anthropic Claude](https://claude.ai)
- [Site da Dewtech](https://dewtech.tech)
