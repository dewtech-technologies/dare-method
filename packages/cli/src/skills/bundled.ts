import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function bundledSkillsRoot(): string {
  return path.join(packageRoot(), 'skills');
}

export function bundledSkillPath(name: string): string {
  return path.join(bundledSkillsRoot(), name);
}

export function hasBundledSkill(name: string): boolean {
  return fs.pathExistsSync(path.join(bundledSkillPath(name), 'skill.yml'));
}

export function installBundledSkill(name: string, targetProjectPath: string): boolean {
  const srcDir = bundledSkillPath(name);
  if (!fs.pathExistsSync(path.join(srcDir, 'skill.yml'))) return false;

  const destDir = path.join(targetProjectPath, 'packages', 'skills', name);
  fs.ensureDirSync(destDir);
  fs.copySync(srcDir, destDir, {
    overwrite: true,
    filter: (src) => !shouldSkipBundledPath(src, srcDir),
  });
  return true;
}

function shouldSkipBundledPath(src: string, root: string): boolean {
  const rel = path.relative(root, src).replace(/\\/g, '/');
  if (!rel) return false;
  return rel.split('/').some((part) => part === 'node_modules' || part === 'dist' || part === '.git');
}
