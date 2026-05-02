# @dewtech/dare-graphrag

Knowledge graph engine for DARE Framework with SQLite persistence and FTS5 semantic search.

## Features

- **SQLite persistence** with WAL mode for performance
- **7 node types**: task, file, schema, endpoint, component, entity, concept
- **7 edge types**: depends_on, implements, uses, references, related_to, contains, extends
- **FTS5 full-text search** for semantic queries
- **Graph traversal** for dependency analysis
- **Import/export** to JSON format

## Installation

```bash
npm install @dewtech/dare-graphrag
```

## Usage

```typescript
import { GraphRAG } from '@dewtech/dare-graphrag';

const graph = new GraphRAG('.dare/graph.db');

// Add nodes
graph.addNode({
  id: 'task-001',
  type: 'task',
  label: 'Implement authentication',
  description: 'JWT-based auth with refresh tokens',
  metadata: { status: 'PENDING', complexity: 'HIGH' }
});

graph.addNode({
  id: 'file-auth-rs',
  type: 'file',
  label: 'auth.rs',
  description: 'Authentication module',
  metadata: { path: 'src/auth.rs', language: 'rust' }
});

// Add edges
graph.addEdge({
  id: 'edge-001',
  sourceId: 'task-001',
  targetId: 'file-auth-rs',
  type: 'implements'
});

// Semantic search (saves tokens vs reading full files)
const results = graph.searchNodes('authentication JWT', 5);
results.forEach(r => console.log(r.node.label, r.score));

// Get dependencies
const deps = graph.getNodeDependencies('task-003', 2);

// Statistics
const stats = graph.getStatistics();
console.log(`${stats.totalNodes} nodes, ${stats.totalEdges} edges`);

// Export/Import
const json = graph.exportToJson();
graph.importFromJson(json);

graph.close();
```

## Node Types

| Type | Description |
|------|-------------|
| `task` | DARE task from dare-dag.yaml |
| `file` | Source code file |
| `schema` | Database table/schema |
| `endpoint` | API endpoint |
| `component` | UI component |
| `entity` | Domain entity |
| `concept` | Abstract concept |

## Edge Types

| Type | Description |
|------|-------------|
| `depends_on` | Task/file dependency |
| `implements` | Task implements file/endpoint |
| `uses` | Component uses schema/endpoint |
| `references` | File references another file |
| `related_to` | General relation |
| `contains` | Parent-child containment |
| `extends` | Inheritance/extension |

## Performance

- WAL mode: concurrent reads while writing
- FTS5: full-text search in ~10ms
- Indexes: type/label queries in O(log n)
- Cache: 10k pages in memory
