# TASKS — Endurecimento de Segurança e Supply-Chain (Security Hardening)

> Resumo legível de [dare-dag-security-hardening.yaml](dare-dag-security-hardening.yaml). DAG completo
> (com `depends_on`, `files`, `gates`) está no YAML. Specs executáveis por task em
> [`EXECUTION/`](EXECUTION/). Derivado de [BLUEPRINT-Feature-security-hardening.md](BLUEPRINT-Feature-security-hardening.md). License: MIT.

**Branch:** `feat/security-hardening` · **Target:** v3.4.0 · **14 tasks em 5 fases**

---

## Visão Geral

- Total de tasks: **14**
- Tasks no rank 0 (sem dependência): **8** (`task-101`, `110`, `111`, `120`, `121`, `122`, `123`, `124`)
- Regra de ouro: **endurecimento 100% determinístico** — middleware, validação de path, gates de CI; nenhum LLM no caminho.

## Quadro geral

| Fase | Tasks | Paralelizável? | Complexidade dominante |
|---|---|---|---|
| 1 — Path safety + init (H1) | T-101 a T-103 | parcial (T-101 ∥ MCP/CI rank-0) | LOW–MED |
| 2 — MCP middleware (C1/C2) | T-110 a T-113 | parcial (T-110/111 ∥) | MED–HIGH |
| 3 — CI / supply-chain | T-120 a T-124 | **SIM** (5 em rank 0) | LOW–MED |
| 4 — Auditoria N-1 | T-130 | não (integração) | HIGH |
| 5 — Docs + release | T-131 | não | LOW |

**Caminho crítico:** `T-101 → T-102 → T-103 → T-130 → T-131`
(em paralelo: `T-110/111 → T-112 → T-113 → T-130`; `T-120..124 → T-130`).

---

## Tabela de Status

| ID | Título | Status | Depends On | Complexity |
|---|---|---|---|---|
| task-101 | path-safety: assertWithinRoot + resolveSafePath | ⏳ PENDING | — | LOW |
| task-102 | init-validation.ts (validateProjectName) | ⏳ PENDING | 101 | MED |
| task-103 | dare init + project-generator guard | ⏳ PENDING | 102 | MED |
| task-110 | MCP middleware auth.ts | ⏳ PENDING | — | MED |
| task-111 | MCP cors + error-handler | ⏳ PENDING | — | MED |
| task-112 | server.ts hardening (helmet, paths) | ⏳ PENDING | 101, 110, 111 | HIGH |
| task-113 | bin/server.ts bind loopback + token boot | ⏳ PENDING | 112 | MED |
| task-120 | ci.yml eslint real (RF-10) | ⏳ PENDING | — | LOW |
| task-121 | coverage gate + KNOWN-COV-BASELINE | ⏳ PENDING | — | MED |
| task-122 | publish.yml provenance (RF-09) | ⏳ PENDING | — | MED |
| task-123 | pin actions SHA + verify script | ⏳ PENDING | — | MED |
| task-124 | SECURITY.md (RF-13) | ⏳ PENDING | — | LOW |
| task-130 | security-hardening regression audit (N-1) | ⏳ PENDING | 103, 113, 120, 121, 122, 123 | HIGH |
| task-131 | CHANGELOG + bump v3.4.0 | ⏳ PENDING | 130, 124 | LOW |

---

## Tarefas por Fase

### Fase 1 — Path safety + init (H1)
- task-101: Estender `utils/path-safety.ts` com `assertWithinRoot`, `resolveSafePath`, `PathEscapeError`
- task-102: Criar `commands/init-validation.ts` com mensagens exatas do blueprint §3.2 (deps: 101)
- task-103: Wire em `init.ts` + `project-generator.ts` com `assertWithinCwd` (deps: 102)

### Fase 2 — MCP middleware (C1/C2)
- task-110: `mcp-server/middleware/auth.ts` — Bearer token + loopback bypass
- task-111: `cors.ts` + `error-handler.ts` — allowlist + correlation id (sem stack no body)
- task-112: Refatorar `server.ts` — middleware chain, helmet, `resolveSafePath`, ignorar `projectPath` (deps: 101, 110, 111)
- task-113: `bin/server.ts` — bind `127.0.0.1`, token boot mascarado (deps: 112)

### Fase 3 — CI / supply-chain
- task-120: `ci.yml` — substituir faux-lint por `pnpm --filter @dewtech/dare-cli lint`
- task-121: `vitest.config.ts` thresholds + `KNOWN-COV-BASELINE.md` + step coverage no CI
- task-122: `publish.yml` — OIDC permissions + `npm publish --provenance`
- task-123: Pin SHA em workflows + `scripts/verify-actions-pinned.mjs`
- task-124: Atualizar `SECURITY.md` (MCP, provenance, SLA)

### Fase 4 — Auditoria N-1
- task-130: Suite `security-hardening.test.ts` + testes MCP (`path-confinement`, `error-sanitize`, `auth`)

### Fase 5 — Docs + release
- task-131: CHANGELOG `[3.4.0]`, README breaking notes, bump `package.json`

---

## Próximas Etapas

1. Revisar e aprovar este TASKS.md e o grafo em `dag-graph-security-hardening.mmd`
2. Executar: `dare execute --dag DARE/dare-dag-security-hardening.yaml --next`
3. Ou task isolada: `/dare-execute task-101` (com `--dag` apontando para o YAML desta feature)
