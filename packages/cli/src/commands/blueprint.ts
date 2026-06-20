import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { renderDagMermaid } from './dag.js';
import { convertYamlToDag } from '../utils/dag-converter.js';

/**
 * `dare blueprint` — gera o esqueleto dos 4 artefatos da fase de Architect:
 *
 *   DARE/BLUEPRINT.md
 *   DARE/TASKS.md
 *   DARE/dare-dag.yaml
 *   DARE/EXECUTION/task-<id>.md (uma por task)
 *
 * O preenchimento real é responsabilidade do agente IA (via `/dare-blueprint`,
 * `/generate-blueprint` ou skill `dare-blueprint`). Este comando apenas
 * inicializa a estrutura com placeholders consistentes — alinhada com o
 * schema canônico definido em `skill-dag-runner` (com `limits`, `models` per
 * runner e `spec_file`). Arquivos já existentes são preservados.
 */
export const blueprintCommand = new Command('blueprint')
  .description('Scaffold BLUEPRINT.md, dare-dag.yaml, TASKS.md and EXECUTION/task-*.md from DESIGN.md')
  .argument('[design-file]', 'Path to DESIGN.md', 'DARE/DESIGN.md')
  .option('-f, --force', 'Overwrite existing files', false)
  .action(async (designFile: string, options: { force: boolean }) => {
    console.log(chalk.blue.bold('\n🏗️  DARE Framework - Blueprint Phase\n'));

    const dareDir = path.resolve(process.cwd(), 'DARE');
    const executionDir = path.join(dareDir, 'EXECUTION');
    const designPath = path.resolve(process.cwd(), designFile);

    if (!(await fs.pathExists(designPath))) {
      console.error(chalk.red(`❌ DESIGN.md not found at ${designPath}`));
      console.log(chalk.yellow('Run: dare design "Your project description"'));
      process.exit(1);
    }

    await fs.ensureDir(dareDir);
    await fs.ensureDir(executionDir);

    const generatedAt = new Date().toISOString();
    const sampleTasks: SampleTask[] = [
      {
        id: 'task-001',
        title: 'Containerize app (Dockerfile + docker-compose)',
        deps: [],
        complexity: 'LOW',
        prompt:
          'Prepare the local runtime so subsequent tasks can be validated by the Ralph Loop.\n' +
          'Create a multi-stage Dockerfile for the chosen stack and a docker-compose.yml\n' +
          'wiring the app + database (+ cache, if applicable). Add a /healthz endpoint that\n' +
          '`docker compose up -d` followed by `curl localhost:<port>/healthz` returns 200.\n' +
          'Document the bring-up in README.md.\n' +
          'Validation gate (Ralph Loop): build/test/lint pass on the chosen stack.',
      },
      {
        id: 'task-002',
        title: 'Database schema (migrations)',
        deps: ['task-001'],
        complexity: 'MED',
        prompt:
          'Implement the database schema defined in DARE/BLUEPRINT.md as migrations.\n' +
          'Include indexes, foreign keys, and the corresponding model factories.\n' +
          'Validation gate (Ralph Loop): migrations run forward and tests can spin\n' +
          'a fresh schema.',
      },
      {
        id: 'task-003',
        title: 'Core API endpoints',
        deps: ['task-002'],
        complexity: 'HIGH',
        prompt:
          'Implement the core API endpoints from DARE/BLUEPRINT.md with proper\n' +
          'request validation, error handling, and response shaping.\n' +
          'Validation gate (Ralph Loop): integration tests cover happy + error paths.',
      },
      {
        id: 'task-004',
        title: 'Authentication',
        deps: ['task-002'],
        complexity: 'HIGH',
        prompt:
          'Implement authentication/authorization following security best practices:\n' +
          'bcrypt or argon2, short-lived access tokens with refresh, rate limiting on\n' +
          'login. Tests must include negative cases.\n' +
          'Validation gate (Ralph Loop): security tests pass (no plaintext passwords,\n' +
          'tokens expire, brute force is rate-limited).',
      },
      {
        id: 'task-005',
        title: 'Real test suite (unit + integration)',
        deps: ['task-003', 'task-004'],
        complexity: 'MED',
        prompt:
          'Write real unit and integration tests with assertions — not placeholders.\n' +
          'Cover happy path, validation errors, and security boundaries (e.g. cross-tenant\n' +
          'access). Aim for >=80% coverage on services and controllers.\n' +
          'Validation gate (Ralph Loop): the test gate is the test gate; assertTrue(true)\n' +
          'is forbidden and will be flagged in review.',
      },
    ];

    const blueprintPath = path.join(dareDir, 'BLUEPRINT.md');
    const dagPath = path.join(dareDir, 'dare-dag.yaml');
    const tasksPath = path.join(dareDir, 'TASKS.md');
    const dagVizPath = path.join(dareDir, 'dag-graph.mmd');

    await writeIfMissing(blueprintPath, renderBlueprint(generatedAt), options.force);
    await writeIfMissing(dagPath, renderDag(sampleTasks, generatedAt), options.force);
    await writeIfMissing(tasksPath, renderTasksMd(sampleTasks, generatedAt), options.force);

    for (const t of sampleTasks) {
      const specPath = path.join(executionDir, `${t.id}.md`);
      await writeIfMissing(specPath, renderTaskSpec(t), options.force);
    }

    // Generate the static DAG visualization (Mermaid). This is regenerated
    // on every run because it must reflect whatever is currently in the YAML.
    try {
      const dag = convertYamlToDag(await fs.readFile(dagPath, 'utf-8'));
      await fs.writeFile(dagVizPath, renderDagMermaid(dag));
    } catch (err) {
      console.log(
        chalk.gray(`   (dag-graph.mmd skipped: ${err instanceof Error ? err.message : String(err)})`),
      );
    }

    console.log(chalk.green('✅ Files scaffolded (existing files preserved):'));
    console.log(`   ${chalk.cyan('DARE/BLUEPRINT.md')}             - Architecture specification`);
    console.log(`   ${chalk.cyan('DARE/dare-dag.yaml')}            - Task dependency graph (canonical schema)`);
    console.log(`   ${chalk.cyan('DARE/TASKS.md')}                 - Human-readable task table`);
    console.log(`   ${chalk.cyan('DARE/EXECUTION/task-*.md')}      - One spec per task (${sampleTasks.length} files)`);
    console.log(`   ${chalk.cyan('DARE/dag-graph.mmd')}            - Mermaid visualization of the DAG\n`);
    console.log(chalk.gray('Tip: real content is filled in by the AI agent (use /dare-blueprint, /generate-blueprint or the dare-blueprint skill).'));
    console.log(chalk.gray('Tip: open DARE/dag-graph.mmd in your editor with a Mermaid preview to see the static graph.'));
    console.log(chalk.cyan('\nNext: dare execute --next\n'));
  });

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface SampleTask {
  id: string;
  title: string;
  deps: string[];
  complexity: 'LOW' | 'MED' | 'HIGH';
  prompt: string;
}

async function writeIfMissing(target: string, content: string, force: boolean): Promise<void> {
  if (!force && (await fs.pathExists(target))) {
    console.log(chalk.gray(`   ↷ ${path.relative(process.cwd(), target)} (kept)`));
    return;
  }
  await fs.writeFile(target, content);
}

function renderBlueprint(generatedAt: string): string {
  return `# BLUEPRINT

## Architecture Overview
> Generated from DESIGN.md — fill in with the AI agent (\`/dare-blueprint\` / skill \`dare-blueprint\`).

## Technology Stack
- **Backend:** To be defined
- **Frontend:** To be defined
- **Database:** To be defined
- **Infrastructure:** To be defined

## Modules
### Module 1: Core
- Description
- Endpoints
- Data models

## API Contracts
\`\`\`yaml
openapi: 3.0.0
info:
  title: Project API
  version: 0.1.0
\`\`\`

## Database Schema
\`\`\`sql
-- Tables to be defined
\`\`\`

## Strategy
- **Testing:** unit + integration; coverage target
- **Deploy:** env, infra targets, CI/CD
- **Security:** OWASP Top 10 baseline + stack-specific

---
*Scaffolded by DARE Framework — ${generatedAt}*
`;
}

function renderDag(tasks: SampleTask[], generatedAt: string): string {
  const tasksYaml = tasks
    .map((t) => {
      const depsYaml = t.deps.length === 0 ? '[]' : `[${t.deps.join(', ')}]`;
      const promptLines = t.prompt
        .split('\n')
        .map((line) => `      ${line}`)
        .join('\n');
      return [
        `  - id: ${t.id}`,
        `    title: "${t.title}"`,
        `    depends_on: ${depsYaml}`,
        `    complexity: ${t.complexity}`,
        `    spec_file: EXECUTION/${t.id}.md`,
        `    subtask_prompt: |`,
        promptLines,
      ].join('\n');
    })
    .join('\n\n');

  return `title: "Project - Development Tasks"
version: "1.0.0"
generated: "${generatedAt}"

# Limites alinhados com Cursor SDK DAG runner
limits:
  parent_context_chars: 2000   # snippet de output de cada pai injetado no filho
  task_output_chars: 4000      # cap do output capturado por task
  timeout_seconds: 600         # AbortController por task

# Mapeamento complexity → modelo, por runner
models:
  cursor:      { HIGH: gpt-5.3-codex,     MED: composer-2,       LOW: auto-low }
  claude:      { HIGH: claude-sonnet-4-5, MED: claude-haiku-4,   LOW: claude-haiku-4 }
  antigravity: { HIGH: gemini-2.5-pro,    MED: gemini-2.5-flash, LOW: gemini-2.5-flash }
  codex:       { HIGH: gpt-5.5,           MED: gpt-5.5,          LOW: gpt-5.4-mini }

tasks:
${tasksYaml}
`;
}

function renderTasksMd(tasks: SampleTask[], generatedAt: string): string {
  const rows = tasks
    .map((t) => {
      const deps = t.deps.length === 0 ? '—' : t.deps.join(', ');
      return `| ${t.id} | ${t.title} | ⏳ PENDING | ${deps} | ${t.complexity} |`;
    })
    .join('\n');

  return `# TASKS

## Status Legend
- ⏳ PENDING
- 🔄 RUNNING
- ✅ DONE
- ❌ FAILED
- ⏭️ SKIPPED

## Tasks

| ID | Title | Status | Depends On | Complexity |
|----|-------|--------|------------|------------|
${rows}

## How to execute

Paralelo (recomendado):
\`\`\`bash
dare execute --parallel
\`\`\`

Task única:
\`\`\`bash
dare execute --task task-001
\`\`\`

Resume (apenas PENDING/FAILED):
\`\`\`bash
dare execute --parallel --resume
\`\`\`

---
*Scaffolded by DARE Framework — ${generatedAt}*
`;
}

function renderTaskSpec(t: SampleTask): string {
  const deps = t.deps.length === 0 ? 'None' : t.deps.join(', ');
  return `# ${t.id}: ${t.title}

## Objective
${t.prompt.split('\n')[0]}

## Description
${t.prompt}

## Dependencies
${deps}

## Complexity
${t.complexity}

## Files to create / modify
- _List the concrete files this task touches._

## Validation Gates
- [ ] Build passes
- [ ] Tests pass
- [ ] Lint clean
- [ ] _Stack-specific gate (e.g. \`php artisan test\`, \`pytest\`, \`cargo test\`)_

## Tests
\`\`\`bash
# Stack-specific test command
\`\`\`

## Security
- _OWASP considerations for this task_

## Next task
- _Suggested follow-up_
`;
}
