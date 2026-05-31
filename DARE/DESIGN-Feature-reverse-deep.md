# Feature Design: Deep Reverse (Fase 3 brownfield) — ERD, regras, state machines, permissões

> Gerado seguindo o Método DARE (Fase D). License: MIT (parte do DARE Method).
> **Inspiração creditada:** agentes Detective (regras/estados/permissões) e Architect (C4/ERD) do
> framework **Reversa** (Macedo & da Costa, *arXiv:2605.18684v1*, 2026; repo MIT). Absorção
> **clean-room** — nenhum prompt/código deles copiado. Origem: `obsidian/.../DARE-Reversa-*.md`.

## Contexto

O `dare reverse` hoje reconstrói o mapa de módulos + IDEIA (o quê) com confiança/rastreabilidade
(Fase 1). Faltam as profundidades que a Reversa extrai e nós não: **modelo de dados (ERD)**,
**regras de negócio**, **state machines** e **permissões** — as áreas E/F do cruzamento competitivo.
A Fase 3 fecha esse último gap, mantendo nossa **espinha determinística**: o que dá pra extrair de
migrations/ORM vira **ERD determinístico** (nosso diferencial sobre o ERD all-agent deles); o resto
(comportamento) é semântico, preenchido pela skill.

## Objetivos

- [O-01] Extrair **modelo de dados / ERD** deterministicamente de migrations SQL + modelos ORM →
  `DARE/REVERSE/erd.md` (Mermaid `erDiagram`) + entidades em `reverse-facts.json`.
- [O-02] Gerar esqueletos para os artefatos **semânticos** (preenchidos pela skill):
  `domain-rules.md`, `state-machines.md` (Mermaid `stateDiagram`), `permissions.md`.
- [O-03] Adicionar uma visão **C4** leve (context/container narrativo na skill; component já é o
  nosso mapa de módulos) — sem overbuild de viz.
- [O-04] Ativar tudo via **`dare reverse --deep`** (opt-in), preservando a saída atual do `reverse`.
- [O-05] Regra da casa: CLI determinístico (ERD + skeletons); skill semântica (regras/estados/permissões/C4).

## Decisões Travadas (com o autor)

| # | Decisão | Escolha |
|---|---|---|
| D-1 | Ativação | _(a validar)_ — `dare reverse --deep` (opt-in) vs. sempre |
| D-2 | Fontes do ERD determinístico | _(a validar)_ — migrations SQL + Prisma + ORMs comuns (TypeORM/Eloquent/ActiveRecord/SQLAlchemy) |
| D-3 | C4 | _(a validar)_ — leve (skill: context; component = mapa de módulos) vs. completo |
| D-4 | Marcação de confiança | ERD extraído = 🟢; entidades/relações inferidas pela skill = 🟡; reusa a Fase 1 |

## Arquitetura (duas camadas)

### Camada A — CLI determinística (`utils/datamodel.ts`, nunca chama LLM)
1. **Descobre fontes de dados** no projeto: `**/migrations/*.{sql,rb,php,ts,js,py}`, `schema.prisma`,
   diretórios `models/` / `entities/`.
2. **Parseia entidades + campos + FKs** por estratégia:
   - SQL: `CREATE TABLE` + colunas + `FOREIGN KEY ... REFERENCES`.
   - Prisma: blocos `model X { ... }` + `@relation`.
   - ORMs (regex leve): Eloquent (`class X extends Model`, `belongsTo/hasMany`), TypeORM
     (`@Entity`, `@Column`, `@ManyToOne`), ActiveRecord (`belongs_to/has_many`), SQLAlchemy
     (`class X(Base)`, `relationship(...)`).
3. **Emite `erd.md`** com Mermaid `erDiagram` (entidades, campos-chave, relações) — tudo 🟢, com
   evidência `arquivo:linha`. O que não der pra parsear vira nota 🟡 pra skill completar.
4. Com `--deep`, **gera skeletons** de `domain-rules.md`, `state-machines.md`, `permissions.md`
   (seções `<!-- AGENT -->`), e linka tudo no `IDEIA.md`.

### Camada B — Skill `/dare-reverse` (3 IDEs) — seções "deep"
- **domain-rules.md** — regras de negócio inferidas (validações, invariantes, cálculos), marcadas 🟢/🟡/🔴.
- **state-machines.md** — `stateDiagram` por entidade/fluxo com estados e transições observados no código.
- **permissions.md** — papéis, recursos e regras de autorização (quem pode o quê).
- **C4-context** (no IDEIA): atores + sistemas externos. Component já é o mapa de módulos.
- Completar o ERD onde o CLI marcou 🟡 (relações inferidas, não-explícitas no schema).

## Artefatos (novos)
```
DARE/REVERSE/
├── erd.md              ← NOVO (CLI: Mermaid erDiagram determinístico)
├── domain-rules.md     ← NOVO (skill)
├── state-machines.md   ← NOVO (skill: Mermaid stateDiagram)
└── permissions.md      ← NOVO (skill)
```
`reverse-facts.json` ganha um bloco `dataModel` (entidades/relações extraídas).

## Superfície de CLI
```bash
dare reverse --deep            # reverse normal + ERD + skeletons deep
dare reverse --deep --check    # mostra entidades/relações detectadas, sem escrever
```

## Análise de Impacto

### Novos
- `packages/cli/src/utils/datamodel.ts` — descoberta de fontes + parsers + render do `erDiagram`
- Testes: `datamodel.test.ts`

### Modificados
- `packages/cli/src/commands/reverse.ts` — flag `--deep` (gera erd.md + skeletons + bloco dataModel)
- `packages/cli/src/utils/reverse-facts.ts` — skeletons deep + link no IDEIA + bloco dataModel
- `implementations/{claude,cursor,antigravity}/.../dare-reverse` — instruções das seções deep
- `README.md` / `docs/skills/INDEX.md` — documentar `--deep`

### NÃO alterar
- Saída padrão do `reverse` (sem `--deep`) permanece idêntica — preservar os 350 testes.
- Read-only no projeto-alvo.

## Estratégia de Testes
- `datamodel.test.ts` — fixtures: migration SQL (CREATE TABLE + FK), `schema.prisma`, um ORM
  (Eloquent ou TypeORM). Verifica entidades/campos/FKs extraídos + `erDiagram` válido.
- Ralph Loop: `pnpm build && pnpm test` verdes; preservar os 350 testes.

## Riscos e Mitigações
| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Dialeto SQL/ORM exótico não parseado | Alta | Médio | Cobrir o comum; o não-parseado vira nota 🟡 pra skill — não quebra |
| ERD enorme/ilegível | Média | Baixo | `erDiagram` lista entidades + relações; detalhes ficam em domain-rules |
| `--deep` em projeto sem dados | Baixa | Baixo | Detecta ausência de fontes e gera só os skeletons semânticos |

## Fora do Escopo (Fase 3)
- `spec-impact-matrix.md` (só `code-spec-matrix`, da Fase 1).
- Mini-site HTML / viz 3D (descartado — mermaid/excalidraw bastam).
- Parser AST real (mantemos regex/line-based da casa).

## Decisões abertas (validar antes de codar)
1. **D-1 ativação:** `dare reverse --deep` (opt-in, recomendado) ou sempre?
2. **D-2 fontes ERD:** SQL migrations + Prisma + ORMs comuns (TypeORM/Eloquent/ActiveRecord/SQLAlchemy) — ok cobrir esse conjunto no v1?
3. **D-3 C4:** leve (skill: context; component = mapa de módulos) ou C4 completo (container/component formais)?

## Próximas Etapas
1. Validar D-1/D-2/D-3.
2. Implementar: `datamodel.ts` → `reverse.ts --deep` → skeletons em `reverse-facts.ts` → skill → testes → docs.
3. Ralph Loop + commit + push (PR).
