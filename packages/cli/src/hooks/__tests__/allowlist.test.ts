import { describe, it, expect } from 'vitest';
import { resolveAction, ActionNotAllowedError } from '../allowlist.js';
import type { AllowedActionKey } from '../allowlist.js';

describe('hooks allowlist', () => {
  it('resolves dare-validate', () => {
    expect(resolveAction('dare-validate', { event: 'pre-commit' }, {})).toEqual({
      cmd: 'dare',
      argv: ['validate', '--strict'],
    });
  });

  it('resolves dare-review with taskId as argv element', () => {
    const resolved = resolveAction(
      'dare-review',
      { event: 'on-task-complete', taskId: 'task-101' },
      {},
    );
    expect(resolved.argv).toContain('task-101');
    expect(resolved.argv).toEqual(['review', 'task-101', '--strict', '--format', 'json']);
  });

  it('resolves lint from stack command', () => {
    expect(resolveAction('lint', { event: 'on-save' }, { lint: 'npm run lint' })).toEqual({
      cmd: 'npm',
      argv: ['run', 'lint'],
    });
  });

  it('rejects unknown action keys', () => {
    expect(() =>
      resolveAction('rm-rf' as AllowedActionKey, { event: 'on-save' }, {}),
    ).toThrow(ActionNotAllowedError);
    expect(() =>
      resolveAction('rm-rf' as AllowedActionKey, { event: 'on-save' }, {}),
    ).toThrow("Hook action 'rm-rf' is not in the allowlist");
  });

  it('rejects dare-review without taskId', () => {
    expect(() =>
      resolveAction('dare-review', { event: 'on-task-complete' }, {}),
    ).toThrow(ActionNotAllowedError);
  });
});
