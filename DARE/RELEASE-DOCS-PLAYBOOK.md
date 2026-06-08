# Release Docs Playbook — Regeneração padrão da documentação

> **Regra do projeto:** TODA release (feature ou patch) inclui uma task **`docs-regen`** que
> **regenera a documentação inteira a partir do código atual** — `docs-site/` (pt/en/es),
> o **README da raiz** e o **README do CLI** — ANTES da task de bump/release.
> Isto existe porque releases anteriores esqueceram de atualizar o banner do README, o
> `UPDATE-MANIFEST.json` e páginas de doc. A regeneração deixa de ser memória e vira processo.

A regeneração é **dirigida por agente** (camada semântica nas IDEs) e **verificada por gates
determinísticos** no CLI/CI — coerente com a regra de ouro (LLM fora do CLI; o CLI/CI só verifica).

---

## Escopo: o que regenerar (tudo, a cada release)

### 1. `docs-site/` — documentação MkDocs (pt + en + es)
Re-derivar do **código atual** (não de docs antigas). Para cada página, varrer a fonte real:

| Página | Fonte de verdade (code-grounded) |
|---|---|
| `index.md` | README + seção **"O que há de novo"** ← CHANGELOG (entrada da release) |
| `getting-started.md` | `commands/init.ts`, `welcome.ts`, `package.json#bin` |
| `greenfield.md` | `commands/{design,blueprint,execute,review,refine}.ts` |
| `brownfield.md` | `commands/{discover,reverse,dna,patterns,migrate}.ts` |
| `execution.md` | `dag-runner/*`, `verification/*` (Ralph Loop + Verification Core + formal) |
| `knowledge-graph.md` | `graphrag/*`, `commands/graph.ts` |
| `configuration.md` | schemas zod (`verification/config.ts`), `core/types/project.ts`, `project-generator.ts` (blocos do `dare.config.json`) |
| `stacks.md` | `stacks/registry.ts` |
| `agents.md` | `mcp-server/server.ts`, hooks/steering |
| `cli-reference.md` | **TODOS** os `commands/*.ts` (commander: `.command/.option/.argument`) |
| `utilities.md` | `commands/{info,validate,dag,update,bench}.ts`, `skills/` |

- Atualizar **en** (`*.en.md`) e **es** (`*.es.md`) das páginas que mudaram (código/flags/termos do produto preservados).
- Atualizar a seção **"O que há de novo"** do `index.md` com a release atual.

### 2. `README.md` (raiz)
- **Banner** (`> 🚀 **vX.Y.Z** — …`): o **número da versão é SEMPRE a release atual** — inclusive em **patches** (a 3.8.1/3.8.2 deixaram o banner travado em 3.8.0; **não repetir**). O *headline* pode continuar a última feature, mas a versão no banner acompanha o `package.json`.
- Título **"## 🔌 Skills & comandos (vX)"**.
- Seção **Roadmap "Shipped"** + **"Histórico … até a vX atual"**.
- Contagens de skills/comandos, se mudaram.

### 3. `packages/cli/README.md`
- Nova **nota `> **vX.Y.Z:** …`** no topo da lista de versões.
- Tabelas de stacks/prereqs, se mudaram.

---

## Gates de verificação (determinísticos — devem passar)
1. `node scripts/verify-docs-coverage.mjs` → **0 comandos/blocos de config sem doc**.
2. `pip install -r requirements-docs.txt && mkdocs build --strict` → **build verde** (sem nav/link quebrado).
3. `node scripts/verify-actions-pinned.mjs` → verde (se mexeu em workflow).
4. Coerência de versão: `package.json` (raiz+CLI) == CHANGELOG topo == banner do README.

> Lembrete relacionado (não é doc, mas é "esquecível"): a task de release também atualiza o
> **`templates/UPDATE-MANIFEST.json`** com as skills/comandos/config novos (senão `dare update`
> não os entrega a projetos existentes). Ver `task-*-release`.

---

## Quando roda no DAG
```
… tasks da feature … → task-NNX (docs-regen)  →  task-NNY (release: bump + CHANGELOG + UPDATE-MANIFEST + tag)
```
`docs-regen` depende da **última task de feature/audit** e é **pré-requisito** da task de release.
O deploy é automático: a tag dispara `publish.yml` → `workflow_run` → `docs.yml` republica o site já regenerado.

## Template
Use `DARE/templates/task-release-docs.template.md` como spec da task `docs-regen` em cada release.
