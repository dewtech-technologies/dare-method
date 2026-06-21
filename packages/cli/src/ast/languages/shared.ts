import type { Endpoint } from '../../utils/datamodel.js';

export function joinRoute(prefix: string, route: string): string {
  const a = prefix.replace(/^\/+|\/+$/g, '');
  const b = route.replace(/^\/+|\/+$/g, '');
  const joined = [a, b].filter(Boolean).join('/');
  return '/' + joined;
}

export function pushEndpoint(
  out: Endpoint[],
  seen: Set<string>,
  method: string,
  route: string,
  source: string,
): void {
  const key = `${method.toUpperCase()} ${route}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ method: method.toUpperCase(), route, source });
}

/** NestJS / Express / Laravel / FastAPI / Gin / Axum patterns on a syntactic blob. */
export function extractEndpointsFromBlob(
  text: string,
  source: string,
  out: Endpoint[],
  seen: Set<string>,
  classPrefix = '',
): void {
  const nest = /@(Get|Post|Put|Patch|Delete|Options|Head)\(\s*['"`]([^'"`]*)['"`]/gi;
  let nm: RegExpExecArray | null;
  while ((nm = nest.exec(text)) !== null) {
    const route = nm[2] ? joinRoute(classPrefix, nm[2]) : joinRoute(classPrefix, '');
    pushEndpoint(out, seen, nm[1], route, source);
  }

  const bareNest = /@(Get|Post|Put|Patch|Delete|Options|Head)\(\s*\)/gi;
  let bm: RegExpExecArray | null;
  while ((bm = bareNest.exec(text)) !== null) {
    pushEndpoint(out, seen, bm[1], joinRoute(classPrefix, ''), source);
  }

  const express =
    /\b(?:app|router|r|route|api)\.(get|post|put|patch|delete|options|head)\(\s*['"`]([^'"`]+)['"`]/gi;
  let em: RegExpExecArray | null;
  while ((em = express.exec(text)) !== null) {
    pushEndpoint(out, seen, em[1], em[2], source);
  }

  const laravel = /Route::(get|post|put|patch|delete|options|any|match)\(\s*['"]([^'"]+)['"]/gi;
  let lm: RegExpExecArray | null;
  while ((lm = laravel.exec(text)) !== null) {
    pushEndpoint(out, seen, lm[1], lm[2], source);
  }

  const fastapi = /@(?:app|router)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/gi;
  let fm: RegExpExecArray | null;
  while ((fm = fastapi.exec(text)) !== null) {
    pushEndpoint(out, seen, fm[1], fm[2], source);
  }

  const gin = /\.(GET|POST|PUT|PATCH|DELETE)\(\s*"([^"]+)"/gi;
  let gm: RegExpExecArray | null;
  while ((gm = gin.exec(text)) !== null) {
    pushEndpoint(out, seen, gm[1], gm[2], source);
  }

  const slim = /\$\w+->(get|post|put|patch|delete|options|head|map)\(\s*['"]([^'"]+)['"]/gi;
  let sm: RegExpExecArray | null;
  while ((sm = slim.exec(text)) !== null) {
    pushEndpoint(out, seen, sm[1], sm[2], source);
  }

  const axum = /\.route\(\s*"([^"]+)"\s*,\s*(get|post|put|patch|delete)\s*\(/gi;
  let am: RegExpExecArray | null;
  while ((am = axum.exec(text)) !== null) {
    pushEndpoint(out, seen, am[2], am[1], source);
  }

  const ruby = /\b(get|post|put|patch|delete|match)\s+['"]([^'"]+)['"]/gi;
  let rm: RegExpExecArray | null;
  while ((rm = ruby.exec(text)) !== null) {
    pushEndpoint(out, seen, rm[1], rm[2], source);
  }

  const flaskArr = /@\w+\.route\(\s*['"]([^'"]+)['"][\s\S]{0,120}?methods\s*[:=]\s*\[([^\]]+)\]/gi;
  let fa: RegExpExecArray | null;
  while ((fa = flaskArr.exec(text)) !== null) {
    for (const part of fa[2].split(',')) {
      const meth = /([A-Za-z]+)/.exec(part);
      if (meth) pushEndpoint(out, seen, meth[1], fa[1], source);
    }
  }

  const flaskGet = /@\w+\.route\(\s*['"]([^'"]+)['"]\s*\)/gi;
  let fg: RegExpExecArray | null;
  while ((fg = flaskGet.exec(text)) !== null) {
    if (!/methods\s*[:=]/.test(fg[0])) pushEndpoint(out, seen, 'GET', fg[1], source);
  }
}

export function extractEntityFromClassBlob(
  text: string,
  source: string,
  out: import('../../utils/datamodel.js').Entity[],
  seen: Set<string>,
): void {
  if (!/@Entity\b|extends\s+Model\b|extends\s+ActiveRecord|class\s+\w+\s*\(\s*Base\s*\)/.test(text)) {
    return;
  }

  const classMatch = /class\s+(\w+)/.exec(text);
  if (!classMatch) return;
  const name = classMatch[1];
  const key = name.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);

  const entity: import('../../utils/datamodel.js').Entity = {
    name,
    fields: [],
    relations: [],
    source,
  };
  for (const raw of text.split(/\r?\n/)) {
    const fm = /^\s*(?:@\w+\([^)]*\)\s*)?(\w+)\??\s*:\s*([\w[\]<>., |]+)/.exec(raw);
    if (fm && !/^(constructor|function|async|public|private|protected|static|get|set)$/.test(fm[1])) {
      entity.fields.push({ name: fm[1], type: fm[2].trim().replace(/[;,].*$/, '') });
    }
    const col = /Column\([^)]*\)\s*\n?\s*(\w+)/.exec(raw);
    if (col) entity.fields.push({ name: col[1], type: 'column' });
  }

  out.push(entity);
}
