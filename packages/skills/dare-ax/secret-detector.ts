/**
 * dare-ax — secret-detector
 * Detects API keys, tokens, passwords, and other secrets in text content.
 * License: MIT
 */

export interface SecretCheckResult {
  found: boolean;
  pattern?: string;
  line?: number;
}

/** Patterns that indicate the presence of a secret. */
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // Generic high-entropy secrets
  { name: 'Generic API Key assignment', pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[A-Za-z0-9\-_]{16,}["']?/i },
  { name: 'Generic Secret assignment', pattern: /(?:secret|access[_-]?secret|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9\-_]{16,}["']?/i },
  { name: 'Generic Token assignment', pattern: /(?:token|access[_-]?token|auth[_-]?token|bearer)\s*[:=]\s*["']?[A-Za-z0-9\-_.]{20,}["']?/i },
  { name: 'Password assignment', pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{4,}["']/i },

  // AWS
  { name: 'AWS Access Key ID', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'AWS Secret Access Key', pattern: /[Aa][Ww][Ss][_\-\s]?[Ss][Ee][Cc][Rr][Ee][Tt]\s*[:=]\s*["']?[A-Za-z0-9+/]{40}["']?/ },

  // GitHub
  { name: 'GitHub Token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
  { name: 'GitHub Fine-grained Token', pattern: /github_pat_[A-Za-z0-9_]{82}/ },

  // Stripe
  { name: 'Stripe Secret Key', pattern: /sk_(live|test)_[A-Za-z0-9]{24,}/ },

  // Google
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z_\-]{35}/ },
  { name: 'Google OAuth Token', pattern: /ya29\.[0-9A-Za-z_\-]{68,}/ },

  // Anthropic
  { name: 'Anthropic API Key', pattern: /sk-ant-[A-Za-z0-9\-]{40,}/ },

  // OpenAI
  { name: 'OpenAI API Key', pattern: /sk-[A-Za-z0-9]{48}/ },

  // Slack
  { name: 'Slack Bot Token', pattern: /xoxb-[0-9]{11}-[0-9]{11}-[0-9A-Za-z]{24}/ },
  { name: 'Slack User Token', pattern: /xoxp-[0-9]{11}-[0-9]{11}-[0-9A-Za-z]{24}/ },

  // Generic PEM private key header
  { name: 'Private Key', pattern: /-----BEGIN\s+(RSA|EC|OPENSSH|DSA)?\s*PRIVATE KEY-----/ },

  // Database connection strings with credentials
  {
    name: 'Database URL with credentials',
    pattern: /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/i,
  },
];

/**
 * Checks a text string for secrets.
 * Returns found=true and the pattern name if any secret is detected.
 */
export function containsSecrets(content: string): SecretCheckResult {
  const lines = content.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    // Skip comments and template placeholders
    if (line.trim().startsWith('#') && !line.includes('=') && !line.includes(':')) {
      continue;
    }

    // Skip Jinja2 template placeholders like {{ variable }}
    if (/\{\{.*?\}\}/.test(line)) {
      continue;
    }

    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        return {
          found: true,
          pattern: name,
          line: lineIndex + 1,
        };
      }
    }
  }

  return { found: false };
}

/**
 * Returns all secret matches found in content, not just the first one.
 * Useful for detailed reporting.
 */
export function findAllSecrets(
  content: string
): Array<{ pattern: string; line: number; lineContent: string }> {
  const results: Array<{ pattern: string; line: number; lineContent: string }> = [];
  const lines = content.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    if (line.trim().startsWith('#') && !line.includes('=') && !line.includes(':')) {
      continue;
    }

    if (/\{\{.*?\}\}/.test(line)) {
      continue;
    }

    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        results.push({
          pattern: name,
          line: lineIndex + 1,
          lineContent: line.trim(),
        });
      }
    }
  }

  return results;
}
