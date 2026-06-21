import type { DataModel } from '../../utils/datamodel.js';
import type { AstNode } from '../walk.js';
import { walkAst, sourceLine } from '../walk.js';
import { extractEndpointsFromBlob } from './shared.js';

export const RUST_EXTENSIONS = ['.rs'] as const;

export function extractFromTree(root: AstNode, relPath: string): Pick<DataModel, 'endpoints' | 'entities'> {
  const endpoints: DataModel['endpoints'] = [];
  const epSeen = new Set<string>();

  walkAst(root, (node) => {
    if (node.type !== 'call_expression' && node.type !== 'macro_invocation') return;
    const src = sourceLine(relPath, node.startPosition.row);
    extractEndpointsFromBlob(node.text, src, endpoints, epSeen);
  });

  return { endpoints, entities: [] };
}
