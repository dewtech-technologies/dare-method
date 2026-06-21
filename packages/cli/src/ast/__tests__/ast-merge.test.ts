import { describe, it, expect } from 'vitest';
import { mergeDataModels, normalizeRoute } from '../merge.js';
import type { DataModel } from '../../utils/datamodel.js';

describe('ast/merge', () => {
  it('normalizeRoute trims slashes', () => {
    expect(normalizeRoute('/users/')).toBe('/users');
    expect(normalizeRoute('users')).toBe('/users');
    expect(normalizeRoute('/')).toBe('/');
  });

  it('dedupes overlapping endpoints preferring AST source', () => {
    const regex: DataModel = {
      endpoints: [{ method: 'GET', route: '/users', source: 'a.ts:1' }],
      entities: [],
    };
    const ast: DataModel = {
      endpoints: [{ method: 'GET', route: '/users', source: 'a.ts:2' }],
      entities: [],
    };
    const merged = mergeDataModels(regex, ast);
    expect(merged.endpoints).toHaveLength(1);
    expect(merged.endpoints[0].source).toBe('a.ts:2');
  });

  it('unions disjoint models with stable sort', () => {
    const regex: DataModel = {
      endpoints: [{ method: 'GET', route: '/b', source: 'b:1' }],
      entities: [{ name: 'Beta', fields: [], relations: [], source: 'b:1' }],
    };
    const ast: DataModel = {
      endpoints: [{ method: 'POST', route: '/a', source: 'a:1' }],
      entities: [{ name: 'Alpha', fields: [{ name: 'id', type: 'int' }], relations: [], source: 'a:1' }],
    };
    const merged = mergeDataModels(regex, ast);
    expect(merged.endpoints.map((e) => e.method)).toEqual(['POST', 'GET']);
    expect(merged.entities.map((e) => e.name)).toEqual(['Alpha', 'Beta']);
  });
});
