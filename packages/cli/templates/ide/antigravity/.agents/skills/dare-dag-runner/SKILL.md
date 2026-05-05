---
name: dare-dag-runner
description: Constrói e executa o grafo DAG de tasks do método DARE com paralelismo via Kahn's algorithm. Use quando o BLUEPRINT.md está aprovado e é hora de gerar dare-dag.yaml ou executar tasks em paralelo. Garante schema correto, dependências mínimas e specs consistentes.
---

# DARE DAG Runner Skill

Você é o orquestrador da fase de execução paralela do método DARE. Seu papel
é traduzir o BLUEPRINT em um grafo executável (`DARE/dare-dag.yaml`) e
operar o `dare execute --parallel` com confiança.

## Quando usar esta skill

- BLUEPRINT.md foi aprovado e é hora de gerar tasks
- Existe `DARE/dare-dag.yaml` e você precisa entender, modificar ou rodar
- Aparece o canvas `DARE/.canvas.md` durante uma execução
- Usuário pede "executa em paralelo" ou "gera o DAG"

## O que é o DAG do DARE

`DARE/dare-dag.yaml` é o **plano de execução** da fase E (Execute) do método.
É um grafo direcionado acíclico:

- **Nó** = uma task atômica
- **Aresta** = `depends_on` (a task filha precisa do output da pai)

O CLI ordena topologicamente (Kahn's algorithm) e executa tasks do mesmo rank
em paralelo via `Promise.all`. Tasks sem dependências comuns rodam ao mesmo
tempo. Outputs dos pais são costurados no contexto dos filhos (snippet de até
2000 chars cada).

```
rank 0  ─→  task-001  task-002       (paralelas)
rank 1  ─→  task-003 (deps: 001,002)
rank 2  ─→  task-004 (deps: 003)
```

## Schema canônico

```yaml
title: "<Nome do projeto> - Development Tasks"
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
      <prompt completamente self-contained>
```

## Regras inegociáveis ao construir o DAG

### 1. `id` em kebab-case e único
`task-001`, `auth-jwt`, `db-migrations`. Sem espaços nem maiúsculas. O id
aparece no canvas e nos logs.

### 2. `depends_on` mínimo

> Adicione uma dependência **somente** quando a task filha não pode começar
> sem o output da pai (arquivo, schema, decisão exportada).

| Cenário | Dependência? |
|---------|--------------|
| B precisa do arquivo que A criou | sim |
| B precisa de uma decisão tomada em A | sim |
| B faz coisa similar a A mas independente | não |
| Pesquisa/leitura sem efeito colateral | não — fan out wide |
| Testes do módulo X | sim — depende da implementação |
| Docs do módulo X | sim — depende da implementação |

Se o seu DAG vira uma cadeia linear `001 → 002 → 003 → ...`, há dependências
falsas. Reanalise.

### 3. `complexity` mapeia para modelo
| Nível | Uso típico |
|-------|------------|
| `LOW`  | Setup, scaffolding, docs simples, pesquisa |
| `MED`  | Implementação direta, refactors, testes unitários |
| `HIGH` | Lógica de negócio crítica, segurança, integrações |

Não use `HIGH` em tudo — encarece sem ganho.

### 4. `subtask_prompt` totalmente self-contained

O subagente recebe apenas:
- O próprio `subtask_prompt`
- Snippets de até 2000 chars dos outputs de cada pai
- Acesso ao filesystem do projeto

Não vale dizer "use o padrão combinado" ou "como na task-001". Coloque tudo no
prompt ou faça vir pelos pais.

### 5. Output capado em 4000 chars

Se a task gera muito, escreva em arquivo e faça o output ser um resumo curto +
caminhos dos arquivos criados.

### 6. Cada task tem spec em `EXECUTION/task-<id>.md`

Spec detalhada com: objetivo, arquivos a criar/modificar, validation gates,
testes esperados, segurança. O `subtask_prompt` referencia
`spec_file: EXECUTION/task-001.md` para que o subagente leia a spec.

## Os 3 artefatos sempre juntos

Quando gerar tasks, produza simultaneamente:

1. **`DARE/TASKS.md`** — tabela master para humanos
2. **`DARE/dare-dag.yaml`** — grafo executável pelo CLI
3. **`DARE/EXECUTION/task-<id>.md`** — uma spec detalhada por task

Os três precisam estar consistentes: mesmo `id`, mesmo `depends_on`, mesma
`complexity`. Inconsistência aqui quebra a execução.

## Como executar

```bash
dare execute --parallel              # paralelo, runner padrão
dare execute --parallel --runner antigravity
dare execute                         # sequencial (debug)
dare execute --task task-003         # task única
dare execute --parallel --resume     # só PENDING/FAILED
```

Env vars necessárias por runner:
- `CURSOR_API_KEY` — runner cursor
- `ANTHROPIC_API_KEY` — runner claude
- `ANTIGRAVITY_API_KEY` — runner antigravity

## Canvas ao vivo (`DARE/.canvas.md`)

O runner reescreve `DARE/.canvas.md` a cada mudança de status. Status:
- `PENDING` ⏳ — aguardando rank
- `RUNNING` 🔄 — executando agora
- `DONE` ✅ — concluído com sucesso
- `FAILED` ❌ — erro durante execução
- `SKIPPED` ⏭️ — dependência falhou; runner pulou automaticamente

Você não precisa intervir em `SKIPPED` — o runner cuida.

## Erros comuns

| Erro | Sintoma | Correção |
|------|---------|----------|
| Ciclo | `Circular dependency detected: <id>` | Retire a aresta cíclica |
| `id` duplicado | Resultado indefinido | Renomeie |
| `depends_on` inexistente | `Task not found: <id>` | Corrija ou adicione |
| Tudo em rank 0 | Conflito de escrita no mesmo arquivo | Adicione dependências reais |
| Cadeia linear | Sem paralelismo | Reveja se as deps são necessárias |

## Checklist antes de aprovar

- [ ] Pelo menos 2 tasks no rank 0
- [ ] `subtask_prompt` executável sem contexto adicional
- [ ] Tasks de teste/doc dependem da implementação correspondente
- [ ] `complexity` reflete o esforço real
- [ ] `id` em kebab-case e único
- [ ] Sem ciclos
- [ ] `TASKS.md` + `dare-dag.yaml` + `EXECUTION/task-*.md` consistentes
