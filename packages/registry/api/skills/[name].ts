/**
 * GET /api/skills/:name — get details for a single skill.
 *
 * Returns the skill with all available versions.
 * RFC 7807 error format for 404 (D-006).
 *
 * Response:
 *   {
 *     name: string;
 *     versions: SkillEntry[];   // all versions, newest first
 *     latest: SkillEntry;       // most recently published version
 *   }
 *
 * @module api/skills/[name]
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readIndex, findSkillsByName } from '../../lib/storage.js';
import { checkRateLimit } from '../../lib/rate-limit.js';

const RATE_LIMIT = 100;
const RATE_WINDOW_MS = 60_000;

function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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

export default function handler(req: VercelRequest, res: VercelResponse): void {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    problem(res, 405, 'Method Not Allowed', `Method ${req.method} is not allowed on this endpoint.`);
    return;
  }

  const { name } = req.query;
  if (!name || typeof name !== 'string') {
    problem(res, 400, 'Bad Request', 'Skill name is required.');
    return;
  }

  // Rate limiting by IP
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(`info:${ip}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    problem(res, 429, 'Too Many Requests', 'Rate limit exceeded. Please wait before making more requests.');
    return;
  }

  let index;
  try {
    index = readIndex();
  } catch (err) {
    problem(res, 500, 'Internal Server Error', 'Failed to read registry data.');
    return;
  }

  const versions = findSkillsByName(index, name);

  if (versions.length === 0) {
    problem(
      res,
      404,
      'Skill Not Found',
      `Skill "${name}" was not found in the registry.`,
    );
    return;
  }

  res.status(200).json({
    name: versions[0]!.name,
    versions,
    latest: versions[0]!,
  });
}
