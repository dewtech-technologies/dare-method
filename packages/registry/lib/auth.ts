/**
 * Auth utilities for the DARE registry API.
 *
 * Phase 1: accepts any non-empty Bearer token.
 * Future: validate GitHub OAuth tokens via API.
 *
 * @module lib/auth
 */

/**
 * Validates a Bearer token from the Authorization header.
 * Returns `true` if the header is present and the token is non-empty.
 */
export function validateToken(authHeader: string | undefined): boolean {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7).trim();
  return token.length > 0; // Phase 1: accept any non-empty token
}

/**
 * Extracts the token value from an Authorization header.
 * Returns `null` if the header is missing or malformed.
 */
export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}
