# Claude Code — Implementação Manual do DARE

Esta é a implementação de referência do método DARE para o **Claude Code** (CLI da Anthropic).

## Estrutura

```
.claude/
├── commands/                ← slash commands (/dare-design, /dare-blueprint, /dare-execute, /dare-tasks)
└── settings.example.json    ← permissões e hooks recomendados
CLAUDE.md                    ← contexto principal lido pelo Claude Code
templates/                   ← templates de documentação DARE
```

## Como instalar manualmente

1. Copie `CLAUDE.md` para a raiz do seu projeto
2. Copie `.claude/` para a raiz do seu projeto
3. Renomeie `.claude/settings.example.json` para `.claude/settings.json`
4. Copie `templates/` para a raiz do seu projeto

## Como instalar via CLI

```bash
dare init meu-projeto
# Escolha "Claude Code" como IDE
```

## Slash Commands

| Command | Descrição |
|---------|-----------|
| `/dare-design <descrição>` | Gera ou atualiza `DARE/DESIGN.md` |
| `/dare-blueprint` | Gera `BLUEPRINT.md`, `dare-dag.yaml` e `TASKS.md` |
| `/dare-execute <task-id>` | Executa uma task com Ralph Loop |
| `/dare-tasks` | Mostra status de todas as tasks |

## Ralph Loop

Antes de marcar qualquer task como DONE:
1. **Build** — compile sem erros
2. **Test** — testes passando
3. **Lint** — sem warnings
