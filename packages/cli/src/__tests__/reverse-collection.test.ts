// SPDX-License-Identifier: MIT
//
// v3.2 — deterministic collection enhancements for `dare reverse`:
//   - @Controller prefix composed into NestJS routes
//   - DTOs / value shapes excluded from entities
//   - IDEIA.md / module specs rendered with the extracted model (not skeletons)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { extractDataModel } from '../utils/datamodel.js';
import {
  buildFacts,
  renderIdeiaSkeleton,
  renderModuleSpecSkeleton,
} from '../utils/reverse-facts.js';
import { detectProject } from '../utils/project-detector.js';
import { detectModules } from '../utils/module-detector.js';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reverse-col-'));
});
afterEach(async () => {
  await fs.remove(dir);
});

async function write(rel: string, content: string): Promise<void> {
  const p = path.join(dir, rel);
  await fs.ensureDir(path.dirname(p));
  await fs.writeFile(p, content);
}

describe('extractDataModel — v3.2 collection', () => {
  it('composes the @Controller prefix into NestJS routes', async () => {
    await write(
      'src/users/users.controller.ts',
      `@Controller('users')
       export class UsersController {
         @Get(':id') findOne() {}
         @Post('bulk') bulk() {}
       }`,
    );
    const model = await extractDataModel(dir);
    const routes = model.endpoints.map((e) => `${e.method} ${e.route}`);
    expect(routes).toContain('GET /users/:id');
    expect(routes).toContain('POST /users/bulk');
  });

  it('handles an empty @Controller() prefix', async () => {
    await write(
      'src/health/health.controller.ts',
      `@Controller()
       export class HealthController { @Get('health') h() {} }`,
    );
    const model = await extractDataModel(dir);
    expect(model.endpoints.map((e) => e.route)).toContain('/health');
  });

  it('does NOT count DTOs as entities', async () => {
    await write(
      'src/users/dto/create-user.dto.ts',
      `export class CreateUserDto { email: string; password: string; }`,
    );
    await write(
      'src/users/entities/user.entity.ts',
      `@Entity() export class User { id: string; email: string; }`,
    );
    const model = await extractDataModel(dir);
    const names = model.entities.map((e) => e.name);
    expect(names).toContain('User');
    expect(names).not.toContain('CreateUserDto');
  });

  it('drops SQL keywords (CASCADE) but keeps lowercase table names', async () => {
    await write(
      'db/schema.sql',
      `CREATE TABLE produtos (id INT);
       ALTER TABLE pedidos ADD CONSTRAINT fk FOREIGN KEY (pid) REFERENCES produtos(id) ON DELETE CASCADE;`,
    );
    const model = await extractDataModel(dir);
    const names = model.entities.map((e) => e.name);
    expect(names).toContain('produtos');
    expect(names).not.toContain('CASCADE');
  });
});

describe('renderIdeiaSkeleton / module spec — render real data', () => {
  it('IDEIA fills API + data-model sections from the model (no AGENT placeholder)', async () => {
    await write(
      'src/orders/orders.controller.ts',
      `@Controller('orders') export class OrdersController { @Get() list() {} }`,
    );
    await write(
      'src/orders/entities/order.entity.ts',
      `@Entity() export class Order { id: string; total: number; }`,
    );
    const detected = await detectProject(dir);
    const graph = await detectModules(dir, {});
    const facts = buildFacts(detected, graph, '2026-06-02T00:00:00Z');
    const model = await extractDataModel(dir);

    const ideia = renderIdeiaSkeleton(facts, false, model);
    expect(ideia).toContain('Superfície de API — 1 endpoints 🟢');
    expect(ideia).toContain('GET');
    expect(ideia).toContain('/orders');
    expect(ideia).toContain('Order');
    // The API section is no longer a bare AGENT placeholder
    expect(ideia).not.toMatch(/## Superfície de API\n<!-- AGENT/);
  });

  it('falls back to AGENT placeholder when no model is passed', async () => {
    const detected = await detectProject(dir);
    const graph = await detectModules(dir, {});
    const facts = buildFacts(detected, graph, '2026-06-02T00:00:00Z');
    const ideia = renderIdeiaSkeleton(facts, false);
    expect(ideia).toContain('## Superfície de API');
    expect(ideia).toMatch(/Superfície de API\n<!-- AGENT/);
  });
});
