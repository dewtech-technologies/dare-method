# AGENT 3 — CLI Evoluído (Skill Package System)

**Branch:** `agent/3-cli`  
**Worktree:** `dare-agent-3-cli`  
**Período:** Semana 1-3 do plano de 30 dias  
**Prioridade:** Alta (libera comunidade de publicar skills)  

---

## Objetivo

Evoluir o DARE CLI de gerador de projetos para **gerenciador de skills** completo com registry, versionamento e install/publish.

Novos comandos:
- `dare skill add <name>[@version]`
- `dare skill list [--installed]`
- `dare skill remove <name>`
- `dare skill publish <path>`
- `dare skill update <name>[@version]`
- `dare skill info <name>`

---

## Dependências

- **DESIGN.md:** `docs/design/cli/dare-cli-skill-package-system/DESIGN.md`
- **DECISIONS.md:** consultar antes de qualquer decisão
- **Bloqueado por:** nenhum — paralelo a agents 1 e 2

---

## Gates de Bloqueio

- **Antes de tag:** `dare skill add dare-ax@1.0.0` funciona de ponta a ponta
- **Antes de PR:** testes passam + `dare:metrics` 100%

---

## TASKS — Semana 1

### Infraestrutura do Manifest (Dias 1-2)

**Status:** ⏳ TODO

- [ ] Definir schema do `.dare/skills.yml` (name, version, enabled, depends_on)
- [ ] Implementar `ManifestReader` (lê e parseia manifest)
- [ ] Implementar `ManifestWriter` (atualiza manifest sem perder comentários)
- [ ] Validação de manifest ao rodar qualquer `dare` command
- [ ] Testes de ManifestReader + ManifestWriter

### `dare skill list` (Dias 2-3)

- [ ] Chamada HTTP ao registry `GET /api/v1/skills`
- [ ] Output formatado em tabela: `name | version | description | author`
- [ ] Flag `--installed`: lê de `.dare/skills.yml` local
- [ ] Flag `--json`: output estruturado (obrigatório por dare-ax M-03)
- [ ] Cache local de 1 hora para evitar chamadas repetidas ao registry

### `dare skill info` (Dias 3-4)

- [ ] `GET /api/v1/skills/<name>` — busca detalhes
- [ ] Output: nome, versão, dependências, compatibility, size, last updated
- [ ] Flag `--json`
- [ ] Fallback graceful se skill não encontrado (404 → mensagem clara)

---

## TASKS — Semana 2

### `dare skill add` (Dias 1-3) — CORE

- [ ] Resolução de versão (latest vs. específica)
- [ ] Resolução de dependências (topological sort)
- [ ] Download do tarball do registry com checksum validation
- [ ] Extração para `packages/skills/<name>/`
- [ ] Atualiza `.dare/skills.yml`
- [ ] Post-install hook (roda `skill.install.sh` se existir)
- [ ] Flag `--dry-run`: mostra o que seria instalado sem instalar
- [ ] Testes de install, dependency resolution, checksum fail

### `dare skill remove` (Dia 3)

- [ ] Verifica dependências reversas (outra skill depende desta?)
- [ ] Remove arquivos
- [ ] Atualiza `.dare/skills.yml`
- [ ] Flag `--force` para remover mesmo com dependências

### `dare skill update` (Dia 4)

- [ ] Checa se há versão nova
- [ ] Resolve dependências da nova versão
- [ ] Remove antiga, instala nova
- [ ] Guarda backup por 7 dias (rollback possível)

---

## TASKS — Semana 3

### `dare skill publish` (Dias 1-3) — REGISTRY

- [ ] Validação de `skill.yml` (metadata obrigatória)
- [ ] Empacotamento em tarball com checksum
- [ ] Autenticação via GitHub token
- [ ] Upload para registry (`POST /api/v1/skills/<name>/publish`)
- [ ] Confirmação + URL de acesso

### Registry Backend (Dias 3-5)

- [ ] Simples HTTP server (Cloudflare Worker ou Vercel Function)
- [ ] Endpoints: `GET /skills`, `GET /skills/:name`, `POST /skills/:name/publish`
- [ ] Storage: JSON files em S3 ou GitHub repo (registry-data)
- [ ] Auth: GitHub JWT
- [ ] Rate limiting

---

## Schema do `skill.yml` (Metadados de uma Skill)

```yaml
# Em packages/skills/dare-ax/skill.yml
name: dare-ax
version: 1.0.0
description: "Agent Experience patterns for DARE projects"
author: Wanderson
license: MIT
homepage: https://github.com/dewtech-technologies/dare-method
repository: https://github.com/dewtech-technologies/dare-method

keywords:
  - ax
  - agent-experience
  - discovery

dare_version: ">=3.0.0"

dependencies: {}  # No dependencies for dare-ax

files:
  - generator.ts
  - validator.ts
  - metrics.ts
  - templates/
  - tests/

scripts:
  install: ""
  postinstall: ""
```

---

## Convenções

- TypeScript strict
- `--json` flag em todos os comandos (dare-ax M-03)
- Erros com mensagens claras + exit code não-zero
- Offline: se sem rede, usa cache local
- Nenhuma dependência circular no resolution
- Testes: mock do registry HTTP (sem rede em testes)

## Perguntas / Blockers

Registrar no `docs/design/DECISIONS.md` e pinger Wanderson.

## Histórico

| Data | Status | Notas |
|------|--------|-------|
| 2026-05-26 | Criado | Semana 0 — setup inicial |
