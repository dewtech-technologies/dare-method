import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

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
        title: 'Setup project structure',
        deps: [],
        complexity: 'LOW',
        prompt:
          'Setup the base project structure following DARE/BLUEPRINT.md.\n' +
          'Create directories, package files, and base dependencies. No business logic yet.\n' +
          'Validation gate: project builds without errors.',
      },
      {
        id: 'task-002',
        title: 'Implement database schema',
        deps: [],
        complexity: 'MED',
        prompt:
          'Implement the database schema as defined in DARE/BLUEPRINT.md.\n' +
          'Create migrations, models, and seed data with appropriate indexes and FKs.\n' +
          'Validation gate: migrations run cleanly forward and backward.',
      },
      {
        id: 'task-003',
        title: 'Implement core API endpoints',
        deps: ['task-001', 'task-002'],
        complexity: 'HIGH',
        prompt:
          'Implement the core API endpoints as defined in DARE/BLUEPRINT.md.\n' +
          'Follow the API contracts, validate inputs, and ensure proper error handling.\n' +
          'Validation gate: all endpoint integration tests pass.',
      },
      {
        id: 'task-004',
        title: 'Implement authentication',
        deps: ['task-001', 'task-002'],
        complexity: 'HIGH',
        prompt:
          'Implement authentication and authorization following security best practices.\n' +
          'Use bcrypt for password hashing, JWT with refresh tokens, and rate limiting.\n' +
          'Validation gate: security tests pass (no plaintext passwords, tokens expire).',
      },
      {
        id: 'task-005',
        title: 'Write tests',
        deps: ['task-003', 'task-004'],
        complexity: 'MED',
        prompt:
          'Write unit and integration tests for all implemented features.\n' +
          'Aim for >=80% code coverage. Include security tests for auth and validation.\n' +
          'Validation gate: full test suite passes; coverage threshold met.',
      },
    ];

    const blueprintPath = path.join(dareDir, 'BLUEPRINT.md');
    const dagPath = path.join(dareDir, 'dare-dag.yaml');
    const tasksPath = path.join(dareDir, 'TASKS.md');

    await writeIfMissing(blueprintPath, renderBlueprint(generatedAt), options.force);
    await writeIfMissing(dagPath, renderDag(sampleTasks, generatedAt), options.force);
    await writeIfMissing(tasksPath, renderTasksMd(sampleTasks, generatedAt), options.force);

    for (const t of sampleTasks) {
      const specPath = path.join(executionDir, `${t.id}.md`);
      await writeIfMissing(specPath, renderTaskSpec(t), options.force);
    }

    console.log(chalk.green('✅ Files scaffolded (existing files preserved):'));
    console.log(`   ${chalk.cyan('DARE/BLUEPRINT.md')}             - Architecture specification`);
    console.log(`   ${chalk.cyan('DARE/dare-dag.yaml')}            - Task dependency graph (canonical schema)`);
    console.log(`   ${chalk.cyan('DARE/TASKS.md')}                 - Human-readable task table`);
    console.log(`   ${chalk.cyan('DARE/EXECUTION/task-*.md')}      - One spec per task (${sampleTasks.length} files)\n`);
    console.log(chalk.gray('Tip: real content is filled in by the AI agent (use /dare-blueprint, /generate-blueprint or the dare-blueprint skill).'));
    console.log(chalk.cyan('\nNext: dare execute --parallel\n'));
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
