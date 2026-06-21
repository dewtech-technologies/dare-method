import type { DataModel, Endpoint, Entity } from '../../utils/datamodel.js';
import type { AstNode } from '../walk.js';
import { walkAst, sourceLine } from '../walk.js';
import { extractEndpointsFromBlob, extractEntityFromClassBlob } from './shared.js';

export const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** Tree-sitter walk: complete call_expression/decorator/class blobs (multi-line safe). */
export function extractFromTree(root: AstNode, relPath: string): Pick<DataModel, 'endpoints' | 'entities'> {
  const endpoints: Endpoint[] = [];
  const entities: Entity[] = [];
  const epSeen = new Set<string>();
  const entSeen = new Set<string>();
  let classPrefix = '';

  walkAst(root, (node) => {
    const src = sourceLine(relPath, node.startPosition.row);
    const text = node.text;

    if (node.type === 'class_declaration' || node.type === 'class') {
      const ctrl = /@Controller\(\s*['"`]([^'"`]*)['"`]/.exec(text);
      if (ctrl) classPrefix = ctrl[1];
      extractEntityFromClassBlob(text, src, entities, entSeen);
    }

    if (
      node.type === 'call_expression' ||
      node.type === 'decorator' ||
      node.type === 'method_definition' ||
      node.type === 'function_declaration'
    ) {
      extractEndpointsFromBlob(text, src, endpoints, epSeen, classPrefix);
    }
  });

  return { endpoints, entities };
}
