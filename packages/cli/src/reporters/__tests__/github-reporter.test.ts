import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DARE_REPORT_MARKER,
  emitAnnotations,
  renderPrCommentBody,
  sanitizeFindingText,
  upsertPrComment,
  type Finding,
} from '../github.js';

describe('github reporter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emitAnnotations_uses_actions_format_without_absolute_paths', () => {
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });

    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/auth.ts',
        line: 12,
        rule: 'todo-marker',
        message: 'TODO fix me',
      },
      {
        severity: 'warning',
        rule: 'drift',
        message: 'orphan requirement',
      },
    ];

    emitAnnotations(findings);
    spy.mockRestore();

    expect(lines.join('')).toContain('::error file=src/auth.ts,line=12::todo-marker: TODO fix me');
    expect(lines.join('')).toContain('::warning::drift: orphan requirement');
    expect(lines.join('')).not.toMatch(/[A-Za-z]:\\/);
  });

  it('sanitizeFindingText_redacts_long_tokens', () => {
    const secret = 'supersecretapitokenvalue1234567890';
    const out = sanitizeFindingText(`leaked ${secret} here`);
    expect(out).not.toContain(secret);
    expect(out).toContain('[REDACTED]');
  });

  it('renderPrCommentBody_includes_marker', () => {
    const body = renderPrCommentBody(
      [{ gate: 'guard', verdict: 'warn', count: 1 }],
      [{ severity: 'warning', rule: 'scan', message: 'suspicious pattern' }],
    );
    expect(body).toContain(DARE_REPORT_MARKER);
    expect(body).toContain('| guard | warn | 1 |');
    expect(body).not.toContain('ghp_');
  });

  it('upsertPrComment_updates_existing_marker_comment', async () => {
    const token = 'ghp_test_token_should_never_log';
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === undefined && url.includes('/comments') && !url.includes('/issues/comments/')) {
        return new Response(
          JSON.stringify([{ id: 99, body: `${DARE_REPORT_MARKER}\nold` }]),
          { status: 200 },
        );
      }
      if (init?.method === 'PATCH') {
        return new Response('{}', { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await upsertPrComment(
      {
        repo: 'org/repo',
        prNumber: 42,
        token,
        summary: [{ gate: 'review', verdict: 'pass', count: 0 }],
        findings: [],
      },
      fetchMock as unknown as typeof fetch,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const patchCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH');
    expect(patchCall?.[0]).toContain('/issues/comments/99');
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(token);
    logSpy.mockRestore();
  });

  it('upsertPrComment_creates_when_marker_missing', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === undefined) {
        return new Response(JSON.stringify([{ id: 1, body: 'other comment' }]), { status: 200 });
      }
      if (init?.method === 'POST') {
        return new Response('{}', { status: 201 });
      }
      return new Response('{}', { status: 404 });
    });

    await upsertPrComment(
      {
        repo: 'org/repo',
        prNumber: 7,
        token: 'token',
        summary: [{ gate: 'guard', verdict: 'fail', count: 2 }],
        findings: [{ severity: 'error', rule: 'scan', message: 'bad' }],
      },
      fetchMock as unknown as typeof fetch,
    );

    const postCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(postCall).toBeDefined();
    const body = JSON.parse(String((postCall?.[1] as RequestInit).body));
    expect(body.body).toContain(DARE_REPORT_MARKER);
  });
});
