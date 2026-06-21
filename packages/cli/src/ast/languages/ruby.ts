import type { DataModel } from '../../utils/datamodel.js';
import type { AstNode } from '../walk.js';
import { walkAst, sourceLine } from '../walk.js';
import { extractEndpointsFromBlob } from './shared.js';

export const RUBY_EXTENSIONS = ['.rb'] as const;

export function extractFromTree(root: AstNode, relPath: string): Pick<DataModel, 'endpoints' | 'entities'> {
  const endpoints: DataModel['endpoints'] = [];
  const epSeen = new Set<string>();

  walkAst(root, (node) => {
    const src = sourceLine(relPath, node.startPosition.row);
    if (node.type === 'call' || node.type === 'method_call') {
      extractEndpointsFromBlob(node.text, src, endpoints, epSeen);
    }
  });

  return { endpoints, entities: [] };
}
