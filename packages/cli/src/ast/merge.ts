import type { DataModel, Entity, Endpoint } from '../utils/datamodel.js';

/** Normalize route for dedupe keys — trim slashes, collapse empty segments. */
export function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed || trimmed === '/') return '/';
  const inner = trimmed.replace(/^\/+|\/+$/g, '');
  return inner ? `/${inner}` : '/';
}

function endpointKey(method: string, route: string): string {
  return `${method.toUpperCase()} ${normalizeRoute(route)}`;
}

function mergeEntityFields(target: Entity, incoming: Entity): void {
  for (const f of incoming.fields) {
    if (!target.fields.some((x) => x.name === f.name)) target.fields.push(f);
  }
  for (const r of incoming.relations) {
    if (!target.relations.some((x) => x.to === r.to && x.kind === r.kind)) target.relations.push(r);
  }
}

/** Dedupe endpoints by (method, normalizedRoute); entities by name. Prefer AST source on tie. */
export function mergeDataModels(regexModel: DataModel, astModel: DataModel): DataModel {
  const endpointMap = new Map<string, Endpoint>();
  const entityMap = new Map<string, Entity>();

  for (const e of regexModel.endpoints) {
    endpointMap.set(endpointKey(e.method, e.route), e);
  }
  for (const e of astModel.endpoints) {
    endpointMap.set(endpointKey(e.method, e.route), e);
  }

  for (const e of regexModel.entities) {
    entityMap.set(e.name.toLowerCase(), { ...e, fields: [...e.fields], relations: [...e.relations] });
  }
  for (const e of astModel.entities) {
    const key = e.name.toLowerCase();
    const existing = entityMap.get(key);
    if (!existing) {
      entityMap.set(key, { ...e, fields: [...e.fields], relations: [...e.relations] });
      continue;
    }
    mergeEntityFields(existing, e);
    if (e.source && e.source !== existing.source) {
      existing.source = `${existing.source}; ${e.source}`;
    }
  }

  const entities = [...entityMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const endpoints = [...endpointMap.values()].sort((a, b) =>
    (a.route + a.method).localeCompare(b.route + b.method),
  );

  return { entities, endpoints };
}
