---
name: dare-tasks
description: Decompõe o BLUEPRINT aprovado em tasks atômicas e gera os 3 artefatos da fase de execução do DARE (TASKS.md, dare-dag.yaml, EXECUTION/task-*.md). Use quando o usuário aprovar o BLUEPRINT.md. A construção do grafo segue rigorosamente a skill dare-dag-runner.
---

# DARE Tasks Skill

Você é o especialista em decomposição de projetos do método DARE. Seu papel é
quebrar o BLUEPRINT aprovado em tasks atômicas e gerar simultaneamente os
**três artefatos** da fase de execução, garantindo consistência entre eles.

## Quando usar esta skill

- BLUEPRINT.md foi aprovado pelo usuário
- Necessário criar o plano de execução (tasks + grafo + specs)
- Terceira fase do Método DARE (transição A → E)

## Pré-requisitos

Antes de gerar, leia também a skill `dare-dag-runner` — ela contém as regras
inegociáveis do grafo (`depends_on` mínimo, complexity, prompt self-contained,
limites de 2000/4000 chars, ranks paralelos).

## Os 3 artefatos sempre juntos

| Arquivo | Para quê | Lido por |
|---------|----------|----------|
| `DARE/TASKS.md` | Visão humana com tabela e progresso | Humano |
| `DARE/dare-dag.yaml` | Grafo executável | CLI `dare execute` |
| `DARE/EXECUTION/task-<id>.md` | Spec detalhada por task | Subagente ao executar |

Os três precisam estar **consistentes**: mesmos `id`s, mesmas `depends_on`,
mesmas `complexity`. Inconsistência aqui quebra a execução.

## Como usar

### Passo 1: Ler o BLUEPRINT aprovado

Leia `DARE/BLUEPRINT.md`. Extraia:
- Fases do plano de execução
- Endpoints, modelos de dados, schemas
- Estrutura de diretórios
- Decisões arquiteturais
- Estratégia de testes

### Passo 2: Decompor em tasks atômicas

Cada task deve:
- Ser pequena o suficiente para uma conversa única (15–60 min de trabalho)
- Ter dependências reais e mínimas (não falsas)
- Ser testável isoladamente
- Incluir validações de segurança apropriadas
- Ter `complexity` honesta (LOW/MED/HIGH)

### Passo 3: Gerar `DARE/TASKS.md` (visão humana)

```markdown
# Tasks: [Nome do Projeto]

## Visão Geral
- Total de Tasks: [N]
- Ranks paralelos: [N]
- Tempo estimado: [horas]

## Tabela de Status

| ID       | Título                      | Status      | Depends On       | Complexity |
|----------|-----------------------------|-------------|------------------|------------|
| task-001 | Setup project structure     | ⏳ PENDING  | —                | LOW        |
| task-002 | DB migrations               | ⏳ PENDING  | —                | MED        |
| task-003 | Auth controllers            | ⏳ PENDING  | task-001, 002    | HIGH       |
| ...      | ...                         | ...         | ...              | ...        |

## Tarefas por Fase

### Phase 1: Setup
- task-001: Setup project structure
- task-002: DB migrations

### Phase 2: Auth
- task-003: Auth controllers (deps: 001, 002)
- ...

## Próximas Etapas
1. Revisar e aprovar este TASKS.md
2. Executar paralelo: `dare execute --parallel`
3. Ou task isolada: `/dare-execute task-001`
```

### Passo 4: Gerar `DARE/dare-dag.yaml` (grafo executável)

Schema canônico:

```yaml
title: "[Nome do Projeto] - Development Tasks"
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
      Create directories, initialize package files. No business logic yet.
      Validation gate: project builds.

  - id: task-002
    title: "DB migrations"
    depends_on: []
    complexity: MED
    spec_file: EXECUTION/task-002.md
    subtask_prompt: |
      Create migrations for users and refresh_tokens tables per BLUEPRINT.
      Include indexes and FKs. Validation gate: migrate runs cleanly.
```

**Regras inegociáveis (da skill dare-dag-runner):**
- `id` em kebab-case e único
- `depends_on` mínimo — só quando filha **literalmente** precisa do output
- `subtask_prompt` self-contained (subagente recebe só ele + 2000 chars de pais)
- Pelo menos 2 tasks no rank 0 (`depends_on: []`)
- Cadeia linear é antipattern — reveja

### Passo 5: Gerar `DARE/EXECUTION/task-<id>.md` (specs detalhadas)

Para CADA task no YAML, crie a spec usando `templates/TASK-SPEC-template.md`:

```markdown
# Task 001: Setup project structure

## Objetivo
Criar a estrutura base do projeto seguindo o BLUEPRINT.

## Descrição
Inicializar diretórios, package files e configuração mínima.
Sem lógica de negócio — apenas scaffolding.

## Arquivos a Criar
- `src/` (diretório)
- `tests/` (diretório)
- `package.json` (ou equivalente da stack)
- `.gitignore`

## Validation Gates
- [ ] Estrutura criada
- [ ] Build passa sem erros
- [ ] Lint sem warnings
- [ ] `package.json` (ou Cargo.toml, composer.json) válido

## Testes
```bash
npm run build    # ou cargo build, composer install, etc.
```

## Segurança
- `.env` no `.gitignore`
- Nenhum secret commitado

## Próxima Task
Task 002: DB migrations
```

### Passo 6: Validar consistência

Antes de entregar, confirme:
- [ ] Mesmos `id`s em `TASKS.md`, `dare-dag.yaml` e `EXECUTION/task-*.md`
- [ ] Mesmas `depends_on` nos três
- [ ] Mesmas `complexity`
- [ ] Sem ciclos no grafo
- [ ] Pelo menos 2 tasks no rank 0
- [ ] Cada `subtask_prompt` é executável sem contexto adicional

### Passo 7: Pedir aprovação

> Gerados os 3 artefatos da fase de execução:
> - `DARE/TASKS.md` ([N] tasks)
> - `DARE/dare-dag.yaml` ([N] ranks paralelos)
> - `DARE/EXECUTION/task-*.md` ([N] specs)
>
> Revise. Quando aprovar, execute: `dare execute --parallel --runner antigravity`.

## Boas práticas

1. **Atômicas:** cada task é independente o suficiente para uma conversa
2. **Testáveis:** validation gates específicos da stack
3. **Documentadas:** specs claras e auto-contidas
4. **Seguras:** integre OWASP nos pontos sensíveis
5. **Paralelizáveis:** maximize rank 0; minimize cadeias lineares

## Erros comuns a evitar

| Erro | Como corrigir |
|------|---------------|
| Cadeia linear `001→002→003→...` | Adicione paralelismo onde a dependência é falsa |
| `subtask_prompt` referenciando "como combinamos" | Coloque tudo no prompt explicitamente |
| Tudo em `complexity: HIGH` | Avalie honestamente — HIGH só para lógica crítica |
| `id` duplicado ou com espaços | Use kebab-case e únicos |
| Inconsistência entre os 3 artefatos | Revise antes de aprovar |
