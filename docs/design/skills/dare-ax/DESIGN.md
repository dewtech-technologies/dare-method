# DESIGN.md — Skill `dare-ax` v1.0

**Data:** 2026-05-26  
**Versão:** 1.0  
**Status:** Final  
**Autor:** Wanderson (Dewtech Technologies)  

---

## 1. Visão

`dare-ax` (Agent Experience) é a skill transversal que codifica **padrões de experiência de desenvolvimento assistido por IA** em três planos: **Discovery**, **Usage** e **Defense**.

Seu objetivo é garantir que todo projeto DARE iniciado de zero, e toda skill filha por stack (`dare-rails-ax`, `dare-rust-axum-ax`, `dare-nestjs-ax`, etc.), implemente automaticamente as melhores práticas de integração com agentes de código (Claude Code, Cursor, Antigravity, etc.) e forneça aos desenvolvedores sinais claros de qualidade e operabilidade.

Skill transversal significa: agnóstica quanto à linguagem ou framework. Cada stack terá uma skill filha que herda os padrões de `dare-ax` v1.0 e os contextualiza.

---

## 2. Problema que Resolve

### 2.1 O gap atual

Projetos criados via DARE Method têm código correto, arquitetura validada, mas **carecem de sinais estruturados** que agentes de código precisam para:
- Descobrir o que fazer (`llms.txt`? Docs completas? Estrutura de pastas?)
- Usar o projeto sem refactorizar a arquitetura (`/ci`, `--json`, OpenAPI, Docker)
- Defender-se contra bad prompts (`validação de config`, `escape de SQL`, `CORS corretamente`)

### 2.2 Sintomas

1. Agentes começam a refactorizar desnecessariamente
2. Código gerado perde consistência visual e arquitetural após 3-4 features
3. Não existe rate limit em endpoints públicos de produção
4. Documentação técnica não existe ou diverge do código
5. CLI do projeto não suporta `--json`, dificultando integração com agentes

### 2.3 Raiz

Infraestrutura técnica é ótima, mas **interfaces para agentes de código são uma afterthought**, não design-first.

---

## 3. Requisitos Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RF-01 | Obrigatoriedade de `llms.txt` | Todo projeto novo criado via `dare init` deve ter `llms.txt` válido no commit inicial |
| RF-02 | OpenAPI obrigatório em HTTP | 100% dos endpoints HTTP gerados devem ter OpenAPI publicado em `/openapi.json` |
| RF-03 | CLI com `--json` | 100% dos CLIs gerados devem suportar flag `--json` para output estruturado |
| RF-04 | Rate limit em produção | 100% dos endpoints públicos devem ter rate limit configurado e documentado |
| RF-05 | Seção AX em config de projeto | Todo projeto tem opcional `ax:` na config (se `not-applicable`, escapa validação) |
| RF-06 | DESIGN.md com seção AX | Toda design doc do projeto DEVE ter seção `## Agent Experience (AX)` descrevendo como agentes devem se integrar |

---

## 4. Requisitos Não-Funcionais

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RNF-01 | Zero overhead em deploy | Validações AX não devem impactar tempo de build ou tamanho de artefato |
| RNF-02 | Documentação agnóstica | Templates AX devem funcionar para Rust, Node, Python, PHP, Go, com variações mínimas |
| RNF-03 | Compatibilidade com agentes | `llms.txt` e OpenAPI devem seguir specs públicos (OpenAI, AnthropicAI, esquema JSON Schema 2020-12) |
| RNF-04 | Reversibilidade | Um projeto pode desativar completamente `dare-ax` setando `ax: not-applicable` sem custos |
| RNF-05 | Versionamento | Mudanças quebradas em AX requerem bump de versão (semver) |
| RNF-06 | Output limpo em CI | Warnings de AX não devem causar falha de build, só alertas/logs |

---

## 5. Requisitos de Segurança

| ID | Requisito | Descrição |
|----|-----------|-----------|
| RS-01 | Nenhum secret em `llms.txt` | `llms.txt` é público; validação deve bloquear secrets (API keys, tokens, senhas) |
| RS-02 | Escape de entrada em prompts | Agentes não devem conseguir injetar prompts maliciosos via parametrização (`$variable` em docs) |
| RS-03 | Validação de CORS | Endpoints públicos devem ter CORS explícito documentado (ou bloqueado) |
| RS-04 | OpenAPI com auth | OpenAPI gerado deve incluir `securitySchemes` se API exigir auth |

---

## 6. Stakeholders

| Stakeholder | Interesse |
|-------------|-----------|
| **Desenvolvedor (humano)** | Interface clara para começar; saber que agente vai entender o código |
| **Agente de código** (Claude Code, Cursor, etc.) | `llms.txt`, OpenAPI, estrutura previsível; poder usar `--json` sem parsing custom |
| **Wanderson** | Consistência visual em todos os projetos DARE; telemetria de conformidade em CI |
| **Comunidade** | Templates reutilizáveis; exemplos de "AX bem feito" |
| **Evil Martians** (inspiração) | Padrões de Layered Design aplicáveis universalmente |

---

## 7. Métricas de Sucesso

**Apenas Tipo A (binárias, técnicas, mensuráveis em CI):**

- **M-01**: 100% dos projetos novos criados via `dare init` têm `llms.txt` válido no commit inicial
- **M-02**: 100% dos endpoints HTTP gerados têm OpenAPI publicado em `/openapi.json`
- **M-03**: 100% dos CLIs gerados suportam `--json`
- **M-04**: 100% dos endpoints públicos têm rate limit configurado

**Métricas Tipo B (adoção externa) e Tipo C (impacto real) removidas:** fora do controle de Wanderson, não mensuráveis com confiança.

---

## 8. Antipatterns Explícitos

| AP-ID | Antipattern | Por que evitar |
|-------|-----------|-----------------|
| AP-01 | Documentação fora do código | Diverge rapidamente; agentes precisam de docs "single source of truth" |
| AP-02 | OpenAPI gerado manualmente | Fica desatualizado; sempre auto-gerar a partir de código |
| AP-03 | CLI sem `--json` | Agentes precisam fazer parsing regex do output — brittle |
| AP-04 | Rate limit em dev, esquecido em prod | Produção fica vulnerável a abuse |
| AP-05 | `llms.txt` com secrets | Expõe credenciais em repositório público |
| AP-06 | CORS wildcard (`*`) em produção | Permite qualquer origem; explicitar sempre |
| AP-07 | Validação de entrada só em API, não em CLI | Agentes usam ambos; validar em ambos os places |
| AP-08 | Config opcionais sem default | Agentes precisam de defaults previsíveis |
| AP-09 | Mudanças quebradas sem bump de semver | Agentes desatualizam e quebram |
| AP-10 | Documentação em markdown solto | Manter docs próximo ao código (docstrings, OpenAPI inline) |

---

## 9. Decisões Arquiteturais

### ADR-01: RFC 7807 como padrão de erro HTTP

**Decisão:** 100% dos erros HTTP devem seguir RFC 7807 (Problem Details for HTTP APIs) como default. Override via config se projeto precisar de formato customizado.

**Racional:** RFC 7807 é standard aberto; agentes conseguem parsear e tratar erros consistentemente.

**Consequências:**
- Erro padrão: `{ "type": "https://api.example.com/errors/validation", "title": "Validation error", "status": 422, "detail": "..." }`
- Agentes precisam aprender o padrão uma única vez

---

### ADR-02: `llms.txt` obrigatório, com escape `ax: not-applicable`

**Decisão:** Todo projeto novo DEVE gerar `llms.txt` na raiz no primeiro commit via `dare init`. Se projeto não caber no padrão (ex: embedded, firmware), setando `ax: not-applicable` na config escapa validação.

**Racional:** `llms.txt` é o "TL;DR" do projeto para agentes; sem ele, agentes começam cegos. Escape exists para não forçar padrão em casos edge.

**Consequências:**
- Aumenta arquivo count em repos (1 arquivo). Tamanho: ~2-10KB típico
- Validação CI falha se `llms.txt` desatualizado ou ausente (sem escape)

---

### ADR-03: OpenAPI auto-gerado, não manual

**Decisão:** OpenAPI é gerado **sempre via decoradores/annotations no código**, nunca manualmente escrito em YAML/JSON. Ferramentas: `swagger-jsdoc`, `FastAPI auto-schema`, `RSpec OpenAPI`, etc.

**Racional:** Auto-gerado garante sincronização; manual diverge em 2-3 versões.

**Consequências:**
- Aprende-se a sintaxe da ferramenta (não do OpenAPI direto)
- Erro em decorador = erro em docs, descoberto em CI

---

### ADR-04: CLI sempre com `--json` como fallback

**Decisão:** Todo CLI do projeto suporta `--json` que output estruturado (JSON válido). Human-readable é default; `--json` é programmatic escape hatch.

**Racional:** Agentes precisam fazer parse; regex é brittle. JSON é universal.

**Consequências:**
- Aumenta 10-15% no tamanho do code (serialization boilerplate)
- Testes precisam validar ambas as saídas (human e JSON)

---

### ADR-05: Rate limit obrigatório em endpoints públicos

**Decisão:** Toda rota HTTP pública **deve ter rate limit configurado e documentado** em OpenAPI. Padrão sugerido: 100 req/min por IP, customizável via config.

**Racional:** Sem rate limit, agentes (ou bots) conseguem abuse a API.

**Consequências:**
- Aumenta latência mínima (~1ms de lookup em cache para rate limit)
- Necessita persistência (Redis, in-memory for dev)
- Precisa de documentação clara para clientes legítimos

---

## 10. Riscos e Mitigações

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| `llms.txt` fica desatualizado e agentes usam info errada | **Alta** | Validação CI checka sintaxe; revisão manual em PRs |
| OpenAPI muito complexo para auto-generar em todas as stacks | **Média** | Começar com stacks alvo (Rails, Rust, Node); outras after v1.1 |
| Rate limit causa rejeição de tráfego legítimo | **Média** | Thresholds conservadores; documentação clara; monitoramento |
| Developers ignoram seção AX no DESIGN.md | **Média** | Checklist em PR template; code review obrigatório |
| Incompatibilidade entre versões de `dare-ax` e skills filhas | **Média** | Versionamento semver rigoroso; testing de compatibilidade |

---

## 11. Dependências

### Externas
- **OpenAI/Anthropic spec**: `llms.txt` segue formato de exemplo público em https://github.com/anthropics/mcp-servers
- **RFC 7807**: HTTP error standard (aberto)
- **JSON Schema 2020-12**: validação de config
- **OpenAPI 3.1.0**: spec de documentação HTTP

### Internas
- `dare-layered-design`: padrões arquiteturais (skills complementar)
- `dare-quality-telemetry`: coleta de métricas M-01 a M-04 em CI
- Stacks filhas (`dare-rails-ax` v1.1, `dare-rust-axum-ax` v1.2, etc.)

---

## 12. Fora de Escopo

- Implementação de skills filhas por stack (entra em v1.1+)
- Monitoring/observability em tempo real (entra em `dare-realtime` v1.0)
- Community Discord/Slack (entra em month 2)
- Submissões a conferências (entra em month 2)
- Integração com GitHub Copilot ou VSCode (future, não v1.0)

---

## 13. Roadmap Pós v1.0

### v1.1 — `dare-rails-ax` (Rails 8, **máxima prioridade**)

Implementa ADR-02 a ADR-05 para stack Rails:
- `llms.txt` com estrutura Rails (models, controllers, services)
- OpenAPI via `rswag` (RSpec + Swagger)
- CLI Rails com `--json` (Thor, clui)
- Rate limit via `rack-attack`
- Exemplos: novo projeto Rails criado via DARE com AX automatizado

**Entrega esperada:** final da semana 2 do plano de 30 dias

---

### v1.2 — `dare-rust-axum-ax` (Rust/Axum)

Rust segundo em prioridade:
- `llms.txt` com estrutura Axum (handlers, extractors, middleware)
- OpenAPI via `utoipa`
- CLI com `--json` (clap com json derive)
- Rate limit via `tower-governor`

**Entrega esperada:** final da semana 3

---

### v1.3 — `dare-nestjs-ax` (Node/NestJS)

NestJS terceiro:
- `llms.txt` com estrutura NestJS (controllers, services, modules)
- OpenAPI via `@nestjs/swagger`
- CLI com `--json` (Commander.js com json output)
- Rate limit via `@nestjs/throttler`

**Entrega esperada:** final da semana 4 ou semana 1 do month 2

---

### Future (v2.0+)

- Skills filhas para Python/FastAPI, PHP/Laravel, Go
- Integração com GitHub Copilot
- Dashboard de conformidade AX (quantos repos em conformidade?)
- Community-driven patterns (PRs de usuários DARE)

---

## Apêndice A: Estrutura de `llms.txt` Padrão DARE

```
# llms.txt — Project Context for AI Agents

## Project Overview
[1 parágrafo sobre o que o projeto faz]

## Tech Stack
- Language: [Rust, Node, Python, etc.]
- Framework: [Axum, NestJS, FastAPI, etc.]
- Database: [Postgres, MongoDB, None, etc.]
- Key Dependencies: [list 5-10]

## Architecture
[Descrição de 3-5 camadas principais: Controllers/Handlers, Services, Repositories, Models, Utils]

## Directory Structure
```
src/
├── handlers/      # HTTP handlers / controllers
├── services/      # Business logic
├── models/        # Data structures
├── db/            # Database access
└── utils/         # Utilities
```

## Key Endpoints
[GET /health, GET /api/v1/users, POST /api/v1/users, etc. — link para OpenAPI]

## Important Files
- `config.json` — application configuration
- `docker-compose.yml` — local dev environment
- `Makefile` or `tasks.json` — common commands

## Getting Started
```bash
make dev    # or npm run dev, cargo run, etc.
```

## Rate Limits
- Public endpoints: 100 req/min per IP
- Auth endpoints: 10 req/min per IP

## Security Notes
- All user input validated in handlers
- SQL queries use parameterized queries
- Environment variables: see `.env.example`

## For AI Agents
- OpenAPI: `GET /openapi.json`
- CLI: `./project-cli --help`, `./project-cli --json`
- No secrets in this file or in `llms.txt`
```

---

## Apêndice B: Checklist para Review de AX em PR

- [ ] `llms.txt` existe e está válido (sem secrets)
- [ ] OpenAPI gerado e `/openapi.json` funciona
- [ ] CLI novo/modificado suporta `--json`
- [ ] Endpoints públicos têm rate limit configurado
- [ ] DESIGN.md tem seção `## Agent Experience (AX)` descrevendo padrões
- [ ] RFC 7807 usado em erros HTTP (ou override documentado)
- [ ] CORS documentado ou bloqueado explicitamente
- [ ] Validação de entrada em ambos CLI e API
- [ ] Sem warnings em CI relacionados a AX
- [ ] Docs técnicas próximas ao código (docstrings, OpenAPI inline)

---

## Apêndice C: Revisão de Decisões Finalizadas

Todas as decisões listadas na seção 4 do HANDOFF.md foram incorporadas:

✅ **RF-06**: seção AX no DESIGN.md do projeto é obrigatória com escape  
✅ **ADR-02**: RFC 7807 como default de erro  
✅ **M-05**: métricas externas removidas; apenas Tipo A (M-01 a M-04)  
✅ **Roadmap pós v1.0**: Rails primeiro  

---

**Próximo passo:** Criar DESIGN.md das demais 5 skills transversais (dare-layered-design, dare-llm-integration, dare-frontend-design, dare-realtime, dare-quality-telemetry) seguindo este template, finalizando Semana 0 do plano de 30 dias.
