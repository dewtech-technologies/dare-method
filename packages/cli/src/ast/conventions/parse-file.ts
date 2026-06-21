import { initAstLoader, loadGrammarWasm } from '../loader.js';
import { walkAst, type AstNode } from '../walk.js';
import type { ScannedFile } from './scan.js';

/** Parse one file and walk the AST before freeing tree-sitter resources. */
export async function walkScannedFile(
  file: ScannedFile,
  visit: (node: AstNode) => void,
): Promise<boolean> {
  const loader = await initAstLoader();
  if (!loader.available) return false;

  const grammar = await loadGrammarWasm(file.wasm, file.lang);
  if (!grammar) return false;

  try {
    const { Parser } = await import('web-tree-sitter');
    const parser = new Parser();
    parser.setLanguage(grammar);
    const tree = parser.parse(file.content);
    if (!tree) {
      parser.delete();
      return false;
    }
    walkAst(tree.rootNode as AstNode, visit);
    tree.delete();
    parser.delete();
    return true;
  } catch {
    return false;
  }
}
