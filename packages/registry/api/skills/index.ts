/**
 * GET /api/skills — list all skills in the registry.
 *
 * Query parameters:
 *   ?keyword=<term>   Filter by keyword (case-insensitive, matches any keyword)
 *   ?author=<name>    Filter by author (case-insensitive exact match)
 *
 * Response: { skills: SkillEntry[], total: number, updatedAt: string }
 *
 * @module api/skills/index
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readIndex, type SkillEntry } from '../../lib/storage.js';
import { checkRateLimit } from '../../lib/rate-limit.js';

const RATE_LIMIT = 100;          // requests
const RATE_WINDOW_MS = 60_000;   // 1 minute

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

  // Rate limiting by IP
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(`list:${ip}`, RATE_LIMIT, RATE_WINDOW_MS)) {
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

  let skills: SkillEntry[] = index.skills;

  // Filter by keyword
  const { keyword, author } = req.query;
  if (keyword && typeof keyword === 'string') {
    const kw = keyword.toLowerCase();
    skills = skills.filter((s) =>
      s.keywords.some((k) => k.toLowerCase().includes(kw)),
    );
  }

  // Filter by author
  if (author && typeof author === 'string') {
    const auth = author.toLowerCase();
    skills = skills.filter((s) => s.author.toLowerCase() === auth);
  }

  res.status(200).json({
    skills,
    total: skills.length,
    updatedAt: index.updatedAt,
  });
}
