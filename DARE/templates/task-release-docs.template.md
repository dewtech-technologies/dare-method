# Task <ID>: docs-regen — regenerar TODA a documentação (vX.Y.Z)

**Phase:** release · **Complexity:** MED · **Depends on:** [<última task de feature/audit>]
**Branch:** `<branch da release>`

> Task PADRÃO de release. Segue `DARE/RELEASE-DOCS-PLAYBOOK.md` à risca.
> Roda ANTES da task de bump/release. NÃO é opcional.

## Escopo
Regenerar, a partir do **código atual**, a documentação inteira: `docs-site/` (pt + en + es),
`README.md` (raiz) e `packages/cli/README.md`. Refletir as features desta release.

## Arquivos tocados
- `docs-site/*.md` (pt) + `docs-site/*.en.md` + `docs-site/*.es.md` — todas as páginas afetadas
- `docs-site/index.md` — seção "O que há de novo" com a release atual
- `README.md` (raiz) — banner (`~:17`), título "Skills & comandos (vX)", Roadmap "Shipped"/"Histórico"
- `packages/cli/README.md` — nota `> **vX.Y.Z:**` no topo

## Implementação
1. **Varredura code-grounded** por página (ver tabela do PLAYBOOK §1): reler a fonte real
   (commands/*, verification/*, graphrag/*, stacks/registry, mcp-server, schemas zod) e reescrever
   o conteúdo — sem herdar texto desatualizado. Preservar código/flags/chaves/termos do produto.
2. **cli-reference.md**: cobrir TODOS os comandos + flags (das defs do commander).
3. **configuration.md**: cobrir TODOS os blocos do `dare.config.json` (incl. os novos da release).
4. **Traduções**: atualizar `*.en.md` e `*.es.md` das páginas que mudaram.
5. **READMEs**: banner + skills header + roadmap (raiz) e nota de versão (CLI).
6. **index "O que há de novo"**: adicionar a release atual (a partir do CHANGELOG).

## Critério de aceite
- [ ] `node scripts/verify-docs-coverage.mjs` → exit 0 (0 comando/bloco de config sem doc)
- [ ] `pip install -r requirements-docs.txt && mkdocs build --strict` → build verde
- [ ] Banner do README, título "Skills & comandos", Roadmap e nota do CLI README refletem a vX.Y.Z
- [ ] `index.md` "O que há de novo" tem a release atual
- [ ] pt/en/es das páginas alteradas estão sincronizados
- [ ] Versão coerente: package.json (raiz+CLI) == CHANGELOG topo == banner README

## Gates
```powershell
node scripts/verify-docs-coverage.mjs
node scripts/verify-actions-pinned.mjs
pip install -r requirements-docs.txt; mkdocs build --strict
```

## Definition of Done (ANTI-STUB)
- [ ] Conteúdo regenerado do código real (sem placeholder, sem texto stale herdado)
- [ ] Nenhum comando/flag/bloco de config novo da release ficou de fora
- [ ] `dare review <ID>` sem achados

## Próxima task sugerida
`<task de release>` — bump (raiz+CLI) + CHANGELOG [vX.Y.Z] + **UPDATE-MANIFEST.json** (skills/comandos/config novos) + tag.
