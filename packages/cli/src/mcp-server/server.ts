import { createRequire } from 'node:module';
import path from 'node:path';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import fs from 'fs-extra';
import helmet from 'helmet';
import pino from 'pino';
import { assertRelativeSafe, PathEscapeError, resolveSafePath } from '../utils/path-safety.js';
import { createGraph, loadGraphConfig } from '../graphrag/index.js';
import type { KnowledgeGraph } from '../graphrag/knowledge-graph.js';
import type { EdgeType, NodeType } from '../graphrag/types.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createCorsMiddleware } from './middleware/cors.js';
import { createErrorHandler } from './middleware/error-handler.js';

const require = createRequire(import.meta.url);
const { version: pkgVersion } = require('../../package.json') as { version: string };

const logger = pino({ transport: { target: 'pino-pretty' } });

export interface ContextQuery {
  type: 'file' | 'task' | 'dependency' | 'architecture' | 'schema' | 'endpoint';
  query: string;
  limit?: number;
  /** @deprecated Ignored — server uses DARE_PROJECT_PATH / cwd only */
  projectPath?: string;
}

export interface ContextResult {
  id: string;
  type: string;
  content: string;
  relevance: number;
  source: string;
}

export interface TaskStatus {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'FAILED' | 'SKIPPED';
  updatedAt: string;
}

const CONTEXT_TYPES = new Set<ContextQuery['type']>([
  'file',
  'task',
  'dependency',
  'architecture',
  'schema',
  'endpoint',
]);

const TASK_STATUSES = new Set<TaskStatus['status']>([
  'PENDING',
  'IN_PROGRESS',
  'DONE',
  'FAILED',
  'SKIPPED',
]);

const TASK_ID_RE = /^(task-[0-9]{3}|task-[0-9a-z-]+)$/;
const GRAPH_REQ_ID_RE = /^(RF-\d+|O-\d+|task-[0-9a-z-]+)$/;
const PATH_LIKE_SEED_RE = /^[\w./-]+$/;

export interface McpServerOptions {
  authToken?: string;
  allowLoopbackWithoutToken?: boolean;
}

function dareFile(projectRoot: string, ...segments: string[]): string {
  return resolveSafePath(projectRoot, 'DARE', ...segments);
}

function projectConfigPath(projectRoot: string): string {
  return resolveSafePath(projectRoot, 'dare.config.json');
}

function isValidTaskId(taskId: string): boolean {
  return TASK_ID_RE.test(taskId);
}

function sendPathEscape(res: Response): void {
  res.status(403).json({ error: 'Forbidden' });
}

async function withProjectGraph<T>(
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

function validateGraphSeedPath(seed: string): void {
  if (!PATH_LIKE_SEED_RE.test(seed)) return;
  if (!seed.includes('/') && !seed.includes('::')) return;
  const pathPart = seed.includes('::') ? seed.split('::')[0]! : seed;
  try {
    assertRelativeSafe(pathPart);
  } catch {
    throw new PathEscapeError();
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseInt(value, 10) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function runSafe<T>(res: Response, next: NextFunction, fn: () => Promise<T>): void {
  fn().catch((err) => {
    if (err instanceof PathEscapeError) {
      sendPathEscape(res);
      return;
    }
    next(err);
  });
}

export function createMcpServer(
  projectRoot: string = process.env.DARE_PROJECT_PATH || process.cwd(),
  options: McpServerOptions = {},
): Express {
  const authToken = options.authToken ?? process.env.DARE_MCP_TOKEN ?? 'dare-mcp-dev-token';
  const bodyLimit = process.env.DARE_MCP_BODY_LIMIT || '1mb';

  const app: Express = express();
  app.set('trust proxy', true);

  app.use(
    createAuthMiddleware({
      token: authToken,
      allowLoopbackWithoutToken: options.allowLoopbackWithoutToken ?? true,
    }),
  );
  app.use(createCorsMiddleware());
  app.use(helmet());
  app.use(express.json({ limit: bodyLimit }));

  app.use((req, _res, next) => {
    const body = req.body as ContextQuery | undefined;
    if (body && typeof body.projectPath === 'string' && body.projectPath.length > 0) {
      logger.warn('deprecated projectPath ignored');
    }
    next();
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: pkgVersion,
      projectRoot: path.basename(projectRoot),
    });
  });

  app.get('/tools', (_req: Request, res: Response) => {
    res.json({
      tools: [
        { name: 'query_context', description: 'Query project context by type and keyword' },
        { name: 'get_blueprint', description: 'Get BLUEPRINT.md content' },
        { name: 'get_dag', description: 'Get dare-dag.yaml content' },
        { name: 'get_task_status', description: 'Get status of a specific task' },
        { name: 'update_task_status', description: 'Update task status in TASKS.md' },
        { name: 'get_project_context', description: 'Get dare.config.json' },
        { name: 'graph_locate', description: 'Locate code symbols from a seed query' },
        { name: 'graph_map_requirement', description: 'Map a requirement/task to symbols and tasks' },
        { name: 'graph_traverse', description: 'Traverse the knowledge graph from seed nodes' },
      ],
    });
  });

  app.post('/context/query', (req: Request, res: Response, next: NextFunction) => {
    runSafe(res, next, async () => {
      const { type, query, limit = 5 } = req.body as ContextQuery;

      if (!query || typeof query !== 'string' || query.trim() === '') {
        res.status(400).json({ error: 'query is required' });
        return;
      }

      if (!type || !CONTEXT_TYPES.has(type)) {
        res.status(400).json({ error: 'invalid context type' });
        return;
      }

      const results: ContextResult[] = [];

      if (type === 'architecture' || type === 'file') {
        const blueprintPath = dareFile(projectRoot, 'BLUEPRINT.md');
        if (await fs.pathExists(blueprintPath)) {
          const content = await fs.readFile(blueprintPath, 'utf-8');
          const lines = content.split('\n');
          const queryLower = query.toLowerCase();

          let currentSection = '';
          let sectionContent = '';
          const relevantSections: { section: string; content: string; relevance: number }[] = [];

          for (const line of lines) {
            if (line.startsWith('#')) {
              if (sectionContent && currentSection.toLowerCase().includes(queryLower)) {
                relevantSections.push({ section: currentSection, content: sectionContent, relevance: 0.8 });
              }
              currentSection = line.replace(/^#+\s*/, '');
              sectionContent = `${line}\n`;
            } else {
              sectionContent += `${line}\n`;
              if (line.toLowerCase().includes(queryLower)) {
                relevantSections.push({ section: currentSection, content: sectionContent, relevance: 1.0 });
              }
            }
          }

          relevantSections
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, limit)
            .forEach((s, i) => {
              results.push({
                id: `blueprint-${i}`,
                type: 'architecture',
                content: s.content.trim(),
                relevance: s.relevance,
                source: 'DARE/BLUEPRINT.md',
              });
            });
        }
      }

      if (type === 'task') {
        const tasksPath = dareFile(projectRoot, 'TASKS.md');
        if (await fs.pathExists(tasksPath)) {
          const content = await fs.readFile(tasksPath, 'utf-8');
          const queryLower = query.toLowerCase();
          const matched = content.split('\n').filter((l) => l.toLowerCase().includes(queryLower));

          matched.slice(0, limit).forEach((line, i) => {
            results.push({
              id: `task-${i}`,
              type: 'task',
              content: line,
              relevance: 1.0,
              source: 'DARE/TASKS.md',
            });
          });
        }
      }

      if (type === 'dependency') {
        const dagPath = dareFile(projectRoot, 'dare-dag.yaml');
        if (await fs.pathExists(dagPath)) {
          const content = await fs.readFile(dagPath, 'utf-8');
          const queryLower = query.toLowerCase();
          const matched = content.split('\n').filter((l) => l.toLowerCase().includes(queryLower));

          matched.slice(0, limit).forEach((line, i) => {
            results.push({
              id: `dag-${i}`,
              type: 'dependency',
              content: line,
              relevance: 1.0,
              source: 'DARE/dare-dag.yaml',
            });
          });
        }
      }

      res.json({ success: true, results, total: results.length, query, type });
    });
  });

  app.get('/blueprint', (req: Request, res: Response, next: NextFunction) => {
    runSafe(res, next, async () => {
      const blueprintPath = dareFile(projectRoot, 'BLUEPRINT.md');
      if (!(await fs.pathExists(blueprintPath))) {
        res.status(404).json({ error: 'BLUEPRINT.md not found. Run: dare blueprint' });
        return;
      }
      const content = await fs.readFile(blueprintPath, 'utf-8');
      res.json({ content, source: 'DARE/BLUEPRINT.md' });
    });
  });

  app.get('/dag', (req: Request, res: Response, next: NextFunction) => {
    runSafe(res, next, async () => {
      const dagPath = dareFile(projectRoot, 'dare-dag.yaml');
      if (!(await fs.pathExists(dagPath))) {
        res.status(404).json({ error: 'dare-dag.yaml not found. Run: dare blueprint' });
        return;
      }
      const content = await fs.readFile(dagPath, 'utf-8');
      res.json({ content, source: 'DARE/dare-dag.yaml' });
    });
  });

  app.get('/tasks/:taskId', (req: Request, res: Response, next: NextFunction) => {
    runSafe(res, next, async () => {
      const { taskId } = req.params;
      if (!isValidTaskId(taskId)) {
        res.status(400).json({ error: 'invalid task id' });
        return;
      }

      const tasksPath = dareFile(projectRoot, 'TASKS.md');
      if (!(await fs.pathExists(tasksPath))) {
        res.status(404).json({ error: 'TASKS.md not found' });
        return;
      }
      const content = await fs.readFile(tasksPath, 'utf-8');
      const line = content.split('\n').find((l) => l.includes(taskId));
      if (!line) {
        res.status(404).json({ error: `Task ${taskId} not found` });
        return;
      }

      let status: TaskStatus['status'] = 'PENDING';
      if (line.includes('✅')) status = 'DONE';
      else if (line.includes('🔄')) status = 'IN_PROGRESS';
      else if (line.includes('❌')) status = 'FAILED';
      else if (line.includes('⏭️')) status = 'SKIPPED';

      res.json({ id: taskId, status, line });
    });
  });

  app.put('/tasks/:taskId', (req: Request, res: Response, next: NextFunction) => {
    runSafe(res, next, async () => {
      const { taskId } = req.params;
      if (!isValidTaskId(taskId)) {
        res.status(400).json({ error: 'invalid task id' });
        return;
      }

      const { status } = req.body as { status?: TaskStatus['status'] };
      if (!status || !TASK_STATUSES.has(status)) {
        res.status(400).json({ error: 'invalid task status' });
        return;
      }

      const tasksPath = dareFile(projectRoot, 'TASKS.md');
      if (!(await fs.pathExists(tasksPath))) {
        res.status(404).json({ error: 'TASKS.md not found' });
        return;
      }

      const icons: Record<TaskStatus['status'], string> = {
        PENDING: '⏳ PENDING',
        IN_PROGRESS: '🔄 IN_PROGRESS',
        DONE: '✅ DONE',
        FAILED: '❌ FAILED',
        SKIPPED: '⏭️ SKIPPED',
      };

      const content = await fs.readFile(tasksPath, 'utf-8');
      const lines = content.split('\n');
      const lineIdx = lines.findIndex((l) => l.includes(taskId));

      if (lineIdx === -1) {
        res.status(404).json({ error: `Task ${taskId} not found` });
        return;
      }

      lines[lineIdx] = lines[lineIdx].replace(
        /⏳ PENDING|🔄 IN_PROGRESS|✅ DONE|❌ FAILED|⏭️ SKIPPED/,
        icons[status],
      );

      await fs.writeFile(tasksPath, lines.join('\n'));
      res.json({ success: true, id: taskId, status });
    });
  });

  app.post('/graph/locate', (req: Request, res: Response, next: NextFunction) => {
    runSafe(res, next, async () => {
      const { seed, hops, limit } = req.body as {
        seed?: string;
        hops?: number;
        limit?: number;
      };

      if (!seed || typeof seed !== 'string' || seed.trim() === '') {
        res.status(400).json({ error: 'seed is required' });
        return;
      }
      if (seed.length > 200) {
        res.status(400).json({ error: 'seed too long' });
        return;
      }

      validateGraphSeedPath(seed);
      const h = clampInt(hops, 1, 5, 3);
      const l = clampInt(limit, 1, 50, 10);

      await withProjectGraph(projectRoot, async (graph) => {
        const result = graph.locate(seed, { hops: h, limit: l });
        res.json({ success: true, candidates: result.candidates });
      });
    });
  });

  app.post('/graph/map-requirement', (req: Request, res: Response, next: NextFunction) => {
    runSafe(res, next, async () => {
      const { reqId } = req.body as { reqId?: string };
      if (!reqId || typeof reqId !== 'string' || !GRAPH_REQ_ID_RE.test(reqId)) {
        res.status(400).json({ error: 'invalid reqId' });
        return;
      }

      const seedId = reqId.startsWith('task-') ? `task:${reqId}` : `requirement:${reqId}`;

      await withProjectGraph(projectRoot, async (graph) => {
        if (!graph.getNode(seedId)) {
          res.status(404).json({ error: `requirement or task '${reqId}' not found` });
          return;
        }
        const walked = graph.traverse({
          seedNodeIds: [seedId],
          maxHops: 3,
          edgeTypes: ['derives_from', 'depends_on', 'implements'],
        });
        const symbols = walked.nodes
          .filter((n) => n.type === 'code_symbol')
          .map((n) => String(n.metadata?.qualifiedName ?? ''))
          .filter(Boolean)
          .sort();
        const tasks = walked.nodes
          .filter((n) => n.type === 'task')
          .map((n) => (n.id.startsWith('task:') ? n.id.slice(5) : n.id))
          .sort();
        res.json({ success: true, symbols, tasks });
      });
    });
  });

  app.post('/graph/traverse', (req: Request, res: Response, next: NextFunction) => {
    runSafe(res, next, async () => {
      const { seedNodeIds, maxHops, nodeTypes, edgeTypes } = req.body as {
        seedNodeIds?: string[];
        maxHops?: number;
        nodeTypes?: NodeType[];
        edgeTypes?: EdgeType[];
      };

      if (!Array.isArray(seedNodeIds) || seedNodeIds.length === 0) {
        res.status(400).json({ error: 'seedNodeIds is required' });
        return;
      }

      const hops = clampInt(maxHops, 1, 5, 3);

      await withProjectGraph(projectRoot, async (graph) => {
        const { nodes, edges } = graph.traverse({
          seedNodeIds,
          maxHops: hops,
          nodeTypes,
          edgeTypes,
        });
        res.json({ success: true, nodes, edges });
      });
    });
  });

  app.get('/project', (req: Request, res: Response, next: NextFunction) => {
    runSafe(res, next, async () => {
      const configPath = projectConfigPath(projectRoot);
      if (!(await fs.pathExists(configPath))) {
        res.status(404).json({ error: 'dare.config.json not found. Run: dare init' });
        return;
      }
      const config = await fs.readJSON(configPath);
      res.json(config);
    });
  });

  app.use(createErrorHandler(logger));

  return app;
}
