import type { DataModel, Endpoint, Entity } from '../../utils/datamodel.js';
import type { AstNode } from '../walk.js';
import { walkAst, sourceLine } from '../walk.js';
import { extractEndpointsFromBlob, pushEndpoint } from './shared.js';

export const PHP_EXTENSIONS = ['.php'] as const;

export function extractFromTree(root: AstNode, relPath: string): Pick<DataModel, 'endpoints' | 'entities'> {
  const endpoints: Endpoint[] = [];
  const entities: Entity[] = [];
  const epSeen = new Set<string>();
  const entSeen = new Set<string>();

  walkAst(root, (node) => {
    const src = sourceLine(relPath, node.startPosition.row);
    const text = node.text;

    if (node.type === 'expression_statement' || node.type === 'method_call_expression' || node.type === 'scoped_call_expression') {
      extractEndpointsFromBlob(text, src, endpoints, epSeen);
      const chain = /Route::[\s\S]*?->(get|post|put|patch|delete|options)\(\s*['"]([^'"]+)['"]/gi;
      let m: RegExpExecArray | null;
      while ((m = chain.exec(text)) !== null) {
        pushEndpoint(endpoints, epSeen, m[1], m[2], src);
      }
      const attr = /#\[\s*(Get|Post|Put|Patch|Delete)\(\s*['"]([^'"]+)['"]\s*\)\]/gi;
      let am: RegExpExecArray | null;
      while ((am = attr.exec(text)) !== null) {
        pushEndpoint(endpoints, epSeen, am[1], am[2], src);
      }
    }

    if (node.type === 'class_declaration') {
      const cm = /class\s+(\w+)/.exec(text);
      if (!cm) return;
      if (!/extends\s+Model\b/.test(text)) return;
      const key = cm[1].toLowerCase();
      if (entSeen.has(key)) return;
      entSeen.add(key);
      const entity: Entity = { name: cm[1], fields: [], relations: [], source: src };
      const fill = /\$fillable\s*=\s*\[([^\]]+)\]/.exec(text);
      if (fill) {
        for (const f of fill[1].matchAll(/['"](\w+)['"]/g)) {
          entity.fields.push({ name: f[1], type: 'fillable' });
        }
      }
      entities.push(entity);
    }
  });

  return { endpoints, entities };
}
