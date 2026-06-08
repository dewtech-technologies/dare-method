import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const IMPL = path.join(REPO, 'implementations');
const TEMPLATES = path.join(REPO, 'packages', 'cli', 'templates');

describe('IDE hook adapters', () => {
  it('Claude settings.example.json calls dare hooks run on-save', async () => {
    const raw = await fs.readFile(
      path.join(IMPL, 'claude', '.claude', 'settings.example.json'),
      'utf-8',
    );
    const settings = JSON.parse(raw) as {
      hooks?: { PostToolUse?: Array<{ hooks?: Array<{ command?: string }> }> };
    };
    const cmd = settings.hooks?.PostToolUse?.[0]?.hooks?.[0]?.command ?? '';
    expect(cmd).toContain('dare hooks run on-save');
    expect(cmd).not.toMatch(/^echo /);
  });

  it('pre-commit template maps to dare hooks run pre-commit', async () => {
    const script = await fs.readFile(
      path.join(TEMPLATES, 'hooks', 'pre-commit-dare-validate'),
      'utf-8',
    );
    expect(script).toContain('dare hooks run pre-commit');
    expect(script).toContain('command -v dare');
    expect(script).toContain('exit 0');
  });

  it('dare.config.hooks.example.json has trusted:false and allowlist actions', async () => {
    const example = await fs.readJson(
      path.join(TEMPLATES, 'hooks', 'dare.config.hooks.example.json'),
    );
    expect(example.hooks.trusted).toBe(false);
    const actions = Object.values(example.hooks.on).flat() as Array<{ action: string }>;
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(['lint', 'dare-review', 'dare-validate']),
    );
  });

  it('Cursor and Antigravity document deferred native hooks + fallback', async () => {
    for (const ide of ['cursor', 'antigravity'] as const) {
      const note = await fs.readFile(
        path.join(IMPL, ide, 'templates', 'HOOKS-ADAPTER.md'),
        'utf-8',
      );
      expect(note.toLowerCase()).toContain('adiad');
      expect(note).toContain('pre-commit');
      expect(note).toContain('dare hooks run');
      expect(note).toContain('/steering');
    }
  });
});
