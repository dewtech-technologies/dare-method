import type { DnaFacts } from '../../utils/dna-detector.js';
import type { ConventionExtractOptions, DnaAstExtractResult, DnaAstSlice } from './types.js';
import { scanConventionFiles } from './scan.js';
import { walkScannedFile } from './parse-file.js';

const DEFAULT_MAX_BYTES = 1_048_576;

function emptySlice(): DnaAstSlice {
  return { extraLayers: [], libraryHints: {}, diPatterns: [] };
}

function applyImportHints(text: string, hints: Partial<DnaFacts['libraries']>): void {
  if (/from\s+['"]typeorm['"]|require\s*\(\s*['"]typeorm['"]/.test(text)) hints.orm = 'TypeORM';
  if (/from\s+['"]@prisma\/client['"]/.test(text)) hints.orm = 'Prisma';
  if (/from\s+['"]@nestjs\/common['"]/.test(text)) hints.http = 'NestJS';
  if (/from\s+['"]zod['"]/.test(text)) hints.validation = 'Zod';
  if (/from\s+['"]class-validator['"]/.test(text)) hints.validation = 'class-validator';
}

/** AST walk for DNA conventions — layers, libraries, DI hints. */
export async function extractDnaWithAst(opts: ConventionExtractOptions): Promise<DnaAstExtractResult> {
  const maxBytes = opts.maxFileBytes ?? DEFAULT_MAX_BYTES;
  const scanned = await scanConventionFiles(opts.root, opts.files, maxBytes);
  if (scanned.length === 0) {
    return { slice: emptySlice(), astAvailable: false };
  }

  const extraLayers = new Set<string>();
  const diPatterns = new Set<string>();
  const libraryHints: Partial<DnaFacts['libraries']> = {};
  let parsedAny = false;

  for (const file of scanned) {
    const walked = await walkScannedFile(file, (node) => {
      const text = node.text;
      const type = node.type;

      if (
        type === 'import_statement' ||
        type === 'import_declaration' ||
        type === 'import_from_statement'
      ) {
        applyImportHints(text, libraryHints);
      }

      if (/@Module\s*\(/.test(text)) extraLayers.add('nestjs-module');
      if (/@Controller\s*\(/.test(text)) extraLayers.add('controller');
      if (/@Injectable\s*\(/.test(text)) extraLayers.add('service');

      if (
        type === 'method_definition' ||
        type === 'function_definition' ||
        type === 'constructor'
      ) {
        if (/constructor\s*\([\s\S]*:\s*\w+Service\b/.test(text)) {
          diPatterns.add('nestjs-constructor-injection');
        }
      }
    });
    if (walked) parsedAny = true;
  }

  return {
    slice: {
      extraLayers: [...extraLayers].sort(),
      libraryHints,
      diPatterns: [...diPatterns].sort(),
    },
    astAvailable: parsedAny,
  };
}
