import type { Express } from 'express';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_STATE_PATH } from '../dag-runner/state-store.js';
import { createGraph, loadGraphConfig } from '../graphrag/index.js';
import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';
import { aggregateTelemetry } from '../telemetry/aggregator.js';
import { assertRelativeSafe, PathEscapeError, resolveSafePath } from '../utils/path-safety.js';

export interface DashboardRoutesOptions {
  readonly projectRoot: string;
}

export function resolveDashboardTemplateRoot(): string {
  return fileURLToPath(new URL('../../templates/dashboard/', import.meta.url));
}

function resolveAssetPath(assetPath: string, templateRoot: string): string {
  assertRelativeSafe(assetPath);
  const normalized = assetPath.replace(/\\/g, '/').replace(/^\/+/, '');
  return resolveSafePath(templateRoot, normalized);
}

async function withGraph<T>(
  projectRoot: string,
  fn: (graph: KnowledgeGraph) => Promise<T>,
): Promise<T> {
  const config = await loadGraphConfig({ cwd: projectRoot });
  const graph = await createGraph(config, { cwd: projectRoot });
  try {
    return await fn(graph);
  } finally {
    await Promise.resolve(graph.close());
  }
}

/** Read-only dashboard routes — mount on a shared createApp() instance. */
export function mountDashboardRoutes(app: Express, opts: DashboardRoutesOptions): void {
  const templateRoot = resolveDashboardTemplateRoot();
  const stateFile = path.join(opts.projectRoot, DEFAULT_STATE_PATH);

  app.get('/dashboard', (_req, res) => {
    res.sendFile(path.join(templateRoot, 'index.html'));
  });

  app.get('/api/telemetry', async (_req, res, next) => {
    try {
      const snapshot = await withGraph(opts.projectRoot, async (graph) =>
        aggregateTelemetry(graph, { stateFile }),
      );
      res.json(snapshot);
    } catch (err) {
      next(err);
    }
  });

  app.get('/dashboard/assets/*', (req, res, next) => {
    try {
      const wildcard = (req.params as Record<string, string | undefined>)['0'] ?? '';
      const assetPath = resolveAssetPath(wildcard, templateRoot);
      const resolvedRoot = path.resolve(templateRoot);
      if (!path.resolve(assetPath).startsWith(resolvedRoot)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      if (!fs.existsSync(assetPath)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.sendFile(assetPath);
    } catch (err) {
      if (err instanceof PathEscapeError) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      if (err instanceof Error && err.message.includes("must not contain '..'")) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      next(err);
    }
  });
}
