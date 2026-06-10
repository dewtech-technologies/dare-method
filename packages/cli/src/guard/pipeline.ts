import fs from 'node:fs';
import path from 'node:path';
import {
  BoundaryViolationError,
  enforceBoundary,
  type BoundaryIntent,
} from './boundary.js';
import type { GuardConfig } from './config.js';
import { classify, computeDigest, verifyArtifact } from './provenance.js';
import { scanHeuristics } from './scan.js';
import type {
  GuardFinding,
  GuardResult,
  GuardVerdict,
  GuardedArtifact,
} from './types.js';
import { auditUnicode } from './unicode.js';

export interface GuardPipelineOptions {
  readonly cwd?: string;
  readonly boundaryIntent?: BoundaryIntent;
}

export interface GuardPipelineOutput {
  readonly result: GuardResult;
  readonly artifact: GuardedArtifact;
}

function normalizeProjectPath(rawPath: string): string {
  return rawPath
    .replace(/\\/g, '/')
    .replace(/^[A-Za-z]:\//, '')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

function worstVerdict(findings: ReadonlyArray<GuardFinding>): GuardVerdict {
  if (findings.some((finding) => finding.severity === 'FAIL')) return 'FAIL';
  if (findings.some((finding) => finding.severity === 'WARN')) return 'WARN';
  return 'PASS';
}

function provenanceFinding(
  rule: string,
  evidence: string,
  severity: GuardVerdict = 'FAIL',
): GuardFinding {
  return {
    layer: 'provenance',
    severity,
    rule,
    evidence,
  };
}

function resolveKeyMaterial(
  cwd: string,
  configuredKey: string | undefined,
): string | undefined {
  const trimmed = configuredKey?.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes('BEGIN PUBLIC KEY')) return trimmed;

  const absPath = path.resolve(cwd, trimmed);
  if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
    return fs.readFileSync(absPath, 'utf8');
  }
  return trimmed;
}

function loadSignature(artifactAbsPath: string): string | undefined {
  const signaturePath = `${artifactAbsPath}.minisig`;
  if (!fs.existsSync(signaturePath)) return undefined;
  const signature = fs.readFileSync(signaturePath, 'utf8').trim();
  return signature.length > 0 ? signature : undefined;
}

function runProvenanceChecks(args: {
  readonly cwd: string;
  readonly artifactAbsPath: string;
  readonly content: Buffer;
  readonly cfg: GuardConfig;
  readonly artifact: GuardedArtifact;
}): GuardFinding[] {
  const findings: GuardFinding[] = [];
  if (args.artifact.channel !== 'control' || !args.cfg.signing.enabled) {
    return findings;
  }

  const publicKey = resolveKeyMaterial(args.cwd, args.cfg.signing.publicKey);
  if (!publicKey) {
    findings.push(
      provenanceFinding(
        'signing-key-missing',
        'guard.signing.publicKey is required when signing is enabled',
      ),
    );
    return findings;
  }

  const signature = loadSignature(args.artifactAbsPath);
  if (!signature) {
    findings.push(
      provenanceFinding(
        'signature-missing',
        `${args.artifact.path}.minisig is required for trusted artifacts`,
      ),
    );
    return findings;
  }

  if (!verifyArtifact(args.content, signature, publicKey)) {
    findings.push(
      provenanceFinding(
        'signature-invalid',
        `${args.artifact.path}.minisig does not match artifact digest`,
      ),
    );
  }

  return findings;
}

export function runGuardPipeline(
  artifactPath: string,
  content: Buffer,
  cfg: GuardConfig,
  options: GuardPipelineOptions = {},
): GuardPipelineOutput {
  const cwd = options.cwd ?? process.cwd();
  const artifactAbsPath = path.isAbsolute(artifactPath)
    ? artifactPath
    : path.resolve(cwd, artifactPath);
  const artifactRelPath = normalizeProjectPath(
    path.isAbsolute(artifactPath)
      ? path.relative(cwd, artifactPath)
      : artifactPath,
  );
  const utf8 = content.toString('utf8');

  const cls = classify(artifactRelPath, cfg);
  const unicode = auditUnicode(utf8, cfg.unicode);
  const scan = scanHeuristics(unicode.sanitized);

  const artifact: GuardedArtifact = {
    path: artifactRelPath,
    origin: cls.origin,
    channel: cls.channel,
    trust: cls.trust,
    digest: computeDigest(content),
  };

  const findings: GuardFinding[] = [
    ...unicode.findings,
    ...scan,
    ...runProvenanceChecks({
      cwd,
      artifactAbsPath,
      content,
      cfg,
      artifact,
    }),
  ];

  try {
    enforceBoundary(artifact, options.boundaryIntent ?? 'read');
  } catch (err) {
    if (err instanceof BoundaryViolationError) {
      findings.push(provenanceFinding('boundary-violation', err.message));
    } else {
      throw err;
    }
  }

  const verdict = worstVerdict(findings);
  const includeSanitized = cfg.unicode === 'strip' && unicode.sanitized !== utf8;
  const result: GuardResult = {
    artifact: artifactRelPath,
    verdict,
    findings,
    ...(includeSanitized ? { sanitized: unicode.sanitized } : {}),
  };

  return { result, artifact };
}
