# Brief de Execução (Cursor) — Secure Autonomous Executor

> Para: agente de codificação no **Cursor**. Objetivo: implementar a feature
> `secure-autonomous-executor` no repo `@dewtech/dare-cli`, executando o DAG task a task.
> Este brief é autossuficiente — tudo que você precisa está referenciado aqui.

## Contexto

Repo: monorepo pnpm do DARE Framework (v3.8.2). Pacote alvo: `packages/cli` (`@dewtech/dare-cli`).
Feature: executor autônomo (`dare execute --agent`) + gate de segurança (`dare guard`).
Fonte de verdade: [RFC-001](../docs/rfcs/RFC-001-secure-autonomous-executor.md),
[DESIGN](DESIGN-Feature-secure-autonomous-executor.md),
[BLUEPRINT](BLUEPRINT-Feature-secure-autonomous-executor.md).

## Antes de começar

1. Criar a branch: `git checkout -b feat/secure-autonomous-executor`.
2. Ler o **BLUEPRINT** inteiro (contratos executáveis, anti-stub, exit codes).
3. Decisões já travadas (NÃO reabrir):
   - **D-002:** internalizar tudo no `@dewtech/dare-cli`. O SDK do LLM é `optionalDependency` +
     `import()` lazy, e só pode ser importado em `src/agent/drivers/claude.ts`.
   - `--require-approval` default = `rank`.
   - **D-003:** assinatura via **Ed25519 nativo do `node:crypto`** (formato minisign-compat) — sem dep externa.

## Ordem de execução (DAG)

DAG completo: [dare-dag-secure-autonomous-executor.yaml](dare-dag-secure-autonomous-executor.yaml).
Resumo legível + tabela de status: [TASKS](TASKS-secure-autonomous-executor.md).
Visual: [dag-graph-secure-autonomous-executor.mmd](dag-graph-secure-autonomous-executor.mmd).

Respeite o `depends_on`. Ordem por rank (duas trilhas paralelas a partir do rank 0):

| Rank | Tasks | Trilha |
|---|---|---|
| 0 | task-601 ∥ task-610 | executor ∥ guard |
| 1 | task-602, task-603, task-605 / task-611, task-612, task-614, task-616 | exec / guard |
| 2 | task-604, task-606 / task-613, task-615 | exec / guard |
| 3 | task-607, task-608, task-617 | (217 junta exec+guard) |
| 4 | task-620 | auditoria N-1 |
| 5 | task-621 | release |

Para **cada** task: abra a spec correspondente em `EXECUTION/task-6NN-*.md` — ela traz Escopo,
Arquivos tocados, Implementação (com seção do BLUEPRINT), Testes nomeados, Gates e Definition of Done.

## Regras de implementação (anti-stub — inegociáveis)

- **Sem stub/mock/TODO** no código de produção. Cada função do BLUEPRINT é implementada de verdade.
- **`import` de SDK de LLM só em `agent/drivers/claude.ts`.** O teste `no-llm-in-core.test.ts`
  (task-604) falha o build se vazar. SDK fica em `optionalDependencies`, nunca em `dependencies`.
- **Reusar `decideNextAction`** de `verification/decay/policy.ts` — NÃO reimplementar a lógica de decisão.
- **BudgetTracker soma TODOS os candidatos** best-of-N (não só o vencedor).
- **Scan heurístico nunca emite FAIL sozinho** (só WARN) — a garantia vem das trust boundaries + tamper-evidence.
- **Artefato assinado AINDA passa por unicode+scan** (assinatura ≠ conteúdo seguro).
- **Exit code 6** reservado para guard-fail (convenção existente: 0/1/3/4/5).

## Gates por task (rodar antes de marcar DONE)

```bash
cd packages/cli
pnpm exec tsc --noEmit
pnpm exec vitest run <suite-da-task>      # nome no spec
pnpm exec eslint <arquivos-tocados>
```
Auditoria final (task-620): `pnpm audit --prod --audit-level=high` = 0 HIGH (com o optionalDependency).
Cada task tem critério DONE verificável no seu spec — só avance quando os testes nomeados passarem.

## Definition of Done da feature

Ver BLUEPRINT §10. Resumo: RF MUST implementados com teste; `no-llm-in-core` verde;
`dare execute --agent --dry-run` roda um DAG fixture fim-a-fim sem rede; `dare guard` pega 100% dos
unicode fixtures e toda adulteração; CHANGELOG `[3.9.0]`+`[3.10.0]`; `dare review` sem achados HIGH.

## Reportar de volta

Ao concluir cada rank, rode `dare review <task-id>` (anti-stub do próprio DARE) e só siga se passar.
Ao final, abra PR da branch `feat/secure-autonomous-executor`.
