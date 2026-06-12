import path from 'node:path';
import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';
import { resolveDashboardTemplateRoot } from '../dashboard/routes.js';

describe('dashboard front templates', () => {
  const root = resolveDashboardTemplateRoot();

  it('index_html_has_required_panel_selectors', async () => {
    const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
    for (const id of [
      'dag-panel',
      'gates-panel',
      'cost-panel',
      'bestof-panel',
      'guard-panel',
      'drift-panel',
      'empty-hints',
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('/dashboard/assets/app.js');
    expect(html).toContain('/dashboard/assets/style.css');
  });

  it('app_js_fetches_telemetry_api', async () => {
    const js = await fs.readFile(path.join(root, 'app.js'), 'utf8');
    expect(js).toContain("fetch('/api/telemetry')");
    expect(js).toContain('renderDag');
    expect(js).toContain('renderGates');
    expect(js).toContain('renderCost');
  });

  it('style_css_defines_panel_layout', async () => {
    const css = await fs.readFile(path.join(root, 'style.css'), 'utf8');
    expect(css).toContain('.panel');
    expect(css).toContain('.chart');
    expect(css).toContain('.metrics');
  });
});
