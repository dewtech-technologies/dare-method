# Known CVEs

Tracking of advisories that `pnpm audit` reports but which we have assessed and
accepted, with rationale and remediation plan. Reviewed each release.

> **CI gate policy (v3.1):** the CI audit job runs `pnpm audit --prod --audit-level=high`.
> It audits **production** dependencies only — the ones that ship in the published
> `@dewtech/dare-cli` tarball (`dist/` + `templates/`). Dev-only advisories are
> tracked here but do not block CI, because they never reach a user's machine.

## Accepted (dev-only) — as of 2026-06-02

| Advisory | Package | Severity | Why accepted | Plan |
|---|---|---|---|---|
| GHSA (vitest UI RCE) | `vitest@1.6.1` | critical (dev) | Only exploitable when the Vitest **UI server** is listening. We never run `--ui`; CI runs `vitest run` headless. devDependency — not in the published tarball. | Bump to vitest ≥ 4.1 in a dedicated PR (major upgrade; needs config migration). Tracked for v3.2. |
| GHSA-23c5-xmqv-rm74 (+2) | `minimatch@9.0.3` | high (dev) | ReDoS, reached only transitively via `@typescript-eslint/*` (lint tooling). devDependency — not shipped. | Resolves when we bump `@typescript-eslint` / eslint 9 (tracked for v3.2). Can also add a pnpm `overrides` for `minimatch@>=9.0.7` if it becomes urgent. |

## Production deps

`pnpm audit --prod --audit-level=high` → **0 high/critical** (2 moderate, accepted).

The published CLI ships `dist/` + `templates/`. The runtime production
dependencies (chalk, commander, fs-extra, inquirer, yaml, express, etc.) carry
no high/critical advisories as of this release.

## How to re-check

```bash
# What ships to users (the gate):
pnpm audit --prod --audit-level=high

# Everything including dev tooling (informational):
pnpm audit --audit-level=high
```
