/**
 * dare-layered-design — generator tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LayeredDesignGenerator } from '../generator.js';

describe('LayeredDesignGenerator', () => {
  let tmpDir: string;
  let generator: LayeredDesignGenerator;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dare-scaffold-test-'));
    generator = new LayeredDesignGenerator();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('scaffold()', () => {
    it('creates all 5 layer directories', () => {
      const result = generator.scaffold(tmpDir);

      const expectedDirs = ['handlers', 'services', 'repositories', 'models', 'presenters'];
      for (const dir of expectedDirs) {
        const fullPath = path.join(tmpDir, 'src', dir);
        expect(fs.existsSync(fullPath), `Expected ${dir} to exist`).toBe(true);
        expect(result.createdDirs).toContain(fullPath);
      }
    });

    it('creates README.md in each layer directory', () => {
      generator.scaffold(tmpDir);

      const layers = ['handlers', 'services', 'repositories', 'models', 'presenters'];
      for (const layer of layers) {
        const readmePath = path.join(tmpDir, 'src', layer, 'README.md');
        expect(fs.existsSync(readmePath), `Expected README.md in ${layer}`).toBe(true);
      }
    });

    it('creates .gitkeep in each layer when withExamples=false', () => {
      generator.scaffold(tmpDir, { withExamples: false });

      const layers = ['handlers', 'services', 'repositories', 'models', 'presenters'];
      for (const layer of layers) {
        const gitkeepPath = path.join(tmpDir, 'src', layer, '.gitkeep');
        expect(fs.existsSync(gitkeepPath), `Expected .gitkeep in ${layer}`).toBe(true);
      }
    });

    it('uses custom srcDir', () => {
      generator.scaffold(tmpDir, { srcDir: 'app' });

      expect(fs.existsSync(path.join(tmpDir, 'app', 'handlers'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'app', 'services'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'src'))).toBe(false);
    });

    it('creates ARCHITECTURE.md in srcDir', () => {
      generator.scaffold(tmpDir);

      const archPath = path.join(tmpDir, 'src', 'ARCHITECTURE.md');
      expect(fs.existsSync(archPath)).toBe(true);
      const content = fs.readFileSync(archPath, 'utf-8');
      expect(content).toContain('Handler → Service → Repository → Model');
    });

    it('creates TypeScript example files when withExamples=true', () => {
      generator.scaffold(tmpDir, { withExamples: true, exampleEntity: 'user', language: 'typescript' });

      expect(fs.existsSync(path.join(tmpDir, 'src', 'handlers', 'user_handler.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'src', 'services', 'create_user_service.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'src', 'repositories', 'user_repository.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'src', 'models', 'user.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'src', 'presenters', 'user_presenter.ts'))).toBe(true);
    });

    it('creates Ruby example files when withExamples=true and language=ruby', () => {
      generator.scaffold(tmpDir, { withExamples: true, exampleEntity: 'user', language: 'ruby', srcDir: 'app' });

      expect(fs.existsSync(path.join(tmpDir, 'app', 'handlers', 'user_handler.rb'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'app', 'services', 'create_user_service.rb'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'app', 'repositories', 'user_repository.rb'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'app', 'models', 'user.rb'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'app', 'presenters', 'user_presenter.rb'))).toBe(true);
    });

    it('TypeScript handler example does not import Repository', () => {
      generator.scaffold(tmpDir, { withExamples: true, exampleEntity: 'user', language: 'typescript' });

      const content = fs.readFileSync(
        path.join(tmpDir, 'src', 'handlers', 'user_handler.ts'),
        'utf-8'
      );
      expect(content).not.toContain('import.*Repository');
      expect(content).toContain('Service');
    });

    it('TypeScript service example mentions DI (no new Repository)', () => {
      generator.scaffold(tmpDir, { withExamples: true, exampleEntity: 'product', language: 'typescript' });

      const content = fs.readFileSync(
        path.join(tmpDir, 'src', 'services', 'create_product_service.ts'),
        'utf-8'
      );
      // Should receive repository via constructor, not instantiate it
      expect(content).toContain('constructor');
      expect(content).not.toMatch(/new\s+\w+Repository\s*\(/);
    });

    it('TypeScript repository example includes InMemory implementation', () => {
      generator.scaffold(tmpDir, { withExamples: true, exampleEntity: 'user', language: 'typescript' });

      const content = fs.readFileSync(
        path.join(tmpDir, 'src', 'repositories', 'user_repository.ts'),
        'utf-8'
      );
      expect(content).toContain('InMemory');
      expect(content).toContain('interface UserRepository');
    });

    it('does not overwrite existing files on second scaffold', () => {
      generator.scaffold(tmpDir);

      // Manually modify a README
      const readmePath = path.join(tmpDir, 'src', 'handlers', 'README.md');
      fs.writeFileSync(readmePath, '# Custom README\n', 'utf-8');

      // Scaffold again
      generator.scaffold(tmpDir);

      // Custom README should be preserved
      const content = fs.readFileSync(readmePath, 'utf-8');
      expect(content).toContain('Custom README');
    });

    it('returns createdFiles list with README.md paths', () => {
      const result = generator.scaffold(tmpDir);

      expect(result.createdFiles.some((f) => f.endsWith('README.md'))).toBe(true);
      expect(result.createdFiles.filter((f) => f.endsWith('README.md'))).toHaveLength(5);
    });

    it('handles multi-word entity names with snake_case convention', () => {
      generator.scaffold(tmpDir, { withExamples: true, exampleEntity: 'user-profile', language: 'typescript' });

      expect(fs.existsSync(path.join(tmpDir, 'src', 'handlers', 'user_profile_handler.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'src', 'models', 'user_profile.ts'))).toBe(true);
    });
  });
});
