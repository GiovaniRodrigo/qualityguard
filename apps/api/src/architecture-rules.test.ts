import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { handler } from './server.js';
import type { ArchitectureRule } from '@qualityguard/domain';

describe('Architecture Rules API & Governance Pipeline Integration', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      handler(req, res).catch((err: unknown) => {
        res.writeHead(500);
        res.end(String(err));
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (typeof addr === 'object' && addr) {
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('performs full CRUD for architecture rules with validation and tenant isolation', async () => {
    // 1. Register Tenant A
    const regResA = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'tenant.a@qualityguard.dev',
        password: 'Password123!',
        organization: 'Tenant A Workspace',
      }),
    });
    expect(regResA.status).toBe(201);
    const { token: tokenA } = (await regResA.json()) as { token: string };

    // 2. Register Tenant B
    const regResB = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'tenant.b@qualityguard.dev',
        password: 'Password123!',
        organization: 'Tenant B Workspace',
      }),
    });
    expect(regResB.status).toBe(201);
    const { token: tokenB } = (await regResB.json()) as { token: string };

    // 3. Create Project under Tenant A
    const projResA = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ name: 'Project A', repository: 'owner/project-a' }),
    });
    expect(projResA.status).toBe(201);
    const projA = (await projResA.json()) as { id: string };

    // 4. Create Architecture Rule on Project A
    const createRuleRes = await fetch(`${baseUrl}/projects/${projA.id}/architecture-rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        name: 'UI to Database Isolation',
        description: 'Frontend components must not import persistence models directly',
        enabled: true,
        severity: 'critical',
        type: 'forbidden_dependency',
        config: {
          source: 'packages/ui/**',
          target: 'packages/database/**',
        },
      }),
    });
    expect(createRuleRes.status).toBe(201);
    const ruleA = (await createRuleRes.json()) as ArchitectureRule;
    expect(ruleA.id).toBeDefined();
    expect(ruleA.name).toBe('UI to Database Isolation');
    expect(ruleA.severity).toBe('critical');

    // 5. List rules for Project A
    const listRes = await fetch(`${baseUrl}/projects/${projA.id}/architecture-rules`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as ArchitectureRule[];
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(ruleA.id);

    // 6. Get single rule
    const getRes = await fetch(`${baseUrl}/projects/${projA.id}/architecture-rules/${ruleA.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(getRes.status).toBe(200);
    const single = (await getRes.json()) as ArchitectureRule;
    expect(single.id).toBe(ruleA.id);

    // 7. Update rule (change severity and toggle status)
    const updateRes = await fetch(`${baseUrl}/projects/${projA.id}/architecture-rules/${ruleA.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        severity: 'high',
        enabled: false,
      }),
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as ArchitectureRule;
    expect(updated.severity).toBe('high');
    expect(updated.enabled).toBe(false);

    // 8. Multi-Tenancy Boundary Audit: Tenant B CANNOT read, update, or delete Tenant A rule
    const crossGetRes = await fetch(`${baseUrl}/projects/${projA.id}/architecture-rules/${ruleA.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(crossGetRes.status).toBe(404);

    const crossUpdateRes = await fetch(`${baseUrl}/projects/${projA.id}/architecture-rules/${ruleA.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ name: 'Hacked Rule' }),
    });
    expect(crossUpdateRes.status).toBe(404);

    const crossDeleteRes = await fetch(`${baseUrl}/projects/${projA.id}/architecture-rules/${ruleA.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(crossDeleteRes.status).toBe(404);

    // 9. Validation error when creating rule with malformed config
    const badConfigRes = await fetch(`${baseUrl}/projects/${projA.id}/architecture-rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        name: 'Invalid Rule',
        severity: 'high',
        type: 'allowed_dependency',
        config: { source: 'ui/**' }, // missing allowedTargets
      }),
    });
    expect(badConfigRes.status).toBe(400);

    // 10. Delete Rule
    const deleteRes = await fetch(`${baseUrl}/projects/${projA.id}/architecture-rules/${ruleA.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(deleteRes.status).toBe(200);

    const verifyDeleted = await fetch(`${baseUrl}/projects/${projA.id}/architecture-rules/${ruleA.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(verifyDeleted.status).toBe(404);
  });
});
