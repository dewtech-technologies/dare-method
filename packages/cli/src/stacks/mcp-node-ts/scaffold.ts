// SPDX-License-Identifier: MIT
/**
 * T-040 — mcp-node-ts scaffolder.
 *
 * Produces an MCP (Model Context Protocol) server in TypeScript using the
 * official @modelcontextprotocol/sdk. Three transports ship together:
 *   - stdio  (default — what most local agents use)
 *   - sse    (SSE-over-HTTP, legacy MCP HTTP transport)
 *   - http   (modern Streamable HTTP transport)
 *
 * Transport is picked at runtime by `--transport` flag or MCP_TRANSPORT env.
 * The scaffolder pre-selects opts.mcp.transport in the generated cli.ts so
 * that `npm start` "just works" with the user's intended default.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import type {
  DareDnaArtifact,
  ScaffoldOpts,
  ScaffoldResult,
  StackScaffold,
} from '../types.js';
import { DARE_DNA } from '../types.js';
import { emit } from '../dna-emitter.js';
import { detectEngine, renderToFile } from '../template-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'templates',
  'stacks',
  'mcp-node-ts',
);

const TEMPLATE_FILES: ReadonlyArray<{ template: string; dest: string }> = [
  { template: 'package.json.hbs', dest: 'package.json' },
  { template: 'tsconfig.json', dest: 'tsconfig.json' },
  { template: 'gitignore', dest: '.gitignore' },
  { template: '.env.example', dest: '.env.example' },
  { template: 'README.md.hbs', dest: 'README.md' },
  { template: 'llms.txt.hbs', dest: 'llms.txt' },
  { template: 'openapi.json.hbs', dest: 'openapi.json' },
  { template: 'src/server.ts.hbs', dest: 'src/server.ts' },
  { template: 'src/cli.ts.hbs', dest: 'src/cli.ts' },
  { template: 'src/tools/index.ts', dest: 'src/tools/index.ts' },
  { template: 'src/tools/echo.ts', dest: 'src/tools/echo.ts' },
  { template: 'src/prompts/index.ts', dest: 'src/prompts/index.ts' },
  { template: 'src/transports/stdio.ts', dest: 'src/transports/stdio.ts' },
  { template: 'src/transports/sse.ts', dest: 'src/transports/sse.ts' },
  { template: 'src/transports/http.ts', dest: 'src/transports/http.ts' },
  { template: 'tests/echo.test.ts', dest: 'tests/echo.test.ts' },
  { template: '.dare/skills.yml', dest: '.dare/skills.yml' },
  { template: '.github/workflows/dare-ci.yml', dest: '.github/workflows/dare-ci.yml' },
];

export const mcp_node_ts: StackScaffold = {
  id: 'mcp-node-ts',
  label: '🟦 MCP / Node.js (TypeScript)',
  category: 'mcp',
  status: 'stable',

  async generate(opts: ScaffoldOpts): Promise<ScaffoldResult> {
    const transport = opts.mcp?.transport ?? 'stdio';
    const vars = {
      projectName: opts.projectName,
      defaultTransport: transport,
      llmProvider: opts.llm?.providers[0]?.id ?? 'dummy',
    };

    const filesWritten: string[] = [];

    for (const { template, dest } of TEMPLATE_FILES) {
      const templatePath = path.join(TEMPLATES_DIR, template);
      const engine = detectEngine(template);
      await renderToFile({
        templatePath,
        engine,
        vars,
        baseDir: opts.dir,
        destPath: dest,
      });
      filesWritten.push(dest);
    }

    const dnaEmitted: ReadonlySet<DareDnaArtifact> = new Set(DARE_DNA);

    const envPath = path.join(opts.dir, '.env.example');
    const envContent = await fs.readFile(envPath, 'utf8');
    await emit({
      dir: opts.dir,
      projectName: opts.projectName,
      stackId: 'mcp-node-ts',
      artifact: 'env-example',
      targetPath: '.env.example',
      content: envContent,
    });

    return {
      filesWritten: [...filesWritten].sort(),
      postInstallSteps: [
        `cd ${opts.projectName}`,
        'cp .env.example .env',
        'pnpm install',
        'pnpm build',
        `pnpm start                    # uses ${transport} transport (default from --transport)`,
        'pnpm inspect                  # MCP Inspector — verifies tools/prompts wire correctly',
      ],
      warnings: [],
      dnaEmitted,
    };
  },
};
