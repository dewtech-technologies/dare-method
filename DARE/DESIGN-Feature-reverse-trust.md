# Feature Design: Trust & Traceability no `dare reverse` (Fase 1 brownfield)

> Gerado seguindo o Método DARE (Fase D). License: MIT (parte do DARE Method).
> **Inspiração creditada:** mecanismos de confiança/rastreabilidade do framework **Reversa**
> (Macedo & da Costa, *arXiv:2605.18684v1*, 2026; repo MIT `github.com/sandeco/reversa`).
> Absorção **clean-room** de conceitos — nenhum prompt/código deles foi copiado.
> Análise de origem: `obsidian/dewtech/Projetos/DARE/DARE-Reversa-{Competitive-Analysis,Cross-Reference}.md`.

## Contexto

Nossa suíte brownfield (`dare reverse` + `dare dna`) reconstrói arquitetura e convenções de um
legado. Falta o que a Reversa faz de melhor: **tratar incerteza como dado de saída de primeira
classe** — marcar cada afirmação como confirmada/inferida/gap, com evidência rastreável, e um
relatório de confiança auditável.

**Nossa vantagem a explorar:** a Reversa admite no paper que o índice de confiança dela é
**auto-avaliado pelo LLM, sem auditoria externa**. Como nosso `reverse` extrai fatos
**deterministicamente** (módulos, LOC, grafo de imports, stack — com `file:line` real), esses
fatos nascem **🟢 CONFIRMED por construção**, e o índice pode ser **computado pelo CLI** (contando
marcadores), não auto-declarado. Resultado: confiança *mais honesta que o original*.

## Objetivos

- [O-01] Marcar cada claim no `IDEIA.md` e nos `REVERSE/module-*.md` com **🟢 CONFIRMED / 🟡 INFERRED / 🔴 GAP** e evidência `file:line` (quando confirmado/inferido).
- [O-02] Gerar **`confidence-report.md`** com índice por módulo, **computado deterministicamente** pelo CLI a partir dos marcadores (confirmado=1.0, inferido=0.5).
- [O-03] Consolidar **gaps classificados** (`gaps.md`: crítico/moderado/cosmético/fora-escopo + tratamento) e **`questions.md`** (perguntas ao humano).
- [O-04] Gerar **`traceability/code-spec-matrix.md`** ligando specs ↔ arquivos de código citados.
- [O-05] Adicionar um passo **Reviewer** que relê os specs contra o código e **reclassifica** claims frágeis.
- [O-06] Manter a regra da casa: CLI determinístico (marca fatos + computa índice/matriz parseando marcadores); skill semântica (marca claims inferidos/gaps, escreve a revisão).

## Decisões Travadas (com o autor)

| # | Decisão | Escolha |
|---|---|---|
| D-1 | Quem computa o índice/`confidence-report` | **CLI**, parseando os marcadores 🟢🟡🔴 dos specs (determinístico, auditável) — nosso diferencial |
| D-2 | Convenção de marcador | Linha de claim iniciada por `- 🟢/🟡/🔴` + evidência em crase `` `path:line` `` (parseável por regex) |
| D-3 | Reviewer | _(a validar — ver §Decisões abertas)_ |
| D-4 | Fatos auto-🟢 nesta fase | Apenas **estruturais** (módulos, LOC, linguagens, grafo de deps, stack). Modelo de dados/endpoints continuam 🟡 da skill (extração determinística desses fica p/ Fase 3) |

## Arquitetura (duas camadas)

### Camada A — CLI determinística
1. **Pré-marca fatos estruturais como 🟢** no esqueleto (IDEIA "Stack/Mapa de Módulos" e nos
   `module-*.md` "Fatos") com evidência (`dare.config`/`reverse-facts.json` ou caminho do módulo).
2. **`dare reverse --report`** (novo): lê os specs já marcados pela skill, conta 🟢/🟡/🔴 por
   arquivo/módulo, computa o índice e escreve:
   - `DARE/REVERSE/confidence-report.md` (tabela por módulo + total + índice — estilo Tabela 5 do paper)
   - `DARE/REVERSE/traceability/code-spec-matrix.md` (spec → arquivos citados, extraídos das
     evidências `` `path:line` `` nos specs; módulo→arquivos vem de `reverse-facts.json`)
   - Atualiza `reverse-facts.json` com o bloco `confidence`.
   100% determinístico: mesma entrada → mesmo relatório.

### Camada B — Skill `/dare-reverse` (3 IDEs)
- **Marcação:** ao preencher os `<!-- AGENT -->`, prefixar cada afirmação com 🟢/🟡/🔴 e citar
  `file:line`. Regra: só 🟢 com evidência direta no código; senão 🟡; sem base → 🔴 + entra em gaps.
- **Gaps & questions:** consolidar 🔴 em `gaps.md` (com severidade + tratamento) e perguntas em `questions.md`.
- **Reviewer (passo final):** reler os specs voltando ao código, **rebaixar** claims sem evidência
  (🟢→🟡 ou 🟡→🔴) e registrar a reclassificação. Depois rodar `dare reverse --report` para o índice.

## Convenção de marcador (parseável)

```markdown
- 🟢 Autenticação via JWT validada no middleware. `src/auth/jwt.ts:42`
- 🟡 Provável rate-limit por IP (padrão recorrente, não confirmado). `src/mw/throttle.ts:18`
- 🔴 Política de expiração de sessão não determinável pelo código. → ver gaps.md
```
Regex CLI: `^\s*[-*]\s*(🟢|🟡|🔴)\s+(.*?)(?:\s+` `` `([^`]+:\d+)` `` `)?\s*$`.

## Artefatos (novos/alterados)
```
DARE/
├── IDEIA.md                         (claims marcados)
└── REVERSE/
    ├── module-*.md                  (claims marcados)
    ├── reverse-facts.json           (+ bloco confidence)
    ├── confidence-report.md         ← NOVO (CLI computa)
    ├── gaps.md                      ← NOVO (skill)
    ├── questions.md                 ← NOVO (skill)
    └── traceability/
        └── code-spec-matrix.md      ← NOVO (CLI computa)
```

## Impacto

### Novos/alterados (CLI)
- `packages/cli/src/commands/reverse.ts` — flag `--report`
- `packages/cli/src/utils/confidence.ts` — NOVO: parser de marcadores + cálculo do índice + render do report/matrix
- `packages/cli/src/utils/reverse-facts.ts` — esqueletos pré-marcam fatos 🟢; bloco `confidence` no facts
- Testes: `confidence.test.ts`

### Skills (3 IDEs)
- `dare-reverse` (claude/cursor/antigravity) — instruções de marcação + Reviewer + gaps/questions

### NÃO alterar
- Saída determinística atual do `reverse` (mapa/tabela) permanece; só ganha marcadores 🟢.
- `dare dna` fora de escopo nesta fase.

## Estratégia de Testes
- `confidence.test.ts` — parser conta 🟢🟡🔴 corretamente; índice = (🟢·1 + 🟡·0.5)/total; matriz extrai `path:line`; ignora linhas não-claim.
- Ralph Loop: `pnpm build && pnpm test` verdes; preservar os 336 testes existentes.

## Riscos e Mitigações
| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Marcador inconsistente da skill quebra o parser | Média | Médio | Regex tolerante + linhas não-casadas ignoradas; skill tem exemplos canônicos |
| Índice confundido com "precisão factual" | Média | Médio | Report deixa explícito: "classificação do pipeline, não auditoria externa" (igual ressalva do paper) |
| Fadiga de marcação (todo claim com emoji) | Baixa | Baixo | Marcar só claims relevantes; fatos estruturais já vêm pré-🟢 do CLI |

## Fora do Escopo (Fase 1)
- `dare migrate` + Gherkin (Fase 2).
- Extração determinística de modelo de dados/endpoints (Fase 3 — daria mais fatos 🟢).
- `spec-impact-matrix.md` (só `code-spec-matrix` nesta fase).

## Decisões abertas (validar antes de codar)
1. **D-1 confirmado?** Índice/report computados pelo **CLI** (parse de marcadores) — recomendado.
2. **D-3 Reviewer:** passo dentro da skill `/dare-reverse` **ou** skill separada `/dare-reverse-review`?
3. **Disparo do report:** `dare reverse --report` manual **ou** a skill chama ao final automaticamente?

## Próximas Etapas
1. Validar D-1/D-3/disparo.
2. Implementar: `confidence.ts` → `reverse.ts --report` → esqueletos pré-🟢 → skills → testes → docs.
3. Ralph Loop + commit + PR.
