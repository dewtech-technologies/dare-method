import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { JsonGraph } from '../../graphrag/json-graph.js';
import { buildGraphFromFixture, loadFixture } from '../../__tests__/graphrag/fixtures/dual-graph/build-fixture-graph.js';
import {
  traceRequirement,
  TraceFormatError,
  TraceNotFoundError,
} from '../graph-queries.js';

describe('trace', () => {
  let graph: JsonGraph;

  beforeEach(async () => {
    const file = path.join(os.tmpdir(), `trace-${Date.now()}.json`);
    graph = new JsonGraph(file);
    await graph.init();
    buildGraphFromFixture(graph, loadFixture('impact-chain'));
  });

  it('traces RF-03 to code symbols within 3 hops (O-07)', () => {
    const result = traceRequirement(graph, 'RF-03');
    expect(result.symbols).toContain('src/math.ts::add');
    expect(result.path.length).toBeGreaterThan(1);
    expect(result.path[0]?.id).toBe('requirement:RF-03');
    expect(result.path.some((n) => n.type === 'code_symbol')).toBe(true);
  });

  it('rejects invalid format', () => {
    expect(() => traceRequirement(graph, 'INVALID')).toThrow(TraceFormatError);
  });

  it('errors when node missing', () => {
    expect(() => traceRequirement(graph, 'RF-999')).toThrow(TraceNotFoundError);
  });
});
