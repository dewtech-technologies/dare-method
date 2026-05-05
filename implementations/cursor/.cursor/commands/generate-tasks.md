# Comando: /generate-tasks

## Descrição
Avança o Método DARE lendo o Blueprint aprovado e gerando os **três artefatos**
da fase de execução: `TASKS.md` (visão humana), `dare-dag.yaml` (grafo
executável pelo CLI) e `EXECUTION/task-<id>.md` (specs detalhadas por task).

## Pré-requisitos

- `DARE/BLUEPRINT.md` aprovado pelo usuário.
- Você deve seguir as regras de construção do DAG definidas em
  `.cursor/rules/skill-dag-runner.mdc` — leia antes de gerar.

## Instruções para o Cursor Composer

### 1. Ler o contexto

- Leia `$ARGUMENTS` (geralmente `DARE/BLUEPRINT.md`).
- Leia os templates: `templates/TASKS-template.md` e `templates/TASK-SPEC-template.md`.
- Leia `.cursorrules` para convenções do projeto.
- Leia a skill `skill-dag-runner.mdc` para regras de DAG (depends_on mínimo,
  complexity, prompt self-contained, output cap 4000, parent context 2000).

### 2. Decompor o Blueprint em tasks atômicas

- Cada fase do Blueprint vira tasks pequenas o suficiente para um único prompt
  do Composer.
- Tarefas de segurança (FormRequests, middlewares, Bcrypt, rate limit) devem
  ter tasks específicas ou estar explícitas nas tasks relevantes.
- Atribua `complexity` a cada task: LOW / MED / HIGH.

#### Regras inegociáveis de ordenação

1. **A primeira task deve preparar o ambiente local** — Dockerfile +
   `docker-compose.yml` + healthcheck. Sem isso o Ralph Loop não tem onde
   rodar build/test/lint. Exceção: projeto que já vive em monorepo
   containerizado.
2. **Não crie task "Ralph Loop final" / "Hardening final"** — o Ralph Loop
   roda automático em cada `dare execute --complete`. Não é uma task; é um
   gate por task.
3. **Tests devem ter assertions reais** desde a task que os escreve.
   Placeholders (`assertTrue(true)` etc.) fazem o gate `test` falhar e a
   task vai para FAILED.

### 3. Gerar `DARE/TASKS.md` (visão humana)

Tabela com todas as tasks e dependências em formato legível:

```markdown
| ID       | Título                    | Status      | Depends On       | Complexity |
|----------|---------------------------|-------------|------------------|------------|
| task-001 | Setup project structure   | ⏳ PENDING  | —                | LOW        |
| task-002 | DB migrations             | ⏳ PENDING  | —                | MED        |
| task-003 | Auth controllers          | ⏳ PENDING  | task-001, 002    | HIGH       |
```

Inclua: total de tasks, fases agrupadas, tempo estimado, próximos passos.

### 4. Gerar `DARE/dare-dag.yaml` (grafo executável)

Schema canônico (alinhado com `skill-dag-runner.mdc`):

```yaml
title: "<Nome do Projeto> - Development Tasks"
version: "1.0.0"

limits:
  parent_context_chars: 2000
  task_output_chars: 4000
  timeout_seconds: 600

models:
  cursor:      { HIGH: gpt-5.3-codex,     MED: composer-2,       LOW: auto-low }
  claude:      { HIGH: claude-sonnet-4-5, MED: claude-haiku-4,   LOW: claude-haiku-4 }
  antigravity: { HIGH: gemini-2.5-pro,    MED: gemini-2.5-flash, LOW: gemini-2.5-flash }

tasks:
  - id: task-001
    title: "Setup project structure"
    depends_on: []
    complexity: LOW
    spec_file: EXECUTION/task-001.md
    subtask_prompt: |
      Setup base project structure following DARE/BLUEPRINT.md.
      Create directories: src/, tests/, docs/. Initialize package files.
      No business logic yet. Validation gate: project builds.
```

**Regras inegociáveis:**
- `id` em kebab-case e único.
- `depends_on` mínimo — só adicione quando a task filha **literalmente** não
  pode começar sem o output da pai (arquivo, schema, decisão exportada).
- `subtask_prompt` totalmente self-contained (o subagente recebe só ele +
  snippets de 2000 chars dos pais).
- Pelo menos 2 tasks no rank 0 (com `depends_on: []`) para haver paralelismo
  real.
- Cadeia linear (`001 → 002 → 003 → ...`) é antipattern. Reanalise.

### 5. Gerar `DARE/EXECUTION/task-<id>.md` (uma spec por task)

Para CADA task em `dare-dag.yaml`, crie a spec correspondente seguindo
`templates/TASK-SPEC-template.md`:

- **Objetivo** claro
- **Arquivos a criar/modificar**
- **Validation Gates** (build, test, lint específicos da stack)
- **Testes esperados**
- **Considerações de segurança**
- **Próxima task** sugerida

O `subtask_prompt` no YAML pode referenciar a spec via
`spec_file: EXECUTION/task-<id>.md` para que o subagente leia a spec na hora
de executar.

### 6. Validar consistência dos 3 artefatos

- Mesmos `id`s em `TASKS.md`, `dare-dag.yaml` e `EXECUTION/task-*.md`.
- Mesmas `depends_on` em `TASKS.md` e `dare-dag.yaml`.
- Mesmas `complexity`.
- Sem ciclos.

### 7. Regenerar a visualização do DAG

Depois de salvar o `dare-dag.yaml`, rode:

```bash
dare dag viz -o DARE/dag-graph.mmd
```

Isso reescreve `DARE/dag-graph.mmd` (Mermaid) refletindo o grafo atualizado.
O usuário pode abrir o arquivo no Cursor com a extensão Mermaid Preview.

### 8. Mensagem final ao usuário

> Gerados 4 artefatos da fase de execução:
> - `DARE/TASKS.md` ([N] tasks, visão humana)
> - `DARE/dare-dag.yaml` (grafo executável, [N] ranks paralelos)
> - `DARE/EXECUTION/task-*.md` ([N] specs detalhadas)
> - `DARE/dag-graph.mmd` (visualização Mermaid do DAG)
>
> Revise (abra `dag-graph.mmd` para ver o grafo). Para executar:
> `/run-dag` ou `dare execute --next`.
