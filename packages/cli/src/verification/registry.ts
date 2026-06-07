import type { MutationTool } from './types.js';
import type { MutationAdapter } from './gates/mutation/adapter.js';
import { UnknownMutationStackError } from './gates/mutation/adapter.js';

const STACK_TO_TOOL: Readonly<Record<string, MutationTool>> = {
  'node-nestjs': 'stryker',
  react: 'stryker',
  vue: 'stryker',
  'mcp-server-node-ts': 'stryker',
  'python-fastapi': 'mutmut',
  'mcp-server-python': 'mutmut',
  'rust-axum': 'cargo-mutants',
  'rust-leptos': 'cargo-mutants',
  'rust-leptos-csr': 'cargo-mutants',
  'php-laravel': 'infection',
};

const TOOL_LOADERS: Readonly<
  Record<MutationTool, () => Promise<MutationAdapter>>
> = {
  stryker: async () => (await import('./gates/mutation/stryker.js')).adapter,
  mutmut: async () => (await import('./gates/mutation/mutmut.js')).adapter,
  'cargo-mutants': async () =>
    (await import('./gates/mutation/cargo-mutants.js')).adapter,
  infection: async () => (await import('./gates/mutation/infection.js')).adapter,
};

const TOOL_ORDER: ReadonlyArray<MutationTool> = [
  'stryker',
  'mutmut',
  'cargo-mutants',
  'infection',
];

const adapterCache = new Map<MutationTool, MutationAdapter>();

async function loadAdapter(tool: MutationTool): Promise<MutationAdapter> {
  let cached = adapterCache.get(tool);
  if (cached) return cached;
  cached = await TOOL_LOADERS[tool]();
  adapterCache.set(tool, cached);
  return cached;
}

function toolForStack(stack: string): MutationTool | undefined {
  return STACK_TO_TOOL[stack];
}

/** Resolve mutation adapter for a project stack (lazy-loaded per tool). */
export async function adapterForStack(
  stack: string,
): Promise<MutationAdapter> {
  const tool = toolForStack(stack);
  if (!tool) throw new UnknownMutationStackError(stack);
  return loadAdapter(tool);
}

/** All registered mutation adapters (loads each tool at most once). */
export async function listMutationAdapters(): Promise<
  ReadonlyArray<MutationAdapter>
> {
  return Promise.all(TOOL_ORDER.map((tool) => loadAdapter(tool)));
}
