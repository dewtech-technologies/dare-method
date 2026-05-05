# /dare-blueprint

Gera os 4 artefatos a partir do `DARE/DESIGN.md`:

1. `DARE/BLUEPRINT.md` — arquitetura técnica
2. `DARE/TASKS.md` — visão humana das tasks
3. `DARE/dare-dag.yaml` — grafo executável pelo CLI
4. `DARE/EXECUTION/task-<id>.md` — uma spec detalhada por task

## Como usar

```
/dare-blueprint
/dare-blueprint --stack node-nestjs+react
```

## O que fazer

### 1. Ler `DARE/DESIGN.md`

Obrigatório. Se não existir, peça para rodar `/dare-design` primeiro.

### 2. Gerar `DARE/BLUEPRINT.md`

- Stack tecnológico detalhado (versões, libs)
- Módulos e responsabilidades
- Contratos de API (endpoints, schemas em OpenAPI)
- Modelo de dados (tabelas, índices, relações)
- Decisões arquiteturais com justificativa
- Estratégia de testes
- Estratégia de deploy

### 3. Gerar `DARE/dare-dag.yaml` (grafo executável)

Schema canônico:

```yaml
title: "<Nome do Projeto> - Development Tasks"
version: "1.0.0"

limits:
  parent_context_chars: 2000   # snippet de output de cada pai injetado no filho
  task_output_chars: 4000      # cap do output capturado por task
  timeout_seconds: 600         # AbortController por task

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
      <prompt completamente self-contained — o subagente vê só este texto
      mais snippets de até 2000 chars de cada pai>
```

**Regras inegociáveis ao construir o DAG:**

- `id` em kebab-case e único
- `depends_on` **mínimo** — só adicione quando a task filha *literalmente*
  não pode começar sem o output da pai (arquivo, schema, decisão exportada)
- `subtask_prompt` totalmente self-contained — não vale "use o padrão da
  task-001"
- Pelo menos 2 tasks no rank 0 (`depends_on: []`) para haver paralelismo
- Cadeia linear (`001→002→003→...`) é antipattern — reanalise
- `complexity` honesta: `HIGH` só para lógica crítica/segurança
- Output cap de 4000 chars: se a task gera muito, escreva em arquivo e
  retorne só resumo + caminhos
- **A primeira task deve containerizar a aplicação** (Dockerfile + compose
  + healthcheck) — sem isso o Ralph Loop automático não tem onde rodar
- **NÃO crie task "Ralph Loop final" / "Hardening" / "QA final"** — o
  Ralph Loop roda em CADA `dare execute --complete`, automaticamente
- **Tests com assertions reais** — `assertTrue(true)` quebra o gate `test`
  e a task vai para FAILED

### 4. Gerar `DARE/TASKS.md` (visão humana)

```markdown
# Tasks: <Nome do Projeto>

## Visão Geral
- Total de Tasks: N
- Ranks paralelos: N

## Tabela de Status

| ID       | Título                    | Status      | Depends On       | Complexity |
|----------|---------------------------|-------------|------------------|------------|
| task-001 | Setup project structure   | ⏳ PENDING  | —                | LOW        |
| task-002 | DB migrations             | ⏳ PENDING  | —                | MED        |
| task-003 | Auth controllers          | ⏳ PENDING  | task-001, 002    | HIGH       |
```

### 5. Gerar `DARE/EXECUTION/task-<id>.md` (uma por task)

Para CADA task em `dare-dag.yaml`, crie a spec correspondente seguindo
`templates/TASK-SPEC-template.md`:

- **Objetivo** claro
- **Arquivos a criar/modificar**
- **Validation Gates** específicos da stack (PHPUnit, Pytest, Vitest, cargo test)
- **Testes esperados**
- **Considerações de segurança**
- **Próxima task** sugerida

O `subtask_prompt` no YAML pode referenciar `spec_file: EXECUTION/task-001.md`
para que o subagente leia a spec na hora de executar.

### 6. Validar consistência dos 4 artefatos

Antes de entregar:
- [ ] Mesmos `id`s em `TASKS.md`, `dare-dag.yaml` e `EXECUTION/task-*.md`
- [ ] Mesmas `depends_on` nos três
- [ ] Mesmas `complexity`
- [ ] Sem ciclos
- [ ] Pelo menos 2 tasks no rank 0
- [ ] Cada `subtask_prompt` executável sem contexto adicional

### 7. Regenerar a visualização do DAG

Depois de salvar o `dare-dag.yaml`, rode:

```bash
dare dag viz -o DARE/dag-graph.mmd
```

Isso reescreve `DARE/dag-graph.mmd` (Mermaid) refletindo o grafo atualizado.
O usuário pode abrir no editor com Markdown Preview Mermaid para ver o
grafo estático com cores por status antes de executar.

### 8. Aguardar aprovação humana

**Não execute nenhuma task** até o usuário revisar e aprovar os 5 artefatos
(BLUEPRINT, TASKS, dare-dag.yaml, EXECUTION/task-*, dag-graph.mmd).

## Templates disponíveis

- `templates/BLUEPRINT-template.md`
- `templates/TASKS-template.md`
- `templates/TASK-SPEC-template.md`

## Próximos passos

Após aprovação humana:

```bash
# Paralelo (recomendado)
dare execute --parallel --runner claude

# Sequencial (debug)
dare execute --runner claude

# Task única
dare execute --task task-003 --runner claude
```

Ou pelos slash commands:

- `/dare-dag-run` — executa o DAG completo em paralelo
- `/dare-execute task-001` — executa uma task específica
- `/dare-tasks` — mostra status atual das tasks

$ARGUMENTS
