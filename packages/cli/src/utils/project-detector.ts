import fs from 'fs-extra';
import path from 'path';

export interface DetectedProject {
  structure: 'monorepo' | 'backend' | 'frontend' | 'mcp-server' | 'unknown';
  backend?: string;
  frontend?: string;
  mcpLanguage?: 'node-ts' | 'python';
  mcpTransport?: 'stdio' | 'sse' | 'http-stream';
  name: string;
  hasDare: boolean;
  hasClaudeCode: boolean;
  hasCodex: boolean;
  dareConfig?: Record<string, unknown>;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

export async function detectProject(dir: string): Promise<DetectedProject> {
  const evidence: string[] = [];
  let structure: DetectedProject['structure'] = 'unknown';
  let backend: string | undefined;
  let frontend: string | undefined;
  let mcpLanguage: DetectedProject['mcpLanguage'];
  let mcpTransport: DetectedProject['mcpTransport'];
  let confidence: DetectedProject['confidence'] = 'low';

  // Detect project name from directory
  const name = path.basename(dir).replace(/[^a-z0-9-_]/gi, '-').toLowerCase();

  // Check if DARE is already installed
  const dareConfigPath = path.join(dir, 'dare.config.json');
  const hasDare = await fs.pathExists(dareConfigPath);
  let dareConfig: Record<string, unknown> | undefined;
  if (hasDare) {
    dareConfig = await fs.readJSON(dareConfigPath);
    evidence.push('dare.config.json found (DARE already installed)');
  }

  // Detect Claude Code usage
  const hasClaudeDir = await fs.pathExists(path.join(dir, '.claude'));
  const hasClaudeMd = await fs.pathExists(path.join(dir, 'CLAUDE.md'));
  const hasCodexDir = await fs.pathExists(path.join(dir, '.codex'));
  const hasAgentsMd = await fs.pathExists(path.join(dir, 'AGENTS.md'));
  if (hasClaudeDir || hasClaudeMd) {
    evidence.push(`${hasClaudeMd ? 'CLAUDE.md' : '.claude/'} found → Claude Code project`);
  }

  // ── Check for monorepo indicators first ──────────────────────────────────
  if (hasCodexDir || hasAgentsMd) {
    evidence.push(`${hasAgentsMd ? 'AGENTS.md' : '.codex/'} found -> Codex project`);
  }

  const hasBackendDir = await fs.pathExists(path.join(dir, 'backend'));
  const hasFrontendDir = await fs.pathExists(path.join(dir, 'frontend'));
  const hasPnpmWorkspace = await fs.pathExists(path.join(dir, 'pnpm-workspace.yaml'));
  const hasLernaJson = await fs.pathExists(path.join(dir, 'lerna.json'));

  if ((hasBackendDir && hasFrontendDir) || hasPnpmWorkspace || hasLernaJson) {
    structure = 'monorepo';
    confidence = 'medium';
    if (hasBackendDir && hasFrontendDir) evidence.push('backend/ and frontend/ directories found');
    if (hasPnpmWorkspace) evidence.push('pnpm-workspace.yaml found');
    if (hasLernaJson) evidence.push('lerna.json found');
  }

  // ── Check package.json ────────────────────────────────────────────────────
  const packageJsonPath = path.join(dir, 'package.json');
  if (await fs.pathExists(packageJsonPath)) {
    const pkg = await fs.readJSON(packageJsonPath).catch(() => ({}));
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const pkgName = pkg.name as string | undefined;

    // MCP detection — highest priority
    if (deps['@modelcontextprotocol/sdk'] || deps['@modelcontextprotocol/server']) {
      structure = 'mcp-server';
      mcpLanguage = 'node-ts';
      confidence = 'high';
      evidence.push('@modelcontextprotocol/sdk found in package.json');

      // Detect transport from scripts or deps
      if (deps['express'] || deps['fastify']) {
        mcpTransport = 'sse';
        evidence.push('express/fastify found → likely SSE transport');
      } else {
        mcpTransport = 'stdio';
        evidence.push('no HTTP framework found → likely stdio transport');
      }
    } else if (deps['@nestjs/core'] || deps['@nestjs/common']) {
      if (structure === 'unknown') structure = 'backend';
      backend = 'node-nestjs';
      confidence = 'high';
      evidence.push('@nestjs/core found in package.json');
    } else if (deps['express'] && structure !== 'monorepo') {
      if (structure === 'unknown') structure = 'backend';
      backend = 'node-express';
      confidence = 'medium';
      evidence.push('express found in package.json');
    } else if (deps['react']) {
      if (structure === 'unknown') structure = 'frontend';
      frontend = 'react';
      confidence = 'high';
      evidence.push('react found in package.json');
    } else if (deps['vue']) {
      if (structure === 'unknown') structure = 'frontend';
      frontend = 'vue';
      confidence = 'high';
      evidence.push('vue found in package.json');
    } else if (deps['nuxt']) {
      if (structure === 'unknown') structure = 'frontend';
      frontend = 'nuxt';
      confidence = 'high';
      evidence.push('nuxt found in package.json');
    } else if (pkg.name) {
      evidence.push(`package.json found (name: ${pkgName})`);
    }
  }

  // ── Check Cargo.toml (Rust) ───────────────────────────────────────────────
  const cargoPath = path.join(dir, 'Cargo.toml');
  if (await fs.pathExists(cargoPath)) {
    if (structure === 'unknown') structure = 'backend';
    backend = 'rust-axum';
    confidence = 'high';
    evidence.push('Cargo.toml found');

    // Check if it's an MCP server built in Rust
    const cargoContent = await fs.readFile(cargoPath, 'utf-8').catch(() => '');
    if (cargoContent.includes('rmcp') || cargoContent.includes('mcp')) {
      structure = 'mcp-server';
      mcpLanguage = 'node-ts'; // closest we have, will ask
      evidence.push('MCP dependency found in Cargo.toml');
    }
  }

  // ── Check Python ──────────────────────────────────────────────────────────
  const requirementsPath = path.join(dir, 'requirements.txt');
  const pyprojectPath = path.join(dir, 'pyproject.toml');
  const mainPyPath = path.join(dir, 'main.py');
  const hasPython = await fs.pathExists(requirementsPath) || await fs.pathExists(pyprojectPath);

  if (hasPython) {
    let pyContent = '';
    if (await fs.pathExists(requirementsPath)) {
      pyContent += await fs.readFile(requirementsPath, 'utf-8').catch(() => '');
      evidence.push('requirements.txt found');
    }
    if (await fs.pathExists(pyprojectPath)) {
      pyContent += await fs.readFile(pyprojectPath, 'utf-8').catch(() => '');
      evidence.push('pyproject.toml found');
    }
    if (await fs.pathExists(mainPyPath)) {
      const mainContent = await fs.readFile(mainPyPath, 'utf-8').catch(() => '');
      pyContent += mainContent;
    }

    const mcpPyPattern = /\bmcp\b|FastMCP|mcp\.server|@mcp\.tool/;
    const fastApiPattern = /fastapi/i;

    if (mcpPyPattern.test(pyContent)) {
      structure = 'mcp-server';
      mcpLanguage = 'python';
      confidence = 'high';
      evidence.push('mcp/FastMCP found in Python files');

      if (pyContent.includes('sse') || pyContent.includes('transport="sse"')) {
        mcpTransport = 'sse';
        evidence.push('SSE transport detected in Python files');
      } else {
        mcpTransport = 'stdio';
      }
    } else if (fastApiPattern.test(pyContent)) {
      if (structure === 'unknown') structure = 'backend';
      backend = 'python-fastapi';
      confidence = 'high';
      evidence.push('fastapi found in Python requirements');
    } else {
      if (structure === 'unknown') structure = 'backend';
      if (!backend) backend = 'python-fastapi';
      confidence = 'medium';
    }
  }

  // ── Check PHP / Laravel ───────────────────────────────────────────────────
  const composerPath = path.join(dir, 'composer.json');
  if (await fs.pathExists(composerPath)) {
    if (structure === 'unknown') structure = 'backend';
    backend = 'php-laravel';
    confidence = 'high';
    evidence.push('composer.json found');

    const composer = await fs.readJSON(composerPath).catch(() => ({}));
    const require = composer.require ?? {};
    if (require['laravel/framework']) {
      evidence.push('laravel/framework found in composer.json');
    }
  }

  // ── Detect frontend within a monorepo ─────────────────────────────────────
  if (structure === 'monorepo' && hasFrontendDir) {
    const frontendPkg = path.join(dir, 'frontend', 'package.json');
    if (await fs.pathExists(frontendPkg)) {
      const pkg = await fs.readJSON(frontendPkg).catch(() => ({}));
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      if (deps['react']) { frontend = 'react'; evidence.push('react found in frontend/package.json'); }
      else if (deps['vue']) { frontend = 'vue'; evidence.push('vue found in frontend/package.json'); }
      else if (deps['nuxt']) { frontend = 'nuxt'; evidence.push('nuxt found in frontend/package.json'); }
    }
  }

  if (structure === 'monorepo' && hasBackendDir) {
    const backendPkg = path.join(dir, 'backend', 'package.json');
    if (await fs.pathExists(backendPkg)) {
      const pkg = await fs.readJSON(backendPkg).catch(() => ({}));
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      if (deps['@nestjs/core']) { backend = 'node-nestjs'; evidence.push('nestjs found in backend/package.json'); }
    }
  }

  if (evidence.length === 0) {
    evidence.push('No recognizable project files found');
  }

  const hasClaudeCode = await fs.pathExists(path.join(dir, '.claude')) || await fs.pathExists(path.join(dir, 'CLAUDE.md'));
  const hasCodex = await fs.pathExists(path.join(dir, '.codex')) || await fs.pathExists(path.join(dir, 'AGENTS.md'));

  return {
    name,
    structure,
    backend,
    frontend,
    mcpLanguage,
    mcpTransport,
    hasDare,
    hasClaudeCode,
    hasCodex,
    dareConfig,
    confidence,
    evidence,
  };
}

export function formatDetectionReport(detected: DetectedProject): string {
  const lines: string[] = [];
  const confidenceColor = detected.confidence === 'high' ? '✅' : detected.confidence === 'medium' ? '⚠️' : '❓';

  lines.push(`  Structure:  ${detected.structure} ${confidenceColor}`);
  if (detected.backend) lines.push(`  Backend:    ${detected.backend}`);
  if (detected.frontend) lines.push(`  Frontend:   ${detected.frontend}`);
  if (detected.mcpLanguage) lines.push(`  MCP Lang:   ${detected.mcpLanguage}`);
  if (detected.mcpTransport) lines.push(`  Transport:  ${detected.mcpTransport}`);
  lines.push(`  DARE:       ${detected.hasDare ? '✅ installed' : '❌ not installed'}`);
  lines.push(`  Claude Code:${detected.hasClaudeCode ? ' ✅ detected' : ' —'}`);
  lines.push(`  Codex CLI:  ${detected.hasCodex ? ' detected' : ' -'}`);
  lines.push('');
  lines.push('  Evidence:');
  for (const e of detected.evidence) {
    lines.push(`    · ${e}`);
  }

  return lines.join('\n');
}
