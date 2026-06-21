import type { DataModel, Endpoint, Entity } from '../../utils/datamodel.js';
import type { AstNode } from '../walk.js';
import { walkAst, sourceLine } from '../walk.js';
import { extractEndpointsFromBlob, extractEntityFromClassBlob } from './shared.js';

export const PY_EXTENSIONS = ['.py'] as const;

export function extractFromTree(root: AstNode, relPath: string): Pick<DataModel, 'endpoints' | 'entities'> {
  const endpoints: Endpoint[] = [];
  const entities: Entity[] = [];
  const epSeen = new Set<string>();
  const entSeen = new Set<string>();

  walkAst(root, (node) => {
    const src = sourceLine(relPath, node.startPosition.row);
    const text = node.text;

    if (node.type === 'decorated_definition' || node.type === 'decorator' || node.type === 'call') {
      extractEndpointsFromBlob(text, src, endpoints, epSeen);
    }

    if (node.type === 'class_definition') {
      extractEntityFromClassBlob(text, src, entities, entSeen);
      if (/class\s+\w+/.test(text)) {
        const cm = /class\s+(\w+)/.exec(text);
        if (cm && /Base|Model|db\.Model/.test(text)) {
          const key = cm[1].toLowerCase();
          if (!entSeen.has(key)) {
            entSeen.add(key);
            const entity: Entity = { name: cm[1], fields: [], relations: [], source: src };
            for (const raw of text.split(/\r?\n/)) {
              const col = /(\w+)\s*=\s*Column\(/.exec(raw);
              if (col) entity.fields.push({ name: col[1], type: 'column' });
            }
            if (entity.fields.length) entities.push(entity);
          }
        }
      }
    }
  });

  return { endpoints, entities };
}
