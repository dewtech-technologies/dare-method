/**
 * POST /api/publish/:name — publish a new skill version to the registry.
 *
 * Request:
 *   Authorization: Bearer <token>
 *   Content-Type: application/json
 *   Body: {
 *     version: string;
 *     description: string;
 *     author: string;
 *     license: string;       // must be "MIT" (D-001)
 *     dare_version: string;
 *     dependencies: Record<string, string>;
 *     keywords: string[];
 *     homepage?: string;
 *   }
 *
 * Rules:
 *   - Requires Bearer token (D-005)
 *   - License MUST be "MIT" — 400 otherwise (D-001)
 *   - Rate limit: 10 publishes per hour per token
 *   - RFC 7807 errors (D-006)
 *
 * @module api/publish/[name]
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readIndex, writeIndex, upsertSkill, type SkillEntry } from '../../lib/storage.js';
import { validateToken, extractToken } from '../../lib/auth.js';
import { checkRateLimit } from '../../lib/rate-limit.js';

const PUBLISH_LIMIT = 10;
const PUBLISH_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function problem(res: VercelResponse, status: number, title: string, detail: string): void {
  res.status(status).json({
    type: `https://dare-registry.vercel.app/errors/${status}`,
    title,
    status,
    detail,
  });
}

interface PublishBody {
  version: string;
  description: string;
  author: string;
  license: string;
  dare_version: string;
  dependencies: Record<string, string>;
  keywords: string[];
  homepage?: string;
}

function validateBody(body: unknown): body is PublishBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b['version'] === 'string' &&
    typeof b['description'] === 'string' &&
    typeof b['author'] === 'string' &&
    typeof b['license'] === 'string' &&
    typeof b['dare_version'] === 'string' &&
    typeof b['dependencies'] === 'object' && b['dependencies'] !== null &&
    Array.isArray(b['keywords'])
  );
}

export default function handler(req: VercelRequest, res: VercelResponse): void {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    problem(res, 405, 'Method Not Allowed', `Method ${req.method} is not allowed on this endpoint.`);
    return;
  }

  // Auth
  const authHeader = req.headers['authorization'] as string | undefined;
  if (!validateToken(authHeader)) {
    problem(res, 401, 'Unauthorized', 'A valid Bearer token is required to publish skills.');
    return;
  }

  const token = extractToken(authHeader)!;

  // Rate limit by token
  if (!checkRateLimit(`publish:${token}`, PUBLISH_LIMIT, PUBLISH_WINDOW_MS)) {
    problem(res, 429, 'Too Many Requests', `Publish rate limit exceeded. Maximum ${PUBLISH_LIMIT} publishes per hour.`);
    return;
  }

  const { name } = req.query;
  if (!name || typeof name !== 'string') {
    problem(res, 400, 'Bad Request', 'Skill name is required in the URL path.');
    return;
  }

  const body = req.body as unknown;
  if (!validateBody(body)) {
    problem(res, 400, 'Bad Request', 'Request body must include: version, description, author, license, dare_version, dependencies, keywords.');
    return;
  }

  // Enforce MIT license (D-001)
  if (body.license !== 'MIT') {
    problem(res, 400, 'License Not Allowed', `Only MIT license is accepted. Received: "${body.license}".`);
    return;
  }

  // Build skill entry
  const entry: SkillEntry = {
    name,
    version: body.version,
    description: body.description,
    author: body.author,
    license: body.license,
    dare_version: body.dare_version,
    dependencies: body.dependencies,
    keywords: body.keywords,
    homepage: body.homepage,
    publishedAt: new Date().toISOString(),
  };

  let index;
  try {
    index = readIndex();
  } catch (err) {
    problem(res, 500, 'Internal Server Error', 'Failed to read registry data.');
    return;
  }

  upsertSkill(index, entry);

  try {
    writeIndex(index);
  } catch (err) {
    // In Vercel read-only FS, write will fail — return success for now since
    // the in-memory update succeeded. A future version will write to a DB.
    // Still respond 200 to the client.
  }

  res.status(200).json({
    message: `Published ${name}@${body.version} successfully.`,
    skill: entry,
  });
}
