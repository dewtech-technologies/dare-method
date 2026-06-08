# Agentes

Tres mecanismos conectan asistentes de IA (Cursor, Antigravity, híbridos) al
proyecto DARE de forma **determinista y auditable**: **hooks** (automatizaciones
por evento), **steering files** (contexto/reglas resueltos por archivo) y el
**servidor MCP** (API local de solo lectura del proyecto y del grafo).

## Hooks

Automatizaciones disparadas por eventos del ciclo de desarrollo. Son
**deterministas** (ningún LLM decide qué se ejecuta) y **opt-in**: la ausencia
del bloque `hooks` en `dare.config.json` significa cero hooks.

### Eventos

Un conjunto **cerrado** en la v1 (`hooks/types.ts`). Los eventos fuera de esta
lista son rechazados:

| Evento | Cuándo dispara | Payload |
|---|---|---|
| `on-save` | Al guardar un archivo | `file` (relativo, validado) |
| `on-file-create` | Al crear un archivo | `file` (relativo, validado) |
| `on-task-complete` | Al concluir una task | `taskId` (`/^task-[0-9a-z-]+$/`) |
| `pre-commit` | Antes de un commit | — |

### Allowlist de acciones

El bloque `on` mapea evento → lista de acciones. Cada acción es una clave de un
conjunto **cerrado** (`hooks/allowlist.ts`) — nunca una cadena de shell:

| Acción | Comando resuelto | Tipo |
|---|---|---|
| `dare-validate` | `dare validate --strict` | spawn |
| `dare-review` | `dare review <taskId> --strict --format json` | spawn (exige `taskId`) |
| `graph-register` | — (interno, no spawnea) | interno |
| `lint` | comando de lint del stack (resuelto del config) | spawn |
| `test` | comando de test del stack (resuelto del config) | spawn |

Las acciones `dare-validate`, `dare-review`, `lint` y `test` producen un
veredicto `pass`/`fail` a partir del exit code (0 = `pass`). `graph-register` es
una acción interna que solo registra el disparo en el grafo.

### Trust gate

```json
{
  "hooks": {
    "on": {
      "on-task-complete": [{ "action": "dare-review" }],
      "pre-commit": [{ "action": "dare-validate" }, { "action": "test" }]
    },
    "trusted": false
  }
}
```

Mientras `hooks.trusted` sea `false`, los hooks **no se auto-ejecutan**:
`dispatchHook` lanza `TrustRequiredError` y `dare hooks run` falla con
`TRUST_REQUIRED` (exit 2). Para ejecutar de todos modos, usa `--trust` (override
por ejecución) o define `trusted: true` en el config.

### Comandos

```bash
# Listar hooks configurados
dare hooks list
dare hooks list --json        # { "hooks": {...}, "trusted": false }

# Rodar os hooks de um evento
dare hooks run on-save --file src/app.ts
dare hooks run on-task-complete --task task-001
dare hooks run pre-commit --trust    # override do trust gate
dare hooks run on-save --file src/app.ts --json

# Validar schema + allowlist do bloco hooks
dare hooks validate
dare hooks validate --json    # { "valid": true, "errors": [] }
```

Flags por subcomando:

| Subcomando | Flags | Notas |
|---|---|---|
| `list` | `--json` | Lista el mapa `on` y `trusted`. |
| `run <event>` | `--file <path>`, `--task <taskId>`, `--trust`, `--json` | Exit 0 = ok, 1 = alguna acción falló, 2 = config inválida / untrusted. |
| `validate` | `--json` | Exit 0 = válido, 1 = errores. |

### Seguridad

!!! danger "Por qué los hooks son seguros por construcción"
    - **Allowlist cerrada**: solo se aceptan las 5 claves canónicas; editable
      únicamente vía diff versionado. Las cadenas de shell arbitrarias son imposibles.
    - **`shell: false`**: todo se ejecuta vía `safeSpawn` con `spawn(cmd, argv, { shell: false })`.
      Los args entran como elementos de argv, **nunca interpolados en shell** — sin
      inyección vía `;`, `&&`, backticks, etc.
    - **Confinamiento de ruta**: `payload.file` y los args con aspecto de ruta
      pasan por `assertRelativeSafe`; los escapes lanzan `PathEscapeError`.
    - **Env saneado**: las variables que casan con `SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|API_KEY|AUTH|PRIVATE`
      se eliminan antes del spawn (allowlist de env en `safe-spawn.ts`).
    - **Trust explícito**: sin `trusted:true`/`--trust`, nada se ejecuta.
    - **Timeout y salida limitada**: cada spawn tiene timeout (600s en el dispatcher)
      y salida acotada.

## Steering files

Archivos Markdown que proporcionan **contexto y reglas** a la IA, resueltos por
archivo destino de forma determinista (`steering/loader.ts` + `resolver.ts`).
No viven en `dare.config.json`.

### Qué son y de dónde vienen

El loader descubre tres orígenes:

| Origen | `isBase` | Front-matter |
|---|---|---|
| `DARE/PROJECT-DNA.md` | `true` | base canónica (reuso del DNA del proyecto) |
| `DARE/PATTERNS.md` | `true` | base canónica (patrones del proyecto) |
| `.dare/steering/*.md` | `false` | front-matter YAML validado por Zod |

!!! warning "Los archivos `.env*` nunca son elegibles"
    Cualquier archivo cuyo nombre case con `^\.env(\..*)?$` se descarta como
    fuente de steering (protección contra fuga de secretos).

Front-matter de un steering file en `.dare/steering/` (Zod `.strict()`):

| Campo | Tipo | Predeterminado | Descripción |
|---|---|---|---|
| `scope` | `'project' \| 'glob'` | — (obligatorio) | `project` aplica a todo; `glob` aplica según el patrón. |
| `glob` | `string` | — | Obligatorio cuando `scope: glob`. Debe ser relativo, sin `..`. |
| `priority` | `number` (int) | `0` | Desempate dentro del mismo bucket. |
| `title` | `string` | — | Título opcional. |

```markdown
---
scope: glob
glob: src/api/**
priority: 10
title: Regras da camada de API
---
Sempre validar entrada com Zod antes de tocar no banco.
```

### Precedencia / resolución

`resolveSteeringForFile` filtra los bloques aplicables al archivo destino y los
ordena de **menos a más específico** — el consumidor concatena en ese orden
(los bloques más específicos sobrescriben a los más generales). La ordenación
(`sortSteeringByPrecedence`) usa:

1. **Bucket** (de lo más general a lo más específico): `base` (0) → `project` (1) → `glob` (2);
2. **`priority`** (menor primero);
3. **`path`** (orden alfabético) como desempate final.

Los bloques `base` (PROJECT-DNA / PATTERNS) y de scope `project` siempre se aplican;
los bloques `glob` solo cuando el patrón casa con el archivo destino.

### Comandos

```bash
# Listar steering files descobertos, em ordem de precedência
dare steering list
dare steering list --json

# Resolver o steering aplicável a um arquivo (na ordem de aplicação)
dare steering show src/api/users.ts
dare steering show src/api/users.ts --json
```

`steering show` lanza un error de ruta (`PathEscapeError`, exit 1) si el archivo
no es relativo y contenido dentro del proyecto.

## Servidor MCP

Servidor HTTP local que expone lectura del contexto del proyecto y del knowledge
graph para los IDEs. Implementado en `mcp-server/server.ts`, iniciado por el
binario `dare-mcp-server` (`mcp-server/bin/server.ts`).

### Cómo arranca

```bash
# binário publicado no package
dare-mcp-server

# ou apontando para outro projeto / porta / token
DARE_PROJECT_PATH=/caminho/do/projeto \
DARE_MCP_PORT=3000 \
DARE_MCP_TOKEN="um-token-forte" \
dare-mcp-server
```

Defaults de boot (`boot-config.ts`): bind `127.0.0.1`, puerto `3000`,
`DARE_PROJECT_PATH` = cwd, y token = `randomUUID()` si `DARE_MCP_TOKEN` no está
definido. Ver la tabla completa en
[Configuración › Variables del MCP](configuration.md#variaveis-de-ambiente-do-mcp).

!!! danger "Bind en loopback y auth Bearer"
    El servidor hace bind en `127.0.0.1` por defecto. En loopback, las
    solicitudes sin token se aceptan (`allowLoopbackWithoutToken`, activado por
    defecto); para cualquier otro origen es obligatorio `Authorization: Bearer <token>`. Con
    `DARE_MCP_BIND=0.0.0.0` el servidor avisa que está expuesto a la LAN — úsalo solo en
    redes confiables y con un `DARE_MCP_TOKEN` fuerte. El CORS acepta solo
    `http://127.0.0.1:*` y `http://localhost:*`. El token nunca se loguea por
    completo (`redactToken`).

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Status, versión y basename del proyecto. |
| `GET` | `/tools` | Lista las herramientas MCP disponibles. |
| `POST` | `/context/query` | Busca contexto por `type` (`file`/`task`/`dependency`/`architecture`/`schema`/`endpoint`) y `query`. |
| `GET` | `/blueprint` | Contenido de `DARE/BLUEPRINT.md`. |
| `GET` | `/dag` | Contenido de `DARE/dare-dag.yaml`. |
| `GET` | `/tasks/:taskId` | Status de una task (leído de `TASKS.md`). |
| `PUT` | `/tasks/:taskId` | Actualiza el status de una task en `TASKS.md`. |
| `GET` | `/project` | Contenido de `dare.config.json`. |
| `GET` | `/steering?file=<rel>` | Steering resuelto para un archivo. |
| `POST` | `/graph/locate` | Localiza símbolos a partir de un `seed`. |
| `POST` | `/graph/map-requirement` | Mapea un `reqId` (`RF-…`/`O-…`/`task-…`) a símbolos y tasks. |
| `POST` | `/graph/traverse` | Recorre el grafo a partir de `seedNodeIds`. |

Las rutas de grafo (`graph/*`) abren el backend vía `loadGraphConfig` +
`createGraph` según el `dare-graph.yml` del proyecto, clampando `hops`/`limit`
(1–5 / 1–50) y validando seeds con aspecto de ruta. Las rutas que leen
archivos resuelven rutas con `resolveSafePath`; los intentos de escape devuelven
`403 Forbidden`.

### Cómo consumen los 3 IDEs

Los IDEs configurados en `ide` (`cursor`, `antigravity`, `hybrid`) apuntan un
cliente MCP a `http://127.0.0.1:3000` y usan el token Bearer (`DARE_MCP_TOKEN`)
para acceder a las herramientas listadas en `/tools`. El flujo típico:

- **`get_project_context`** (`GET /project`) y **`get_blueprint`** /
  **`get_dag`** dan al IDE el contexto estructural del proyecto;
- **`query_context`** (`POST /context/query`) busca fragmentos relevantes de
  BLUEPRINT/TASKS/DAG por palabra clave;
- **`get_task_status`** / **`update_task_status`** (`GET`/`PUT /tasks/:id`)
  sincronizan el progreso de las tasks;
- **`graph_locate` / `graph_map_requirement` / `graph_traverse`** (`POST /graph/*`)
  navegan el knowledge graph para anclar cambios a requisitos y símbolos;
- **`get_steering`** (`GET /steering`) entrega al IDE las reglas aplicables al
  archivo abierto, ya resueltas por precedencia.
