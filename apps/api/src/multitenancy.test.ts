import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { handler } from './server.js';

describe('Multi-Tenancy & Authorization Security Boundary Audit', () => {
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

  it('strictly isolates projects, analyses, findings, architecture, and security between Tenant A and Tenant B', async () => {
    // 1. Register Tenant A
    const regA = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'tenant.a@enterprise-a.com',
        password: 'PasswordTenantA123!',
        organization: 'Organization Alpha',
      }),
    });
    expect(regA.status).toBe(201);
    const authA = (await regA.json()) as { token: string; organizationId: string };

    // 2. Register Tenant B
    const regB = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'tenant.b@enterprise-b.com',
        password: 'PasswordTenantB123!',
        organization: 'Organization Beta',
      }),
    });
    expect(regB.status).toBe(201);
    const authB = (await regB.json()) as { token: string; organizationId: string };

    // 3. Tenant A creates Project Alpha
    const projARes = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${authA.token}`,
      },
      body: JSON.stringify({
        name: 'Project Alpha Confidential',
        repository: 'org-alpha/confidential-service',
        branch: 'main',
      }),
    });
    expect(projARes.status).toBe(201);
    const projectA = (await projARes.json()) as { id: string; name: string };

    // 4. Tenant B lists projects -> Should NOT contain Project Alpha
    const listBRes = await fetch(`${baseUrl}/projects`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });
    expect(listBRes.status).toBe(200);
    const projectsB = (await listBRes.json()) as Array<{ id: string; name: string }>;
    expect(projectsB.some((p) => p.id === projectA.id)).toBe(false);

    // 5. Tenant B attempts direct access to Project Alpha GET /projects/:id -> 404
    const getProjRes = await fetch(`${baseUrl}/projects/${projectA.id}`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });
    expect(getProjRes.status).toBe(404);

    // 6. Tenant B attempts to trigger analysis on Project Alpha -> 404
    const triggerRes = await fetch(`${baseUrl}/projects/${projectA.id}/analyses`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${authB.token}`,
      },
      body: JSON.stringify({ branch: 'main' }),
    });
    expect(triggerRes.status).toBe(404);

    // 7. Tenant B attempts to get architecture of Project Alpha -> 404
    const archRes = await fetch(`${baseUrl}/projects/${projectA.id}/architecture`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });
    expect(archRes.status).toBe(404);

    // 8. Tenant B attempts to get security findings of Project Alpha -> 404
    const secRes = await fetch(`${baseUrl}/projects/${projectA.id}/security`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });
    expect(secRes.status).toBe(404);

    // 9. Tenant B attempts to get dependencies of Project Alpha -> 404
    const depsRes = await fetch(`${baseUrl}/projects/${projectA.id}/dependencies`, {
      headers: { Authorization: `Bearer ${authB.token}` },
    });
    expect(depsRes.status).toBe(404);

    // 10. Tenant B attempts to delete Project Alpha -> 404
    const deleteRes = await fetch(`${baseUrl}/projects/${projectA.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authB.token}` },
    });
    expect(deleteRes.status).toBe(404);

    // 11. Tenant A still owns and can access Project Alpha
    const checkA = await fetch(`${baseUrl}/projects/${projectA.id}`, {
      headers: { Authorization: `Bearer ${authA.token}` },
    });
    expect(checkA.status).toBe(200);
  });
});
