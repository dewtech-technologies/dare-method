# DARE RFCs

Documentos de design (Request for Comments) para funcionalidades não-triviais do
DARE Framework. Um RFC fecha as decisões difíceis **antes** de codar — onde mudar
de ideia custa um parágrafo, não um refactor. É o insumo natural da fase
**Design → BLUEPRINT** do próprio método DARE.

## Índice

| # | Título | Status | Target | Data |
|---|--------|--------|--------|------|
| [001](RFC-001-secure-autonomous-executor.md) | Secure Autonomous Executor (`dare execute --agent` + `dare guard`) | Accepted | v3.9.0 / v3.10.0 | 2026-06-10 |

## Status possíveis

- **Draft** — em escrita, ainda não aberto a comentários.
- **Proposed** — pronto para revisão/discussão.
- **Accepted** — aprovado; vira DESIGN/TASKS.
- **Rejected** — descartado (mantém-se o registro do porquê).
- **Superseded by RFC-NNN** — substituído por outro.

## Como propor um RFC

1. Copie o cabeçalho de um RFC existente (bloco Status/Date/Author/Target/License).
2. Numere sequencialmente: `RFC-NNN-slug-curto.md`.
3. Seções mínimas: Resumo · Motivação · Proposta · Alternativas consideradas ·
   Riscos/trade-offs · Plano de implementação · Questões em aberto.
4. Adicione a linha na tabela de índice acima.
5. Abra para comentários (status **Proposed**).
