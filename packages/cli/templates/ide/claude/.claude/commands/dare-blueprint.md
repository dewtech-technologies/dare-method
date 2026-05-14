# /dare-blueprint

Gera **somente** `DARE/BLUEPRINT.md` a partir do `DARE/DESIGN.md`.

> Tasks, DAG e specs de execução são geradas depois com `/dare-tasks`, após aprovação humana do Blueprint.

## Como usar

```
/dare-blueprint
/dare-blueprint --stack node-nestjs+react
```

## O que fazer

### 1. Ler `DARE/DESIGN.md`

Obrigatório. Se não existir, peça para rodar `/dare-design` primeiro.

Extraia e use durante todo o comando:
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

**2.8 Controles de Segurança** — checklist com todos os RS-* do DESIGN mapeados para fases específicas

**2.9 Estratégia de Testes** — unitários + integração + segurança (auditoria de deps) + E2E se frontend

**2.10 Estratégia de Deploy** — por ambiente com branch, trigger e infra

**2.11 Checklist de Aprovação** — checkboxes para o usuário revisar antes de prosseguir

### 3. Salvar e aguardar aprovação humana

Salve `DARE/BLUEPRINT.md` e informe:

_"Blueprint gerado. Revise a arquitetura, os contratos de API e os critérios de DONE de cada fase — especialmente as tasks de complexidade HIGH. Quando aprovado, rode `/dare-tasks` para gerar o DAG e as specs de execução."_

**Não gere** `DARE/TASKS.md`, `DARE/dare-dag.yaml` nem arquivos em `DARE/EXECUTION/`.
Esses artefatos são responsabilidade exclusiva do `/dare-tasks`.

$ARGUMENTS
