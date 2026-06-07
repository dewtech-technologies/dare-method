# Dual-graph fixtures

Deterministic JSON graphs for objectives O-02 (owners), O-03 (impact recall), O-04 (locate top-5) and O-07 (trace ≤3 hops).

## Shape

Each `*.json` file contains:

- `nodes` — array of `GraphNode` with canonical ids (`code_symbol:path::sym`, `requirement:RF-NN`, `task:task-NN`, `file:path`)
- `edges` — array of `GraphEdge` linking those nodes
- `expect` — optional assertions consumed by later objective tests (task-210/211)

## Files

| File | Purpose |
|------|---------|
| `impact-chain.json` | requirement → task → code_symbol chain (O-03, O-07) |
| `owners-chain.json` | multiple owners for one file path (O-02) |
| `locate/math.json` | locate seed `math` (O-04) |
| `locate/auth.json` | locate seed `auth` (O-04) |

## Usage

```ts
import { JsonGraph } from '../../../graphrag/json-graph.js';
import { buildGraphFromFixture, loadFixture } from './build-fixture-graph.js';

const graph = new JsonGraph('graph.json');
await graph.init();
buildGraphFromFixture(graph, loadFixture('impact-chain'));
```

`buildGraphFromFixture` calls real `addNode` / `addEdge` on the supplied `KnowledgeGraph`.
