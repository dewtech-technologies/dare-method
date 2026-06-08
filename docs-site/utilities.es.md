# Utilidades y Diagnóstico

Esta página se enfoca en los comandos de **diagnóstico y mantenimiento** de la CLI `dare`: cómo verificar la salud del proyecto, validar el DAG, visualizar dependencias, actualizar el setup, correr el gate de calidad y gestionar skills. Todos son determinísticos (no llaman a un LLM) y seguros para CI. La referencia completa de flags está en [Referencia de la CLI](cli-reference.md).

!!! info "Cuándo usar cada uno"
    `info` para una radiografía rápida · `validate` antes de commitear/en CI · `dag viz` para ver dependencias · `update` para sincronizar el template · `bench` como gate de calidad · `skill` para gestionar paquetes de skill.

---

## `dare info` — radiografía del proyecto

Muestra la versión de la CLI, paths relevantes y la **integridad DARE** del proyecto actual. Es el primer comando a correr cuando algo "no parece correcto": confirma si estás en un proyecto DARE válido y qué artefactos existen.

```bash
dare info
```

No recibe flags. Úsalo para confirmar la versión instalada antes de abrir un bug o antes de correr `dare update`.

## `dare validate` — integridad del DAG

Valida la integridad del `dare-dag.yaml`. Pensado para **pre-commit hooks** y **CI**: retorna exit code `1` cuando encuentra errores (o warnings, bajo `--strict`).

```bash
dare validate
dare validate --dag DARE/dare-dag.yaml --strict
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Ruta del DAG a validar. |
| `--strict` | boolean | `false` | Trata warnings como errors (falla el exit code). |

Chequeos ejecutados por el comando (extraídos de `validate.ts`):

| # | Tipo | Verificación |
|---|------|-------------|
| 1 | error | **Id único** — ningún `task.id` duplicado. |
| 2 | error | **kebab-case** — id casa con `^[a-z][a-z0-9-]*$`. |
| 3 | error | **`depends_on` válido** — toda dependencia referencia un id existente y ninguna task depende de sí misma. |
| 4 | error | **Sin ciclos** — `computeRanks` falla en ciclos del grafo. |
| 5 | warning | **Prompt no vacío** — task con `subtask_prompt` vacío. |
| 6 | warning | **Paralelismo** — menos de 2 tasks en el rank 0 (DAG sin paralelismo real). |

!!! tip "Pre-commit / CI"
    En CI, corre `dare validate --strict` para que los warnings (prompt vacío, falta de paralelismo) también derriben el pipeline. Sin `--strict`, solo los errores estructurales (ids, ciclos, dependencias) fallan.

## `dare dag viz` — visualizar el DAG

Renderiza el `dare-dag.yaml` como diagrama, con **colores por estado**, para inspeccionar el orden de ejecución y las dependencias entre tasks.

```bash
dare dag viz                                   # Mermaid no stdout
dare dag viz --format dot -o DARE/dag.dot       # Graphviz
dare dag viz --format excalidraw                # → DARE/dag-graph.excalidraw
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Ruta del DAG. |
| `-f, --format <fmt>` | string | `mermaid` | `mermaid` \| `dot` \| `excalidraw`. |
| `-o, --output <file>` | string | stdout¹ | Archivo de salida. |

¹ Para `excalidraw`, cuando se omite `-o`, el default es `DARE/dag-graph.excalidraw`.

- **mermaid** — pégalo en cualquier doc Markdown que soporte Mermaid (incluido este sitio).
- **dot** — para renderizar con Graphviz (`dot -Tpng`).
- **excalidraw** — canvas editable; ábrelo en [excalidraw.com](https://excalidraw.com) para reorganizarlo visualmente.

!!! note "DAG estático vs. knowledge graph"
    `dare dag viz` dibuja el **DAG estático de tareas** (`dare-dag.yaml`). Para visualizar el **knowledge graph** (requirements ↔ tasks ↔ símbolos de código), usa `dare graph viz` — ver [Referencia de la CLI](cli-reference.md#dare-graph-viz).

## `dare update` — sincronizar el setup

Actualiza el setup del proyecto a la versión actual de la DARE CLI (templates, scaffolding de artefactos), preservando customizaciones.

```bash
dare update --dry-run        # inspeciona sem escrever
dare update -y               # aplica tudo, mantendo customizações
dare update --target 2.6.0   # atualiza para versão específica
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `--dry-run` | boolean | `false` | Muestra lo que se haría, sin escribir nada. |
| `-y, --yes` | boolean | `false` | No pregunta nada — aplica todo y mantiene customizaciones. |
| `--force` | boolean | `false` | Sobrescribe incluso archivos customizados. |
| `--target <version>` | string | CLI instalada | Actualiza a una versión específica. |

!!! warning "Flujo recomendado"
    Siempre corre `--dry-run` primero para revisar el plan. Usa `-y` para aplicar de forma no interactiva. Reserva `--force` para casos en los que aceptas perder ediciones manuales en los archivos de template — es destructivo.

## `dare bench` — gate de calidad de patch

Corre las fixtures de bench de verificación: un **gate determinístico de calidad de patch**. Útil para detectar regresiones en la capacidad del pipeline de resolver tasks, comparando contra un baseline.

```bash
dare bench
dare bench --json --baseline baseline.json --fail-on-regression 5
dare bench --filter "auth-*"
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `--suite <dir>` | string | suite por defecto | Directorio con `suite.json`. |
| `--json` | boolean | `false` | Emite reporte JSON en stdout. |
| `--baseline <file>` | string | — | `BenchReport` JSON de baseline para comparación. |
| `--fail-on-regression <pp>` | string | `3` | Falla si la solve-rate cae más de N puntos porcentuales vs baseline. |
| `--filter <glob>` | string | — | Corre solo fixtures que casan con el glob. |

!!! tip "Regresión en CI"
    Guarda un `baseline.json` en el repositorio y corre `dare bench --json --baseline baseline.json` en CI. Con el default `--fail-on-regression 3`, una caída de más de 3 puntos porcentuales en la solve-rate derriba el build.

## `dare skill` — gestión de skills

Gestiona los paquetes de **skill** del proyecto (instalar, remover, listar, inspeccionar, actualizar, publicar). El registry puede ser **local** (default) o **remoto** (backend Vercel, vía `--remote`). Las skills instaladas se rastrean en `.dare/skills.yml`.

Todos los subcomandos aceptan `--json` para salida machine-readable.

| Subcomando | Sintaxis | Qué hace |
|------------|---------|-----------|
| `list` | `dare skill list [--installed]` | Lista skills del registry o, con `--installed`, las de `.dare/skills.yml`. |
| `info` | `dare skill info <name>` | Muestra detalles de una skill del registry. |
| `add` | `dare skill add <name[@version]> [--dry-run]` | Instala una skill en el proyecto. |
| `remove` | `dare skill remove <name> [--force]` | Desinstala; `--force` ignora dependientes. |
| `update` | `dare skill update <name[@version]> [--dry-run]` | Actualiza skill instalada (muestra diff con `--dry-run`). |
| `publish` | `dare skill publish <path> [--remote] [--token <t>]` | Publica skill local; `--remote` usa el registry Vercel (exige `--token`). |

Ejemplos:

```bash
dare skill list --installed
dare skill add dare-ax@1.0.0 --dry-run
dare skill remove dare-ax --force
dare skill publish ./minha-skill --remote --token "$GITHUB_TOKEN"
```

!!! note "Local vs. remoto"
    Por defecto, `publish` graba en el **registry local**. Para distribuir una skill al registry **remoto** (Vercel), pasa `--remote` junto con `--token <github-token>` — el token es obligatorio en ese modo. Usa `--dry-run` para validar y listar los archivos antes de publicar de verdad.

## Comandos relacionados

- `dare hooks validate` — valida el schema de la config de hooks y el allowlist (determinístico). Ver [Referencia de la CLI](cli-reference.md#dare-hooks).
- `dare steering list` — inspecciona la precedencia de los archivos de steering. Ver [Referencia de la CLI](cli-reference.md#dare-steering).
- `dare graph stats` / `dare graph ingest` — diagnóstico y re-sincronización del knowledge graph.
