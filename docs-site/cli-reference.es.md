# Referencia de la CLI

Referencia completa de **todos** los comandos del binario `dare`, extraída directamente de las definiciones `commander` (`packages/cli/src/bin/dare.ts`, `packages/cli/src/commands/*.ts` y `packages/cli/src/skills/`). La CLI no llama a ningún LLM: orquesta artefactos y el grafo de tareas; el agente corre dentro de tu IDE.

!!! info "Opción global"
    `--no-banner` — suprime el banner ASCII. Disponible en cualquier comando. El banner solo aparece en comandos elegibles (`init`, `--version`/`-V`); los demás comandos no lo muestran.

!!! tip "Convenciones de las tablas"
    Los argumentos entre `<...>` son obligatorios; entre `[...]` son opcionales. La columna **Default** refleja el valor por defecto definido en el código (`.option(..., default)`). Las flags `--no-*` son *booleanas negativas* de commander.

---

## `dare init`

Inicializa un nuevo proyecto DARE. Modo **interactivo** (prompts) o **no interactivo** (vía flags, para CI/scripts).

```bash
dare init my-app --stack go-gin --toolchain auto --non-interactive
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `[project-name]` | argumento | (pregunta) | Nombre del proyecto. |
| `--stack <id>` | string | — | Id del stack de backend (salta el prompt interactivo). |
| `--mcp <language>` | string | — | Lenguaje del servidor MCP: `node-ts` \| `python` \| `rust` \| `go`. |
| `--transport <mode>` | string | `stdio` | Transporte MCP: `stdio` \| `sse` \| `http`. |
| `--toolchain <mode>` | string | `auto` | Herramientas de scaffold: `native` \| `docker` \| `auto`. |
| `--non-interactive` | boolean | `false` | Falla en vez de preguntar; exige `--stack` o `--mcp`. |

## `dare bootstrap`

Corre el scaffold oficial del stack del proyecto actual (lee `dare.config.json`) **sin** tocar los artefactos DARE. Útil en proyectos antiguos o donde el bootstrap se saltó en el `init`.

```bash
dare bootstrap --toolchain docker
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `--force` | boolean | `false` | Corre incluso con artefactos de framework presentes (puede sobrescribir archivos). |
| `--toolchain <mode>` | string | (config) | Sobrescribe el modo de toolchain en esta ejecución: `auto` \| `native` \| `docker`. |

!!! warning "Conflictos"
    Sin `--force`, el comando se niega a correr si encuentra artefactos como `vendor/`, `composer.lock`, `node_modules`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Cargo.lock` o `target/`.

## `dare discover`

Detecta un proyecto existente e instala los archivos de la metodología DARE.

```bash
dare discover --dir ./meu-projeto --check
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `-d, --dir <path>` | string | dir actual | Directorio objetivo. |
| `--check` | boolean | — | Solo muestra el resultado de la detección, sin instalar. |

## `dare reverse`

Ingeniería inversa de un codebase existente en un `IDEIA.md` (Fase 0) + specs de módulos (onboarding brownfield).

```bash
dare reverse --deep --modules auth,billing
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `-d, --dir <path>` | string | dir actual | Directorio objetivo. |
| `--check` | boolean | — | Solo muestra módulos detectados, sin escribir artefactos. |
| `--modules <list>` | string | — | Limita a módulos específicos (ids/nombres separados por coma). |
| `--no-excalidraw` | boolean | (genera) | Salta la generación del canvas de arquitectura `.excalidraw` editable. |
| `--report` | boolean | — | Calcula el reporte de confianza + matriz code-spec a partir de specs ya marcados. |
| `--deep` | boolean | — | También extrae ERD + superficie de API (determinístico) y hace scaffold de domain-rules / state-machines / permissions / C4. |

## `dare dna`

Extrae las convenciones de un codebase legado a `DARE/PROJECT-DNA.md` (ruleset de house-style brownfield).

```bash
dare dna --check
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `-d, --dir <path>` | string | dir actual | Directorio objetivo. |
| `--check` | boolean | — | Solo muestra convenciones detectadas, sin escribir artefactos. |

## `dare migrate`

Planifica una migración segura de un proyecto legado a un stack objetivo, con escenarios Gherkin de paridad (brownfield Fase 2).

```bash
dare migrate --to rust-axum --check
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `-d, --dir <path>` | string | dir actual | Directorio objetivo. |
| `--to <stack>` | string | — | Stack objetivo (ej.: `go-gin`, `rust-axum`, `node-nestjs`, `python-fastapi`). |
| `--check` | boolean | — | Muestra source/target/módulos/gaps bloqueantes, sin escribir artefactos. |

## `dare design`

Genera un `DESIGN.md` a partir de una descripción del proyecto.

```bash
dare design "API de cobrança com webhooks Stripe"
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `<description>` | argumento | — | Descripción del proyecto (obligatorio). |
| `--interactive` | boolean | — | Emite un cuestionario de planificación determinístico a partir de los hechos de dna/patterns (sin LLM). |

## `dare blueprint`

Hace el scaffold de `BLUEPRINT.md`, `dare-dag.yaml`, `TASKS.md` y `EXECUTION/task-*.md` a partir del `DESIGN.md`.

```bash
dare blueprint DARE/DESIGN.md --force
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `[design-file]` | argumento | `DARE/DESIGN.md` | Ruta al `DESIGN.md`. |
| `-f, --force` | boolean | `false` | Sobrescribe archivos existentes. |

## `dare execute`

Orquesta la ejecución del DAG (el agente del IDE corre cada task). La acción por defecto es `--status`.

```bash
dare execute --next
dare execute --complete task-001 --output "OK" --tokens 1200
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Ruta al `dare-dag.yaml`. |
| `--next` | boolean | `false` | Imprime las próximas tasks ejecutables (con prompts compuestos). |
| `--status` | boolean | `false` | Renderiza el canvas y muestra un resumen (acción por defecto). |
| `--watch` | boolean | `false` | Streamea la disponibilidad de las tasks (reimprime en cada cambio de estado). Implica `--next`. |
| `--complete <id>` | string | — | Marca una task como DONE (usar con `--output`). |
| `--fail <id>` | string | — | Marca una task como FAILED (usar con `--reason`). |
| `--reset <id>` | string | — | Resetea una task a PENDING. |
| `--output <text>` | string | — | Output capturado de la task (con `--complete`). |
| `--reason <text>` | string | — | Motivo del fallo (con `--fail`). |
| `--tokens <n>` | string | — | Tokens consumidos (con `--complete`). |
| `--duration <ms>` | string | — | Duración de la task en ms (con `--complete`). |
| `--no-graph` | boolean | (ingiere) | Salta la ingestión en el knowledge-graph en esta llamada. |
| `--parallel-hint` | boolean | `false` | Con `--next`, marca como RUNNING toda task del mismo rank. |
| `--verify` | boolean | `false` | Corre el core de verificación después de que el Ralph Loop pase. |
| `--no-verify` | boolean | (config) | Salta la verificación aunque esté habilitada en `dare.config.json`. |
| `--full-mutation` | boolean | `false` | Deshabilita la mutación incremental en esta conclusión. |
| `--verdict-json` | boolean | `false` | Emite el `LoopVerdict` como JSON en stdout. |
| `--best-of <n>` | string | — | Corre N candidatos de verificación (best-of-N). |
| `--policy <p>` | string | — | Sobrescribe la policy del loop (`decay`\|`fixed`). |
| `--prerank` | boolean | `false` | Habilita el ordenamiento prerank sin ejecución (nunca autoriza DONE). |
| `--formal` | boolean | `false` | Habilita el gate de verificación formal en esta finalización (hereda `verification.formal.enabled`). |
| `--no-formal` | boolean | (config) | Omite la verificación formal aunque esté habilitada en la config. |
| `--formal-backend <backend>` | string | (`formal.backend`) | Sobrescribe el backend formal (`dafny`\|`verus`\|`lean`). |

> **Opt-in / experimental.** El gate formal está desactivado por defecto y exige opt-in en dos niveles: `verification.formal.enabled` en la config **y** marcación por módulo (`@dare-formal` o `verification.formal.modules`). Sin eso, el comportamiento es idéntico al anterior.

## `dare graph`

Inspecciona y visualiza el knowledge graph DARE. Tiene subcomandos.

### `dare graph stats`

Muestra el conteo de nodos/aristas y el desglose por tipo. (Sin flags.)

```bash
dare graph stats
```

### `dare graph query <term>`

Busca nodos cuyo label/descripción contenga `<term>`.

```bash
dare graph query auth --type requirement --limit 5
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `<term>` | argumento | — | Término de búsqueda. |
| `-l, --limit <n>` | string | `10` | Número máximo de resultados. |
| `-t, --type <type>` | string | — | Restringe a un tipo de nodo. |

### `dare graph viz`

Exporta el grafo a un diagrama Mermaid o DOT.

```bash
dare graph viz --format dot -o graph.dot
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `-f, --format <fmt>` | string | `mermaid` | Formato de salida: `mermaid` \| `dot`. |
| `-o, --output <file>` | string | stdout | Escribe en archivo. |

### `dare graph owners <path>`

Lista tasks/requirements que poseen símbolos bajo `<path>`.

```bash
dare graph owners src/auth --json --limit 30
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `<path>` | argumento | — | Ruta a inspeccionar. |
| `--json` | boolean | — | Emite JSON. |
| `--limit <n>` | string | `20` | Número máximo de owners. |

### `dare graph impact <path>`

Muestra tasks/requirements impactados por cambios bajo `<path>`.

```bash
dare graph impact src/billing --hops 2
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `<path>` | argumento | — | Ruta de cambio. |
| `--json` | boolean | — | Emite JSON. |
| `--hops <n>` | string | `3` | Profundidad de travesía (máx 5). |

### `dare graph trace <req>`

Rastrea un requirement/task hasta símbolos de código.

```bash
dare graph trace REQ-001 --json
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `<req>` | argumento | — | Requirement o task. |
| `--json` | boolean | — | Emite JSON. |

### `dare graph locate <seed>`

Localiza símbolos/archivos/tasks de código a partir de una query semilla.

```bash
dare graph locate "login flow" --type symbol --hops 2
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `<seed>` | argumento | — | Query semilla. |
| `--json` | boolean | — | Emite JSON. |
| `--hops <n>` | string | `3` | Saltos de travesía. |
| `--limit <n>` | string | `10` | Máximo de candidatos. |
| `--type <t>` | string (repetible) | `[]` | Filtra tipos de nodo (puede repetirse). |
| `--edge-type <e>` | string (repetible) | `[]` | Filtra tipos de arista (puede repetirse). |

### `dare graph ingest`

Re-sincroniza el grafo a partir del `dare-dag.yaml` + estado actuales.

```bash
dare graph ingest --requirements-only
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Ruta al `dare-dag.yaml`. |
| `--requirements-only` | boolean | `false` | Re-parsea solo DESIGN/BLUEPRINT/TASKS, salta el DAG. |

## `dare dag`

Inspecciona y visualiza el DAG estático de tareas (`dare-dag.yaml`). Tiene el subcomando `viz`.

### `dare dag viz`

Renderiza el `dare-dag.yaml` como diagrama Mermaid, DOT o Excalidraw, con colores por estado.

```bash
dare dag viz --format excalidraw -o DARE/dag-graph.excalidraw
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Ruta al `dare-dag.yaml`. |
| `-f, --format <fmt>` | string | `mermaid` | Formato: `mermaid` \| `dot` \| `excalidraw`. |
| `-o, --output <file>` | string | stdout¹ | Escribe en archivo. |

¹ Para `excalidraw`, el default es `DARE/dag-graph.excalidraw` cuando se omite `-o`.

## `dare validate`

Valida la integridad del `dare-dag.yaml` (apto para pre-commit hooks y CI).

```bash
dare validate --strict
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `--dag <file>` | string | `DARE/dare-dag.yaml` | Ruta al `dare-dag.yaml`. |
| `--strict` | boolean | `false` | Trata warnings como errors. |

## `dare info`

Muestra la versión, paths y la integridad DARE del proyecto actual. (Sin flags.)

```bash
dare info
```

## `dare update`

Actualiza el setup del proyecto a la versión actual de la DARE CLI.

```bash
dare update --dry-run
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `--dry-run` | boolean | `false` | Muestra lo que se haría, sin escribir nada. |
| `-y, --yes` | boolean | `false` | No pregunta nada — aplica todo y mantiene customizaciones. |
| `--force` | boolean | `false` | Sobrescribe incluso archivos customizados (peligroso). |
| `--target <version>` | string | (CLI instalada) | Actualiza a una versión específica. |

## `dare review`

Audita una task en busca de stubs, mocks, TODOs y funciones vacías.

```bash
dare review task-001 --strict --format json
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `<task-id>` | argumento | — | ID de la task (ej.: `task-001`) — busca `DARE/EXECUTION/<id>.md`. |
| `--strict` | boolean | `false` | Trata warnings como errors (CI-friendly). |
| `--errors-only` | boolean | `false` | Suprime warnings en la salida humana. |
| `--files <files...>` | string[] | — | Lista explícita de archivos a analizar (ignora spec/git). |
| `--from-agent <path>` | string | — | Ruta al JSON con `SemanticVerdict` producido por el agente IDE. |
| `--format <fmt>` | string | `human` | Salida: `human` \| `json`. |

## `dare refine`

Mide la complejidad de una task y (opcionalmente) propone una división en sub-tasks.

```bash
dare refine task-003 --split --apply
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `<task-id>` | argumento | — | ID de la task (ej.: `task-001`). |
| `--split` | boolean | `false` | Emite una propuesta de división en sub-tasks. |
| `--apply` | boolean | `false` | Aplica el split: marca la task original como SPLIT en `DARE/TASKS.md`. |
| `--strict` | boolean | `false` | Exit code 2 cuando la complejidad sea HIGH/CRITICAL (CI-friendly). |
| `--format <fmt>` | string | `human` | Salida: `human` \| `json`. |
| `--from-agent <path>` | string | — | JSON con `RefineVerdict` producido por el agente IDE. |

## `dare bench`

Corre fixtures de bench de verificación (gate determinístico de calidad de patch).

```bash
dare bench --json --baseline baseline.json --fail-on-regression 5
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `--suite <dir>` | string | (suite por defecto) | Directorio con `suite.json`. |
| `--json` | boolean | `false` | Emite reporte JSON en stdout. |
| `--baseline <file>` | string | — | `BenchReport` JSON de baseline para comparación de regresión. |
| `--fail-on-regression <pp>` | string | `3` | Falla si la solve-rate cae más de N puntos porcentuales vs baseline. |
| `--filter <glob>` | string | — | Corre solo fixtures que casan con el glob. |

## `dare hooks`

Gestiona y corre hooks de agente DARE (determinístico, sin LLM). Tiene subcomandos.

### `dare hooks list`

Lista los hooks configurados en `dare.config.json`.

```bash
dare hooks list --json
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `--json` | boolean | — | Emite JSON. |

### `dare hooks run <event>`

Corre los hooks de un evento.

```bash
dare hooks run on-save --file src/index.ts
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `<event>` | argumento | — | Evento (ej.: `on-save`, `on-file-create`, `on-task-complete`). |
| `--file <path>` | string | — | Ruta relativa del archivo (`on-save` / `on-file-create`). |
| `--task <taskId>` | string | — | Id de la task (`on-task-complete`). |
| `--trust` | boolean | — | Sobrescribe `hooks.trusted` en esta ejecución. |
| `--json` | boolean | — | Emite resultados en JSON. |

### `dare hooks validate`

Valida el schema de la config de hooks y el allowlist.

```bash
dare hooks validate --json
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `--json` | boolean | — | Emite JSON. |

## `dare steering`

Inspecciona archivos de steering resueltos (determinístico, sin LLM). Tiene subcomandos.

### `dare steering list`

Lista los archivos de steering descubiertos y su orden de precedencia.

```bash
dare steering list --json
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `--json` | boolean | — | Emite JSON. |

### `dare steering show <file>`

Resuelve e imprime el steering aplicable a `<file>`, en orden de precedencia.

```bash
dare steering show src/auth/login.ts
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `<file>` | argumento | — | Archivo objetivo. |
| `--json` | boolean | — | Emite JSON. |

## `dare patterns`

Descubre patrones recurrentes del codebase en `DARE/PATTERNS.md` (determinístico, sin LLM).

```bash
dare patterns --inject
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `-d, --dir <path>` | string | dir actual | Directorio objetivo. |
| `--check` | boolean | — | Solo muestra patrones detectados, sin escribir artefactos. |
| `--modules <list>` | string | — | Limita a módulos específicos (ids/nombres separados por coma). |
| `--inject` | boolean | — | Confirma `PATTERNS.md` como base de steering (idempotente, preserva el steering del usuario). |

## `dare skill`

Gestiona las skills DARE de este proyecto (add, remove, list, info, update, publish). Tiene subcomandos.

### `dare skill list`

Lista skills disponibles (registry) o instaladas en el proyecto.

```bash
dare skill list --installed
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `--installed` | boolean | `false` | Muestra solo skills instaladas de `.dare/skills.yml`. |
| `--json` | boolean | `false` | Salida JSON (machine-readable). |

### `dare skill info <name>`

Muestra información detallada de una skill del registry.

```bash
dare skill info dare-ax
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `<name>` | argumento | — | Nombre de la skill (ej.: `dare-ax`). |
| `--json` | boolean | `false` | Salida JSON (machine-readable). |

### `dare skill add <name>`

Instala una skill en el proyecto.

```bash
dare skill add dare-ax@1.0.0 --dry-run
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `<name>` | argumento | — | Nombre de la skill con versión opcional (ej.: `dare-ax` o `dare-ax@1.0.0`). |
| `--dry-run` | boolean | `false` | Muestra lo que se instalaría, sin alterar nada. |
| `--json` | boolean | `false` | Salida JSON (machine-readable). |

### `dare skill remove <name>`

Remueve una skill instalada del proyecto.

```bash
dare skill remove dare-ax --force
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `<name>` | argumento | — | Nombre de la skill a remover (ej.: `dare-ax`). |
| `--force` | boolean | `false` | Remueve incluso si otras skills instaladas dependen de ella. |
| `--json` | boolean | `false` | Salida JSON (machine-readable). |

### `dare skill update <name>`

Actualiza una skill instalada a una versión más nueva.

```bash
dare skill update dare-ax@1.1.0 --dry-run
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `<name>` | argumento | — | Nombre de la skill con versión opcional (ej.: `dare-ax` o `dare-ax@1.1.0`). |
| `--dry-run` | boolean | `false` | Muestra el diff de versión, sin alterar nada. |
| `--json` | boolean | `false` | Salida JSON (machine-readable). |

### `dare skill publish <path>`

Publica una skill local en el registry (local por defecto, o remoto con `--remote`).

```bash
dare skill publish ./minha-skill --remote --token "$GITHUB_TOKEN"
```

| Flag | Tipo | Default | Descripción |
|------|------|---------|-----------|
| `<path>` | argumento | — | Ruta del directorio de la skill que contiene `skill.yml`. |
| `--dry-run` | boolean | `false` | Valida y lista archivos, sin publicar. |
| `--json` | boolean | `false` | Salida JSON (machine-readable). |
| `--remote` | boolean | `false` | Publica en el backend remoto (registry Vercel). |
| `--token <github-token>` | string | — | Bearer token de GitHub (obligatorio con `--remote`). |

## `dare welcome`

Muestra el banner de bienvenida de DARE y la guía de quick-start. (Sin flags.)

```bash
dare welcome
```
