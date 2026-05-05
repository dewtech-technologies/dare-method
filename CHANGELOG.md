# Changelog

Todas as mudanças notáveis deste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

> Como esta é uma metodologia (não software executável), versões refletem
> mudanças na **estrutura do método, comandos canônicos e templates**.
> Patches em wording de prompts ou documentação não bumpam major.

## [Unreleased]

## [2.0.0] — 2026-05

### Mudado (BREAKING)
- **Pacote único:** `@dewtech/dare-core`, `@dewtech/dare-graphrag` e
  `@dewtech/dare-mcp-server` foram unificados em `@dewtech/dare-cli`.
  Instalar `@dewtech/dare-cli` agora dá acesso a tudo — não há subpacotes
  para gerenciar nem subpaths para importar.
  - Os 3 pacotes antigos estão deprecated no npm.
  - Motivo: eliminar o version-sync hell entre pacotes interdependentes.
- **Versão única:** todo o monorepo passa a versionar pelo `@dewtech/dare-cli`.
  Sem mais bumps em cascata; uma versão, um publish.
- **Scripts internos do monorepo:** removidos `pnpm mcp` e `pnpm graphrag`
  do `package.json` raiz (apontavam para pacotes que não existem mais).

### Adicionado
- Binário adicional `dare-mcp-server` distribuído junto com `dare`.
- `implementations/claude/` como fonte da verdade para Claude Code
  (`CLAUDE.md`, slash commands, settings).
- `dare-graph.yml` gerado pelo `dare init` conforme backend escolhido
  (sqlite | json | neo4j); preserva edição manual do usuário.
- Sync automático no build (`scripts/sync-implementations.ts`).

### Corrigido
- `dare --version` agora lê dinamicamente do `package.json` (era hardcoded).
- Geração de `.cursor/commands/` e `.agents/skills/` que produzia stubs vazios.
- Testes do GraphRAG agora usam arquivo temporário (sql.js exige disco).
- Texto em `CLAUDE.md` template orientava `@dewtech/dare-graphrag` standalone;
  agora aponta para os comandos `dare graph` (planejados na v2.3).

### Notas de migração
**Para usuários do CLI:** nenhuma mudança. `dare init`, `dare design`,
`dare blueprint`, `dare execute` funcionam idênticos. Só atualize:

```bash
npm uninstall -g @dewtech/dare-cli
npm install -g @dewtech/dare-cli@latest
```

**Para projetos gerados pelo `dare init`:** nenhuma mudança no código.
Os projetos não importam pacotes `@dewtech/*` — eram CLIs/templates puros.

## [Unreleased - histórico legado]

### Adicionado
- Estrutura inicial pública do repositório
- README polido com posicionamento, comparação com Vibe Coding/BDD/TDD, e seção dedicada ao Ralph Loop
- Imagem do Ralph Wiggum ilustrando o Ralph Loop
- Logo Dewtech no hero
- Reorganização em `implementations/cursor/` e `implementations/antigravity/` autocontidos
- Documentação canônica em `docs/` (methodology, ralph-loop, phases, glossary, faq, comparisons)
- Arquivos de governança (LICENSE MIT, CONTRIBUTING, SECURITY)

## [1.0.0] — 2026-04

### Adicionado
- **Método DARE** com 4 fases (Design → Architect → Review → Execute)
- **Ralph Loop** como ciclo de auto-correção pós-execução
- **Implementação Cursor** com 9 comandos:
  - Core: `/generate-design`, `/generate-blueprint`, `/generate-tasks`, `/execute-task`
  - Infra: `/generate-dockerfile`, `/generate-docker-compose`
  - Análise: `/telemetry-report`
  - Especializados: `/generate-bugfix-design`, `/generate-feature-design`
- **Implementação Antigravity** com 6 skills equivalentes
- **Skills (Cursor)**: Laravel API, Docker, Security, Telemetry
- **Templates** universais: DESIGN, BLUEPRINT, TASKS, TASK-SPEC, TELEMETRY
- **Exemplos** em Laravel + Vue
- **Script** de análise de telemetria (`scripts/analyze-telemetry.py`)
- **Setup automatizado** via `setup-projeto.sh` / `setup-projeto.bat`

[Unreleased]: https://github.com/dewtech-technologies/dare-method/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/dewtech-technologies/dare-method/releases/tag/v1.0.0
