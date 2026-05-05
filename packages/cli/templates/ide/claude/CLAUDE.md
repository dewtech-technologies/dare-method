# DARE Framework

## Metodologia
Você é o Claude Code, assistente de desenvolvimento seguindo o método DARE:
- **D**esign: Requisitos e objetivos definidos em `DARE/DESIGN.md`
- **A**rchitect: Blueprint técnico e grafo de tasks em `DARE/BLUEPRINT.md`
- **R**eview: Validação humana antes de executar
- **E**xecute: Implementação task a task com Ralph Loop

## Regras Fundamentais
- Sempre leia `DARE/BLUEPRINT.md` antes de implementar qualquer feature
- Atualize o status em `DARE/TASKS.md` ao concluir cada task
- Nunca pule o Ralph Loop (build → test → lint) antes de marcar uma task como DONE
- Aprovação humana obrigatória antes de merge para a branch principal
- Use os slash commands `/dare-design`, `/dare-blueprint`, `/dare-execute`, `/dare-tasks`

## Estrutura do Projeto
```
DARE/
├── DESIGN.md        ← Fase D — requisitos (humano define)
├── BLUEPRINT.md     ← Fase A — arquitetura (IA propõe, humano valida)
├── TASKS.md         ← rastreamento de tasks
├── dare-dag.yaml    ← grafo de dependências para execução paralela
└── EXECUTION/       ← logs de execução por task
```

## DAG Task Runner (Execução Paralela)

O DARE suporta execução paralela de tasks via DAG:

```bash
dare blueprint              # gera BLUEPRINT.md + dare-dag.yaml + TASKS.md
dare execute --parallel     # executa tasks em paralelo respeitando depends_on
```

- Tasks com `depends_on: []` rodam no rank 0 (paralelas entre si)
- Tasks com `depends_on: [task-001]` rodam após task-001 concluir
- O canvas `DARE/.canvas.md` mostra o status ao vivo

## Backends Suportados

### Rust/Axum
- Use Rust idioms — sem `unwrap()` em produção
- Async/await com Tokio runtime
- Axum extractors para request handling
- Erros com `thiserror`/`anyhow`
- Ralph Loop: `cargo clippy && cargo test`

### Node.js/NestJS
- Decorators e dependency injection do NestJS
- DTOs com class-validator para todos os inputs
- TypeORM ou Prisma para acesso a dados
- Ralph Loop: `npm run build && npm test && npx eslint src`

### Python/FastAPI
- Pydantic v2 para validação
- Type hints PEP 484 obrigatórios
- async/await em todas as operações IO
- Ralph Loop: `python -m pytest && ruff check .`

### PHP/Laravel
- PSR-12 coding standards
- FormRequests para validação de input
- API Resources para responses
- Ralph Loop: `php artisan test && ./vendor/bin/phpstan analyse`

## Frontends Suportados

### React 18+
- Functional components com hooks apenas
- TypeScript em todos os componentes
- React Query para server state
- Ralph Loop: `npm run build && npm test && npx eslint src`

### Vue 3+
- Composition API com `<script setup>`
- TypeScript em todos os componentes
- Pinia para state management
- Ralph Loop: `npm run build && npm test && npx eslint src`

## Knowledge Graph (GraphRAG)

O projeto mantém um grafo de conhecimento em `dare-graph.yml`:
- **Nodes:** task, file, schema, endpoint, component, entity, concept
- **Edges:** depends_on, implements, uses, references, related_to, contains, extends

A engine GraphRAG vem dentro de `@dewtech/dare-cli` — use `dare graph ingest`,
`dare graph query` e `dare graph stats` para indexar e consultar o grafo.

## DARE MCP Server (opcional)

Quando habilitado, o MCP Server expõe queries de contexto em `http://localhost:3000`:
- `POST /context/query` com `{"type": "architecture"|"task"|"dependency", "query": "..."}`
- Reduz uso de tokens em ~95% comparado a reler arquivos inteiros

## Ralph Loop (obrigatório antes de DONE)

1. **Build** — compile e verifique erros
2. **Test** — rode a suite de testes completa
3. **Lint** — rode o linter/formatter
4. Só marque DONE se os 3 passos passarem sem erros

## Segurança

- Nunca exponha secrets em logs ou outputs
- Valide e sanitize todas as entradas
- Use proteções OWASP Top 10
- Autenticação/autorização em todos os endpoints sensíveis
- Rate limiting em endpoints públicos
