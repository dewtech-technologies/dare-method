# Feature Design: Faxina CLI-only (monorepo enxuto)

> Gerado seguindo o Método DARE (Fase D — Design). Artefato para **revisão humana**
> antes de `/dare-blueprint`. License: MIT.
>
> **Base de evidências:** v3.12.0 entregou paridade terminal↔chat (`AgentProvider`, drivers
> multi-IDE, skills no core do CLI). O produto foi reafirmado como **local-first, CLI como
> superfície principal** — não SaaS, não multi-app no monorepo. Esta feature remove pacotes
> mortos que duplicam docs/marketing e não entram no tarball `@dewtech/dare-cli`.
>
> **Branch:** `feat/v3.13-cli-only` · **Target:** v3.13.0 · **Repo base:** v3.12.0

## Contexto no Projeto Existente

O monorepo hoje tem **três “camadas” de documentação/site** com papéis sobrepostos:

| Caminho | Papel atual | Publicado? |
|---|---|---|
| `docs-site/` + `mkdocs.yml` (raiz) | Doc **canônica** pt/en/es; GitHub Pages via `.github/workflows/docs.yml` | ✅ Sim |
| `docs/` (raiz) | Metodologia interna, RFCs, `skills/INDEX.md`, designs históricos | GitHub (raw) |
| `packages/docs/` | MkDocs **legado** (subset antigo + Docker/K8s) | ❌ Não (workflow próprio morto) |
| `packages/website/` | Landing **legada** (HTML estático + posts + Docker/K8s) | ❌ Não |

O **único pacote npm publicável** é `@dewtech/dare-cli` em `packages/cli/`. Desde v3.1, stacks
e skills foram internalizados no CLI; `packages/docs` e `packages/website` **não têm
`package.json`**, não participam do `pnpm -r build` e não aparecem no tarball — são
**dívida estrutural** da era pré-consolidação.

A direção acordada pós-v3.12:

- **Manter:** CLI + MCP embutido + GraphRAG + guard + DAG + terminal AI.
- **Manter:** `docs-site/` como documentação oficial (gate `verify-docs-coverage`).
- **Manter:** `docs/` como arquivo interno (RFC, fases, INDEX de skills) — **não** confundir
  com `packages/docs/`.
- **Remover:** `packages/docs/` e `packages/website/` (faxina física + links + CI órfã).

## Objetivos e Métricas de Sucesso

| ID | Objetivo | Métrica verificável | Meta |
|---|---|---|---|
| O-01 | Monorepo CLI-centric | Só `packages/cli/` contém código publicável | 1 pacote npm |
| O-02 | Zero duplicação de doc site | `packages/docs/` não existe no tree | diretório ausente |
| O-03 | Zero site legado no repo | `packages/website/` não existe | diretório ausente |
| O-04 | Docs públicas intactas | `mkdocs build --strict` + `verify-docs-coverage` verdes | CI verde |
| O-05 | Links não quebrados | Nenhum link interno aponta para paths removidos | grep + teste |
| O-06 | Instalação npm inalterada | `npm pack` do CLI ≤ tamanho atual ±5% | sem regressão |

## Stakeholders

| Papel | Interesse |
|---|---|
| Autor / Dewtech | Repo reflete produto real (CLI), menos ruído para contributors |
| Usuário final | Doc em `docs-site` (GitHub Pages) continua única e atualizada |
| CI / release | Menos paths fantasma; publish npm só do CLI |

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | **Remover `packages/docs/`** inteiro (docs, Dockerfile, nginx, k8s, workflow) | MUST | `git ls-files packages/docs` vazio |
| RF-02 | **Remover `packages/website/`** inteiro | MUST | idem |
| RF-03 | **Auditoria de links** — README, ROADMAP, `implementations/*`, `packages/cli/README.md`, DARE/*, `docs/*` | MUST | zero referências a `packages/docs` ou `packages/website` |
| RF-04 | **Preservar `docs-site/`** — nenhuma remoção da doc canônica | MUST | nav + i18n intactos |
| RF-05 | **Preservar `docs/`** na raiz (RFC, methodology, skills INDEX) | MUST | pasta intacta salvo links corrigidos |
| RF-06 | **Teste de invariante** — falha se dirs legados voltarem | SHOULD | `cli-only-invariants.test.ts` ou grep no CI |
| RF-07 | **ROADMAP + CHANGELOG `[3.13.0]`** | MUST | shipped + nota de remoção |
| RF-08 | **Conteúdo útil resgatado** — se `packages/docs` tiver página sem equivalente em `docs-site`, migrar antes de apagar | SHOULD | checklist de paridade doc (tabela abaixo) |

### Checklist paridade doc (antes do delete)

| Conteúdo em `packages/docs` | Equivalente em `docs-site`? | Ação |
|---|---|---|
| getting-started/* | `getting-started.md` | Já coberto → delete |
| cli/skill-* | `cli-reference.md` + `utilities.md` | Já coberto → delete |
| skills/* (subset) | `stacks.md`, `agents.md` | Já coberto → delete |
| stacks/ruby-rails-8 | `stacks.md` | Já coberto → delete |
| contributing/publish-a-skill | parcial em `utilities.md` | Verificar 1 parágrafo; migrar se faltar |

## Requisitos Não-Funcionais

| ID | Requisito | Meta |
|---|---|---|
| RNF-01 | **Diff mínimo** | Só remoção + links; sem refactor do CLI |
| RNF-02 | **Compat npm** | `@dewtech/dare-cli` tarball inalterado em conteúdo funcional |
| RNF-03 | **CI verde** | `pnpm -r build`, `pnpm test`, lint, docs gate |
| RNF-04 | **Reversível via git** | delete atômico; restore = revert do PR |

## Requisitos de Segurança

| ID | Requisito | Nota |
|---|---|---|
| RS-01 | Não remover `.github/workflows/docs.yml` nem secrets de Pages | doc deploy continua |
| RS-02 | Dockerfiles legados removidos não devem ser referenciados em CI principal | evita build fantasma |
| RS-03 | Não commitar credenciais ao mover conteúdo | N/A (só delete) |

## Análise de Impacto

### Removidos (delete)

```
packages/docs/          # ~28 arquivos — MkDocs legado + k8s + docker-build workflow
packages/website/       # ~14 arquivos — landing legada + k8s + docker-build workflow
```

### Preservados (sem delete)

```
packages/cli/           # único pacote npm
docs-site/              # doc pública (MkDocs Material + i18n)
docs/                   # RFC, metodologia, skills INDEX, designs históricos
mkdocs.yml              # config canônica (aponta docs-site/)
implementations/        # skills IDE (fonte → sync → templates/ide)
DARE/                   # artefatos do método
```

### Modificados (links e metadados)

| Arquivo / área | Mudança |
|---|---|
| `README.md` | Remover menções a packages legados; reforçar link `docs-site` / GitHub Pages |
| `ROADMAP.md` | Seção Shipped v3.13.0; mover “site institucional” para planejado externo |
| `packages/cli/README.md` | Links que apontam só para `docs/` mantidos; corrigir se citarem `packages/docs` |
| `implementations/*/README.md` | Links `../../docs/` → OK; corrigir se citarem packages removidos |
| `CHANGELOG.md` | Entrada `[3.13.0]` — removed legacy packages |
| `.github/workflows/ci.yml` | Sem change esperado (já não builda packages/docs) |
| `pnpm-workspace.yaml` | Opcional: comentário `packages/*` = só cli; remover `packages/stacks/*` morto do `package.json` workspaces se ainda listado |

### Banco de dados

N/A.

## Stack Técnica

| Camada | Decisão |
|---|---|
| Produto | `@dewtech/dare-cli` único artefato publicável |
| Docs públicas | MkDocs + `docs-site/` (existente) |
| Docs internas | `docs/` + `DARE/` (existente) |
| Validação | `scripts/verify-docs-coverage.mjs` + teste invariante novo |

## Restrições

- **Não remover `docs-site/`** — é a doc oficial e alimenta o gate de cobertura.
- **Não remover `docs/`** nesta fase — conteúdo diferente de `packages/docs/`; migração massiva
  para docs-site é outra feature.
- **Não tocar em `implementations/`** além de links em README.
- **Sem período de deprecação** — dirs não são consumidos por usuários finais; delete direto
  (mesmo princípio do `dare new` em v3.1).

## Fora do Escopo (v3.13)

| Item | Fase futura |
|---|---|
| Brownfield AST (tree-sitter) | v3.14 |
| Executor autônomo robusto (todos drivers aplicam patch) | v3.15 |
| Context layer / produto (GraphRAG ↔ AI empacotado) | v4.0 |
| Migrar todo `docs/` → `docs-site/` | backlog |
| `dare.dewtech.tech` / site institucional externo | ROADMAP planejado (repo separado) |
| Go/Rust rewrite | adiado |

## Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Link quebrado em README/skill | Média | Baixo | RF-03 + grep no CI |
| Conteúdo único só em `packages/docs` | Baixa | Médio | RF-08 checklist antes do delete |
| Contributor com bookmark antigo | Baixa | Baixo | CHANGELOG + redirect note no README |
| Confundir `docs/` com `packages/docs/` | Média | Baixo | Este DESIGN + ROADMAP explicam |

## Plano de Validação (gates)

```powershell
# Invariantes
pnpm --filter @dewtech/dare-cli test -- src/__tests__/cli-only-invariants.test.ts

# Regressão CLI
pnpm --filter @dewtech/dare-cli build
pnpm --filter @dewtech/dare-cli test

# Docs
node scripts/verify-docs-coverage.mjs
pip install -r requirements-docs.txt
mkdocs build --strict

# Links (opcional no CI)
rg "packages/docs|packages/website" --glob "!CHANGELOG.md" --glob "!DARE/DESIGN-*"
# → zero matches
```

## Definition of Done

- [ ] `packages/docs/` e `packages/website/` ausentes do tree
- [ ] Zero referências nos arquivos rastreados (exceto histórico CHANGELOG/DESIGN)
- [ ] Teste invariante verde
- [ ] `verify-docs-coverage` + `mkdocs build --strict` verdes
- [ ] ROADMAP + CHANGELOG `[3.13.0]` + bump `package.json` **antes** da tag `v3.13.0`
- [ ] `dare review` da feature sem achados

## Próximas Etapas

1. **Revisar e aprovar** este DESIGN
2. `/dare-blueprint` → `DARE/BLUEPRINT-Feature-cli-only-cleanup.md`
3. `/dare-tasks` → DAG bloco **13xx**
4. Executar na branch `feat/v3.13-cli-only`
5. Release: bump → tag `v3.13.0` → npm publish (ordem acordada pós-v3.12)

## Decisões Travadas (proposta — confirmar na revisão)

| # | Decisão | Alternativa rejeitada |
|---|---|---|
| D-01 | Delete direto de `packages/docs` e `packages/website` | Deprecation period — dirs não são API pública |
| D-02 | `docs-site/` permanece fonte única de doc de usuário | Mesclar docs-site em packages/docs |
| D-03 | `docs/` raiz permanece para RFC/metodologia interna | Deletar junto com packages/docs |
| D-04 | Target **v3.13.0** (minor — remoção estrutural, sem breaking no CLI) | v4.0 — escopo menor que semver major |
