/**
 * dare-ax — validator tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DareAxValidator } from '../validator.js';

/** A complete, valid llms.txt for use as baseline in tests */
const VALID_LLMS_TXT = `# llms.txt — Project Context for AI Agents

## Project Overview
This is a test API project that provides user management endpoints.
It follows the DARE Method layered architecture pattern.

## Tech Stack
- Language: TypeScript
- Framework: NestJS
- Database: Postgres
- Key Dependencies: nestjs, typeorm, pg, class-validator, rxjs

## Architecture
The project uses a 4-layer architecture: Handlers (controllers), Services,
Repositories, and Models. Each layer has a single responsibility. Handlers
never call Repositories directly — always through Services.

## Directory Structure
\`\`\`
src/
├── handlers/
├── services/
├── repositories/
└── models/
\`\`\`

## Key Endpoints
- GET /health — Health check
- GET /api/v1/users — List users
- POST /api/v1/users — Create user

## Important Files
- config.json — Application configuration
- docker-compose.yml — Local dev environment

## Getting Started
\`\`\`bash
make dev
\`\`\`

## Rate Limits
- Public endpoints: 100 req/min per IP
- Auth endpoints: 10 req/min per IP

## Security Notes
- All input validated in handlers
- SQL via parameterized queries
- See .env.example

## For AI Agents
- OpenAPI: GET /openapi.json
- CLI: ./project-cli --help, ./project-cli --json
- Architecture: Handler → Service → Repository → Model
`;

describe('DareAxValidator', () => {
  let tmpDir: string;
  let validator: DareAxValidator;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-ax-validator-test-'));
    validator = new DareAxValidator();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── File-based validate() ───────────────────────────────────────────────

  describe('validate(path)', () => {
    it('returns valid=false when file does not exist', () => {
      const result = validator.validate(path.join(tmpDir, 'non-existent.txt'));

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'E_FILE_NOT_FOUND')).toBe(true);
    });

    it('returns valid=false for empty file', () => {
      const filePath = path.join(tmpDir, 'llms.txt');
      fs.writeFileSync(filePath, '', 'utf-8');

      const result = validator.validate(filePath);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'E_EMPTY_FILE')).toBe(true);
    });

    it('returns valid=true for a complete llms.txt', () => {
      const filePath = path.join(tmpDir, 'llms.txt');
      fs.writeFileSync(filePath, VALID_LLMS_TXT, 'utf-8');

      const result = validator.validate(filePath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error for missing "Project Overview" section', () => {
      const content = VALID_LLMS_TXT.replace('## Project Overview', '## Old Overview');
      const filePath = path.join(tmpDir, 'llms.txt');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validator.validate(filePath);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Project Overview'))).toBe(true);
    });

    it('returns error for missing "Tech Stack" section', () => {
      const content = VALID_LLMS_TXT.replace('## Tech Stack', '## Stack');
      const filePath = path.join(tmpDir, 'llms.txt');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validator.validate(filePath);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Tech Stack'))).toBe(true);
    });

    it('returns error for missing "Architecture" section', () => {
      const content = VALID_LLMS_TXT.replace('## Architecture', '## Arch');
      const filePath = path.join(tmpDir, 'llms.txt');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validator.validate(filePath);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Architecture'))).toBe(true);
    });

    it('returns error for missing "Key Endpoints" section', () => {
      const content = VALID_LLMS_TXT.replace('## Key Endpoints', '## Endpoints');
      const filePath = path.join(tmpDir, 'llms.txt');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validator.validate(filePath);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Key Endpoints'))).toBe(true);
    });

    it('returns error for missing "For AI Agents" section', () => {
      const content = VALID_LLMS_TXT.replace('## For AI Agents', '## For Agents');
      const filePath = path.join(tmpDir, 'llms.txt');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validator.validate(filePath);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('For AI Agents'))).toBe(true);
    });

    it('returns error for all 5 required sections missing', () => {
      const filePath = path.join(tmpDir, 'llms.txt');
      fs.writeFileSync(filePath, '# Just a comment\n\nNo sections here at all.\n', 'utf-8');

      const result = validator.validate(filePath);

      expect(result.valid).toBe(false);
      // Should have errors for all 5 required sections
      const missingErrors = result.errors.filter((e) => e.code === 'E_MISSING_SECTION');
      expect(missingErrors).toHaveLength(5);
    });

    it('returns error when AWS key detected', () => {
      const content = VALID_LLMS_TXT + '\n' + 'AKIA' + 'IOSFODNN7EXAMPLE' + '\n';
      const filePath = path.join(tmpDir, 'llms.txt');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validator.validate(filePath);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'E_SECRET_DETECTED')).toBe(true);
      expect(result.errors.some((e) => e.message.includes('AWS'))).toBe(true);
    });

    it('returns error when Stripe secret key detected', () => {
      const content =
        VALID_LLMS_TXT + '\nstripe_key=' + 'sk_li' + 've_abcdefghijklmnopqrstuvwx\n';
      const filePath = path.join(tmpDir, 'llms.txt');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validator.validate(filePath);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'E_SECRET_DETECTED')).toBe(true);
    });

    it('returns error when password assignment detected', () => {
      const content = VALID_LLMS_TXT + '\ndatabase_password="s3cr3tP4ss"\n';
      const filePath = path.join(tmpDir, 'llms.txt');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validator.validate(filePath);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'E_SECRET_DETECTED')).toBe(true);
    });

    it('returns warning for missing recommended sections', () => {
      // Remove recommended sections but keep required
      const contentWithoutRecommended = `# llms.txt

## Project Overview
This is a test project with only required sections.

## Tech Stack
- Language: TypeScript
- Framework: NestJS
- Database: Postgres

## Architecture
3-layer architecture with handlers, services, and repositories.

## Key Endpoints
- GET /health — Health check
- GET /api/v1/users — List users

## For AI Agents
- OpenAPI: GET /openapi.json
- CLI: ./app --json
`;
      const filePath = path.join(tmpDir, 'llms.txt');
      fs.writeFileSync(filePath, contentWithoutRecommended, 'utf-8');

      const result = validator.validate(filePath);

      expect(result.valid).toBe(true); // warnings don't make it invalid
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.warnings.some((w) => w.code === 'W_MISSING_RECOMMENDED_SECTION')
      ).toBe(true);
    });

    it('warns when "For AI Agents" section does not mention OpenAPI', () => {
      const content = VALID_LLMS_TXT.replace(
        '- OpenAPI: GET /openapi.json\n- CLI: ./project-cli --help, ./project-cli --json',
        '- CLI: ./project-cli --json'
      );
      const filePath = path.join(tmpDir, 'llms.txt');
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = validator.validate(filePath);

      expect(
        result.warnings.some((w) => w.code === 'W_MISSING_OPENAPI_REFERENCE')
      ).toBe(true);
    });
  });

  // ── Content-based validateContent() ────────────────────────────────────

  describe('validateContent(content)', () => {
    it('validates string content without writing to disk', () => {
      const result = validator.validateContent(VALID_LLMS_TXT);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error for empty string', () => {
      const result = validator.validateContent('');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'E_EMPTY_FILE')).toBe(true);
    });

    it('returns error for OpenAI API key', () => {
      const content =
        VALID_LLMS_TXT + '\nopenai_key=sk-' + 'a'.repeat(48) + '\n';
      const result = validator.validateContent(content);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'E_SECRET_DETECTED')).toBe(true);
    });

    it('ignores Jinja2 template placeholders as secrets', () => {
      // Template variables like {{ api_key }} should not be flagged as secrets
      const content = VALID_LLMS_TXT + '\n- API key: {{ api_key }}\n';
      const result = validator.validateContent(content);

      // Template placeholders are not actual secrets
      expect(result.errors.filter((e) => e.code === 'E_SECRET_DETECTED')).toHaveLength(0);
    });
  });
});
