# /dare-blueprint

Gera os 5 artefatos a partir do `DARE/DESIGN.md`:

1. `DARE/BLUEPRINT.md` — arquitetura técnica detalhada
2. `DARE/TASKS.md` — visão humana das tasks
3. `DARE/dare-dag.yaml` — grafo executável pelo CLI
4. `DARE/EXECUTION/task-<id>.md` — spec detalhada por task
5. `DARE/dag-graph.mmd` — visualização Mermaid do DAG

## Como usar

```
/dare-blueprint
/dare-blueprint --stack node-nestjs+react
```

## O que fazer

### 1. Ler `DARE/DESIGN.md`

Obrigatório. Se não existir, peça para rodar `/dare-design` primeiro.

Extraia e memorize para uso neste comando:
- Stack técnica (linguagem, framework, versões)
- Requisitos funcionais priorizados (RF-*)
- Requisitos de segurança (RS-*)
- Integrações externas confirmadas
- Restrições e escopo

### 2. Gerar `DARE/BLUEPRINT.md`

Siga o template `templates/BLUEPRINT-template.md`. Seções obrigatórias:

**2.1 Visão Geral da Arquitetura**
- Diagrama Mermaid da arquitetura
- Tabela de decisões arquiteturais com justificativa (não apenas "escolha X")

**2.2 Stack Técnica Definida** — versões fixas, não ranges

**2.3 Estrutura de Pastas** — árvore completa dos arquivos que serão criados

**2.4 Modelo de Dados** — entidades, campos tipados, relacionamentos, índices necessários

**2.5 Contratos de API** — tabela completa: método, rota, auth, request body, response, status codes

**2.6 Plano de Execução (Fases)** — cada fase com:
- Nome e objetivo
- **Critério de DONE** — comportamento verificável e testável (não "código feito")
- Lista de entregáveis concretos

  > **Fase 1 é sempre containerização** (Dockerfile + docker-compose + healthcheck)
  > **Fase N-1 é sempre auditoria de segurança e dependências**

**2.7 Validation Gates por Stack**

| Stack | Build | Test | Lint/Audit |
|-------|-------|------|------------|
| Rust/Axum | `cargo build` | `cargo test --workspace` | `cargo clippy && cargo audit` |
| Node/NestJS | `npm run build` | `npm test` | `npx eslint src && npm audit --audit-level=high` |
| Python/FastAPI | verificar imports | `pytest` | `ruff check . && pip-audit` |
| PHP/Laravel | `php artisan config:cache` | `php artisan test` | `./vendor/bin/phpstan && composer audit` |
| Go | `go build ./...` | `go test ./...` | `golangci-lint run` |

**2.8 Controles de Segurança** — checklist com todos os RS-* do DESIGN mapeados para tasks específicas

**2.9 Estratégia de Testes** — unitários + integração + segurança (auditoria de deps) + E2E se frontend

**2.10 Estratégia de Deploy** — por ambiente com branch, trigger e infra

### 3. Gerar `DARE/dare-dag.yaml` (grafo executável)

Schema canônico:

```yaml
title: "<Nome do Projeto> - Development Tasks"
version: "1.0.0"

limits:
  parent_context_chars: 2000
  task_output_chars: 4000
  timeout_seconds: 600

models:
  cursor:      { HIGH: gpt-5.3-codex,     MED: composer-2,       LOW: auto-low }
  claude:      { HIGH: claude-sonnet-4-6, MED: claude-haiku-4-5, LOW: claude-haiku-4-5 }
  antigravity: { HIGH: gemini-2.5-pro,    MED: gemini-2.5-flash, LOW: gemini-2.5-flash }

tasks:
  - id: task-001
    title: "Containerização — Dockerfile + docker-compose"
    depends_on: []
    complexity: LOW
    spec_file: EXECUTION/task-001.md
    subtask_prompt: |
      <prompt completamente self-contained>
```

**Regras inegociáveis:**

- `id` em kebab-case e único
- `depends_on` **mínimo** — só quando a task filha literalmente não pode começar sem o output da pai
- `subtask_prompt` totalmente self-contained — não use "siga o padrão da task-001"
- Pelo menos 2 tasks no rank 0 (`depends_on: []`) para haver paralelismo real
- Cadeia linear (`001→002→003→...`) é antipattern — reanalise o grafo
- `complexity: HIGH` apenas para lógica de segurança crítica, algoritmos complexos ou integrações externas arriscadas
- **task-001 = containerização** sempre
- **task-N-1 ou task-N = auditoria de segurança + dependências** (sem CVE HIGH/CRITICAL)
- **NÃO crie task "Ralph Loop final" / "QA final"** — o Ralph Loop roda em CADA `--complete`
- **NÃO crie task "Refactoring geral"** — refactoring faz parte de cada task
- Testes com assertions reais — `assertTrue(true)` quebra o gate e a task vai para FAILED

### 4. Gerar `DARE/TASKS.md` (visão humana)

```markdown
# Tasks: <Nome do Projeto>

## Visão Geral
- Total de Tasks: N
- Ranks paralelos: N

## Tabela de Status

| ID       | Título                    | Status      | Depends On       | Complexity |
|----------|---------------------------|-------------|------------------|------------|
| task-001 | Containerização           | ⏳ PENDING  | —                | LOW        |
| task-002 | DB migrations             | ⏳ PENDING  | —                | MED        |
| task-003 | Auth endpoints            | ⏳ PENDING  | task-001, 002    | HIGH       |
```

### 5. Gerar `DARE/EXECUTION/task-<id>.md` (uma por task)

Para CADA task, use o template `templates/TASK-SPEC-template.md`:
- Objetivo verificável (não uma ação, mas um estado observável)
- Arquivos a criar/modificar (tabela)
- Implementação passo a passo
- **Considerações de segurança** (seção obrigatória mesmo para tasks de infra)
- **Validation Gates** específicos da stack (build + test + lint + audit se nova dep)
- Critérios de DONE explícitos

### 6. Validar consistência dos 5 artefatos

- [ ] Mesmos `id`s em `TASKS.md`, `dare-dag.yaml` e `EXECUTION/task-*.md`
- [ ] Mesmas `depends_on` nos três artefatos
- [ ] Mesma `complexity` nos três artefatos
- [ ] Sem ciclos no DAG
- [ ] Pelo menos 2 tasks no rank 0
- [ ] task-001 é containerização
- [ ] Existe task de auditoria de segurança/dependências
- [ ] Cada `subtask_prompt` é executável sem contexto adicional

### 7. Regenerar visualização do DAG

```bash
dare dag viz -o DARE/dag-graph.mmd
```

### 8. Aguardar aprovação humana

**Não execute nenhuma task** até o usuário revisar e aprovar os 5 artefatos.

## Próximos passos

Após aprovação:

```bash
dare execute --parallel --runner claude
dare execute --runner claude          # sequencial (debug)
dare execute --task task-003 --runner claude  # task única
```

Ou slash commands: `/dare-dag-run` · `/dare-execute task-001` · `/dare-tasks`

$ARGUMENTS
