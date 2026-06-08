export type SteeringScope = 'project' | 'glob';

/** Front-matter do steering file (Zod-validado na loader). `.env*` nunca é elegível (RS-04). */
export interface SteeringFrontMatter {
  readonly scope: SteeringScope;
  readonly glob?: string;
  readonly priority?: number;
  readonly title?: string;
}

export interface SteeringFile {
  readonly path: string;
  readonly frontMatter: SteeringFrontMatter;
  readonly body: string;
  /** true só para o bloco derivado de DARE/PROJECT-DNA.md (base canônica, RF-08). */
  readonly isBase: boolean;
}

export interface SteeringResolution {
  readonly file: string;
  /** Blocos do menos para o mais específico (A-6); o consumidor concatena em ordem. */
  readonly blocks: readonly SteeringFile[];
  readonly resolvedAt: string;
}
