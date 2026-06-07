import { describe, it, expect } from 'vitest';
import { createMcpServer } from '../../mcp-server/server.js';
import request from 'supertest';

describe('MCP Server', () => {
  it('should create an express app', () => {
    const app = createMcpServer();
    expect(app).toBeDefined();
    expect(typeof app.use).toBe('function');
  });

  it('should have health check endpoint', async () => {
    const app = createMcpServer();
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body).toHaveProperty('projectRoot');
    expect(response.body).not.toHaveProperty('projectPath');
  });

});
