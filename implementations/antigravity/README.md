# DARE — Implementação Google Antigravity

> Implementação do **Método DARE** para o **[Google Antigravity](https://antigravity.google)** — IDE desktop com Agent integrado, Task Groups nativos e Planning Mode.

📖 **Antes de começar:** [README principal do dare-method](../../README.md) explica o método. Este documento foca apenas em **como instalar e usar a implementação Antigravity** num projeto.

[Setup](#-setup) ·
[Mapeamento DARE → Antigravity](#-mapeamento-dare--antigravity) ·
[Skills](#-skills) ·
[Estrutura](#-estrutura-no-seu-projeto) ·
[Cursor vs Antigravity](#-cursor-vs-antigravity)

---

## ⚡ Setup

Da raiz desta pasta (`implementations/antigravity/`):

```bash
# Copia tudo pra raiz do seu projeto
cp -r .agents seu-projeto/
cp -r templates seu-projeto/
cp -r examples seu-projeto/
cp -r scripts seu-projeto/
mkdir -p seu-projeto/DARE/EXECUTION
```

### Validar instalação

1. Abre o **Antigravity** → **File → Open Workspace** → seleciona seu projeto
2. **Agent Manager** (Cmd+E ou Ctrl+E) → **New Conversation**
3. Pede: *"Liste as skills DARE disponíveis"*
4. Resposta esperada: o agent menciona `dare-design`, `dare-blueprint`, `dare-tasks`, `dare-execute`

---

## 🧭 Mapeamento DARE → Antigravity

O Antigravity tem conceitos próprios que **mapeiam diretamente** nas 4 fases do DARE:

| Fase DARE | Conceito Antigravity | Saída |
|-----------|----------------------|-------|
| **1. Design** | Implementation Plan (Artifact) | `DARE/DESIGN.md` |
| **2. Architect** | Task List (Artifact) | `DARE/BLUEPRINT.md` |
| **3. Review** | Aprovação humana via Artifact feedback | ✓ approval |
| **4. Execute** | Task Groups + Planning Mode | Código + testes ✓ |

### Fluxo típico

```
1. Você: "Criar API de autenticação JWT em Laravel"
        ↓
2. Agent (skill dare-design):
     - Lê requisitos
     - Cria Implementation Plan
     - Pede aprovação
        ↓
3. Você revisa e aprova DESIGN.md
        ↓
4. Agent (skill dare-blueprint):
     - Lê DESIGN.md
     - Cria Task List
     - Pede aprovação
        ↓
5. Você revisa e aprova BLUEPRINT.md
        ↓
6. Agent (skill dare-tasks):
     - Lê BLUEPRINT.md
     - Cria Task Groups com subtasks
        ↓
7. Você revisa e aprova TASKS.md
        ↓
8. Agent (Planning Mode + skill dare-execute):
     - Executa cada subtask
     - Roda Ralph Loop nos Validation Gates
     - Cria Artifacts de progresso
        ↓
9. Projeto completo ✓
```

📖 [Detalhes do método e cada fase →](../../docs/methodology.md)

---

## 🧠 Skills

Skills são **carregadas automaticamente** pelo Agent quando você abre o workspace. Cada uma vive em `.agents/skills/<nome>/SKILL.md` com YAML frontmatter.

### Skills DARE Core

| Skill | Função |
|-------|--------|
| **dare-design** | Gera Implementation Plan a partir de requisitos |
| **dare-blueprint** | Gera Task List a partir do Design |
| **dare-tasks** | Quebra Blueprint em Task Groups com subtasks |
| **dare-execute** | Executa tasks com Ralph Loop (testes auto-corretivos) |

### Skills especializadas

| Skill | Função |
|-------|--------|
| **dare-feature-design** | Workflow específico para feature nova |
| **dare-bugfix-design** | Workflow específico para correção de bug com root cause analysis |

### Adicionar skills novas

```
.agents/skills/skill-<nome>/
└── SKILL.md
```

Conteúdo mínimo de `SKILL.md`:

```markdown
---
name: skill-<nome>
description: Descrição. Use quando precisar fazer X.
---
# Skill <Nome>

Instruções detalhadas para o Agent...
```

O Agent carrega automaticamente na próxima conversa. Veja `.agents/skills/dare-design/SKILL.md` como referência de estrutura.

---

## 📂 Estrutura no seu projeto (após setup)

```
seu-projeto/
├── .agents/
│   └── skills/                        # Skills DARE + skills auxiliares
│       ├── dare-design/SKILL.md
│       ├── dare-blueprint/SKILL.md
│       ├── dare-tasks/SKILL.md
│       ├── dare-execute/SKILL.md
│       ├── dare-feature-design/SKILL.md
│       └── dare-bugfix-design/SKILL.md
│
├── DARE/                              # Pasta de governança DARE (gerada conforme uso)
│   ├── DESIGN.md
│   ├── BLUEPRINT.md
│   ├── TASKS.md
│   ├── EXECUTION/
│   │   ├── task-001.md
│   │   └── ...
│   └── TELEMETRY.md                   # opcional
│
├── templates/                         # Esqueletos para os documentos DARE
├── examples/                          # Exemplos de código por stack (referência)
├── scripts/
│   └── analyze-telemetry.py
│
└── (resto do seu código)
```

---

## ✨ Por que Antigravity para DARE

| Vantagem | Como ajuda DARE |
|----------|------------------|
| **Task Groups nativos** | Quebra automática de blueprints complexos |
| **Artifacts estruturados** | DESIGN/BLUEPRINT renderizados visualmente, não só markdown |
| **Planning Mode** | Execução autônoma com checkpoints automáticos |
| **Skills com pasta dedicada** | Estrutura mais rica que arquivo único (skill com examples/ e resources/) |
| **Browser automation** | Subagent útil para tasks que precisam testar UI |

---

## 🔄 Cursor vs Antigravity

Os dois rodam DARE com fidelidade. A escolha depende do seu workflow:

| Aspecto | Cursor IDE | Antigravity |
|---------|------------|-------------|
| **Tipo** | Editor com IA conversacional | IDE com Agent autônomo |
| **Interação** | Síncrona (você pergunta, IA responde) | Planejamento + execução em batch |
| **Saídas** | Código + texto na conversa | Artifacts visuais estruturados |
| **Autonomia** | Aprovação por etapa | Planning Mode trabalha em sequência |
| **Skills** | Arquivos `.mdc` simples | Pastas com `SKILL.md` (estrutura aberta) |
| **Melhor para** | Iteração tática rápida | Projetos médios/grandes com várias tasks |

📖 [Cursor implementation →](../cursor/)

---

## 🔁 Ralph Loop no Antigravity

Quando o Agent executa uma task com `dare-execute`:

1. **Implementa** o código conforme spec
2. **Roda Validation Gates** (testes, lint, type check definidos na task)
3. **Se falha:** lê o erro, corrige e tenta de novo
4. **Se passa:** marca task como concluída e segue pra próxima
5. **Limite de 6 attempts** antes de pedir ajuda humana

A diferença vs Cursor: Antigravity executa **múltiplas tasks em sequência** dentro do Planning Mode, com mínima intervenção humana entre elas (apenas aprovação de pending steps quando configurado).

📖 [Ralph Loop em profundidade →](../../docs/ralph-loop.md)

---

## 🛡️ Segurança

A skill `skill-security` (se importada do Cursor — ver roadmap) orienta o Agent a aplicar controles do OWASP Top 10 nas fases. Por padrão, esta implementação foca nas 6 skills DARE core. Skills auxiliares de stack vêm via roadmap.

---

## 📊 Telemetria

Mesmo script da implementação Cursor — analisa `DARE/TELEMETRY.md`:

```bash
python3 scripts/analyze-telemetry.py
```

Mostra tokens consumidos, modelos usados, custo estimado.

---

## 🐛 Troubleshooting

### Skills não aparecem para o Agent
- Confere que `.agents/skills/<nome>/SKILL.md` existe (com `S` maiúsculo no `SKILL.md`)
- Confere que tem YAML frontmatter no topo
- Inicia nova conversa no Agent Manager (skills carregam no boot)

### Agent não usa o YAML frontmatter
- O `description:` no frontmatter é o que dispara o load. Garante que está descritivo e relevante
- Evita descrições genéricas — quanto mais específica, melhor o auto-trigger

### Planning Mode não respeita pending steps
- Confere que a task tem **Validation Gates explícitos** com comandos concretos
- Sem gates, Planning Mode tende a ser otimista demais sobre conclusão

---

## 🔗 Links

- [Repo dare-method principal](../../README.md)
- [Documentação canônica do método](../../docs/)
- [Google Antigravity — site oficial](https://antigravity.google)
- [Implementação Cursor (alternativa)](../cursor/)
- [Site da Dewtech](https://dewtech.tech)
