import fs from 'fs-extra';
import path from 'path';
import { generateCursorRules, generateAntigravityRules, generateSharedConfig } from './templates.js';

export interface ProjectConfig {
  name: string;
  structure: 'monorepo' | 'backend' | 'frontend';
  backend?: string;
  frontend?: string;
  ide: 'cursor' | 'antigravity' | 'hybrid';
  graphrag: 'sqlite' | 'json' | 'neo4j';
  mcp: boolean;
  outputDir: string;
}

export async function generateProjectStructure(config: ProjectConfig): Promise<void> {
  const { outputDir, name, structure, backend, frontend, ide, graphrag, mcp } = config;

  await fs.ensureDir(outputDir);

  // Create DARE directory
  await fs.ensureDir(path.join(outputDir, 'DARE'));
  await fs.ensureDir(path.join(outputDir, 'DARE', 'EXECUTION'));

  // Write dare.config.json
  await fs.writeJSON(
    path.join(outputDir, 'dare.config.json'),
    { name, structure, backend, frontend, ide, graphrag, mcp, version: '0.1.0' },
    { spaces: 2 }
  );

  // Write .gitignore
  await fs.writeFile(
    path.join(outputDir, '.gitignore'),
    `node_modules/\ndist/\nbuild/\n*.db\n*.db-shm\n*.db-wal\n.env\n.env.local\n.dare/\nlogs/\n*.log\n`
  );

  // Write .cursorrules (global)
  if (ide === 'cursor' || ide === 'hybrid') {
    await fs.writeFile(
      path.join(outputDir, '.cursorrules'),
      generateCursorRules({ backend, frontend, graphrag, mcp })
    );

    await fs.ensureDir(path.join(outputDir, '.cursor', 'rules'));
    await fs.ensureDir(path.join(outputDir, '.cursor', 'commands'));

    // Write stack-specific skills
    if (backend) {
      await fs.writeFile(
        path.join(outputDir, '.cursor', 'rules', `skill-${backend}.mdc`),
        generateStackSkill(backend)
      );
    }
    if (frontend) {
      await fs.writeFile(
        path.join(outputDir, '.cursor', 'rules', `skill-${frontend}.mdc`),
        generateStackSkill(frontend)
      );
    }

    // Write DARE commands for Cursor
    await fs.writeFile(
      path.join(outputDir, '.cursor', 'commands', 'generate-design.md'),
      `# Generate Design\nGenerate a DESIGN.md for the described feature.\n`
    );
    await fs.writeFile(
      path.join(outputDir, '.cursor', 'commands', 'generate-blueprint.md'),
      `# Generate Blueprint\nGenerate a BLUEPRINT.md from the DESIGN.md.\n`
    );
    await fs.writeFile(
      path.join(outputDir, '.cursor', 'commands', 'execute-task.md'),
      `# Execute Task\nExecute the specified task from TASKS.md.\n`
    );
  }

  // Write .antigravityrules
  if (ide === 'antigravity' || ide === 'hybrid') {
    await fs.writeFile(
      path.join(outputDir, '.antigravityrules'),
      generateAntigravityRules({ backend, frontend, graphrag, mcp })
    );

    await fs.ensureDir(path.join(outputDir, '.agents', 'skills', 'dare-design'));
    await fs.ensureDir(path.join(outputDir, '.agents', 'skills', 'dare-blueprint'));
    await fs.ensureDir(path.join(outputDir, '.agents', 'skills', 'dare-execute'));
    await fs.ensureDir(path.join(outputDir, '.agents', 'skills', 'dare-tasks'));
    await fs.ensureDir(path.join(outputDir, '.agents', 'workflows'));
  }

  // Write shared config
  await fs.writeFile(
    path.join(outputDir, 'DARE', 'README.md'),
    generateSharedConfig(name)
  );

  // Create backend structure
  if (structure !== 'frontend' && backend) {
    const backendDir = structure === 'monorepo' ? path.join(outputDir, 'backend') : outputDir;
    await generateBackendTemplate(backendDir, backend);
  }

  // Create frontend structure
  if (structure !== 'backend' && frontend) {
    const frontendDir = structure === 'monorepo' ? path.join(outputDir, 'frontend') : outputDir;
    await generateFrontendTemplate(frontendDir, frontend);
  }
}

async function generateBackendTemplate(dir: string, stack: string): Promise<void> {
  await fs.ensureDir(path.join(dir, 'src'));

  switch (stack) {
    case 'rust-axum':
      await fs.writeFile(path.join(dir, 'Cargo.toml'), `[package]\nname = "api"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\naxum = "0.7"\ntokio = { version = "1", features = ["full"] }\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\n`);
      await fs.writeFile(path.join(dir, 'src', 'main.rs'), `use axum::{routing::get, Router};\n\n#[tokio::main]\nasync fn main() {\n    let app = Router::new().route("/health", get(health));\n    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();\n    axum::serve(listener, app).await.unwrap();\n}\n\nasync fn health() -> &'static str { "OK" }\n`);
      await fs.writeFile(path.join(dir, '.cursorrules'), `# Rust/Axum Rules\n- Use Rust idioms and patterns\n- Prefer async/await with Tokio\n- Use Axum for HTTP routing\n- Handle errors with thiserror/anyhow\n- Run clippy before committing\n`);
      break;
    case 'node-nestjs':
      await fs.writeJSON(path.join(dir, 'package.json'), { name: 'api', version: '0.1.0', scripts: { start: 'nest start', build: 'nest build', test: 'jest' }, dependencies: { '@nestjs/core': '^10.0.0', '@nestjs/common': '^10.0.0', '@nestjs/platform-express': '^10.0.0' } }, { spaces: 2 });
      await fs.writeFile(path.join(dir, 'src', 'main.ts'), `import { NestFactory } from '@nestjs/core';\nimport { AppModule } from './app.module';\nasync function bootstrap() {\n  const app = await NestFactory.create(AppModule);\n  await app.listen(3000);\n}\nbootstrap();\n`);
      await fs.writeFile(path.join(dir, '.cursorrules'), `# Node.js/NestJS Rules\n- Use NestJS decorators and DI\n- Define DTOs with class-validator\n- Use TypeORM or Prisma for DB\n- Write Jest tests for all services\n`);
      break;
    case 'python-fastapi':
      await fs.writeFile(path.join(dir, 'main.py'), `from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/health")\ndef health():\n    return {"status": "ok"}\n`);
      await fs.writeFile(path.join(dir, 'requirements.txt'), `fastapi>=0.100.0\nuvicorn>=0.23.0\npydantic>=2.0.0\n`);
      await fs.writeFile(path.join(dir, '.cursorrules'), `# Python/FastAPI Rules\n- Use Pydantic v2 for validation\n- Type all functions with PEP 484\n- Use async/await for IO operations\n- Follow PEP 8 style guide\n`);
      break;
    case 'php-laravel':
      await fs.writeJSON(path.join(dir, 'composer.json'), { name: 'app/api', require: { php: '^8.2', 'laravel/framework': '^11.0' }, scripts: { 'post-install-cmd': ['@php artisan key:generate'] } }, { spaces: 2 });
      await fs.writeFile(path.join(dir, '.cursorrules'), `# PHP/Laravel Rules\n- Follow PSR-12 coding standards\n- Use FormRequests for validation\n- Use API Resources for responses\n- Write PHPUnit tests\n- Use Eloquent ORM\n`);
      break;
  }
}

async function generateFrontendTemplate(dir: string, stack: string): Promise<void> {
  await fs.ensureDir(path.join(dir, 'src', 'components'));

  switch (stack) {
    case 'react':
      await fs.writeJSON(path.join(dir, 'package.json'), { name: 'frontend', version: '0.1.0', scripts: { dev: 'vite', build: 'vite build', test: 'vitest' }, dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' }, devDependencies: { vite: '^5.0.0', '@vitejs/plugin-react': '^4.0.0', typescript: '^5.0.0' } }, { spaces: 2 });
      await fs.writeFile(path.join(dir, 'src', 'App.tsx'), `import React from 'react';\n\nexport default function App() {\n  return <div><h1>DARE Framework - React App</h1></div>;\n}\n`);
      await fs.writeFile(path.join(dir, '.cursorrules'), `# React Rules\n- Use functional components with hooks\n- Use TypeScript for all components\n- Prefer React Query for server state\n- Use Zustand or Context for client state\n- Write Vitest tests\n`);
      break;
    case 'vue':
      await fs.writeJSON(path.join(dir, 'package.json'), { name: 'frontend', version: '0.1.0', scripts: { dev: 'vite', build: 'vite build', test: 'vitest' }, dependencies: { vue: '^3.0.0' }, devDependencies: { vite: '^5.0.0', '@vitejs/plugin-vue': '^5.0.0', typescript: '^5.0.0' } }, { spaces: 2 });
      await fs.writeFile(path.join(dir, 'src', 'App.vue'), `<template>\n  <div><h1>DARE Framework - Vue App</h1></div>\n</template>\n\n<script setup lang="ts">\n// Composition API\n</script>\n`);
      await fs.writeFile(path.join(dir, '.cursorrules'), `# Vue Rules\n- Use Composition API with <script setup>\n- Use TypeScript for all components\n- Use Pinia for state management\n- Use Vue Router for navigation\n- Write Vitest tests\n`);
      break;
  }
}

function generateStackSkill(stack: string): string {
  const skills: Record<string, string> = {
    'rust-axum': `---\ndescription: Rust/Axum API development skill\n---\n# Rust/Axum Skill\n- Use Axum for HTTP routing\n- Use Tokio for async runtime\n- Use SQLx for database\n- Run clippy and cargo test\n`,
    'node-nestjs': `---\ndescription: Node.js/NestJS development skill\n---\n# NestJS Skill\n- Use NestJS modules and DI\n- Use DTOs with class-validator\n- Write Jest tests\n`,
    'python-fastapi': `---\ndescription: Python/FastAPI development skill\n---\n# FastAPI Skill\n- Use Pydantic for validation\n- Use async endpoints\n- Write pytest tests\n`,
    'php-laravel': `---\ndescription: PHP/Laravel development skill\n---\n# Laravel Skill\n- Use FormRequests\n- Use API Resources\n- Write PHPUnit tests\n`,
    react: `---\ndescription: React development skill\n---\n# React Skill\n- Use functional components\n- Use TypeScript\n- Use React Query\n- Write Vitest tests\n`,
    vue: `---\ndescription: Vue 3 development skill\n---\n# Vue Skill\n- Use Composition API\n- Use Pinia\n- Write Vitest tests\n`,
  };
  return skills[stack] || `---\ndescription: ${stack} skill\n---\n# ${stack} Skill\n`;
}
