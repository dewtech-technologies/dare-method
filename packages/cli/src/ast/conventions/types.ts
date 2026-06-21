import type { ModuleInfo } from '../../utils/module-detector.js';
import type { DnaFacts } from '../../utils/dna-detector.js';
import type { DiscoveredPattern } from '../../utils/pattern-detector.js';

export interface ConventionExtractOptions {
  readonly root: string;
  readonly files: readonly string[];
  readonly modules: readonly ModuleInfo[];
  readonly maxFileBytes?: number;
}

export interface DnaAstSlice {
  readonly extraLayers: readonly string[];
  readonly libraryHints: Partial<DnaFacts['libraries']>;
  readonly diPatterns: readonly string[];
}

export interface PatternsAstSlice {
  readonly patterns: readonly DiscoveredPattern[];
}

export interface ConventionExtractionMeta {
  readonly mode: 'regex' | 'hybrid';
  readonly astEnabled: boolean;
  readonly astAvailable: boolean;
  readonly astPatternCount: number;
  readonly regexPatternCount: number;
}

export interface DnaAstExtractResult {
  readonly slice: DnaAstSlice;
  readonly astAvailable: boolean;
}

export interface PatternsAstExtractResult {
  readonly slice: PatternsAstSlice;
  readonly astAvailable: boolean;
}
