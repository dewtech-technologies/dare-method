# /dare-dag-run

Executa o grafo de tasks definido em `DARE/dare-dag.yaml` em paralelo,
respeitando dependências (Kahn's algorithm + execução por rank). O canvas
ao vivo é gravado em `DARE/.canvas.md`.

## Pré-requisitos

- `DARE/dare-dag.yaml` existe e foi aprovado pelo usuário
- Specs em `DARE/EXECUTION/task-<id>.md` geradas
- `ANTHROPIC_API_KEY` exportada no ambiente (runner padrão para o Claude)

## Como usar

```
/dare-dag-run                    # paralelo, runner claude
/dare-dag-run --resume           # só PENDING/FAILED
/dare-dag-run --task task-003    # task única
/dare-dag-run --sequential       # debug
/dare-dag-run --runner cursor    # trocar de runner
```

## O que fazer

### 1. Validar pré-condições

- Confirme que `DARE/dare-dag.yaml` existe. Se não, oriente
  `/dare-blueprint` ou `/dare-dag-build`.
- Leia o YAML e verifique:
  - Sem ciclos
  - Pelo menos 2 tasks no rank 0
  - Cada task tem `id` único, `complexity`, `subtask_prompt`
- Confirme `ANTHROPIC_API_KEY` (ou a env var do runner escolhido).

### 2. Escolher modo de execução

| Modo | Comando |
|------|---------|
| Paralelo (recomendado) | `dare execute --parallel --runner claude` |
| Sequencial (debug) | `dare execute --runner claude` |
| Task única | `dare execute --task <id> --runner claude` |
| Resume (PENDING/FAILED) | `dare execute --parallel --runner claude --resume` |

### 3. Sugerir abrir o canvas ao vivo

Antes de rodar, peça ao usuário abrir `DARE/.canvas.md` em outra aba do
editor. O runner reescreve o arquivo a cada transição de status:

```
| ID       | Title              | Status        | Duration | Tokens |
|----------|--------------------|---------------|----------|--------|
| task-001 | Setup structure    | ✅ DONE       | 1240ms   | 850    |
| task-002 | DB schema          | 🔄 RUNNING    | -        | -      |
| task-003 | Core endpoints     | ⏳ PENDING    | -        | -      |
```

### 4. Executar e monitorar

Rode o comando escolhido. Durante a execução:

- **Não interrompa por `SKIPPED`** — o runner pula automaticamente quando
  uma dependência falha. Esse é comportamento esperado.
- Se uma task falhar, leia o erro no terminal/canvas e corrija a spec em
  `EXECUTION/task-<id>.md` ou o `subtask_prompt` no `dare-dag.yaml`. Depois
  re-execute com `--resume`.
- Use `Ctrl+C` para cancelar — o runner trata SIGINT e finaliza limpamente.

### 5. Pós-execução

Ao terminar:

- Atualize `DARE/TASKS.md` com os status finais (DONE/FAILED/SKIPPED)
- Mostre um resumo:
  - Total DONE / FAILED / SKIPPED
  - Duração total
  - Tokens consumidos
  - Tasks que precisam atenção (FAILED)
- Se houver FAILED, sugira:
  1. Ler `EXECUTION/task-<id>.md` da que falhou
  2. Corrigir spec ou prompt
  3. Re-executar: `/dare-dag-run --resume`
- Se tudo DONE, parabenize e oriente próxima feature/blueprint

## Variáveis de ambiente por runner

| Runner | Env var |
|--------|---------|
| `claude` (default no Claude Code) | `ANTHROPIC_API_KEY` |
| `cursor` | `CURSOR_API_KEY` |
| `antigravity` | `ANTIGRAVITY_API_KEY` |

## Erros comuns

| Sintoma | Causa | Correção |
|---------|-------|----------|
| `dare-dag.yaml not found` | Grafo não foi gerado | `/dare-blueprint` ou `/dare-dag-build` |
| `Circular dependency detected` | Ciclo no grafo | Edite o YAML para remover |
| `ANTHROPIC_API_KEY not set` | Env var faltando | `export ANTHROPIC_API_KEY=...` |
| Cascata de SKIPPED | Pai falhou e bloqueou descendentes | Corrija pai, use `--resume` |
| Output truncado em 4000 chars | Cap de output | Faça a task escrever em arquivo e retornar resumo |
| Timeout (>600s) | Task longa demais | Quebre em sub-tasks ou aumente `limits.timeout_seconds` |

## Referências

- Schema do grafo: `DARE/dare-dag.yaml`
- Canvas ao vivo: `DARE/.canvas.md`
- Specs por task: `DARE/EXECUTION/task-*.md`
- Status humano: `DARE/TASKS.md`

$ARGUMENTS
