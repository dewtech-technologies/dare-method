# Changelog

Todas as mudanças notáveis deste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

> Como esta é uma metodologia (não software executável), versões refletem
> mudanças na **estrutura do método, comandos canônicos e templates**.
> Patches em wording de prompts ou documentação não bumpam major.

## [Unreleased]

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
