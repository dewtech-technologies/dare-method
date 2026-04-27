# 🚀 Método DARE para Google Antigravity

**Versão:** 1.0 | **Plataforma:** Google Antigravity | **Data:** Abril 2026

Este diretório contém a implementação do **Método DARE** (Design → Architect → Review → Execute) otimizada para o **Google Antigravity**, um IDE desktop com Agent integrado.

## 📖 O Método DARE no Antigravity

O Método DARE aproveita as capacidades nativas do Antigravity para criar um fluxo de trabalho totalmente automatizado:

| Fase DARE | Artifact Antigravity | Descrição |
|-----------|---------------------|-----------|
| **Design** | Implementation Plan | Agent cria plano de implementação |
| **Architect** | Task List | Agent cria lista de tarefas estruturada |
| **Review** | Feedback em Artifacts | Humano aprova/corrige |
| **Execute** | Task Groups + Planning Mode | Agent executa com autonomia |

## 🎯 Fluxo Completo

```
1. Usuário: "Criar API de autenticação"
   ↓
2. Agent (com skill dare-design):
   - Lê requisitos
   - Cria Implementation Plan Artifact
   - Pede aprovação humana
   ↓
3. Humano: Revisa e aprova DESIGN.md
   ↓
4. Agent (com skill dare-blueprint):
   - Lê DESIGN.md
   - Cria Task List Artifact
   - Pede aprovação humana
   ↓
5. Humano: Revisa e aprova BLUEPRINT.md
   ↓
6. Agent (com skill dare-tasks):
   - Lê BLUEPRINT.md
   - Cria Task Groups com subtasks
   - Pede aprovação humana
   ↓
7. Humano: Revisa e aprova TASKS.md
   ↓
8. Agent (Planning Mode + skill dare-execute):
   - Executa cada subtask
   - Testa código (Ralph Loop)
   - Cria Artifacts de progresso
   - Pede aprovação em pending steps
   ↓
9. Humano: Aprova ou corrige
   ↓
10. Projeto Completo ✓
```

## 📂 Estrutura de Arquivos

```
DARE-ANTIGRAVITY/
├── .agents/
│   ├── skills/                      # Skills reutilizáveis
│   │   ├── dare-design/
│   │   │   ├── SKILL.md
│   │   │   ├── examples/
│   │   │   └── resources/
│   │   ├── dare-blueprint/
│   │   │   └── SKILL.md
│   │   ├── dare-tasks/
│   │   │   └── SKILL.md
│   │   ├── dare-execute/
│   │   │   └── SKILL.md
│   │   ├── skill-laravel-api/
│   │   │   ├── SKILL.md
│   │   │   ├── examples/
│   │   │   └── resources/
│   │   ├── skill-docker/
│   │   │   └── SKILL.md
│   │   ├── skill-security/
│   │   │   └── SKILL.md
│   │   └── skill-telemetry/
│   │       └── SKILL.md
│   └── rules/
│       └── dare-workflow.md         # Rules/Workflows
├── DARE/
│   ├── DESIGN.md                    # Requisitos aprovados
│   ├── BLUEPRINT.md                 # Arquitetura aprovada
│   ├── TASKS.md                     # Visão geral das tarefas
│   ├── TELEMETRY.md                 # Rastreamento de uso (opcional)
│   └── EXECUTION/
│       ├── task-001.md
│       ├── task-002.md
│       └── ...
├── templates/                       # Templates para geração
│   ├── DESIGN-template.md
│   ├── BLUEPRINT-template.md
│   ├── TASKS-template.md
│   ├── TASK-SPEC-template.md
│   └── TELEMETRY-template.md
├── examples/                        # Exemplos de código-base
│   ├── laravel-user-controller.php
│   ├── laravel-user-model.php
│   ├── laravel-Dockerfile
│   ├── laravel-docker-compose.yml
│   └── vue-user-form.vue
├── scripts/                         # Utilitários
│   └── analyze-telemetry.py
└── README.md                        # Este arquivo
```

## 🧠 Skills Disponíveis

### Skills DARE Core

| Skill | Propósito |
|-------|-----------|
| **dare-design** | Gera Implementation Plan a partir de requisitos |
| **dare-blueprint** | Gera Task List a partir do Design |
| **dare-tasks** | Cria Task Groups a partir do Blueprint |
| **dare-execute** | Executa tasks com Ralph Loop (testes) |

### Skills Técnicas

| Skill | Propósito |
|-------|-----------|
| **skill-laravel-api** | Padrões para PHP 8.3 + Laravel 11 |
| **skill-docker** | Multi-stage builds, segurança, otimização |
| **skill-security** | OWASP Top 10, validação, criptografia |
| **skill-telemetry** | Rastreamento de tokens e modelos |

## 🚀 Início Rápido

### 1. Abrir Projeto no Antigravity

```bash
# Abra o Google Antigravity
# File → Open Workspace → Selecione este diretório
```

### 2. Criar uma Conversa com o Agent

```
Agent Manager (Cmd+E) → New Conversation
```

### 3. Usar Skills DARE

O Agent verá automaticamente as skills disponíveis. Para começar:

```
"Criar uma API de autenticação com JWT em Laravel"
```

O Agent vai:
1. Ler a skill `dare-design`
2. Criar um Implementation Plan
3. Pedir sua aprovação
4. Continuar com o fluxo DARE

## 📋 Vantagens do Antigravity para DARE

| Vantagem | Descrição |
|----------|-----------|
| **Task Groups Nativos** | Quebra automática de problemas complexos |
| **Artifacts Estruturados** | Saídas visuais (não apenas Markdown) |
| **Planning Mode** | Execução autônoma com checkpoints |
| **Feedback Integrado** | Artifacts pedem feedback, não apenas revisão |
| **Skills Reutilizáveis** | Padrão aberto (compatível com qualquer projeto) |
| **Browser Automation** | Subagent para automação de browser |
| **Melhor Visualização** | UI/UX otimizada para Artifacts |

## 🔄 Comparação: Cursor vs Antigravity

| Aspecto | Cursor | Antigravity |
|--------|--------|-----------|
| **Tipo** | Editor com IA | IDE com Agent |
| **Interação** | Conversa síncrona | Planejamento + Execução autônoma |
| **Saídas** | Código + Conversa | Artifacts estruturados |
| **Autonomia** | Requer aprovação em cada etapa | Planning Mode: trabalha autonomamente |
| **Skills** | Arquivos `.mdc` | Pastas com `SKILL.md` (padrão aberto) |
| **Melhor Para** | Desenvolvimento iterativo | Planejamento e execução de projetos complexos |

## 📚 Documentação

| Documento | Propósito |
|-----------|-----------|
| **CONFIGURACAO-ANTIGRAVITY.md** | Como configurar Antigravity para DARE |
| **GUIA-SKILLS.md** | Como criar e usar Skills |
| **GUIA-WORKFLOWS.md** | Como usar Rules/Workflows |
| **GUIA-TELEMETRIA.md** | Rastreamento de tokens e modelos |

## 🛡️ Segurança (OWASP Top 10)

A skill `skill-security` garante que o Agent gere código seguro em todas as fases:

- **Design:** Requisitos de segurança explícitos
- **Blueprint:** Arquitetura com proteções (Auth, Rate Limit, Validação)
- **Tasks:** Tarefas incluem validações de segurança
- **Execute:** Código com Bcrypt, SQL Injection prevention, XSS protection

## 🐳 Docker & Containerização

O sistema gera Dockerfiles otimizados com:

- Multi-stage builds para reduzir tamanho
- Usuários não-root para segurança
- Cache de camadas para performance
- Health checks para confiabilidade
- docker-compose.yml com volumes persistentes

## 📊 Telemetria & Análise

Rastreie qual modelo do Antigravity foi usado em cada etapa:

```bash
python3 scripts/analyze-telemetry.py
```

Gera análise com:
- Tokens processados por etapa
- Modelos utilizados
- Tempo de execução
- Recomendações de otimização

## 🔧 Customização

### Adicionar Novas Skills

1. Crie uma pasta em `.agents/skills/skill-[nome]/`
2. Adicione um arquivo `SKILL.md` com YAML frontmatter:

```markdown
---
name: skill-nome
description: Descrição da skill. Use quando você precisa fazer X.
---
# Skill Name

Instruções detalhadas para o Agent...
```

3. O Agent carregará automaticamente na próxima conversa

### Adicionar Rules/Workflows

Edite `.agents/rules/dare-workflow.md` para customizar comportamento do Agent.

## 🎯 Casos de Uso

### Caso 1: Criar uma API de Autenticação

```
"Criar API de login com JWT, refresh tokens e 2FA"
```

O Agent vai:
1. Criar Implementation Plan
2. Criar Task List
3. Criar Task Groups
4. Executar em Planning Mode

### Caso 2: Containerizar Projeto Existente

```
"Containerizar este projeto Laravel com Docker"
```

O Agent vai usar `skill-docker` para gerar Dockerfile otimizado.

### Caso 3: Auditar Segurança

```
"Auditar segurança do código usando OWASP Top 10"
```

O Agent vai usar `skill-security` para revisar.

## 📞 Suporte

Se algo não funcionar:

1. Verifique se as skills estão em `.agents/skills/`
2. Verifique se os arquivos têm `SKILL.md` (não `.mdc`)
3. Feche e reabra o Antigravity
4. Teste novamente

## 🔗 Referências

- [Google Antigravity Docs](https://antigravity.google/docs)
- [Método DARE (DewTech)](https://www.youtube.com/@dewtech)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

**Versão:** 1.0 | **Plataforma:** Google Antigravity | **Data:** Abril 2026
