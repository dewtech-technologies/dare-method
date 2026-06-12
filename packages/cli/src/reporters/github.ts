import fs from 'node:fs';
import path from 'node:path';

export const DARE_REPORT_MARKER = '<!-- dare-report -->';

export interface Finding {
  readonly severity: 'error' | 'warning';
  readonly file?: string;
  readonly line?: number;
  readonly rule: string;
  readonly message: string;
}

export interface GateSummary {
  readonly gate: string;
  readonly verdict: string;
  readonly count: number;
}

export interface PrCommentInput {
  readonly repo: string;
  readonly prNumber: number;
  readonly token: string;
  readonly summary: ReadonlyArray<GateSummary>;
  readonly findings: ReadonlyArray<Finding>;
}

/** Sanitize text for annotations/comments (reuses guard redaction patterns, RS-04). */
export function sanitizeFindingText(text: string): string {
  let out = text.replace(/\r\n/g, '\n');
  out = out.replace(/\b[A-Za-z0-9_=-]{16,}\b/g, '[REDACTED]');
  // OS-independent: na CI (Linux) path.basename é POSIX e não trata `\` como separador,
  // deixando paths Windows passarem. Usar win32/posix explicitamente.
  out = out.replace(/[A-Za-z]:\\[^\s:]+/g, (match) => path.win32.basename(match));
  out = out.replace(/(?:^|\s)\/[^\s:]+/g, (match) => {
    const trimmed = match.trim();
    return ` ${path.posix.basename(trimmed)}`;
  });
  if (out.length > 500) {
    return `${out.slice(0, 500)}...`;
  }
  return out;
}

export function relativizePath(filePath: string | undefined, cwd: string): string | undefined {
  if (!filePath) return undefined;
  const resolved = path.resolve(cwd, filePath);
  const rel = path.relative(cwd, resolved).replace(/\\/g, '/');
  if (rel.startsWith('..') || path.isAbsolute(filePath)) {
    return path.basename(filePath);
  }
  return rel;
}

function formatAnnotationMessage(finding: Finding): string {
  return sanitizeFindingText(`${finding.rule}: ${finding.message}`);
}

/** Emits GitHub Actions workflow commands on stdout (read-only, no secrets). */
export function emitAnnotations(findings: ReadonlyArray<Finding>): void {
  for (const finding of findings) {
    const message = formatAnnotationMessage(finding);
    if (finding.file) {
      const line = finding.line ?? 1;
      const file = finding.file.replace(/\\/g, '/');
      process.stdout.write(`::${finding.severity} file=${file},line=${line}::${message}\n`);
    } else {
      process.stdout.write(`::${finding.severity}::${message}\n`);
    }
  }
}

export function renderPrCommentBody(
  summary: ReadonlyArray<GateSummary>,
  findings: ReadonlyArray<Finding>,
): string {
  const lines: string[] = [
    DARE_REPORT_MARKER,
    '## DARE Gate Report',
    '',
    '| Gate | Verdict | Findings |',
    '|------|---------|----------|',
  ];

  for (const row of summary) {
    lines.push(`| ${row.gate} | ${row.verdict} | ${row.count} |`);
  }

  if (findings.length === 0) {
    lines.push('', '_No findings._');
  } else {
    lines.push('', '### Findings', '');
    for (const finding of findings) {
      const loc =
        finding.file !== undefined
          ? ` \`${finding.file}${finding.line ? `:${finding.line}` : ''}\``
          : '';
      const msg = sanitizeFindingText(finding.message);
      lines.push(`- **${finding.severity.toUpperCase()}** [\`${finding.rule}\`]${loc}: ${msg}`);
    }
  }

  lines.push('', '_Updated by `dare` CI integration._');
  return lines.join('\n');
}

export type FetchFn = typeof fetch;

export async function upsertPrComment(
  input: PrCommentInput,
  fetchImpl: FetchFn = fetch,
): Promise<void> {
  const [owner, repoName] = input.repo.split('/');
  if (!owner || !repoName) {
    throw new Error('Invalid GITHUB_REPOSITORY — expected owner/repo');
  }

  const body = renderPrCommentBody(input.summary, input.findings);
  const headers = {
    Authorization: `Bearer ${input.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  const listUrl = `https://api.github.com/repos/${owner}/${repoName}/issues/${input.prNumber}/comments`;
  const listRes = await fetchImpl(listUrl, { headers });
  if (!listRes.ok) {
    throw new Error(`GitHub API list comments failed: HTTP ${listRes.status}`);
  }

  const comments = (await listRes.json()) as Array<{ id: number; body?: string }>;
  const existing = comments.find((c) => typeof c.body === 'string' && c.body.includes(DARE_REPORT_MARKER));

  if (existing) {
    const patchUrl = `https://api.github.com/repos/${owner}/${repoName}/issues/comments/${existing.id}`;
    const patchRes = await fetchImpl(patchUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ body }),
    });
    if (!patchRes.ok) {
      throw new Error(`GitHub API update comment failed: HTTP ${patchRes.status}`);
    }
    return;
  }

  const createRes = await fetchImpl(listUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body }),
  });
  if (!createRes.ok) {
    throw new Error(`GitHub API create comment failed: HTTP ${createRes.status}`);
  }
}

export function readPrNumberFromEvent(eventPath: string): number | null {
  try {
    const raw = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as {
      pull_request?: { number?: number };
      issue?: { number?: number };
    };
    const n = raw.pull_request?.number ?? raw.issue?.number;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export interface GitHubPrContext {
  readonly token: string;
  readonly repo: string;
  readonly prNumber: number;
}

export function readGitHubPrContext(env: NodeJS.ProcessEnv = process.env): GitHubPrContext | null {
  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPOSITORY;
  if (!token || !repo) return null;

  let prNumber: number | null = null;
  if (env.GITHUB_EVENT_PATH) {
    prNumber = readPrNumberFromEvent(env.GITHUB_EVENT_PATH);
  }
  if (prNumber === null && env.GITHUB_REF?.startsWith('refs/pull/')) {
    const match = /^refs\/pull\/(\d+)\//.exec(env.GITHUB_REF);
    if (match) prNumber = parseInt(match[1], 10);
  }

  if (prNumber === null) return null;
  return { token, repo, prNumber };
}
