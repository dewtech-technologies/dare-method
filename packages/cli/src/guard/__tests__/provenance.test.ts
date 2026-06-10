import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  classify,
  computeDigest,
  signArtifact,
  verifyArtifact,
} from '../provenance.js';
import { parseGuardConfig } from '../config.js';

function keyPairPem(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

describe('guard/provenance', () => {
  it('digest_stable', () => {
    const a = Buffer.from('same-content');
    const b = Buffer.from('same-content');
    const c = Buffer.from('same-content');
    c[0] ^= 0x01;

    expect(computeDigest(a)).toBe(computeDigest(b));
    expect(computeDigest(a)).not.toBe(computeDigest(c));
  });

  it('sign_then_verify_ok', () => {
    const { privateKey, publicKey } = keyPairPem();
    const content = Buffer.from('artifact-content');
    const sig = signArtifact(content, privateKey);

    expect(verifyArtifact(content, sig, publicKey)).toBe(true);
  });

  it('tamper_detected', () => {
    const { privateKey, publicKey } = keyPairPem();
    const original = Buffer.from('artifact-content');
    const tampered = Buffer.from(original);
    const sig = signArtifact(original, privateKey);
    tampered[3] ^= 0x01;

    const valid = verifyArtifact(tampered, sig, publicKey);
    const verdict = valid ? 'PASS' : 'FAIL';
    expect(valid).toBe(false);
    expect(verdict).toBe('FAIL');
  });

  it('classify_trusted_signed_is_control', () => {
    const cfg = parseGuardConfig({
      guard: {
        trustedPaths: ['DARE/**'],
        signing: { enabled: true, publicKey: 'minisign.pub' },
      },
    });

    expect(classify('DARE/TASKS.md', cfg)).toEqual({
      origin: 'human',
      channel: 'control',
      trust: 'signed',
    });
  });

  it('classify_untrusted_is_data', () => {
    const cfg = parseGuardConfig({
      guard: {
        trustedPaths: ['DARE/**'],
        signing: { enabled: true, publicKey: 'minisign.pub' },
      },
    });

    const result = classify('docs/rfcs/README.md', cfg);
    expect(result.channel).toBe('data');
    expect(result.trust).toBe('unsigned');
    expect(['agent', 'external']).toContain(result.origin);
  });

  it('missing_signature_on_trusted_path_is_fail', () => {
    const cfg = parseGuardConfig({
      guard: {
        trustedPaths: ['DARE/**'],
        signing: { enabled: true, publicKey: 'minisign.pub' },
      },
    });

    const meta = classify('DARE/BLUEPRINT.md', cfg);
    const signature = '';
    const signatureValid =
      signature.length > 0 &&
      verifyArtifact(Buffer.from('payload'), signature, cfg.signing.publicKey ?? '');
    const verdict =
      meta.channel === 'control' && meta.trust === 'signed' && !signatureValid
        ? 'FAIL'
        : 'PASS';

    expect(verdict).toBe('FAIL');
  });
});
