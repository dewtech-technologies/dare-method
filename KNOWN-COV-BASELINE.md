# Coverage baseline — `@dewtech/dare-cli`

Medido em **2026-06-07** com `pnpm --filter @dewtech/dare-cli exec vitest run --coverage`
(escopo: `packages/cli/src/**/*.ts`, excluindo testes).

## Valores iniciais (gate CI)

| Métrica    | Medido | Threshold CI | Meta v3.4+ |
|------------|--------|--------------|------------|
| Statements | 61.9%  | 60%          | 70%        |
| Branches   | 74.8%  | 58%          | 60%        |
| Functions  | 79.6%  | 63%          | 65%        |
| Lines      | 61.9%  | 60%          | 70%        |

Thresholds fixados em **medido − 2pp** (RF-11, O-06) para não bloquear o release enquanto
a suíte cresce. Roadmap: **+2pp por minor release** até atingir 70 / 65 / 60 / 70.

## Como reproduzir

```bash
cd packages/cli
pnpm exec vitest run --coverage
```

O step `Test with coverage gate` em `.github/workflows/ci.yml` roda o mesmo comando no Node 20.x.
