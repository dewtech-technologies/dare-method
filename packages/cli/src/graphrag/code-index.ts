import fs from 'node:fs';
import path from 'node:path';
import { SUPPORTED_EXTENSIONS, inString, isTestFile } from '../utils/static-analyzer.js';
import type { CodeSymbolKind } from './types.js';

export interface ExtractedSymbol {
  readonly path: string;
  readonly symbol: string;
  readonly kind: CodeSymbolKind;
  readonly qualifiedName: string;
  readonly line: number;
}

/** Normaliza path para qualifiedName (posix, lowercase drive no win32). */
export function toQualifiedName(filePath: string, symbol: string): string {
  let posix = filePath.replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(posix)) {
    posix = posix[0]!.toLowerCase() + posix.slice(1);
  }
  return `${posix}::${symbol}`;
}

function sortSymbols(symbols: ExtractedSymbol[]): ExtractedSymbol[] {
  return [...symbols].sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    if (a.line !== b.line) return a.line - b.line;
    return a.symbol.localeCompare(b.symbol);
  });
}

function pushSymbol(
  out: ExtractedSymbol[],
  relPath: string,
  symbol: string,
  kind: CodeSymbolKind,
  line: number,
): void {
  out.push({
    path: relPath,
    symbol,
    kind,
    qualifiedName: toQualifiedName(relPath, symbol),
    line,
  });
}

function matchNameCol(line: string, re: RegExp): { symbol: string; col: number } | null {
  const m = re.exec(line);
  if (!m) return null;
  const symbol = [...m].reverse().find((g) => typeof g === 'string' && /^\w+$/.test(g));
  if (!symbol) return null;
  const col = m.index + m[0].indexOf(symbol);
  if (inString(line, col)) return null;
  return { symbol, col };
}

function extractTsJs(lines: string[], relPath: string, out: ExtractedSymbol[]): void {
  const fnRe = /^(export\s+)?(async\s+)?function\s+(\w+)\s*\(/;
  const classRe = /^(export\s+)?(abstract\s+)?class\s+(\w+)/;
  const methodRe = /^\s+(\w+)\s*\(/;

  let braceDepth = 0;
  let inClassBody = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (!inClassBody) {
      const fnMatch = matchNameCol(line, fnRe);
      if (fnMatch) {
        pushSymbol(out, relPath, fnMatch.symbol, 'function', i + 1);
      }
      const classMatch = matchNameCol(line, classRe);
      if (classMatch) {
        pushSymbol(out, relPath, classMatch.symbol, 'class', i + 1);
        if (line.includes('{')) {
          inClassBody = true;
          braceDepth =
            (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
        }
      }
      continue;
    }

    const methodMatch = matchNameCol(line, methodRe);
    if (methodMatch && !/^(if|for|while|switch|catch|return)\b/.test(methodMatch.symbol)) {
      pushSymbol(out, relPath, methodMatch.symbol, 'method', i + 1);
    }
    braceDepth += (line.match(/\{/g) ?? []).length;
    braceDepth -= (line.match(/\}/g) ?? []).length;
    if (braceDepth <= 0) {
      inClassBody = false;
      braceDepth = 0;
    }
  }
}

function extractPython(lines: string[], relPath: string, out: ExtractedSymbol[]): void {
  const defRe = /^def\s+(\w+)\s*\(/;
  const classRe = /^class\s+(\w+)/;

  let inClass = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!inClass) {
      const classMatch = matchNameCol(line, classRe);
      if (classMatch) {
        pushSymbol(out, relPath, classMatch.symbol, 'class', i + 1);
        inClass = true;
        continue;
      }
      const defMatch = matchNameCol(line, defRe);
      if (defMatch) {
        pushSymbol(out, relPath, defMatch.symbol, 'function', i + 1);
      }
    } else {
      if (line.trim() === '' || /^\s/.test(line)) {
        if (/^class\s/.test(line.trim())) inClass = false;
        const indentedDef = /^\s+def\s+(\w+)\s*\(/.exec(line);
        if (indentedDef?.[1]) {
          const col = line.indexOf(indentedDef[1]);
          if (!inString(line, col)) {
            pushSymbol(out, relPath, indentedDef[1], 'method', i + 1);
          }
        }
      } else {
        inClass = false;
        const defMatch = matchNameCol(line, defRe);
        if (defMatch) {
          pushSymbol(out, relPath, defMatch.symbol, 'function', i + 1);
        }
      }
    }
  }
}

function extractGo(lines: string[], relPath: string, out: ExtractedSymbol[]): void {
  const fnRe = /^func\s+(\w+)\s*\(/;
  const methodRe = /^func\s+\([^)]*\)\s+(\w+)\s*\(/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const methodMatch = matchNameCol(line, methodRe);
    if (methodMatch) {
      pushSymbol(out, relPath, methodMatch.symbol, 'method', i + 1);
      continue;
    }
    const fnMatch = matchNameCol(line, fnRe);
    if (fnMatch) {
      pushSymbol(out, relPath, fnMatch.symbol, 'function', i + 1);
    }
  }
}

function extractRust(lines: string[], relPath: string, out: ExtractedSymbol[]): void {
  const fnRe = /^(pub\s+)?(async\s+)?fn\s+(\w+)\s*\(/;
  for (let i = 0; i < lines.length; i++) {
    const fnMatch = matchNameCol(lines[i]!, fnRe);
    if (fnMatch) {
      pushSymbol(out, relPath, fnMatch.symbol, 'function', i + 1);
    }
  }
}

function extractPhp(lines: string[], relPath: string, out: ExtractedSymbol[]): void {
  const fnRe = /^\s*(?:public|private|protected)?\s*function\s+(\w+)\s*\(/;
  for (let i = 0; i < lines.length; i++) {
    const m = matchNameCol(lines[i]!, fnRe);
    if (!m) continue;
    const kind: CodeSymbolKind = /^\s+/.test(lines[i]!) ? 'method' : 'function';
    pushSymbol(out, relPath, m.symbol, kind, i + 1);
  }
}

function extractByExtension(ext: string, lines: string[], relPath: string): ExtractedSymbol[] {
  const out: ExtractedSymbol[] = [];
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    extractTsJs(lines, relPath, out);
  } else if (ext === '.py') {
    extractPython(lines, relPath, out);
  } else if (ext === '.go') {
    extractGo(lines, relPath, out);
  } else if (ext === '.rs') {
    extractRust(lines, relPath, out);
  } else if (ext === '.php') {
    extractPhp(lines, relPath, out);
  }
  return out;
}

/** Lê arquivo do disco; retorna [] se extensão não suportada ou isTestFile. */
export function extractSymbolsFromFile(absPath: string, projectRoot: string): ExtractedSymbol[] {
  const ext = path.extname(absPath);
  if (!SUPPORTED_EXTENSIONS.has(ext)) return [];
  if (isTestFile(absPath)) return [];

  const relPath = path.relative(projectRoot, absPath).replace(/\\/g, '/');
  let content: string;
  try {
    content = fs.readFileSync(absPath, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.split(/\r?\n/);
  return sortSymbols(extractByExtension(ext, lines, relPath));
}

/** Batch incremental — só paths listados. */
export function extractSymbolsFromPaths(
  paths: readonly string[],
  projectRoot: string,
): ExtractedSymbol[] {
  const seen = new Set<string>();
  const out: ExtractedSymbol[] = [];
  for (const p of paths) {
    const abs = path.isAbsolute(p) ? p : path.resolve(projectRoot, p);
    for (const sym of extractSymbolsFromFile(abs, projectRoot)) {
      if (seen.has(sym.qualifiedName)) continue;
      seen.add(sym.qualifiedName);
      out.push(sym);
    }
  }
  return sortSymbols(out);
}
