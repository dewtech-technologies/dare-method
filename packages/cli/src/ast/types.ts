export type AstLanguageId =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'php'
  | 'go'
  | 'ruby'
  | 'rust';

export interface AstLoaderStatus {
  readonly available: boolean;
  readonly reason?: string;
  readonly loadedLanguages: ReadonlyArray<AstLanguageId>;
}

export interface AstExtractOptions {
  readonly root: string;
  readonly languages?: ReadonlyArray<AstLanguageId>;
  readonly maxFileBytes?: number;
}

export interface ExtractionMeta {
  readonly mode: 'regex' | 'hybrid';
  readonly astEnabled: boolean;
  readonly astLanguages: ReadonlyArray<AstLanguageId>;
  readonly astAvailable: boolean;
  readonly regexFallback: boolean;
  readonly astEndpoints: number;
  readonly regexEndpoints: number;
  readonly astEntities: number;
  readonly regexEntities: number;
}

export interface AstExtractResult {
  readonly model: import('../utils/datamodel.js').DataModel;
  readonly meta: Pick<
    ExtractionMeta,
    'astEndpoints' | 'astEntities' | 'astLanguages' | 'astAvailable'
  >;
}
