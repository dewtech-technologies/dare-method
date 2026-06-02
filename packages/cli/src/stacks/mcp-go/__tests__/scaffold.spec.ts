// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { mcp_go } from '../scaffold.js';
import { DARE_DNA } from '../../types.js';

let tmpRoot: string;
let appDir: string;
let result: Awaited<ReturnType<typeof mcp_go.generate>>;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpgo-scaffold-'));
  appDir = path.join(tmpRoot, 'my-mcp');
  await fs.ensureDir(appDir);
  result = await mcp_go.generate({
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

describe('mcp-go scaffold', () => {
  describe('metadata', () => {
    it('id is mcp-go, category mcp, status beta', () => {
      expect(mcp_go.id).toBe('mcp-go');
      expect(mcp_go.category).toBe('mcp');
      expect(mcp_go.status).toBe('beta');
    });
  });

  describe('filesWritten', () => {
    it('emits ≥ 14 files', () => {
      expect(result.filesWritten.length).toBeGreaterThanOrEqual(14);
    });

    it.each([
      'go.mod',
      '.env.example',
      'llms.txt',
      'openapi.json',
      'README.md',
      'cmd/server/main.go',
      'internal/server/server.go',
      'internal/tools/echo.go',
      'internal/prompts/summarize.go',
      'internal/transports/stdio.go',
      'internal/transports/sse.go',
      'internal/transports/http.go',
      'tests/echo_test.go',
      '.dare/skills.yml',
      '.github/workflows/dare-ci.yml',
    ])('writes anchor %s', (anchor) => {
      expect(result.filesWritten).toContain(anchor);
    });
  });

  describe('go.mod', () => {
    let mod: string;
    beforeAll(async () => {
      mod = await fs.readFile(path.join(appDir, 'go.mod'), 'utf8');
    });

    it('uses moduleName from projectName', () => {
      expect(mod).toMatch(/^module\s+my-mcp/m);
    });

    it('targets Go 1.22+', () => {
      expect(mod).toMatch(/^go 1\.2[2-9]/m);
    });

    it('declares mark3labs/mcp-go SDK', () => {
      expect(mod).toContain('github.com/mark3labs/mcp-go');
    });
  });

  describe('main.go — transport dispatch', () => {
    let main: string;
    beforeAll(async () => {
      main = await fs.readFile(path.join(appDir, 'cmd/server/main.go'), 'utf8');
    });

    it('flag-based transport with stdio default', () => {
      expect(main).toContain('flag.String("transport"');
      expect(main).toContain('"stdio"');
    });

    it('reads MCP_TRANSPORT env', () => {
      expect(main).toContain('MCP_TRANSPORT');
    });

    it('supports --json + --list-tools (M-03)', () => {
      expect(main).toContain('list-tools');
      expect(main).toContain('InventoryJSON');
    });

    it('dispatches to RunStdio/RunSSE/RunHTTP', () => {
      expect(main).toContain('transports.RunStdio');
      expect(main).toContain('transports.RunSSE');
      expect(main).toContain('transports.RunHTTP');
    });

    it('uses moduleName-prefixed imports', () => {
      expect(main).toContain('"my-mcp/internal/');
    });
  });

  describe('server.go uses mcp-go SDK', () => {
    let server: string;
    beforeAll(async () => {
      server = await fs.readFile(path.join(appDir, 'internal/server/server.go'), 'utf8');
    });

    it('imports mark3labs/mcp-go', () => {
      expect(server).toContain('github.com/mark3labs/mcp-go/mcp');
      expect(server).toContain('github.com/mark3labs/mcp-go/server');
    });

    it('registers echo tool + summarize prompt', () => {
      expect(server).toContain('mcp.NewTool("echo"');
      expect(server).toContain('mcp.NewPrompt("summarize"');
    });

    it('delegates to pure tools.Echo / prompts.Summarize', () => {
      expect(server).toContain('tools.Echo');
      expect(server).toContain('prompts.Summarize');
    });

    it('exposes InventoryJSON for M-03', () => {
      expect(server).toContain('func InventoryJSON');
    });
  });

  describe('pure tools / prompts', () => {
    it('tools/echo.go: Echo with ErrEmpty', async () => {
      const echo = await fs.readFile(path.join(appDir, 'internal/tools/echo.go'), 'utf8');
      expect(echo).toContain('func Echo');
      expect(echo).toContain('ErrEmpty');
    });

    it('prompts/summarize.go: Summarize', async () => {
      const s = await fs.readFile(
        path.join(appDir, 'internal/prompts/summarize.go'),
        'utf8',
      );
      expect(s).toContain('func Summarize');
    });
  });

  describe('Transports — 3 runners, aliased imports avoid server collision', () => {
    it('stdio.go uses ServeStdio + aliased srv import', async () => {
      const t = await fs.readFile(
        path.join(appDir, 'internal/transports/stdio.go'),
        'utf8',
      );
      expect(t).toContain('ServeStdio');
      expect(t).toContain('srv "my-mcp/internal/server"');
    });

    it('sse.go binds host:port', async () => {
      const t = await fs.readFile(path.join(appDir, 'internal/transports/sse.go'), 'utf8');
      expect(t).toContain('NewSSEServer');
      expect(t).toContain('host');
      expect(t).toContain('port');
    });

    it('http.go binds host:port', async () => {
      const t = await fs.readFile(path.join(appDir, 'internal/transports/http.go'), 'utf8');
      expect(t).toContain('StreamableHTTPServer');
    });
  });

  describe('tests/echo_test.go', () => {
    it('covers echo + summarize + inventory with moduleName imports', async () => {
      const t = await fs.readFile(path.join(appDir, 'tests/echo_test.go'), 'utf8');
      expect(t).toContain('"my-mcp/internal/tools"');
      expect(t).toContain('TestEchoReturnsInput');
      expect(t).toContain('TestEchoRejectsEmpty');
      expect(t).toContain('TestSummarizeIncludesInput');
      expect(t).toContain('TestInventoryListsEcho');
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

    it('dare-ci.yml has govulncheck + golangci-lint + go test', async () => {
      const ci = await fs.readFile(
        path.join(appDir, '.github/workflows/dare-ci.yml'),
        'utf8',
      );
      expect(ci).toMatch(/^\s*audit:/m);
      expect(ci).toMatch(/^\s*lint:/m);
      expect(ci).toMatch(/^\s*test:/m);
      expect(ci).toContain('govulncheck');
      expect(ci).toContain('golangci-lint');
      expect(ci).toContain('go test');
    });
  });

  describe('warnings', () => {
    it('flags beta status of mark3labs/mcp-go', () => {
      expect(result.warnings.some((w) => /beta/i.test(w))).toBe(true);
    });
  });

  describe('postInstallSteps', () => {
    it('includes go mod tidy + go run', () => {
      const j = result.postInstallSteps.join('\n');
      expect(j).toContain('cd my-mcp');
      expect(j).toContain('go mod tidy');
      expect(j).toContain('go run ./cmd/server');
    });
  });
});
