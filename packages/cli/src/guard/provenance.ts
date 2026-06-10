import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import type { GuardConfig } from './config.js';
import type { ArtifactOrigin, TrustChannel } from './types.js';

type ArtifactTrust = 'signed' | 'unsigned';

function normalizePath(rawPath: string): string {
  return rawPath
    .replace(/\\/g, '/')
    .replace(/^[A-Za-z]:\//, '')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

function isTrustedPath(path: string, pattern: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedPattern = normalizePath(pattern);
  const hasWildcard = normalizedPattern.includes('*');

  if (!hasWildcard) {
    return (
      normalizedPath === normalizedPattern ||
      normalizedPath.endsWith(`/${normalizedPattern}`)
    );
  }

  const source = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*');
  const regex = new RegExp(`^(?:.*/)?${source}$`);
  return regex.test(normalizedPath);
}

function inferOrigin(path: string): ArtifactOrigin {
  const normalized = normalizePath(path).toLowerCase();
  if (normalized.startsWith('.dare/')) {
    return 'agent';
  }
  return 'external';
}

function decodeBase64Signature(line: string): Buffer | null {
  const compact = line.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    return null;
  }
  try {
    const decoded = Buffer.from(compact, 'base64');
    if (decoded.length === 0) return null;
    const normalizedInput = compact.replace(/=+$/g, '');
    const normalizedDecoded = decoded.toString('base64').replace(/=+$/g, '');
    return normalizedInput === normalizedDecoded ? decoded : null;
  } catch {
    return null;
  }
}

function signaturePayload(signature: string): Buffer | null {
  const lines = signature
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return null;

  const candidateLines =
    lines.length === 1
      ? lines
      : lines.filter(
          (line) =>
            !line.toLowerCase().startsWith('untrusted comment:') &&
            !line.toLowerCase().startsWith('trusted comment:'),
        );

  for (const candidate of candidateLines) {
    const decoded = decodeBase64Signature(candidate);
    if (decoded) return decoded;
  }

  return null;
}

export function computeDigest(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Layout minisign-compat:
 * - Linha 1: "untrusted comment: ..."
 * - Linha 2: assinatura Ed25519 em base64 (raw)
 */
export function signArtifact(content: Buffer, privKeyPem: string): string {
  const privateKey = createPrivateKey(privKeyPem);
  const signature = sign(null, content, privateKey).toString('base64');
  return `untrusted comment: signature from dare guard\n${signature}`;
}

export function verifyArtifact(
  content: Buffer,
  sig: string,
  pubKeyPem: string,
): boolean {
  const payload = signaturePayload(sig);
  if (!payload) return false;
  try {
    const publicKey = createPublicKey(pubKeyPem);
    return verify(null, content, publicKey, payload);
  } catch {
    return false;
  }
}

export function classify(
  path: string,
  cfg: GuardConfig,
): { origin: ArtifactOrigin; channel: TrustChannel; trust: ArtifactTrust } {
  const trusted = cfg.trustedPaths.some((pattern) => isTrustedPath(path, pattern));
  if (trusted) {
    return {
      origin: 'human',
      channel: 'control',
      trust: cfg.signing.enabled ? 'signed' : 'unsigned',
    };
  }

  return {
    origin: inferOrigin(path),
    channel: 'data',
    trust: 'unsigned',
  };
}
