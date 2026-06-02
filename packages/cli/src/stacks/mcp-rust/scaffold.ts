// SPDX-License-Identifier: MIT
/**
 * T-042 — mcp-rust scaffolder.
 *
 * Produces an MCP server in Rust using the official `rmcp` SDK
 * (https://github.com/modelcontextprotocol/rust-sdk). Three transports:
 *   - stdio  (default)
 *   - sse    (SSE-over-HTTP via axum)
 *   - http   (Streamable HTTP via axum)
 *
 * Transport is picked at runtime by `--transport` (clap) or MCP_TRANSPORT env.
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
  'mcp-rust',
);

const TEMPLATE_FILES: ReadonlyArray<{ template: string; dest: string }> = [
  { template: 'Cargo.toml.tera', dest: 'Cargo.toml' },
  { template: 'gitignore', dest: '.gitignore' },
  { template: '.env.example', dest: '.env.example' },
  { template: 'README.md.tera', dest: 'README.md' },
  { template: 'llms.txt.tera', dest: 'llms.txt' },
  { template: 'openapi.json.tera', dest: 'openapi.json' },
  { template: 'src/main.rs.tera', dest: 'src/main.rs' },
  { template: 'src/lib.rs', dest: 'src/lib.rs' },
  { template: 'src/server.rs.tera', dest: 'src/server.rs' },
  { template: 'src/cli.rs.tera', dest: 'src/cli.rs' },
  { template: 'src/tools/mod.rs', dest: 'src/tools/mod.rs' },
  { template: 'src/tools/echo.rs', dest: 'src/tools/echo.rs' },
  { template: 'src/prompts/mod.rs', dest: 'src/prompts/mod.rs' },
  { template: 'src/prompts/summarize.rs', dest: 'src/prompts/summarize.rs' },
  { template: 'src/transports/mod.rs', dest: 'src/transports/mod.rs' },
  { template: 'src/transports/stdio.rs', dest: 'src/transports/stdio.rs' },
  { template: 'src/transports/sse.rs', dest: 'src/transports/sse.rs' },
  { template: 'src/transports/http.rs', dest: 'src/transports/http.rs' },
  { template: 'tests/echo_test.rs.tera', dest: 'tests/echo_test.rs' },
  { template: '.dare/skills.yml', dest: '.dare/skills.yml' },
  { template: '.github/workflows/dare-ci.yml', dest: '.github/workflows/dare-ci.yml' },
];

export const mcp_rust: StackScaffold = {
  id: 'mcp-rust',
  label: '🦀 MCP / Rust',
  category: 'mcp',
  status: 'beta',

  async generate(opts: ScaffoldOpts): Promise<ScaffoldResult> {
    const transport = opts.mcp?.transport ?? 'stdio';
    const vars = {
      projectName: opts.projectName,
      crateName: opts.projectName.replace(/-/g, '_'),
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
      stackId: 'mcp-rust',
      artifact: 'env-example',
      targetPath: '.env.example',
      content: envContent,
    });

    return {
      filesWritten: [...filesWritten].sort(),
      postInstallSteps: [
        `cd ${opts.projectName}`,
        'cp .env.example .env',
        'cargo build',
        `cargo run                    # uses ${transport} transport (default)`,
        'npx @modelcontextprotocol/inspector cargo run   # round-trip via Inspector',
      ],
      warnings: [
        'mcp-rust ships as beta: the rmcp SDK API is still stabilizing. Pin the rmcp version in Cargo.toml if upstream breaks.',
      ],
      dnaEmitted,
    };
  },
};
