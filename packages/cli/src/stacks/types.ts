// SPDX-License-Identifier: MIT
/**
 * Core contract for stack scaffolders (v3.1).
 *
 * Every scaffolder in `packages/cli/src/stacks/<id>/scaffold.ts` implements
 * `StackScaffold`. Each one is registered (lazy) in `./registry.ts`.
 */

// ─── Stack identifiers ─────────────────────────────────────────────────────

export type BackendStackId =
  | 'ruby-rails-8'
  | 'node-nestjs'
  | 'python-fastapi'
  | 'php-laravel'
  | 'rust-axum'
  | 'go-gin'
  | 'go-stdlib';

export type McpStackId =
  | 'mcp-node-ts'
  | 'mcp-python'
  | 'mcp-rust'
  | 'mcp-go';

export type StackId = BackendStackId | McpStackId;

export type StackCategory = 'backend' | 'mcp';

// ─── Runtime options ───────────────────────────────────────────────────────

export type ToolchainMode = 'native' | 'docker' | 'auto';

export type McpTransport = 'stdio' | 'sse' | 'http';

// ─── DARE DNA — 7 invariant artifacts ──────────────────────────────────────
//
// Every stack MUST emit all 7 artifacts. Test `dna.spec.ts` gates this.

export type DareDnaArtifact =
  | 'llms-txt'
  | 'openapi'
  | 'cli-json-flag'
  | 'env-example'
  | 'rate-limit'
  | 'skills-yml'
  | 'github-ci';

export const DARE_DNA: readonly DareDnaArtifact[] = [
  'llms-txt',
  'openapi',
  'cli-json-flag',
  'env-example',
  'rate-limit',
  'skills-yml',
  'github-ci',
] as const;

// Compile-time exhaustiveness check — if DareDnaArtifact grows, this fails to
// compile until DARE_DNA is updated.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _DARE_DNA_EXHAUSTIVE_CHECK: Record<DareDnaArtifact, true> = {
  'llms-txt': true,
  openapi: true,
  'cli-json-flag': true,
  'env-example': true,
  'rate-limit': true,
  'skills-yml': true,
  'github-ci': true,
};

// ─── Options passed to every scaffolder ────────────────────────────────────

export interface LlmProvider {
  /** Free-form id validated by enum upstream. E.g. 'openai', 'anthropic', 'dummy'. */
  readonly id: string;
  readonly defaultModel: string;
}

export interface ScaffoldOpts {
  /** Already-created, empty target directory. */
  readonly dir: string;
  /** kebab-case slug, validated upstream. */
  readonly projectName: string;
  readonly toolchain: ToolchainMode;
  /** Subset of DARE_DNA. Default = all 7 (DNA is mandatory). */
  readonly features: ReadonlySet<DareDnaArtifact>;
  /** Optional. When absent, scaffolder does NOT wire any LLM stack. */
  readonly llm?: { providers: ReadonlyArray<LlmProvider> };
  /** Backend-only realtime config. Defaults to 'ws' when realtime is on. */
  readonly realtime?: { transport: 'ws' | 'sse' };
  /** Required when stack.category === 'mcp'. Default 'stdio' upstream. */
  readonly mcp?: { transport: McpTransport };
  /** True when init detected a pre-existing monorepo (Cargo workspace etc.). */
  readonly isMonorepo: boolean;
  /**
   * True when the project structure is 'mvc' — the stack should scaffold a
   * full server-rendered MVC app (views + asset pipeline) instead of API-only.
   * Honored by stacks that support both shapes (e.g. ruby-rails-8). Stacks that
   * are inherently full-stack (php-laravel) or API-only ignore it. Default false.
   */
  readonly fullstack?: boolean;
}

export interface ScaffoldResult {
  /** Paths relative to opts.dir. Order = write order. */
  readonly filesWritten: ReadonlyArray<string>;
  /** Shell-quoted commands the user should run next. */
  readonly postInstallSteps: ReadonlyArray<string>;
  /** Non-fatal warnings — go to stderr. */
  readonly warnings: ReadonlyArray<string>;
  /** Which of the 7 DNA artifacts were emitted. Used by dna.spec.ts. */
  readonly dnaEmitted: ReadonlySet<DareDnaArtifact>;
}

// ─── Contract every scaffolder implements ──────────────────────────────────

export interface StackScaffold {
  readonly id: StackId;
  /** Human-readable label shown in the prompt (may include emoji). */
  readonly label: string;
  readonly category: StackCategory;
  readonly status: 'stable' | 'beta';

  generate(opts: ScaffoldOpts): Promise<ScaffoldResult>;
}

// ─── Registry entry (lazy import) ──────────────────────────────────────────

export interface StackRegistryEntry {
  readonly id: StackId;
  readonly label: string;
  readonly category: StackCategory;
  readonly status: 'stable' | 'beta';
  /** Lazy import. Resolves when the user picks the stack. */
  readonly load: () => Promise<StackScaffold>;
}
