// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { mcp_rust } from '../scaffold.js';
import { DARE_DNA } from '../../types.js';

let tmpRoot: string;
let appDir: string;
let result: Awaited<ReturnType<typeof mcp_rust.generate>>;

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mcprust-scaffold-'));
  appDir = path.join(tmpRoot, 'my-mcp');
  await fs.ensureDir(appDir);
  result = await mcp_rust.generate({
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

describe('mcp-rust scaffold', () => {
  describe('metadata', () => {
    it('id is mcp-rust, category mcp, status beta', () => {
      expect(mcp_rust.id).toBe('mcp-rust');
      expect(mcp_rust.category).toBe('mcp');
      expect(mcp_rust.status).toBe('beta');
    });
  });

  describe('filesWritten', () => {
    it('emits ≥ 18 files', () => {
      expect(result.filesWritten.length).toBeGreaterThanOrEqual(18);
    });

    it.each([
      'Cargo.toml',
      '.env.example',
      'llms.txt',
      'openapi.json',
      'README.md',
      'src/main.rs',
      'src/lib.rs',
      'src/server.rs',
      'src/cli.rs',
      'src/tools/mod.rs',
      'src/tools/echo.rs',
      'src/prompts/mod.rs',
      'src/prompts/summarize.rs',
      'src/transports/mod.rs',
      'src/transports/stdio.rs',
      'src/transports/sse.rs',
      'src/transports/http.rs',
      'tests/echo_test.rs',
      '.dare/skills.yml',
      '.github/workflows/dare-ci.yml',
    ])('writes anchor %s', (anchor) => {
      expect(result.filesWritten).toContain(anchor);
    });
  });

  describe('Cargo.toml', () => {
    let toml: string;
    beforeAll(async () => {
      toml = await fs.readFile(path.join(appDir, 'Cargo.toml'), 'utf8');
    });

    it('uses crateName (underscored projectName)', () => {
      expect(toml).toContain('name = "my_mcp"');
    });

    it('declares rmcp SDK', () => {
      expect(toml).toContain('rmcp');
    });

    it('declares tokio + axum + clap', () => {
      expect(toml).toContain('tokio');
      expect(toml).toContain('axum');
      expect(toml).toContain('clap');
    });

    it('bin name matches crateName', () => {
      expect(toml).toContain('name = "my_mcp"');
      expect(toml).toContain('path = "src/main.rs"');
    });
  });

  describe('cli.rs — transport dispatch', () => {
    let cli: string;
    beforeAll(async () => {
      cli = await fs.readFile(path.join(appDir, 'src/cli.rs'), 'utf8');
    });

    it('clap Parser with Transport enum', () => {
      expect(cli).toContain('clap::{Parser, ValueEnum}');
      expect(cli).toContain('enum Transport');
    });

    it('default transport is stdio', () => {
      expect(cli).toContain('default_value = "stdio"');
    });

    it('reads MCP_TRANSPORT env', () => {
      expect(cli).toContain('env = "MCP_TRANSPORT"');
    });

    it('supports --json + --list-tools (M-03)', () => {
      expect(cli).toContain('list_tools');
      expect(cli).toContain('json');
    });
  });

  describe('main.rs wiring', () => {
    let main: string;
    beforeAll(async () => {
      main = await fs.readFile(path.join(appDir, 'src/main.rs'), 'utf8');
    });

    it('uses tokio::main', () => {
      expect(main).toContain('#[tokio::main]');
    });

    it('dispatches to stdio/sse/http transports', () => {
      expect(main).toContain('Transport::Stdio');
      expect(main).toContain('Transport::Sse');
      expect(main).toContain('Transport::Http');
    });

    it('short-circuits --json --list-tools', () => {
      expect(main).toContain('inventory_json');
    });

    it('imports from crateName lib', () => {
      expect(main).toContain('use my_mcp::');
    });
  });

  describe('tools / prompts as pure functions', () => {
    it('echo.rs is a pure fn with EchoError', async () => {
      const echo = await fs.readFile(path.join(appDir, 'src/tools/echo.rs'), 'utf8');
      expect(echo).toContain('pub fn echo');
      expect(echo).toContain('EchoError');
    });

    it('tools/mod.rs exposes inventory_json', async () => {
      const mod = await fs.readFile(path.join(appDir, 'src/tools/mod.rs'), 'utf8');
      expect(mod).toContain('pub fn inventory_json');
      expect(mod).toContain('"echo"');
    });

    it('summarize.rs is a pure fn', async () => {
      const s = await fs.readFile(path.join(appDir, 'src/prompts/summarize.rs'), 'utf8');
      expect(s).toContain('pub fn summarize');
    });
  });

  describe('Transports — 3 runner modules', () => {
    it('stdio.rs serves over stdin/stdout', async () => {
      const t = await fs.readFile(path.join(appDir, 'src/transports/stdio.rs'), 'utf8');
      expect(t).toContain('stdin');
      expect(t).toContain('stdout');
    });

    it('sse.rs binds host:port via axum', async () => {
      const t = await fs.readFile(path.join(appDir, 'src/transports/sse.rs'), 'utf8');
      expect(t).toContain('axum');
      expect(t).toContain('SocketAddr');
    });

    it('http.rs binds host:port via axum', async () => {
      const t = await fs.readFile(path.join(appDir, 'src/transports/http.rs'), 'utf8');
      expect(t).toContain('axum');
      expect(t).toContain('SocketAddr');
    });
  });

  describe('tests/echo_test.rs', () => {
    it('uses crateName-prefixed imports + covers echo + summarize + inventory', async () => {
      const t = await fs.readFile(path.join(appDir, 'tests/echo_test.rs'), 'utf8');
      expect(t).toContain('use my_mcp::');
      expect(t).toContain('echo_returns_input');
      expect(t).toContain('echo_rejects_empty');
      expect(t).toContain('summarize_includes_input');
      expect(t).toContain('tool_inventory_lists_echo');
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

    it('dare-ci.yml has cargo audit + clippy + cargo test', async () => {
      const ci = await fs.readFile(
        path.join(appDir, '.github/workflows/dare-ci.yml'),
        'utf8',
      );
      expect(ci).toMatch(/^\s*audit:/m);
      expect(ci).toMatch(/^\s*lint:/m);
      expect(ci).toMatch(/^\s*test:/m);
      expect(ci).toContain('cargo audit');
      expect(ci).toContain('clippy');
      expect(ci).toContain('cargo test');
    });
  });

  describe('warnings', () => {
    it('flags beta status of rmcp', () => {
      expect(result.warnings.some((w) => /beta/i.test(w))).toBe(true);
    });
  });

  describe('postInstallSteps', () => {
    it('includes cargo build + cargo run', () => {
      const j = result.postInstallSteps.join('\n');
      expect(j).toContain('cd my-mcp');
      expect(j).toContain('cargo build');
      expect(j).toContain('cargo run');
    });
  });
});
