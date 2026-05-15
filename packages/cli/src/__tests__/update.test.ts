import { describe, it, expect } from 'vitest';
import {
  compareVersions,
  isNewerThan,
  parseVersion,
  sortVersionsAscending,
} from '../utils/version-compare.js';
import {
  buildUpdatePlan,
  changeAppliesToIde,
  LEGACY_BASELINE_VERSION,
  resolveProjectVersion,
} from '../utils/UpdateDetector.js';
import type {
  ManifestChange,
  UpdateManifest,
} from '../types/UpdateManifest.types.js';

describe('version-compare', () => {
  it('parses semver strings', () => {
    expect(parseVersion('2.17.0')).toEqual({ major: 2, minor: 17, patch: 0 });
    expect(parseVersion('10.0.42')).toEqual({ major: 10, minor: 0, patch: 42 });
  });

  it('rejects invalid versions', () => {
    expect(() => parseVersion('abc')).toThrow();
    expect(() => parseVersion('1.2')).toThrow();
  });

  it('compares versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('2.17.0', '2.16.0')).toBe(1);
  });

  it('isNewerThan is strict', () => {
    expect(isNewerThan('2.17.0', '2.16.0')).toBe(true);
    expect(isNewerThan('2.16.0', '2.16.0')).toBe(false);
    expect(isNewerThan('2.15.0', '2.16.0')).toBe(false);
  });

  it('sorts versions ascending', () => {
    expect(sortVersionsAscending(['2.17.0', '2.16.0', '3.0.0', '2.16.1'])).toEqual([
      '2.16.0',
      '2.16.1',
      '2.17.0',
      '3.0.0',
    ]);
  });
});

describe('resolveProjectVersion', () => {
  it('returns the version as-is for real DARE versions', () => {
    expect(resolveProjectVersion({ version: '2.17.0' })).toEqual({
      version: '2.17.0',
      isLegacy: false,
    });
  });

  it('treats hardcoded placeholder "0.1.0" as legacy', () => {
    expect(resolveProjectVersion({ version: '0.1.0' })).toEqual({
      version: LEGACY_BASELINE_VERSION,
      isLegacy: true,
    });
  });

  it('treats missing version as legacy', () => {
    expect(resolveProjectVersion({})).toEqual({
      version: LEGACY_BASELINE_VERSION,
      isLegacy: true,
    });
  });
});

describe('changeAppliesToIde', () => {
  const baseChange: ManifestChange = {
    type: 'modified',
    path: 'x',
    description: '',
  };

  it("wildcard '*' applies to every IDE", () => {
    expect(changeAppliesToIde({ ...baseChange, appliesTo: ['*'] }, 'cursor')).toBe(true);
    expect(changeAppliesToIde({ ...baseChange }, 'antigravity')).toBe(true); // default
  });

  it('exact ide match', () => {
    expect(changeAppliesToIde({ ...baseChange, appliesTo: ['cursor'] }, 'cursor')).toBe(
      true,
    );
    expect(changeAppliesToIde({ ...baseChange, appliesTo: ['cursor'] }, 'antigravity')).toBe(
      false,
    );
  });

  it("'hybrid' inherits cursor + antigravity", () => {
    expect(changeAppliesToIde({ ...baseChange, appliesTo: ['cursor'] }, 'hybrid')).toBe(true);
    expect(changeAppliesToIde({ ...baseChange, appliesTo: ['antigravity'] }, 'hybrid')).toBe(
      true,
    );
    expect(changeAppliesToIde({ ...baseChange, appliesTo: ['claude-code'] }, 'hybrid')).toBe(
      false,
    );
  });

  it("'claude-hybrid' inherits claude-code + cursor", () => {
    expect(
      changeAppliesToIde({ ...baseChange, appliesTo: ['claude-code'] }, 'claude-hybrid'),
    ).toBe(true);
    expect(
      changeAppliesToIde({ ...baseChange, appliesTo: ['cursor'] }, 'claude-hybrid'),
    ).toBe(true);
    expect(
      changeAppliesToIde({ ...baseChange, appliesTo: ['antigravity'] }, 'claude-hybrid'),
    ).toBe(false);
  });
});

describe('buildUpdatePlan', () => {
  const manifest: UpdateManifest = {
    schemaVersion: 1,
    releases: {
      '2.16.0': {
        releasedAt: '2026-05-10',
        summary: 'A',
        changelog: 'A',
        changes: [],
      },
      '2.17.0': {
        releasedAt: '2026-05-15',
        summary: 'B',
        changelog: 'B',
        changes: [
          {
            type: 'modified',
            path: 'shared.md',
            description: '',
            appliesTo: ['*'],
          },
          {
            type: 'added',
            path: '.cursor/commands/x.md',
            description: '',
            appliesTo: ['cursor'],
          },
          {
            type: 'added',
            path: '.agents/skills/y.md',
            description: '',
            appliesTo: ['antigravity'],
          },
        ],
      },
      '2.18.0': {
        releasedAt: '2026-06-01',
        summary: 'C',
        changelog: 'C',
        changes: [
          {
            type: 'modified',
            path: 'other.md',
            description: '',
          },
        ],
      },
    },
  };

  it('includes only versions strictly newer than fromVersion', () => {
    const plan = buildUpdatePlan(manifest, '2.16.0', '2.18.0', 'cursor');
    const versions = plan.pendingReleases.map((r) => r.version);
    expect(versions).toEqual(['2.17.0', '2.18.0']);
  });

  it('excludes versions newer than toVersion', () => {
    const plan = buildUpdatePlan(manifest, '2.16.0', '2.17.0', 'cursor');
    const versions = plan.pendingReleases.map((r) => r.version);
    expect(versions).toEqual(['2.17.0']);
  });

  it('filters changes by IDE', () => {
    const plan = buildUpdatePlan(manifest, '2.16.0', '2.17.0', 'cursor');
    const paths = plan.applicableChanges.map((c) => c.path);
    expect(paths).toContain('shared.md');
    expect(paths).toContain('.cursor/commands/x.md');
    expect(paths).not.toContain('.agents/skills/y.md');
  });

  it('returns empty plan when up to date', () => {
    const plan = buildUpdatePlan(manifest, '2.18.0', '2.18.0', 'cursor');
    expect(plan.pendingReleases).toHaveLength(0);
    expect(plan.applicableChanges).toHaveLength(0);
  });
});
