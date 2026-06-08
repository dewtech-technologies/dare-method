import fs from 'fs-extra';
import path from 'node:path';
import { assertRelativeSafe } from '../../../utils/path-safety.js';
import type { CriticalModuleMarker, FormalGateConfig } from '../../types.js';

/** Tag de marcação no código-fonte (A-11). Aceita `@dare-formal` e `@dare-formal: <symbol>`. */
const FORMAL_TAG = /@dare-formal(?::\s*([A-Za-z_$][\w$]*))?/;

/** Captura o nome de função/método na linha (ou nas próximas) após a tag. */
const SYMBOL_NEAR =
  /\b(?:function|async function|class)\s+([A-Za-z_$][\w$]*)|\b([A-Za-z_$][\w$]*)\s*(?:=\s*(?:async\s*)?\(|\()/;

function markerKey(file: string, symbol?: string): string {
  return `${file}::${symbol ?? '*'}`;
}

function parseConfigModule(entry: string): { file: string; symbol?: string } {
  const sep = entry.indexOf('::');
  if (sep === -1) return { file: entry.trim() };
  return {
    file: entry.slice(0, sep).trim(),
    symbol: entry.slice(sep + 2).trim() || undefined,
  };
}

function extractSymbolNear(lines: string[], startIndex: number): string | undefined {
  for (let i = startIndex; i < Math.min(lines.length, startIndex + 4); i++) {
    const match = lines[i]?.match(SYMBOL_NEAR);
    if (match) return match[1] ?? match[2];
  }
  return undefined;
}

/**
 * Une marcação por tag (@dare-formal no changedFiles) e por config
 * (verification.formal.modules no formato "path::symbol"). Valida cada
 * file com assertRelativeSafe (RS-01). Deduplica por (file, symbol).
 *
 * Pura sobre (cwd, changedFiles, config). Sem LLM, sem rede. readFile READ-ONLY.
 * Pós: lista de alvos críticos; VAZIA ⇒ aspecto formal vira SKIP (O-03).
 */
export async function resolveFormalTargets(args: {
  readonly cwd: string;
  readonly changedFiles: ReadonlyArray<string>;
  readonly config: FormalGateConfig;
}): Promise<ReadonlyArray<CriticalModuleMarker>> {
  const seen = new Set<string>();
  const out: CriticalModuleMarker[] = [];

  const push = (marker: CriticalModuleMarker): void => {
    const key = markerKey(marker.file, marker.symbol);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(marker);
  };

  for (const entry of args.config.modules) {
    const { file, symbol } = parseConfigModule(entry);
    assertRelativeSafe(file);
    push({ file, symbol, source: 'config' });
  }

  for (const rel of args.changedFiles) {
    assertRelativeSafe(rel);
    const abs = path.resolve(args.cwd, rel);
    let content: string;
    try {
      content = await fs.readFile(abs, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const tagMatch = lines[i]?.match(FORMAL_TAG);
      if (!tagMatch) continue;
      const explicit = tagMatch[1];
      const symbol = explicit ?? extractSymbolNear(lines, i);
      push({ file: rel, symbol, source: 'tag' });
    }
  }

  return Object.freeze(out);
}
