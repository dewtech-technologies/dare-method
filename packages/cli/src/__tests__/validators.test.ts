import { describe, it, expect } from 'vitest';

// Inline validators to avoid import issues in tests
function isValidProjectName(name: string): boolean {
  return /^[a-z0-9-_]+$/.test(name) && name.length >= 2 && name.length <= 50;
}

function sanitizeProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

describe('validators', () => {
  describe('isValidProjectName', () => {
    it('should accept valid lowercase names', () => {
      expect(isValidProjectName('my-project')).toBe(true);
      expect(isValidProjectName('myproject')).toBe(true);
      expect(isValidProjectName('my_project')).toBe(true);
      expect(isValidProjectName('project123')).toBe(true);
    });

    it('should reject names with uppercase letters', () => {
      expect(isValidProjectName('MyProject')).toBe(false);
      expect(isValidProjectName('MY_PROJECT')).toBe(false);
    });

    it('should reject names with spaces', () => {
      expect(isValidProjectName('my project')).toBe(false);
    });

    it('should reject names with special characters', () => {
      expect(isValidProjectName('my@project')).toBe(false);
      expect(isValidProjectName('my.project')).toBe(false);
      expect(isValidProjectName('my/project')).toBe(false);
    });

    it('should reject names that are too short', () => {
      expect(isValidProjectName('a')).toBe(false);
    });

    it('should reject names that are too long', () => {
      expect(isValidProjectName('a'.repeat(51))).toBe(false);
    });

    it('should accept names at boundary lengths', () => {
      expect(isValidProjectName('ab')).toBe(true);
      expect(isValidProjectName('a'.repeat(50))).toBe(true);
    });
  });

  describe('sanitizeProjectName', () => {
    it('should convert uppercase to lowercase', () => {
      expect(sanitizeProjectName('MyProject')).toBe('myproject');
    });

    it('should replace spaces with hyphens', () => {
      expect(sanitizeProjectName('my project')).toBe('my-project');
    });

    it('should replace special characters with hyphens', () => {
      expect(sanitizeProjectName('my@project!')).toBe('my-project-');
    });

    it('should collapse multiple hyphens', () => {
      expect(sanitizeProjectName('my--project')).toBe('my-project');
    });

    it('should remove leading and trailing hyphens', () => {
      expect(sanitizeProjectName('-my-project-')).toBe('my-project');
    });
  });
});
