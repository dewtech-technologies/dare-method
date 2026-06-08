# Utilitários e Diagnóstico

Esta página foca nos comandos de **diagnóstico e manutenção** da CLI `dare`: como verificar a saúde do projeto, validar o DAG, visualizar dependências, atualizar o setup, rodar o gate de qualidade e gerenciar skills. Todos são determinísticos (não chamam LLM) e seguros para CI. A referência completa de flags está em [Referência da CLI](cli-reference.md).

!!! info "Quando usar cada um"
    `info` para um raio-X rápido · `validate` antes de commitar/em CI · `dag viz` para enxergar dependências · `update` para sincronizar o template · `bench` como gate de qualidade · `skill` para gerenciar pacotes de skill.

---

## `dare info` — raio-X do projeto

Mostra versão da CLI, paths relevantes e a **integridade DARE** do projeto atual. É o primeiro comando a rodar quando algo "não parece certo": confirma se você está num projeto DARE válido e quais artefatos existem.

```bash
dare info
```

Não recebe flags. Use-o para confirmar a versão instalada antes de abrir um bug ou antes de rodar `dare update`.

## `dare validate` — integridade do DAG

Valida a integridade do `dare-dag.yaml`. Pensado para **pre-commit hooks** e **CI**: retorna exit code `1` quando encontra erros (ou warnings, sob `--strict`).

```bash
dare validate
dare validate --dag DARE/dare-dag.yaml --strict
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Caminho do DAG a validar. |
| `--strict` | boolean | `false` | Trata warnings como errors (falha o exit code). |

Checagens executadas pelo comando (extraídas de `validate.ts`):

| # | Tipo | Verificação |
|---|------|-------------|
| 1 | erro | **Id único** — nenhum `task.id` duplicado. |
| 2 | erro | **kebab-case** — id casa `^[a-z][a-z0-9-]*$`. |
| 3 | erro | **`depends_on` válido** — toda dependência referencia um id existente e nenhuma task depende de si mesma. |
| 4 | erro | **Sem ciclos** — `computeRanks` falha em ciclos no grafo. |
| 5 | warning | **Prompt não-vazio** — task com `subtask_prompt` vazio. |
| 6 | warning | **Paralelismo** — menos de 2 tasks no rank 0 (DAG sem paralelismo real). |

!!! tip "Pre-commit / CI"
    Em CI, rode `dare validate --strict` para que warnings (prompt vazio, falta de paralelismo) também derrubem o pipeline. Sem `--strict`, só os erros estruturais (ids, ciclos, dependências) falham.

## `dare dag viz` — visualizar o DAG

Renderiza o `dare-dag.yaml` como diagrama, com **cores por status**, para inspecionar a ordem de execução e as dependências entre tasks.

```bash
dare dag viz                                   # Mermaid no stdout
dare dag viz --format dot -o DARE/dag.dot       # Graphviz
dare dag viz --format excalidraw                # → DARE/dag-graph.excalidraw
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Caminho do DAG. |
| `-f, --format <fmt>` | string | `mermaid` | `mermaid` \| `dot` \| `excalidraw`. |
| `-o, --output <file>` | string | stdout¹ | Arquivo de saída. |

¹ Para `excalidraw`, quando `-o` é omitido, o default é `DARE/dag-graph.excalidraw`.

- **mermaid** — cole em qualquer doc Markdown que suporte Mermaid (incluindo este site).
- **dot** — para renderizar com Graphviz (`dot -Tpng`).
- **excalidraw** — canvas editável; abra em [excalidraw.com](https://excalidraw.com) para reorganizar visualmente.

!!! note "DAG estático vs. grafo de conhecimento"
    `dare dag viz` desenha o **DAG estático de tarefas** (`dare-dag.yaml`). Para visualizar o **knowledge graph** (requirements ↔ tasks ↔ símbolos de código), use `dare graph viz` — ver [Referência da CLI](cli-reference.md#dare-graph-viz).

## `dare update` — sincronizar o setup

Atualiza o setup do projeto para a versão atual do DARE CLI (templates, scaffolding de artefatos), preservando customizações.

```bash
dare update --dry-run        # inspeciona sem escrever
dare update -y               # aplica tudo, mantendo customizações
dare update --target 2.6.0   # atualiza para versão específica
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--dry-run` | boolean | `false` | Mostra o que seria feito, sem escrever nada. |
| `-y, --yes` | boolean | `false` | Não pergunta nada — aplica tudo e mantém customizações. |
| `--force` | boolean | `false` | Sobrescreve até arquivos customizados. |
| `--target <version>` | string | CLI instalado | Atualiza para uma versão específica. |

!!! warning "Fluxo recomendado"
    Sempre rode `--dry-run` primeiro para revisar o plano. Use `-y` para aplicar de forma não-interativa. Reserve `--force` para casos em que você aceita perder edições manuais nos arquivos de template — é destrutivo.

## `dare bench` — gate de qualidade de patch

Roda as fixtures de bench de verificação: um **gate determinístico de qualidade de patch**. Útil para detectar regressões na capacidade do pipeline de resolver tasks, comparando contra um baseline.

```bash
dare bench
dare bench --json --baseline baseline.json --fail-on-regression 5
dare bench --filter "auth-*"
```

| Flag | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `--suite <dir>` | string | suite padrão | Diretório com `suite.json`. |
| `--json` | boolean | `false` | Emite relatório JSON no stdout. |
| `--baseline <file>` | string | — | `BenchReport` JSON de baseline para comparação. |
| `--fail-on-regression <pp>` | string | `3` | Falha se a solve-rate cair mais que N pontos percentuais vs baseline. |
| `--filter <glob>` | string | — | Roda só fixtures que casam com o glob. |

!!! tip "Regressão em CI"
    Guarde um `baseline.json` no repositório e rode `dare bench --json --baseline baseline.json` no CI. Com o default `--fail-on-regression 3`, uma queda de mais de 3 pontos percentuais na solve-rate derruba o build.

## `dare skill` — gestão de skills

Gerencia pacotes de **skill** do projeto (instalar, remover, listar, inspecionar, atualizar, publicar). O registry pode ser **local** (default) ou **remoto** (backend Vercel, via `--remote`). Skills instaladas são rastreadas em `.dare/skills.yml`.

Todos os subcomandos aceitam `--json` para saída machine-readable.

| Subcomando | Sintaxe | O que faz |
|------------|---------|-----------|
| `list` | `dare skill list [--installed]` | Lista skills do registry ou, com `--installed`, as de `.dare/skills.yml`. |
| `info` | `dare skill info <name>` | Mostra detalhes de uma skill do registry. |
| `add` | `dare skill add <name[@version]> [--dry-run]` | Instala uma skill no projeto. |
| `remove` | `dare skill remove <name> [--force]` | Desinstala; `--force` ignora dependentes. |
| `update` | `dare skill update <name[@version]> [--dry-run]` | Atualiza skill instalada (mostra diff com `--dry-run`). |
| `publish` | `dare skill publish <path> [--remote] [--token <t>]` | Publica skill local; `--remote` usa o registry Vercel (exige `--token`). |

Exemplos:

```bash
dare skill list --installed
dare skill add dare-ax@1.0.0 --dry-run
dare skill remove dare-ax --force
dare skill publish ./minha-skill --remote --token "$GITHUB_TOKEN"
```

!!! note "Local vs. remoto"
    Por padrão, `publish` grava no **registry local**. Para distribuir uma skill ao registry **remoto** (Vercel), passe `--remote` junto com `--token <github-token>` — o token é obrigatório nesse modo. Use `--dry-run` para validar e listar os arquivos antes de publicar de fato.

## Comandos relacionados

- `dare hooks validate` — valida o schema da config de hooks e o allowlist (determinístico). Ver [Referência da CLI](cli-reference.md#dare-hooks).
- `dare steering list` — inspeciona a precedência dos arquivos de steering. Ver [Referência da CLI](cli-reference.md#dare-steering).
- `dare graph stats` / `dare graph ingest` — diagnóstico e re-sincronização do knowledge graph.
