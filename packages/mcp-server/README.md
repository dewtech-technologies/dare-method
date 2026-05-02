# @dewtech/dare-mcp-server

Model Context Protocol (MCP) server for DARE Framework. Provides semantic context queries to reduce token consumption by up to 90%.

## Features

- **HTTP API** implementing Model Context Protocol
- **Semantic context queries** without reading full files
- **Task status management** and tracking
- **Blueprint and DAG** access endpoints
- **Full-text search** with FTS5

## Installation

```bash
npm install @dewtech/dare-mcp-server
```

## Usage

### Start the server

```bash
dare-mcp-server
# or
DARE_MCP_PORT=3000 DARE_PROJECT_PATH=/path/to/project dare-mcp-server
```

### Query context (saves tokens)

```bash
# Instead of reading BLUEPRINT.md entirely, query only what you need
curl -X POST http://localhost:3000/context/query \
  -H "Content-Type: application/json" \
  -d '{"type": "architecture", "query": "authentication", "limit": 3}'
```

### Update task status

```bash
curl -X PUT http://localhost:3000/tasks/task-001 \
  -H "Content-Type: application/json" \
  -d '{"status": "DONE"}'
```

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/tools` | List MCP tools |
| `POST` | `/context/query` | Semantic context query |
| `GET` | `/blueprint` | Get BLUEPRINT.md |
| `GET` | `/dag` | Get dare-dag.yaml |
| `GET` | `/tasks/:id` | Get task status |
| `PUT` | `/tasks/:id` | Update task status |
| `GET` | `/project` | Get dare.config.json |

## Integration with Cursor

Add to `.cursorrules`:

```
## MCP Server
Query context via MCP instead of reading full files:
POST http://localhost:3000/context/query
{"type": "architecture", "query": "your query", "limit": 5}
This saves ~90% of tokens on context retrieval.
```

## Token Savings

| Method | Tokens Used |
|--------|-------------|
| Read full BLUEPRINT.md | ~8,000 tokens |
| MCP query (5 results) | ~400 tokens |
| **Savings** | **~95%** |
