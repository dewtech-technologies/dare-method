/**
 * Unit tests for the Registry client.
 *
 * Uses the mock JSON registry — no network calls.
 */

import { describe, it, expect } from 'vitest';
import { Registry } from '../registry.js';

describe('Registry', () => {
  const reg = new Registry();

  it('loadAll() returns all skills from the mock', () => {
    const skills = reg.loadAll();
    expect(skills.length).toBeGreaterThan(0);
  });

  it('loadAll() returns objects with required fields', () => {
    const skills = reg.loadAll();
    for (const s of skills) {
      expect(typeof s.name).toBe('string');
      expect(typeof s.version).toBe('string');
      expect(typeof s.description).toBe('string');
      expect(typeof s.author).toBe('string');
    }
  });

  it('findByName() returns the correct skill', () => {
    const skill = reg.findByName('dare-ax');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('dare-ax');
    expect(skill?.version).toBe('1.0.0');
  });

  it('findByName() returns undefined for unknown skill', () => {
    expect(reg.findByName('does-not-exist')).toBeUndefined();
  });

  it('resolveDependencies() returns empty array for dare-ax (no deps)', () => {
    const deps = reg.resolveDependencies('dare-ax');
    expect(deps).toEqual([]);
  });

  it('resolveDependencies() returns dare-ax as dep for dare-llm-integration', () => {
    const deps = reg.resolveDependencies('dare-llm-integration');
    const names = deps.map((d) => d.name);
    expect(names).toContain('dare-ax');
  });

  it('resolveDependencies() resolves transitive deps for ruby-rails-8', () => {
    const deps = reg.resolveDependencies('ruby-rails-8');
    const names = deps.map((d) => d.name);
    // ruby-rails-8 depends on dare-ax, dare-layered-design, dare-realtime
    expect(names).toContain('dare-ax');
    expect(names).toContain('dare-layered-design');
    expect(names).toContain('dare-realtime');
  });

  it('resolveDependencies() throws for unknown skill', () => {
    expect(() => reg.resolveDependencies('nonexistent-skill')).toThrow('not found in the registry');
  });

  it('resolveDependencies() result does NOT include the target skill itself', () => {
    const deps = reg.resolveDependencies('dare-llm-integration');
    const names = deps.map((d) => d.name);
    expect(names).not.toContain('dare-llm-integration');
  });
});
