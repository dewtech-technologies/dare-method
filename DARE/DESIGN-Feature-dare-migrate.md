# Feature Design: `dare migrate` — Migração com paridade (Fase 2 brownfield)

> Gerado seguindo o Método DARE (Fase D). License: MIT (parte do DARE Method).
> **Inspiração creditada:** time de Migração + cenários de paridade do framework **Reversa**
> (Macedo & da Costa, *arXiv:2605.18684v1*, 2026; repo MIT). Absorção **clean-room** — nenhum
> prompt/código deles copiado. Origem: `obsidian/dewtech/Projetos/DARE/DARE-Reversa-*.md`.

## Contexto

Hoje a suíte brownfield vai até entender o legado (`reverse` → IDEIA, `dna` → convenções) e
preparar a Fase 1 de confiança/rastreabilidade. **Falta o elo final:** transformar esse
entendimento numa **reimplementação segura** — o que a Reversa faz com o time de Migração e os
**cenários Gherkin de paridade** (no estudo deles, COBOL→Go gerou 53 cenários). É exatamente o que
fecha o loop `reverse → dna → migrate → execute` (e o `execute` já é nossa força com DAG + Ralph Loop).

## Objetivos

- [O-01] Rodar `dare migrate --to <stack>` consumindo `IDEIA.md` + `PROJECT-DNA.md` + facts e
  produzir um **plano de migração** acionável.
- [O-02] Gerar **cenários Gherkin de paridade** (`.feature`) que servem de contrato comportamental:
  garantem que a reimplementação preserva o comportamento do legado.
- [O-03] Reaproveitar a **confiança da Fase 1**: 🔴 gaps viram **blocking gaps** (riscos que impedem
  reimplementação segura) — métrica direta do paper deles.
- [O-04] Alinhar a **arquitetura-alvo ao DNA** quando o alvo for o mesmo paradigma, ou registrar a
  decisão de paradigma quando mudar (ex.: procedural→OO, monólito→serviços).
- [O-05] Regra da casa: CLI determinístico (lê facts, monta esqueletos + stubs de `.feature`, lista
  blocking gaps); skill semântica (escreve estratégia, risco e os Gherkin reais).

## Decisões Travadas (com o autor)

| # | Decisão | Escolha |
|---|---|---|
| D-1 | Stack-alvo | _(a validar)_ — `--to <stack>` com vocabulário conhecido + fallback interativo |
| D-2 | Granularidade dos `.feature` | _(a validar)_ — por módulo vs. por comportamento/caso de uso |
| D-3 | Dependência de `reverse`/`dna` | _(a validar)_ — exigir vs. degradar graciosamente |
| D-4 | Blocking gaps | Reusar 🔴 da Fase 1 (de `reverse-facts.json#confidence` / `gaps.md`) como riscos bloqueantes |

## Arquitetura (duas camadas)

### Camada A — CLI determinística (`utils/migration.ts`, nunca chama LLM)
1. Lê `DARE/REVERSE/reverse-facts.json` (módulos + bloco `confidence`) e `DARE/dna-facts.json`
   (stack origem + convenções). `detectProject` confirma a stack de origem.
2. Resolve a **stack-alvo** (`--to`).
3. Conta **blocking gaps** (🔴 de `confidence.counts.gap` / por módulo) → baseline do registro de risco.
4. Emite esqueletos:
   - `DARE/MIGRATION/MIGRATION.md` (briefing, decisão de paradigma, estratégia, registro de risco
     com os blocking gaps pré-listados, arquitetura-alvo, plano de cutover/rollback)
   - `DARE/MIGRATION/parity/<módulo>.feature` (stub Gherkin por módulo, com `Feature:` + um
     `Scenario:` placeholder marcado `# AGENT`)
   - `DARE/MIGRATION/migration-facts.json` (origem, alvo, módulos, blocking gaps)

### Camada B — Skill `/dare-migrate` (3 IDEs)
Lê os facts + IDEIA + DNA + amostra de código → preenche:
- **Decisão de paradigma** (se origem e alvo divergem) com justificativa.
- **Estratégia de migração** (big-bang vs. strangler/parallel-run) + critérios.
- **Registro de risco** consolidando os blocking gaps (🔴) + riscos de regressão.
- **Arquitetura-alvo** alinhada ao DNA (camadas, convenções) e à stack-alvo.
- **Cenários Gherkin de paridade reais** (Given/When/Then) extraídos do comportamento legado —
  cada `.feature` cobre os fluxos do módulo.
- **Plano de cutover** (passos, validação, rollback).

## Artefatos Gerados

```
DARE/
└── MIGRATION/
    ├── migration-facts.json     (origem, alvo, módulos, blocking gaps)
    ├── MIGRATION.md             (paradigma, estratégia, risco, arch-alvo, cutover)
    └── parity/
        ├── <módulo>.feature     (Gherkin de paridade)
        └── ...
```

> O loop fechado: `reverse` (o quê) + `dna` (como) → **`migrate`** (reimplementar com paridade) →
> `dare design`/`blueprint`/`execute` na stack-alvo (com o `.feature` como contrato de aceite).

## Superfície de CLI

```bash
dare migrate --to go              # alvo Go
dare migrate --to rust-axum -d ./legado
dare migrate --check              # mostra origem/alvo/módulos/blocking gaps, não escreve
```

## Análise de Impacto

### Novos
- `packages/cli/src/utils/migration.ts` — leitura de facts + render de MIGRATION.md/.feature/facts
- `packages/cli/src/commands/migrate.ts` — comando (espelha `reverse`/`dna`)
- `implementations/{claude,cursor,antigravity}/.../dare-migrate` — skills
- Testes: `migration.test.ts`

### Modificados
- `packages/cli/src/bin/dare.ts` — registra `migrateCommand` (após `dna`)
- `README.md` + `docs/skills/INDEX.md` — documentar (31 → 32 skills)

### NÃO alterar
- Read-only no projeto-alvo: `migrate` só escreve em `DARE/MIGRATION/`. Não toca código nem os
  artefatos do `reverse`/`dna` (só lê).

## Estratégia de Testes
- `migration.test.ts` — lê reverse/dna facts de fixture; conta blocking gaps; gera stub `.feature`
  por módulo; MIGRATION.md contém placeholders AGENT + riscos pré-listados; `--check` não escreve.
- Ralph Loop: `pnpm build && pnpm test` verdes; preservar os 343 testes.

## Riscos e Mitigações
| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Rodar sem `reverse`/`dna` antes | Média | Médio | Detectar ausência e orientar; degradar (gerar esqueleto mínimo a partir de `detectProject`) |
| Gherkin genérico/sem paridade real | Média | Alto | Skill exige cenários derivados do comportamento legado citado; stub marca `# AGENT` |
| Stack-alvo não suportada | Baixa | Baixo | `--to` aceita texto livre; vocabulário conhecido só melhora dicas |

## Fora do Escopo (Fase 2)
- Executar a migração / gerar código-alvo (isso é o `execute` na stack-alvo, fase seguinte).
- Rodar os `.feature` (parity test runner) — contrato é gerado; execução fica no projeto-alvo.
- `spec-impact-matrix.md` e profundidade C4/ERD (Fase 3).

## Decisões abertas (validar antes de codar)
1. **D-1 stack-alvo:** `--to <stack>` (go/rust-axum/node-nestjs/python-fastapi/php-laravel/…) + interativo? 
2. **D-2 granularidade `.feature`:** um por **módulo** (mapeia nosso inventário) ou por **comportamento/caso de uso**?
3. **D-3 dependência:** **exigir** `reverse` antes (migração precisa do entendimento) ou **degradar** graciosamente?

## Próximas Etapas
1. Validar D-1/D-2/D-3.
2. Implementar: `migration.ts` → `migrate.ts` (+registro) → skills → testes → docs.
3. Ralph Loop + commit + push (PR).
