// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { mcp_node_ts } from '../scaffold.js';
import { DARE_DNA } from '../../types.js';

let tmpRoot: string;
let appDir: string;
let result: Awaited<ReturnType<typeof mcp_node_ts.generate>>;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpnode-scaffold-'));
  appDir = path.join(tmpRoot, 'my-mcp');
  await fs.ensureDir(appDir);
  result = await mcp_node_ts.generate({
    dir: appDir,
    projectName: 'my-mcp',
    toolchain: 'auto',
    features: new Set(DARE_DNA),
    isMonorepo: false,
    mcp: { transport: 'stdio' },
  });
});

afterAll(async () => {
  if (tmpRoot) await fs.remove(tmpRoot);
});

describe('mcp-node-ts scaffold', () => {
  describe('metadata', () => {
    it('id is mcp-node-ts, category mcp, stable', () => {
      expect(mcp_node_ts.id).toBe('mcp-node-ts');
      expect(mcp_node_ts.category).toBe('mcp');
      expect(mcp_node_ts.status).toBe('stable');
    });
  });

  describe('filesWritten', () => {
    it('emits ≥ 15 files', () => {
      expect(result.filesWritten.length).toBeGreaterThanOrEqual(15);
    });

    it.each([
      'package.json',
      'tsconfig.json',
      '.env.example',
      'llms.txt',
      'openapi.json',
      'README.md',
      'src/server.ts',
      'src/cli.ts',
      'src/tools/index.ts',
      'src/tools/echo.ts',
      'src/prompts/index.ts',
      'src/transports/stdio.ts',
      'src/transports/sse.ts',
      'src/transports/http.ts',
      'tests/echo.test.ts',
      '.dare/skills.yml',
      '.github/workflows/dare-ci.yml',
    ])('writes anchor %s', (anchor) => {
      expect(result.filesWritten).toContain(anchor);
    });
  });

  describe('package.json', () => {
    let pkg: Record<string, unknown>;
    beforeAll(async () => {
      pkg = await fs.readJSON(path.join(appDir, 'package.json'));
    });

    it('uses projectName as name', () => {
      expect(pkg.name).toBe('my-mcp');
    });

    it('type=module + has bin pointing to dist/cli.js', () => {
      expect(pkg.type).toBe('module');
      const bin = pkg.bin as Record<string, string>;
      expect(bin['my-mcp']).toBe('dist/cli.js');
    });

    it('declares @modelcontextprotocol/sdk + zod + express', () => {
      const deps = pkg.dependencies as Record<string, string>;
      expect(deps['@modelcontextprotocol/sdk']).toBeDefined();
      expect(deps.zod).toBeDefined();
      expect(deps.express).toBeDefined();
    });

    it('has inspect script via @modelcontextprotocol/inspector', () => {
      const scripts = pkg.scripts as Record<string, string>;
      expect(scripts.inspect).toContain('@modelcontextprotocol/inspector');
    });

    it('audit script targets HIGH', () => {
      const scripts = pkg.scripts as Record<string, string>;
      expect(scripts.audit).toContain('--audit-level=high');
    });
  });

  describe('server.ts wires the SDK', () => {
    let server: string;
    beforeAll(async () => {
      server = await fs.readFile(path.join(appDir, 'src/server.ts'), 'utf8');
    });

    it('imports Server + Request schemas from SDK', () => {
      expect(server).toContain("'@modelcontextprotocol/sdk/server/index.js'");
      expect(server).toContain('ListToolsRequestSchema');
      expect(server).toContain('CallToolRequestSchema');
      expect(server).toContain('ListPromptsRequestSchema');
      expect(server).toContain('GetPromptRequestSchema');
    });

    it('uses projectName as server name', () => {
      expect(server).toContain("name: 'my-mcp'");
    });

    it('declares capabilities: tools + prompts', () => {
      expect(server).toContain('tools: {}');
      expect(server).toContain('prompts: {}');
    });
  });

  describe('cli.ts — transport dispatch', () => {
    let cli: string;
    beforeAll(async () => {
      cli = await fs.readFile(path.join(appDir, 'src/cli.ts'), 'utf8');
    });

    it('default transport is the requested one (stdio)', () => {
      expect(cli).toMatch(/['"]stdio['"]/);
    });

    it('parses --transport with stdio | sse | http', () => {
      expect(cli).toContain("=== 'stdio'");
      expect(cli).toContain("=== 'sse'");
      expect(cli).toContain("=== 'http'");
    });

    it('supports --json --list-tools (M-03)', () => {
      expect(cli).toContain('--list-tools');
      expect(cli).toContain('--json');
    });

    it('reads MCP_TRANSPORT env override', () => {
      expect(cli).toContain('MCP_TRANSPORT');
    });
  });

  describe('tools / prompts registries', () => {
    it('echo tool has zod schema + Tool descriptor', async () => {
      const echo = await fs.readFile(path.join(appDir, 'src/tools/echo.ts'), 'utf8');
      expect(echo).toContain('z.object');
      expect(echo).toContain('echoTool');
      expect(echo).toContain('inputSchema');
    });

    it('TOOLS registry exports echoTool', async () => {
      const idx = await fs.readFile(path.join(appDir, 'src/tools/index.ts'), 'utf8');
      expect(idx).toContain('echoTool');
      expect(idx).toContain('callTool');
    });

    it('summarize prompt in PROMPTS', async () => {
      const idx = await fs.readFile(path.join(appDir, 'src/prompts/index.ts'), 'utf8');
      expect(idx).toContain('summarize');
    });
  });

  describe('Transports — 3 files for 3 transports', () => {
    it('stdio uses StdioServerTransport', async () => {
      const t = await fs.readFile(path.join(appDir, 'src/transports/stdio.ts'), 'utf8');
      expect(t).toContain('StdioServerTransport');
    });

    it('sse uses SSEServerTransport + express', async () => {
      const t = await fs.readFile(path.join(appDir, 'src/transports/sse.ts'), 'utf8');
      expect(t).toContain('SSEServerTransport');
      expect(t).toContain('express');
    });

    it('http uses StreamableHTTPServerTransport', async () => {
      const t = await fs.readFile(path.join(appDir, 'src/transports/http.ts'), 'utf8');
      expect(t).toContain('StreamableHTTPServerTransport');
    });

    it('sse + http apply RATE_LIMIT_RPM when set', async () => {
      const sse = await fs.readFile(path.join(appDir, 'src/transports/sse.ts'), 'utf8');
      const http = await fs.readFile(path.join(appDir, 'src/transports/http.ts'), 'utf8');
      expect(sse).toContain('RATE_LIMIT_RPM');
      expect(http).toContain('RATE_LIMIT_RPM');
    });
  });

  describe('tests/echo.test.ts is non-trivial', () => {
    it('exercises runEcho + callTool + PROMPTS round-trip', async () => {
      const t = await fs.readFile(path.join(appDir, 'tests/echo.test.ts'), 'utf8');
      expect(t).toContain('runEcho');
      expect(t).toContain('callTool');
      expect(t).toContain('summarize');
      expect(t).toContain("expect(out).toBe('hello')");
    });
  });

  describe('DNA emission', () => {
    it('reports all 7 DNA artifacts', () => {
      expect([...result.dnaEmitted].sort()).toEqual([...DARE_DNA].sort());
    });

    it('llms.txt is substantive', async () => {
      const llms = await fs.readFile(path.join(appDir, 'llms.txt'), 'utf8');
      expect(llms.length).toBeGreaterThan(400);
      expect(llms).toMatch(/^#\s+my-mcp/m);
    });

    it('.env.example passes secret scan', async () => {
      const env = await fs.readFile(path.join(appDir, '.env.example'), 'utf8');
      for (const line of env.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const v = t.split('=', 2)[1] ?? '';
        expect(v).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
        expect(v).not.toMatch(/[a-f0-9]{32,}/);
      }
    });

    it('dare-ci.yml has audit/lint/test jobs with pnpm audit --audit-level=high', async () => {
      const ci = await fs.readFile(
        path.join(appDir, '.github/workflows/dare-ci.yml'),
        'utf8',
      );
      expect(ci).toMatch(/^\s*audit:/m);
      expect(ci).toMatch(/^\s*lint:/m);
      expect(ci).toMatch(/^\s*test:/m);
      expect(ci).toContain('--audit-level=high');
    });
  });

  describe('Variant: --transport sse default', () => {
    it('cli.ts picks sse default when scaffolded with transport=sse', async () => {
      const tmp2 = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpnode-sse-'));
      const dir = path.join(tmp2, 'sse-mcp');
      await fs.ensureDir(dir);
      await mcp_node_ts.generate({
        dir,
        projectName: 'sse-mcp',
        toolchain: 'auto',
        features: new Set(DARE_DNA),
        isMonorepo: false,
        mcp: { transport: 'sse' },
      });
      const cli = await fs.readFile(path.join(dir, 'src/cli.ts'), 'utf8');
      // The default literal in parseArgs() should be the chosen transport
      expect(cli).toMatch(/['"]sse['"]/);
      await fs.remove(tmp2);
    });
  });

  describe('postInstallSteps', () => {
    it('includes pnpm install + build + start + inspect', () => {
      const j = result.postInstallSteps.join('\n');
      expect(j).toContain('cd my-mcp');
      expect(j).toContain('pnpm install');
      expect(j).toContain('pnpm build');
      expect(j).toContain('pnpm start');
      expect(j).toContain('pnpm inspect');
    });
  });
});
