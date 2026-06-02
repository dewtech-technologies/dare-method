// SPDX-License-Identifier: MIT
/**
 * T-041 — mcp-python scaffolder.
 *
 * Produces an MCP server in Python 3.11+ using the official `mcp[cli]` SDK
 * (FastMCP high-level API). Three transports ship together:
 *   - stdio  (default)
 *   - sse    (SSE-over-HTTP via uvicorn)
 *   - http   (Streamable HTTP via uvicorn)
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
  'mcp-python',
);

const TEMPLATE_FILES: ReadonlyArray<{ template: string; dest: string }> = [
  { template: 'pyproject.toml.j2', dest: 'pyproject.toml' },
  { template: '.gitignore', dest: '.gitignore' },
  { template: '.env.example', dest: '.env.example' },
  { template: 'README.md.j2', dest: 'README.md' },
  { template: 'llms.txt.j2', dest: 'llms.txt' },
  { template: 'openapi.json.j2', dest: 'openapi.json' },
  { template: 'src/__init__.py', dest: 'src/__init__.py' },
  { template: 'src/server.py.j2', dest: 'src/server.py' },
  { template: 'src/cli.py.j2', dest: 'src/cli.py' },
  { template: 'src/tools/__init__.py', dest: 'src/tools/__init__.py' },
  { template: 'src/tools/echo.py', dest: 'src/tools/echo.py' },
  { template: 'src/prompts/__init__.py', dest: 'src/prompts/__init__.py' },
  { template: 'src/prompts/summarize.py', dest: 'src/prompts/summarize.py' },
  { template: 'src/transports/__init__.py', dest: 'src/transports/__init__.py' },
  { template: 'src/transports/stdio.py', dest: 'src/transports/stdio.py' },
  { template: 'src/transports/sse.py', dest: 'src/transports/sse.py' },
  { template: 'src/transports/http.py', dest: 'src/transports/http.py' },
  { template: 'tests/__init__.py', dest: 'tests/__init__.py' },
  { template: 'tests/test_echo.py', dest: 'tests/test_echo.py' },
  { template: '.dare/skills.yml', dest: '.dare/skills.yml' },
  { template: '.github/workflows/dare-ci.yml', dest: '.github/workflows/dare-ci.yml' },
];

export const mcp_python: StackScaffold = {
  id: 'mcp-python',
  label: '🐍 MCP / Python',
  category: 'mcp',
  status: 'stable',

  async generate(opts: ScaffoldOpts): Promise<ScaffoldResult> {
    const transport = opts.mcp?.transport ?? 'stdio';
    const vars = {
      projectName: opts.projectName,
      projectModule: opts.projectName.replace(/-/g, '_'),
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
      stackId: 'mcp-python',
      artifact: 'env-example',
      targetPath: '.env.example',
      content: envContent,
    });

    return {
      filesWritten: [...filesWritten].sort(),
      postInstallSteps: [
        `cd ${opts.projectName}`,
        'cp .env.example .env',
        'python -m venv .venv',
        'source .venv/bin/activate    # or .venv\\Scripts\\activate on Windows',
        'pip install -e ".[dev]"',
        `python -m src.cli           # uses ${transport} transport (default)`,
        'npx @modelcontextprotocol/inspector python -m src.cli   # round-trip via Inspector',
      ],
      warnings: [],
      dnaEmitted,
    };
  },
};
