import { describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DARE_REPORT_MARKER,
  emitAnnotations,
  sanitizeFindingText,
  upsertPrComment,
} from '../reporters/github.js';
import { exitCodeForFailOn, parseFailOn } from '../reporters/ci-gate.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);

describe('ci-pr regression', () => {
  it('annotations_match_github_workflow_command_format', () => {
    const lines: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c) => {
      lines.push(String(c));
      return true;
    });

    emitAnnotations([
      {
        severity: 'error',
        file: 'packages/cli/src/foo.ts',
        line: 10,
        rule: 'todo-marker',
        message: 'TODO remove',
      },
    ]);

    expect(lines[0]).toMatch(/^::error file=packages\/cli\/src\/foo\.ts,line=10::/);
  });

  it('upsertPrComment_updates_instead_of_duplicating', async () => {
    let postCount = 0;
    let patchCount = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) {
        return new Response(JSON.stringify([{ id: 5, body: `${DARE_REPORT_MARKER}\nold` }]), {
          status: 200,
        });
      }
      if (init.method === 'PATCH') {
        patchCount += 1;
        return new Response('{}', { status: 200 });
      }
      if (init.method === 'POST') {
        postCount += 1;
        return new Response('{}', { status: 201 });
      }
      return new Response('{}', { status: 404 });
    });

    await upsertPrComment(
      {
        repo: 'org/repo',
        prNumber: 1,
        token: 'secret-token-value',
        summary: [{ gate: 'guard', verdict: 'pass', count: 0 }],
        findings: [],
      },
      fetchMock as unknown as typeof fetch,
    );

    expect(patchCount).toBe(1);
    expect(postCount).toBe(0);
  });

  it('fail_on_none_does_not_block', () => {
    expect(parseFailOn('none')).toBe('none');
    expect(exitCodeForFailOn('none', 'fail')).toBe(0);
  });

  it('sanitize_removes_secrets_and_absolute_paths', () => {
    const out = sanitizeFindingText(
      'C:\\Users\\secret\\file.txt leaked ghp_abcdefghijklmnopqrstuvwxyz123456',
    );
    expect(out).not.toContain('C:\\Users');
    expect(out).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456');
  });

  it('action_yml_declares_minimal_permissions', async () => {
    const actionYml = await fs.readFile(path.join(REPO_ROOT, 'action.yml'), 'utf8');
    expect(actionYml).toContain('pull-requests: write');
    expect(actionYml).toContain('contents: read');
    expect(actionYml).toContain("default: 'none'");
  });

  it('dare_pr_workflow_template_pins_actions_by_sha', async () => {
    const wf = await fs.readFile(
      path.join(REPO_ROOT, 'packages/cli/templates/.github/workflows/dare-pr.yml'),
      'utf8',
    );
    expect(wf).toMatch(/uses: actions\/checkout@[0-9a-f]{40}/);
    expect(wf).not.toMatch(/@v\d/);
  });
});
