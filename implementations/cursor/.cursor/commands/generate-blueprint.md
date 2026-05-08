# Comando: /generate-blueprint

## Descrição
Avança o DARE para a fase Architect: lê `DARE/DESIGN.md` aprovado e gera os 5 artefatos de arquitetura.

## Instruções para o Cursor Composer

1. **Leia `DARE/DESIGN.md`** — obrigatório. Se não existir, peça `/generate-design` primeiro. Extraia: stack, RF-*, RNF-*, RS-*, integrações, restrições.

2. **Leia o template:** `templates/BLUEPRINT-template.md` — siga a estrutura fielmente.

3. **Gere `DARE/BLUEPRINT.md`** com seções obrigatórias:

   - **Visão Geral da Arquitetura** — diagrama Mermaid + tabela de decisões com justificativa
   - **Stack Técnica Definida** — versões fixas (não ranges)
   - **Estrutura de Pastas** — árvore completa dos arquivos a criar
   - **Modelo de Dados** — entidades, campos tipados, relacionamentos, índices
   - **Contratos de API** — método, rota, auth, request/response, status codes
   - **Plano de Execução (Fases)** — cada fase com critério de DONE verificável:
     - **Fase 1 = containerização** (Dockerfile + docker-compose + healthcheck) — sempre
     - **Fase N-1 = auditoria de segurança + dependências** — sempre
   - **Validation Gates por stack:**
     | Stack | Build | Test | Lint/Audit |
     |-------|-------|------|------------|
     | Rust | `cargo build` | `cargo test --workspace` | `cargo clippy && cargo audit` |
     | Node | `npm run build` | `npm test` | `npx eslint src && npm audit --audit-level=high` |
     | Python | verificar imports | `pytest` | `ruff check . && pip-audit` |
     | PHP | `php artisan config:cache` | `php artisan test` | `./vendor/bin/phpstan && composer audit` |
     | Go | `go build ./...` | `go test ./...` | `golangci-lint run` |
   - **Controles de Segurança** — checklist mapeando cada RS-* do DESIGN para tasks específicas
   - **Estratégia de Testes** — unitários + integração + auditoria de deps + E2E
   - **Estratégia de Deploy** — por ambiente

4. **Gere `DARE/dare-dag.yaml`** com regras:
   - `id` kebab-case único; `depends_on` mínimo necessário
   - Pelo menos 2 tasks no rank 0 (paralelismo real)
   - task-001 = containerização; task final = auditoria de segurança
   - Sem task "Ralph Loop final" ou "QA geral" — corre em cada `--complete`
   - `subtask_prompt` totalmente self-contained

5. **Gere `DARE/TASKS.md`** (tabela de status visual)

6. **Gere `DARE/EXECUTION/task-<id>.md`** para cada task usando `templates/TASK-SPEC-template.md`:
   - Objetivo verificável (estado, não ação)
   - Arquivos a criar/modificar (tabela)
   - Seção "Considerações de Segurança" obrigatória
   - Validation gates específicos da stack (build + test + lint + audit se nova dep)

7. **Valide consistência** dos 5 artefatos (IDs, depends_on, complexity iguais nos 3)

8. **Salve e informe:** _"Blueprint gerado com [N] tasks em [K] ranks paralelos. Revise especialmente: [lista de tasks HIGH complexity]. Quando aprovado, execute `dare execute --parallel`."_
