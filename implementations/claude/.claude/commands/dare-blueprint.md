# /dare-blueprint

Gera o `DARE/BLUEPRINT.md`, `DARE/dare-dag.yaml` e `DARE/TASKS.md` a partir do DESIGN.md.

## Como usar

```
/dare-blueprint
/dare-blueprint --stack node-nestjs+react
```

## O que fazer

1. **Leia `DARE/DESIGN.md`** — obrigatório. Se não existir, peça para rodar `/dare-design` primeiro.

2. **Gere `DARE/BLUEPRINT.md`** com:
   - Stack tecnológico detalhado (versões, libs)
   - Módulos e responsabilidades
   - Contratos de API (endpoints, schemas em OpenAPI)
   - Modelo de dados (tabelas, índices, relações)
   - Decisões arquiteturais com justificativa
   - Estratégia de testes
   - Estratégia de deploy

3. **Gere `DARE/dare-dag.yaml`** com tasks em grafo de dependências:
   ```yaml
   title: "Projeto X - Development Tasks"
   version: "1.0.0"
   models:
     HIGH: "claude-sonnet-4"
     MED: "claude-haiku-4"
     LOW: "claude-haiku-4"
   tasks:
     - id: task-001
       title: "Setup project structure"
       depends_on: []
       complexity: LOW
       subtask_prompt: |
         Setup base project structure following BLUEPRINT.md.
   ```

4. **Gere `DARE/TASKS.md`** com tabela de status:
   ```markdown
   | ID | Título | Status | Depends On | Complexity |
   |----|--------|--------|------------|------------|
   | task-001 | Setup | ⏳ PENDING | - | LOW |
   ```

5. **Maximize paralelismo:** só adicione `depends_on` quando a task filha REALMENTE não pode começar sem o output da pai.

6. **Aguarde aprovação humana** antes de executar qualquer task.

## Templates disponíveis

- `templates/BLUEPRINT-template.md`
- `templates/TASKS-template.md`

## Próximo passo

Após aprovação humana, rodar:
```bash
dare execute --parallel
```

$ARGUMENTS
