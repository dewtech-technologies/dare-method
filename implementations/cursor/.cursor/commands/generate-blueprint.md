# Comando: /generate-blueprint

## Descrição
Avança o DARE para a fase Architect: lê `DARE/DESIGN.md` aprovado e gera **somente** `DARE/BLUEPRINT.md`.

> As tasks, DAG e specs de execução são geradas depois com `/generate-tasks`, após você revisar e aprovar o Blueprint.

## Instruções para o Cursor Composer

1. **Leia `DARE/DESIGN.md`** — obrigatório. Se não existir, peça `/generate-design` primeiro. Extraia: stack, RF-*, RNF-*, RS-*, integrações, restrições, escopo.

2. **Leia o template:** `templates/BLUEPRINT-template.md` — siga a estrutura fielmente.

3. **Gere `DARE/BLUEPRINT.md`** com seções obrigatórias:

   - **Visão Geral da Arquitetura** — diagrama Mermaid + tabela de decisões com justificativa
   - **Stack Técnica Definida** — versões fixas (não ranges)
   - **Estrutura de Pastas** — árvore completa dos arquivos a criar
   - **Modelo de Dados** — entidades, campos tipados, relacionamentos, índices
   - **Contratos de API** — método, rota, auth, request/response, status codes
   - **Plano de Execução (Fases)** — cada fase com critério de DONE verificável:
     - Fase 1 = containerização (Dockerfile + docker-compose + healthcheck) — sempre
     - Fase N-1 = auditoria de segurança + dependências — sempre
   - **Validation Gates por stack:**
     | Stack | Build | Test | Lint/Audit |
     |-------|-------|------|------------|
     | Rust | `cargo build` | `cargo test --workspace` | `cargo clippy && cargo audit` |
     | Node | `npm run build` | `npm test` | `npx eslint src && npm audit --audit-level=high` |
     | Python | verificar imports | `pytest` | `ruff check . && pip-audit` |
     | PHP | `php artisan config:cache` | `php artisan test` | `./vendor/bin/phpstan && composer audit` |
     | Go | `go build ./...` | `go test ./...` | `golangci-lint run` |
   - **Controles de Segurança** — checklist mapeando cada RS-* do DESIGN para fases específicas
   - **Estratégia de Testes** — unitários + integração + auditoria de deps + E2E
   - **Estratégia de Deploy** — por ambiente
   - **Checklist de Aprovação** — checkboxes para revisão humana

4. **Salve `DARE/BLUEPRINT.md`** e informe:

   _"Blueprint gerado. Revise a arquitetura, os contratos de API e os critérios de DONE de cada fase. Quando aprovado, execute `/generate-tasks` para gerar o DAG e as specs de execução."_

**Não gere** `TASKS.md`, `dare-dag.yaml` nem arquivos em `EXECUTION/` — isso é responsabilidade do `/generate-tasks`.
