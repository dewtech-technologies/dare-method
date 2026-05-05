import express, { Request, Response, Express } from 'express';
import cors from 'cors';
import fs from 'fs-extra';
import path from 'path';
import pino from 'pino';

const logger = pino({ transport: { target: 'pino-pretty' } });

export interface ContextQuery {
  type: 'file' | 'task' | 'dependency' | 'architecture' | 'schema' | 'endpoint';
  query: string;
  limit?: number;
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

export function createMcpServer(projectPath: string = process.cwd()): Express {
  const app: Express = express();
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: '0.1.0', projectPath });
  });

  // List available MCP tools
  app.get('/tools', (_req: Request, res: Response) => {
    res.json({
      tools: [
        { name: 'query_context', description: 'Query project context by type and keyword' },
        { name: 'get_blueprint', description: 'Get BLUEPRINT.md content' },
        { name: 'get_dag', description: 'Get dare-dag.yaml content' },
        { name: 'get_task_status', description: 'Get status of a specific task' },
        { name: 'update_task_status', description: 'Update task status in TASKS.md' },
        { name: 'get_project_context', description: 'Get dare.config.json' },
      ],
    });
  });

  // Main context query endpoint - saves tokens by returning only relevant context
  app.post('/context/query', async (req: Request, res: Response) => {
    const { type, query, limit = 5, projectPath: reqPath } = req.body as ContextQuery;
    const basePath = reqPath || projectPath;

    try {
      const results: ContextResult[] = [];

      if (type === 'architecture' || type === 'file') {
        const blueprintPath = path.join(basePath, 'DARE', 'BLUEPRINT.md');
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
              sectionContent = line + '\n';
            } else {
              sectionContent += line + '\n';
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
        const tasksPath = path.join(basePath, 'DARE', 'TASKS.md');
        if (await fs.pathExists(tasksPath)) {
          const content = await fs.readFile(tasksPath, 'utf-8');
          const queryLower = query.toLowerCase();
          const lines = content.split('\n').filter((l) => l.toLowerCase().includes(queryLower));

          lines.slice(0, limit).forEach((line, i) => {
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
        const dagPath = path.join(basePath, 'DARE', 'dare-dag.yaml');
        if (await fs.pathExists(dagPath)) {
          const content = await fs.readFile(dagPath, 'utf-8');
          const queryLower = query.toLowerCase();
          const lines = content.split('\n').filter((l) => l.toLowerCase().includes(queryLower));

          lines.slice(0, limit).forEach((line, i) => {
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
    } catch (err) {
      logger.error(err);
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // Get BLUEPRINT.md
  app.get('/blueprint', async (_req: Request, res: Response) => {
    const blueprintPath = path.join(projectPath, 'DARE', 'BLUEPRINT.md');
    if (!await fs.pathExists(blueprintPath)) {
      res.status(404).json({ error: 'BLUEPRINT.md not found. Run: dare blueprint' });
      return;
    }
    const content = await fs.readFile(blueprintPath, 'utf-8');
    res.json({ content, source: 'DARE/BLUEPRINT.md' });
  });

  // Get dare-dag.yaml
  app.get('/dag', async (_req: Request, res: Response) => {
    const dagPath = path.join(projectPath, 'DARE', 'dare-dag.yaml');
    if (!await fs.pathExists(dagPath)) {
      res.status(404).json({ error: 'dare-dag.yaml not found. Run: dare blueprint' });
      return;
    }
    const content = await fs.readFile(dagPath, 'utf-8');
    res.json({ content, source: 'DARE/dare-dag.yaml' });
  });

  // Get task status
  app.get('/tasks/:taskId', async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const tasksPath = path.join(projectPath, 'DARE', 'TASKS.md');
    if (!await fs.pathExists(tasksPath)) {
      res.status(404).json({ error: 'TASKS.md not found' });
      return;
    }
    const content = await fs.readFile(tasksPath, 'utf-8');
    const line = content.split('\n').find((l) => l.includes(taskId));
    if (!line) {
      res.status(404).json({ error: `Task ${taskId} not found` });
      return;
    }

    let status = 'PENDING';
    if (line.includes('✅')) status = 'DONE';
    else if (line.includes('🔄')) status = 'IN_PROGRESS';
    else if (line.includes('❌')) status = 'FAILED';
    else if (line.includes('⏭️')) status = 'SKIPPED';

    res.json({ id: taskId, status, line });
  });

  // Update task status
  app.put('/tasks/:taskId', async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const { status } = req.body as { status: TaskStatus['status'] };
    const tasksPath = path.join(projectPath, 'DARE', 'TASKS.md');

    if (!await fs.pathExists(tasksPath)) {
      res.status(404).json({ error: 'TASKS.md not found' });
      return;
    }

    const icons: Record<string, string> = {
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

    lines[lineIdx] = lines[lineIdx]
      .replace(/⏳ PENDING|🔄 IN_PROGRESS|✅ DONE|❌ FAILED|⏭️ SKIPPED/, icons[status] || status);

    await fs.writeFile(tasksPath, lines.join('\n'));
    res.json({ success: true, id: taskId, status });
  });

  // Get project config
  app.get('/project', async (_req: Request, res: Response) => {
    const configPath = path.join(projectPath, 'dare.config.json');
    if (!await fs.pathExists(configPath)) {
      res.status(404).json({ error: 'dare.config.json not found. Run: dare init' });
      return;
    }
    const config = await fs.readJSON(configPath);
    res.json(config);
  });

  return app;
}
