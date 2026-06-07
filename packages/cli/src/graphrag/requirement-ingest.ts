import fs from 'node:fs';
import path from 'node:path';
import type { KnowledgeGraph } from './knowledge-graph.js';
import type { RequirementNode } from './types.js';

export interface ParsedRequirement {
  readonly reqId: string;
  readonly title: string;
  readonly priority?: 'MUST' | 'SHOULD' | 'COULD';
  readonly parentId?: string;
  readonly source: RequirementNode['source'];
}

const RF_RE = /^\|\s*(RF-\d+)\s*\|([^|]*)/;
const O_RE = /^\|\s*(O-\d+)\s*\|([^|]*)/;
const TASK_TABLE_RE = /^\|\s*(task-\d+)\s*\|([^|]*)/i;
const TASK_HEADING_RE = /\btask-(\d+)\s*:/i;
const PHASE_RE = /^###\s+(?:Phase|Fase)\s+(\d+)/i;
const PRIORITY_RE = /\b(MUST|SHOULD|COULD)\b/i;

function parsePriority(text: string): 'MUST' | 'SHOULD' | 'COULD' | undefined {
  const m = PRIORITY_RE.exec(text);
  if (!m) return undefined;
  return m[1]!.toUpperCase() as 'MUST' | 'SHOULD' | 'COULD';
}

function cleanTitle(raw: string): string {
  return raw.replace(/\|/g, '').trim();
}

export function parseRequirementsFromMarkdown(
  content: string,
  source: RequirementNode['source'],
): ParsedRequirement[] {
  const lines = content.split(/\r?\n/);
  const out: ParsedRequirement[] = [];
  let currentParent: string | undefined;

  for (const line of lines) {
    const phase = PHASE_RE.exec(line);
    if (phase) {
      const phaseId = `phase-${phase[1]}`;
      currentParent = phaseId;
      out.push({
        reqId: phaseId,
        title: `Phase ${phase[1]}`,
        source,
        parentId: undefined,
      });
      continue;
    }

    let match: RegExpExecArray | null = RF_RE.exec(line);
    if (match) {
      const title = cleanTitle(match[2] ?? '');
      out.push({
        reqId: match[1]!,
        title,
        priority: parsePriority(title),
        parentId: currentParent,
        source,
      });
      continue;
    }

    match = O_RE.exec(line);
    if (match) {
      const title = cleanTitle(match[2] ?? '');
      out.push({
        reqId: match[1]!,
        title,
        priority: parsePriority(title),
        parentId: currentParent,
        source,
      });
      continue;
    }

    match = TASK_TABLE_RE.exec(line);
    if (match) {
      const reqId = match[1]!.toLowerCase();
      const title = cleanTitle(match[2] ?? reqId);
      out.push({
        reqId,
        title,
        priority: parsePriority(title),
        parentId: currentParent,
        source,
      });
      continue;
    }

    const taskHeading = TASK_HEADING_RE.exec(line);
    if (taskHeading) {
      const reqId = `task-${taskHeading[1]}`;
      const title = line.replace(/^#+\s*/, '').trim();
      out.push({
        reqId,
        title,
        priority: parsePriority(title),
        parentId: currentParent,
        source,
      });
    }
  }

  return out;
}

function listMarkdownFiles(dir: string, prefix: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.md'))
    .map((f) => path.join(dir, f));
}

function sourceForFile(name: string): RequirementNode['source'] | null {
  if (name.startsWith('DESIGN')) return 'design';
  if (name.startsWith('BLUEPRINT')) return 'blueprint';
  if (name.startsWith('TASKS')) return 'tasks';
  return null;
}

export function ingestRequirements(
  graph: KnowledgeGraph,
  projectRoot: string,
): { nodes: number; edges: number } {
  const dareDir = path.join(projectRoot, 'DARE');
  let nodes = 0;
  let edges = 0;

  const files: Array<{ file: string; source: RequirementNode['source'] }> = [];
  for (const f of listMarkdownFiles(dareDir, 'DESIGN')) {
    files.push({ file: f, source: 'design' });
  }
  for (const f of listMarkdownFiles(dareDir, 'BLUEPRINT')) {
    files.push({ file: f, source: 'blueprint' });
  }
  for (const f of listMarkdownFiles(dareDir, 'TASKS')) {
    files.push({ file: f, source: 'tasks' });
  }

  const parsed: ParsedRequirement[] = [];
  for (const { file, source } of files) {
    const content = fs.readFileSync(file, 'utf-8');
    parsed.push(...parseRequirementsFromMarkdown(content, source));
  }

  const seenNodes = new Set<string>();
  const seenEdges = new Set<string>();

  for (const req of parsed) {
    const nodeId = `requirement:${req.reqId}`;
    graph.addNode({
      id: nodeId,
      type: 'requirement',
      label: req.title || req.reqId,
      metadata: {
        reqId: req.reqId,
        source: req.source,
        priority: req.priority,
        title: req.title,
      },
    });
    if (!seenNodes.has(nodeId)) {
      seenNodes.add(nodeId);
      nodes++;
    }

    if (req.parentId) {
      const edgeId = `derives_from:${req.reqId}->${req.parentId}`;
      graph.addEdge({
        id: edgeId,
        sourceId: nodeId,
        targetId: `requirement:${req.parentId}`,
        type: 'derives_from',
      });
      if (!seenEdges.has(edgeId)) {
        seenEdges.add(edgeId);
        edges++;
      }
    }
  }

  return { nodes, edges };
}
