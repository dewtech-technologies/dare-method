// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { mcp_python } from '../scaffold.js';
import { DARE_DNA } from '../../types.js';

let tmpRoot: string;
let appDir: string;
let result: Awaited<ReturnType<typeof mcp_python.generate>>;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mcppy-scaffold-'));
  appDir = path.join(tmpRoot, 'my-mcp');
  await fs.ensureDir(appDir);
  result = await mcp_python.generate({
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

describe('mcp-python scaffold', () => {
  describe('metadata', () => {
    it('id is mcp-python, category mcp, stable', () => {
      expect(mcp_python.id).toBe('mcp-python');
      expect(mcp_python.category).toBe('mcp');
      expect(mcp_python.status).toBe('stable');
    });
  });

  describe('filesWritten', () => {
    it('emits ≥ 15 files', () => {
      expect(result.filesWritten.length).toBeGreaterThanOrEqual(15);
    });

    it.each([
      'pyproject.toml',
      '.env.example',
      'llms.txt',
      'openapi.json',
      'README.md',
      'src/__init__.py',
      'src/server.py',
      'src/cli.py',
      'src/tools/echo.py',
      'src/prompts/summarize.py',
      'src/transports/stdio.py',
      'src/transports/sse.py',
      'src/transports/http.py',
      'tests/test_echo.py',
      '.dare/skills.yml',
      '.github/workflows/dare-ci.yml',
    ])('writes anchor %s', (anchor) => {
      expect(result.filesWritten).toContain(anchor);
    });
  });

  describe('pyproject.toml', () => {
    let content: string;
    beforeAll(async () => {
      content = await fs.readFile(path.join(appDir, 'pyproject.toml'), 'utf8');
    });

    it('uses projectName', () => {
      expect(content).toContain('name = "my-mcp"');
    });

    it('declares mcp[cli] SDK', () => {
      expect(content).toContain('mcp[cli]');
    });

    it('declares dev deps: pytest + ruff + pip-audit', () => {
      expect(content).toContain('pytest');
      expect(content).toContain('ruff');
      expect(content).toContain('pip-audit');
    });

    it('Python target >= 3.11', () => {
      expect(content).toMatch(/requires-python\s*=\s*">=3\.11"/);
    });

    it('registers entry-point script for the module', () => {
      // projectName 'my-mcp' → module 'my_mcp'
      expect(content).toContain('my_mcp = "src.cli:main"');
    });
  });

  describe('server.py uses FastMCP', () => {
    let server: string;
    beforeAll(async () => {
      server = await fs.readFile(path.join(appDir, 'src/server.py'), 'utf8');
    });

    it('imports FastMCP', () => {
      expect(server).toContain('from mcp.server.fastmcp import FastMCP');
    });

    it('instantiates FastMCP with projectName', () => {
      expect(server).toContain('FastMCP("my-mcp")');
    });

    it('decorates @mcp.tool() for echo', () => {
      expect(server).toContain('@mcp.tool()');
      expect(server).toContain('async def echo');
    });

    it('decorates @mcp.prompt() for summarize', () => {
      expect(server).toContain('@mcp.prompt()');
      expect(server).toContain('def summarize');
    });
  });

  describe('cli.py — transport dispatch', () => {
    let cli: string;
    beforeAll(async () => {
      cli = await fs.readFile(path.join(appDir, 'src/cli.py'), 'utf8');
    });

    it('default transport is stdio (from opts.mcp.transport)', () => {
      expect(cli).toMatch(/['"]stdio['"]/);
    });

    it('argparse with choices=stdio,sse,http', () => {
      expect(cli).toContain('argparse');
      expect(cli).toContain('"stdio"');
      expect(cli).toContain('"sse"');
      expect(cli).toContain('"http"');
    });

    it('reads MCP_TRANSPORT env override', () => {
      expect(cli).toContain('MCP_TRANSPORT');
    });

    it('supports --json --list-tools (M-03)', () => {
      expect(cli).toContain('--list-tools');
      expect(cli).toContain('--json');
      expect(cli).toContain('list_tools_json');
    });

    it('dispatches to stdio/sse/http modules', () => {
      expect(cli).toContain('stdio_transport.run');
      expect(cli).toContain('sse_transport.run');
      expect(cli).toContain('http_transport.run');
    });
  });

  describe('Tools / prompts as plain modules (testable)', () => {
    it('tools/echo.py exposes async echo() with ValueError on bad input', async () => {
      const echo = await fs.readFile(path.join(appDir, 'src/tools/echo.py'), 'utf8');
      expect(echo).toContain('async def echo');
      expect(echo).toContain('ValueError');
    });

    it('prompts/summarize.py exposes summarize()', async () => {
      const s = await fs.readFile(path.join(appDir, 'src/prompts/summarize.py'), 'utf8');
      expect(s).toContain('def summarize');
      expect(s).toContain('Summarize');
    });
  });

  describe('Transports — 3 wrappers around mcp.run()', () => {
    it('stdio.py runs transport="stdio"', async () => {
      const t = await fs.readFile(path.join(appDir, 'src/transports/stdio.py'), 'utf8');
      expect(t).toContain('transport="stdio"');
    });

    it('sse.py runs transport="sse" with host+port', async () => {
      const t = await fs.readFile(path.join(appDir, 'src/transports/sse.py'), 'utf8');
      expect(t).toContain('transport="sse"');
      expect(t).toContain('host');
      expect(t).toContain('port');
    });

    it('http.py runs transport="streamable-http"', async () => {
      const t = await fs.readFile(path.join(appDir, 'src/transports/http.py'), 'utf8');
      expect(t).toContain('streamable-http');
    });
  });

  describe('tests/test_echo.py', () => {
    it('covers happy path + empty + None + summarize', async () => {
      const t = await fs.readFile(path.join(appDir, 'tests/test_echo.py'), 'utf8');
      expect(t).toContain('test_echo_returns_input');
      expect(t).toContain('test_echo_rejects_empty');
      expect(t).toContain('test_echo_rejects_non_string');
      expect(t).toContain('test_summarize_includes_input_text');
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

    it('dare-ci.yml has audit/lint/test with pip-audit + ruff + pytest', async () => {
      const ci = await fs.readFile(
        path.join(appDir, '.github/workflows/dare-ci.yml'),
        'utf8',
      );
      expect(ci).toMatch(/^\s*audit:/m);
      expect(ci).toMatch(/^\s*lint:/m);
      expect(ci).toMatch(/^\s*test:/m);
      expect(ci).toContain('pip-audit');
      expect(ci).toContain('ruff check');
      expect(ci).toContain('pytest');
    });
  });

  describe('Variant: --transport http default', () => {
    it('cli.py picks http default when scaffolded with transport=http', async () => {
      const tmp2 = await fs.mkdtemp(path.join(os.tmpdir(), 'mcppy-http-'));
      const dir = path.join(tmp2, 'http-mcp');
      await fs.ensureDir(dir);
      await mcp_python.generate({
        dir,
        projectName: 'http-mcp',
        toolchain: 'auto',
        features: new Set(DARE_DNA),
        isMonorepo: false,
        mcp: { transport: 'http' },
      });
      const cli = await fs.readFile(path.join(dir, 'src/cli.py'), 'utf8');
      expect(cli).toMatch(/['"]http['"]/);
      await fs.remove(tmp2);
    });
  });

  describe('postInstallSteps', () => {
    it('includes venv + pip install + python -m src.cli', () => {
      const j = result.postInstallSteps.join('\n');
      expect(j).toContain('cd my-mcp');
      expect(j).toContain('python -m venv');
      expect(j).toContain('pip install -e ".[dev]"');
      expect(j).toContain('python -m src.cli');
    });
  });
});
