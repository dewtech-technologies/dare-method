/** Minimal tree-sitter node surface for walking without importing web-tree-sitter in every module. */
export interface AstNode {
  readonly type: string;
  readonly text: string;
  readonly startPosition: { readonly row: number };
  readonly namedChildCount: number;
  namedChild(index: number): AstNode;
}

export function walkAst(node: AstNode, visit: (n: AstNode) => void): void {
  visit(node);
  for (let i = 0; i < node.namedChildCount; i++) {
    walkAst(node.namedChild(i), visit);
  }
}

export function sourceLine(relPath: string, row: number): string {
  return `${relPath}:${row + 1}`;
}
