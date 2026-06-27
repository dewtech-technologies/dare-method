// SPDX-License-Identifier: MIT
//
// MVC structure detection — Rails (Gemfile) and Laravel (composer.json) are
// full-stack MVC frameworks, so `dare discover` classifies them as 'mvc',
// not 'backend'.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { detectProject } from '../utils/project-detector.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'detect-mvc-'));
});
afterEach(async () => {
  await fs.remove(dir);
});

describe('detectProject — MVC frameworks', () => {
  it("classifies a Rails project (Gemfile with gem 'rails') as mvc + ruby-rails-8", async () => {
    await fs.writeFile(
      path.join(dir, 'Gemfile'),
      `source "https://rubygems.org"\ngem "rails", "~> 8.0"\ngem "puma"\n`,
    );

    const detected = await detectProject(dir);

    expect(detected.structure).toBe('mvc');
    expect(detected.backend).toBe('ruby-rails-8');
    expect(detected.confidence).toBe('high');
    expect(detected.evidence.some((e) => /Rails MVC project/.test(e))).toBe(true);
  });

  it('classifies a Laravel project (laravel/framework in composer.json) as mvc + php-laravel', async () => {
    await fs.writeJSON(path.join(dir, 'composer.json'), {
      require: { 'laravel/framework': '^11.0' },
    });

    const detected = await detectProject(dir);

    expect(detected.structure).toBe('mvc');
    expect(detected.backend).toBe('php-laravel');
    expect(detected.evidence.some((e) => /MVC project/.test(e))).toBe(true);
  });

  it('keeps a plain Gemfile (no rails gem) as backend, not mvc', async () => {
    await fs.writeFile(
      path.join(dir, 'Gemfile'),
      `source "https://rubygems.org"\ngem "sinatra"\n`,
    );

    const detected = await detectProject(dir);

    expect(detected.structure).toBe('backend');
    expect(detected.backend).toBe('ruby-rails-8');
  });
});
