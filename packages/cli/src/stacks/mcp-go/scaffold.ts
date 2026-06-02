// SPDX-License-Identifier: MIT
/**
 * T-043 — mcp-go scaffolder.
 *
 * Produces an MCP server in Go using `github.com/mark3labs/mcp-go` (the
 * reference community SDK; swap to an official Anthropic Go SDK if/when one
 * ships). Three transports:
 *   - stdio  (default)
 *   - sse    (SSE-over-HTTP)
 *   - http   (Streamable HTTP)
 *
 * Transport is picked at runtime by `--transport` flag or MCP_TRANSPORT env.
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
  'mcp-go',
);

const TEMPLATE_FILES: ReadonlyArray<{ template: string; dest: string }> = [
  { template: 'go.mod.tpl', dest: 'go.mod' },
  { template: '.gitignore', dest: '.gitignore' },
  { template: '.env.example', dest: '.env.example' },
  { template: 'README.md.tpl', dest: 'README.md' },
  { template: 'llms.txt.tpl', dest: 'llms.txt' },
  { template: 'openapi.json.tpl', dest: 'openapi.json' },
  { template: 'cmd/server/main.go.tpl', dest: 'cmd/server/main.go' },
  { template: 'internal/server/server.go.tpl', dest: 'internal/server/server.go' },
  { template: 'internal/tools/echo.go', dest: 'internal/tools/echo.go' },
  { template: 'internal/prompts/summarize.go', dest: 'internal/prompts/summarize.go' },
  { template: 'internal/transports/stdio.go.tpl', dest: 'internal/transports/stdio.go' },
  { template: 'internal/transports/sse.go.tpl', dest: 'internal/transports/sse.go' },
  { template: 'internal/transports/http.go.tpl', dest: 'internal/transports/http.go' },
  { template: 'tests/echo_test.go.tpl', dest: 'tests/echo_test.go' },
  { template: '.dare/skills.yml', dest: '.dare/skills.yml' },
  { template: '.github/workflows/dare-ci.yml', dest: '.github/workflows/dare-ci.yml' },
];

export const mcp_go: StackScaffold = {
  id: 'mcp-go',
  label: '🐹 MCP / Go',
  category: 'mcp',
  status: 'beta',

  async generate(opts: ScaffoldOpts): Promise<ScaffoldResult> {
    const transport = opts.mcp?.transport ?? 'stdio';
    const vars = {
      projectName: opts.projectName,
      moduleName: opts.projectName,
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
      stackId: 'mcp-go',
      artifact: 'env-example',
      targetPath: '.env.example',
      content: envContent,
    });

    return {
      filesWritten: [...filesWritten].sort(),
      postInstallSteps: [
        `cd ${opts.projectName}`,
        'cp .env.example .env',
        'go mod tidy',
        `go run ./cmd/server          # uses ${transport} transport (default)`,
        'npx @modelcontextprotocol/inspector go run ./cmd/server   # round-trip via Inspector',
      ],
      warnings: [
        'mcp-go ships as beta: mark3labs/mcp-go is community-led. If Anthropic releases an official Go SDK, migrate internal/server + internal/transports to it.',
      ],
      dnaEmitted,
    };
  },
};
