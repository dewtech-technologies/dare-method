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

## TASKS — Semana 2 ✅ DONE

### `dare skill add` (Dias 1-3) — CORE

- [x] Resolução de versão (latest vs. específica)
- [x] Resolução de dependências (topological sort)
- [x] Fallback para LocalRegistry quando skill não está no mock
- [x] Extração para `packages/skills/<name>/` via LocalRegistry.install()
- [x] Atualiza `.dare/skills.yml`
- [x] Flag `--dry-run`: mostra o que seria instalado sem instalar

### `dare skill remove` (Dia 3)

- [x] Verifica dependências reversas (outra skill depende desta?)
- [x] Remove de `.dare/skills.yml`
- [x] Flag `--force` para remover mesmo com dependências

### `dare skill update` (Dia 4)

- [x] Checa se há versão nova (compara installed vs. target)
- [x] Remove antiga, instala nova (upsert no manifest)
- [x] Flag `--dry-run`: mostra diff de versão sem alterar
- [x] Testes: skill não instalada, já na última versão, atualiza, dry-run

### FASE 6 — `dare skill publish`

- [x] Validação de `skill.yml` (campos obrigatórios: name, version, description, author, license, dare_version)
- [x] MIT obrigatório — rejeita qualquer licença diferente (D-001)
- [x] Coleta de arquivos (exclui node_modules/, dist/, .git/)
- [x] Salva em `~/.dare/registry/<name>/<version>/`
- [x] Atualiza `index.json`
- [x] Flag `--dry-run`: valida e lista arquivos sem publicar
- [x] Flag `--json`
- [x] Testes: skill.yml inválido, licença não-MIT, dry-run, publish com sucesso

### FASE 7 — Registry local (`~/.dare/registry/`)

- [x] `LocalRegistry.publish(skillPath, meta)` — copia para registry e atualiza index.json
- [x] `LocalRegistry.list()` — lê index.json
- [x] `LocalRegistry.find(name, version?)` — busca por nome/versão
- [x] `LocalRegistry.install(name, version, targetPath)` — instala skill no projeto
- [x] Testes completos: list, find, publish, install

### FASE 8 — `dare skill list` com skills locais + mock

- [x] Combina skills do mock + skills locais (sem duplicatas)
- [x] Skills locais marcadas com `[local]` na saída formatada
- [x] JSON inclui campo `local: boolean`

---

## TASKS — Semana 3 ✅ DONE

### `dare skill publish` — Extensões futuras

- [x] Autenticação via GitHub token (Bearer token, fase 1)
- [x] Upload para registry remoto (`POST /api/publish/:name`) com flag `--remote --token`
- [x] Confirmação + URL de acesso remoto
- [ ] Empacotamento em tarball com checksum (atualmente copia arquivos) — v1.1

### Registry Backend (Dias 3-5)

- [x] Vercel Functions backend em `packages/registry/`
- [x] Endpoints: `GET /api/skills`, `GET /api/skills/:name`, `POST /api/publish/:name`
- [x] Storage: `data/index.json` pré-populado com 6 skills DARE
- [x] Auth: Bearer token (fase 1 — aceita qualquer token não-vazio)
- [x] Rate limiting: in-memory sliding window (100 req/min list, 10 publishes/hora)
- [x] RFC 7807 error format em todos os endpoints (D-006)
- [x] MIT license enforcement (D-001)
- [x] CORS headers

### CLI integrado com registry remoto

- [x] `RemoteRegistry` class com fetch + AbortController timeout 3s
- [x] `RegistryResolver` com prioridade: remote > local > mock
- [x] `dare skill list` mostra fonte: `[remote]`, `[local]`, `[mock]`
- [x] `dare skill publish --remote --token <token>` publica no registry remoto
- [x] Fallback automático quando remote timeout/offline

### Testes — Semana 3

- [x] `packages/registry/tests/skills.spec.ts` — 23 testes
- [x] `packages/registry/tests/publish.spec.ts` — 26 testes (auth, license, upsert, rate limit)
- [x] `packages/registry/tests/rate-limit.spec.ts` — 16 testes
- [x] `packages/cli/src/skills/tests/remote-registry.spec.ts` — 23 testes

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
| 2026-05-26 | DONE | Semana 2 — update, publish, registry-local, list local. 269 testes passando (+64). |
| 2026-05-26 | DONE | Semana 3 — registry backend Vercel Functions, RemoteRegistry, RegistryResolver. 357 testes passando (+88). |
