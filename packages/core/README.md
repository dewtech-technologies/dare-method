# @dewtech/dare-core

Tipos TypeScript, utilitários e constantes compartilhadas para o ecossistema DARE Framework.

Este pacote é parte do [DARE System Method](https://github.com/dewtech-technologies/dare-method).

## Instalação

```bash
npm install @dewtech/dare-core
```

## Uso

```typescript
import { ProjectConfig, GraphNode, NodeType } from '@dewtech/dare-core';

const config: ProjectConfig = {
  name: 'meu-projeto',
  structure: 'monorepo',
  backend: 'node-nestjs',
  frontend: 'react',
  ide: 'cursor',
  graphrag: 'sqlite'
};

const node: GraphNode = {
  id: '123',
  type: 'task',
  label: 'Implementar API'
};
```

## Tipos Disponíveis

- **Grafo:** `GraphNode`, `GraphEdge`, `NodeType`, `EdgeType`, `SearchResult`, `GraphStatistics`
- **Projeto:** `ProjectConfig`, `ProjectStructure`, `BackendStack`, `FrontendStack`, `IdeChoice`, `GraphRagBackend`
