# Comando: /run-dag

## Descrição
Executa o grafo de tasks definido em `DARE/dare-dag.yaml` em paralelo
respeitando dependências (Kahn's algorithm + Promise.all por rank). O canvas
ao vivo é gravado em `DARE/.canvas.md`.

## Pré-requisitos

- `DARE/dare-dag.yaml` existe e foi aprovado pelo usuário
- Specs em `DARE/EXECUTION/task-<id>.md` geradas
- `CURSOR_API_KEY` exportada no ambiente

## Instruções para o Cursor Composer

### 1. Validar pré-condições

- Confirme que `DARE/dare-dag.yaml` existe. Se não, oriente o usuário a rodar
  `/generate-tasks` primeiro.
- Leia o YAML e verifique:
  - Sem ciclos
  - Pelo menos 2 tasks no rank 0 (paralelismo real)
  - Cada `task` tem `id` único, `complexity`, `subtask_prompt`
- Confira `CURSOR_API_KEY`. Se faltar, peça ao usuário exportar.

### 2. Escolher o modo de execução

Pergunte ao usuário (ou infira do `$ARGUMENTS`) qual modo:

| Modo | Comando |
|------|---------|
| Paralelo (recomendado) | `dare execute --parallel --runner cursor` |
| Sequencial (debug) | `dare execute --runner cursor` |
| Task única | `dare execute --task <id> --runner cursor` |
| Resume (só PENDING/FAILED) | `dare execute --parallel --runner cursor --resume` |

### 3. Abrir o canvas em paralelo à execução

Antes de rodar, sugira ao usuário abrir `DARE/.canvas.md` em uma aba para
acompanhar o progresso ao vivo. O runner reescreve o arquivo a cada transição
de status.

### 4. Executar e monitorar

Rode o comando escolhido. Durante a execução:

- Não interrompa por `SKIPPED` — o runner pula automaticamente quando uma
  dependência falha
- Se uma task falhar, leia o erro no terminal/canvas e corrija a spec em
  `EXECUTION/task-<id>.md` ou o `subtask_prompt` no `dare-dag.yaml`
- Use `--resume` para retomar sem refazer tasks DONE

### 5. Pós-execução

Ao terminar:

- Atualize `DARE/TASKS.md` com os status finais (DONE/FAILED/SKIPPED)
- Mostre um resumo: total DONE, FAILED, SKIPPED, duração total, tokens
- Se houver FAILED, sugira diagnóstico e re-execução com `--resume`
- Se tudo DONE, parabenize e oriente próximo blueprint/feature

## Variáveis de ambiente por runner

| Runner | Env var |
|--------|---------|
| `cursor` (default) | `CURSOR_API_KEY` |
| `claude` | `ANTHROPIC_API_KEY` |
| `antigravity` | `ANTIGRAVITY_API_KEY` |

## Erros comuns

| Sintoma | Causa | Correção |
|---------|-------|----------|
| `dare-dag.yaml not found` | Arquivo não foi gerado | Rode `/generate-tasks` |
| `Circular dependency detected` | Ciclo no grafo | Edite `dare-dag.yaml` para remover |
| `CURSOR_API_KEY not set` | Env var faltando | `export CURSOR_API_KEY=...` |
| Muitos `SKIPPED` em cascata | Pai falhou e bloqueou descendentes | Corrija o pai e use `--resume` |
| Output truncado | Cap de 4000 chars | Faça a task escrever em arquivo e retornar resumo |

## Referências

- Skill: `.cursor/rules/skill-dag-runner.mdc` (regras do DAG)
- Schema: `DARE/dare-dag.yaml`
- Canvas: `DARE/.canvas.md`
- Specs: `DARE/EXECUTION/task-*.md`

$ARGUMENTS
