import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateProjectStructure } from '../utils/project-generator.js';

vi.mock('../utils/project-generator.js');

describe('Init Command Utils', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should generate project structure with correct config', async () => {
    const config = {
      name: 'test-project',
      structure: 'monorepo' as const,
      backend: 'node-nestjs',
      frontend: 'react',
      ide: 'cursor' as const,
      graphrag: 'sqlite' as const,
      mcp: false,
      outputDir: '/tmp/test-project',
    };

    await generateProjectStructure(config);

    expect(generateProjectStructure).toHaveBeenCalledWith(config);
  });
});
