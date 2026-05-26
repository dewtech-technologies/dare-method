# DESIGN.md — CLI `dare-cli-skill-package-system` v1.0

**Data:** 2026-05-26  
**Versão:** 1.0  
**Status:** Final  
**Autor:** Wanderson (Dewtech Technologies)  

---

## 1. Visão

`dare-cli-skill-package-system` evolui o DARE CLI de um **gerador de projetos** para um **gerenciador de skills** completo.

Novos comandos:
- `dare skill add <name>` — instalar skill em projeto existente
- `dare skill list` — listar skills disponíveis (com versões, descrição)
- `dare skill remove <name>` — desinstalar skill
- `dare skill publish <path>` — publicar skill no registry
- `dare skill update <name>` — atualizar skill para nova versão
- `dare skill info <name>` — detalhes de skill (dependências, compatibility)

Permits **composition** — começar com projeto base, adicionar skills sob demanda (não all-or-nothing).

---

## 2. Problema que Resolve

### 2.1 O gap atual

Hoje o CLI só faz `dare new`. Depois de criado:
- "Como adiciono LLM feature?" → manual install do dare-llm-integration
- "Como sou para nova versão da skill?" → manual clone + update
- "Como publico minha skill custom?" → zero infrastructure

### 2.2 Sintomas

1. Developers burlam structure (copy-paste de outro projeto)
2. Skill updates são frágeis (incompatibilities ninguém tracked)
3. Nenhuma community-contributed skills (no registry)
4. Versionamento impossível (não há "skill v1.0 vs v1.1")

### 2.3 Raiz

**Falta infrastructure** de skill management. CLI é apenas scaffolding, não package manager.

---

## 3. Requisitos Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RF-01 | Skill registry | Repositório central de skills (HTTP API, indexado) |
| RF-02 | dare skill add | Instala skill em projeto; atualiza config/manifest |
| RF-03 | dare skill list | Lista skills com versão, description, author |
| RF-04 | Versioning | Skills usam SemVer; compatibilidade tracked |
| RF-05 | Dependency resolution | Skill pode depender de outras skills (transitive) |
| RF-06 | dare skill publish | Publica skill no registry com metadados |
| RF-07 | Removal & cleanup | `dare skill remove` limpa arquivo e dependências |
| RF-08 | Manifest tracking | `.dare/skills.yml` tracks installed skills + versions |

---

## 4. Requisitos Não-Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RNF-01 | Registry < 500ms latency | HTTP API is fast |
| RNF-02 | Skill adds < 30s | Installation completes in < 30s |
| RNF-03 | Offline fallback | Works without network if cached |
| RNF-04 | Backwards compatible | Old projects still work |

---

## 5. Requisitos de Segurança

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RS-01 | Registry signature | Skills signed (prevent tampering) |
| RS-02 | Author verification | Author identity verified (badges for official) |
| RS-03 | No malware | Registry screens for common attack patterns |
| RS-04 | Audit trail | Log all installs/removes for compliance |

---

## 6. Stakeholders

| Stakeholder | Interesse |
|-------------|-----------|
| **Developer** | Easy skill discovery and installation |
| **Community** | Ability to publish custom skills |
| **Wanderson** | Quality gate on registry |
| **DevOps** | Dependency tracking and security |

---

## 7. Métricas de Sucesso

**Apenas Tipo A:**

- **M-01**: 100% de installed skills are tracked em `.dare/skills.yml`
- **M-02**: 0% de unauthorized skill installations (registry enforced)
- **M-03**: Skill add completes < 30s for 95th percentile
- **M-04**: 0% broken dependencies (resolution works 100%)

---

## 8. Antipatterns Explícitos

| AP-ID | Antipattern | Por que evitar |
|-------|-----------|-----------------|
| AP-01 | Manual file editing | Edit `.dare/skills.yml` by hand. Do `dare skill` instead. |
| AP-02 | No manifest | Project has skills but no tracking file. Loses state. |
| AP-03 | Unversioned skills | Skill with no semver. Breaking changes undetected. |
| AP-04 | Circular dependencies | Skill A depends on B, B on A. Breaks resolution. |
| AP-05 | Giant monolithic skills | Single skill does everything. Hard to compose. |
| AP-06 | No breaking change docs | V1.0 to V2.0: no migration guide. |
| AP-07 | Registry downtime | Can't install skills when registry down. No fallback. |

---

## 9. Decisões Arquiteturais

### ADR-01: Manifest-Driven Installation

**Decisão:** `.dare/skills.yml` is source of truth:

```yaml
# .dare/skills.yml
skills:
  - name: dare-ax
    version: "1.0.0"
    authors: [Wanderson]
    enabled: true
    
  - name: dare-llm-integration
    version: "1.0.0"
    authors: [Wanderson]
    enabled: true
    depends_on:
      - dare-ax
      - dare-quality-telemetry
```

Each project tracks exactly which skills are installed (and versions). CI validates manifest compliance.

**Racional:** Reproducibility; version locking.

**Consequências:**
- Manifest grows with skills
- Dependency resolution needed

---

### ADR-02: SemVer Strict + Compatibility Matrix

**Decisão:** Skills use SemVer:
- `1.0.0` = major feature
- `1.0.1` = patch (backwards compatible)
- `2.0.0` = breaking change

Registry tracks compatibility matrix:

```json
{
  "skills": {
    "dare-rails-design": {
      "1.0.0": {
        "compatible_with": {
          "dare-ax": ["1.0.0"],
          "dare-layered-design": ["1.0.0"]
        }
      },
      "1.1.0": {
        "compatible_with": {
          "dare-ax": ["1.0.0", "1.1.0"],
          "dare-layered-design": ["1.0.0", "1.1.0"]
        }
      }
    }
  }
}
```

**Racional:** Clear breaking change semantics.

**Consequências:**
- Registry maintains compatibility metadata
- Slow skill adoption (semver discipline required)

---

### ADR-03: Registry HTTP API (GitHub-like)

**Decisão:** Centralized skill registry accessible via HTTP:

```
GET /api/v1/skills              # List all
GET /api/v1/skills/<name>       # Get skill info
GET /api/v1/skills/<name>/<version>  # Specific version
POST /api/v1/skills/<name>/publish   # Publish new version
```

Hosted at `registry.dare-method.dev` (or S3 + CloudFront).

**Racional:** Distributed; cacheable; same as npm, crates.io.

**Consequences:**
- Registry infrastructure needed
- Rate limiting needed

---

### ADR-04: Local Cache + Offline Support

**Decisão:** Install skill once, cache locally. Offline installs from cache:

```bash
~/.dare/cache/skills/dare-ax/1.0.0/
├── manifest.yml
├── files/...
└── metadata.json
```

`dare skill add dare-ax` checks cache first; falls back to registry.

**Racional:** Offline productivity; faster reinstalls.

**Consequências:**
- Cache management needed (cleanup old)
- Storage on user machine

---

## 10. Riscos e Mitigações

| Risco | Severidade | Mitigación |
|-------|-----------|-----------|
| Broken dependency hell | **Alta** | Dependency resolution via SAT solver (or conservative approach) |
| Registry unavailable | **Média** | Local cache + offline mode |
| Malicious skills in registry | **Alta** | Code review + signature verification |
| Skill conflicts (multiple versions) | **Média** | Manifest locks versions explicitly |

---

## 11. Dependências

### Internal

- DARE CLI (exists; extends with skill commands)
- dare-quality-telemetry (validates M-01 to M-04)
- All 6 transversal skills (available for install)

### External

- HTTP registry (hosted by Wanderson)
- GitHub (authentication for publishing)
- npm (inspiration for design)

---

## 12. Fora de Escopo

- Advanced dependency resolution (SAT solver) — v1.1
- Skill marketplace with ratings — v1.1+
- Custom registries (self-hosted) — v1.1
- Git-based skills (clone from GitHub) — v1.1

---

## 13. Roadmap Pós v1.0

### v1.1 — Advanced Resolution + Marketplace

- Dependency SAT solver (handle complex scenarios)
- Skill marketplace with ratings/reviews
- Search and filtering
- Custom registry support

**Entrega esperada:** month 2

---

### v2.0+

- Skill composition validator
- Automated testing of skill combinations
- Auto-update checker
- Fallback registry (mirror)

---

## Apêndice A: Example Commands

```bash
# List available skills
dare skill list

# Output:
# dare-ax 1.0.0 (Core AX patterns)
# dare-layered-design 1.0.0 (Layered architecture)
# dare-llm-integration 1.0.0 (LLM patterns)
# dare-frontend-design 1.0.0 (Frontend patterns)
# dare-realtime 1.0.0 (Real-time patterns)
# dare-quality-telemetry 1.0.0 (Metrics collection)
# dare-rails-design 1.1.0 (Rails 8 stack)

# Add a skill to existing project
cd myproject
dare skill add dare-llm-integration@1.0.0

# Get info about a skill
dare skill info dare-rails-design

# Output:
# dare-rails-design v1.1.0
# Rails 8 stack with all DARE patterns integrated
# Author: Wanderson
# Homepage: https://github.com/dewtech/dare-method
# Repository: https://github.com/dewtech/dare-method
#
# Dependencies:
#   dare-ax >= 1.0.0
#   dare-layered-design >= 1.0.0
#   dare-realtime >= 1.0.0
#
# Compatibility:
#   Rails >= 8.0.0
#   Ruby >= 3.3.0
#
# Installation size: 2.4 MB
# Last updated: 2026-05-26

# List installed skills in current project
dare skill list --installed

# Output:
# ✓ dare-ax 1.0.0
# ✓ dare-layered-design 1.0.0

# Update a skill
dare skill update dare-ax@1.1.0

# Remove a skill
dare skill remove dare-axios

# Publish your custom skill
dare skill publish ./my-custom-skill

# Output:
# Publishing my-custom-skill v1.0.0...
# ✓ Uploaded
# ✓ Verified
# ✓ Available at https://registry.dare-method.dev/skills/my-custom-skill/1.0.0
```

---

## Apêndice B: Registry API Schema

```yaml
# GET /api/v1/skills/dare-ax
{
  "name": "dare-ax",
  "description": "Agent Experience patterns",
  "author": "Wanderson",
  "homepage": "https://github.com/dewtech/dare-method",
  "repository": "https://github.com/dewtech/dare-method",
  "license": "MIT",
  "versions": [
    {
      "version": "1.0.0",
      "published_at": "2026-05-26T00:00:00Z",
      "download_url": "https://...",
      "checksum": "sha256:...",
      "dependencies": {},
      "compatible_with": {
        "dare-layered-design": ["1.0.0"],
        "dare-llm-integration": ["1.0.0"]
      },
      "rails_versions": null,
      "node_versions": null,
      "python_versions": null
    }
  ],
  "keywords": ["ax", "agent-experience", "discovery"],
  "downloads": 12345,
  "stars": 456
}
```

---

**Próximo passo:** Implementation via Agent 3 (week 1-2). Skill registry launched simultaneously.
