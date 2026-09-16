import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { handler } from './server.js';
import { getStore, pool } from './db.js';
import type { Review } from './store.js';

describe('QG-TDD-008 — API Comparison & Tenant Isolation Integration Tests', () => {
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
    if (pool) {
      await pool.end().catch(() => {});
    }
  });

  it('enforces authentication and tenant isolation on comparison endpoints', async () => {
    const store = getStore();

    // 1. Register Tenant A
    const regA = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `tenant.a.${Date.now()}@alpha.com`,
        password: 'PasswordAlpha123!',
        organization: 'Alpha Corp',
      }),
    });
    expect(regA.status).toBe(201);
    const authA = (await regA.json()) as { token: string; organizationId: string };

    // 2. Register Tenant B
    const regB = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `tenant.b.${Date.now()}@beta.com`,
        password: 'PasswordBeta123!',
        organization: 'Beta Corp',
      }),
    });
    expect(regB.status).toBe(201);
    const authB = (await regB.json()) as { token: string; organizationId: string };

    // 3. Tenant A creates Project Alpha
    const projARes = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authA.token}`,
      },
      body: JSON.stringify({
        name: 'Project Alpha',
        repository: 'https://github.com/alpha/repo',
        branch: 'main',
      }),
    });
    expect(projARes.status).toBe(201);
    const projectA = (await projARes.json()) as { id: string };

    // 4. Create 2 reviews for Project Alpha directly in store
    const revA1: Review = {
      id: `rev-a1-${Date.now()}`,
      projectId: projectA.id,
      organizationId: authA.organizationId,
      branch: 'main',
      score: 75,
      decision: 'block',
      findings: [
        {
          id: 'find-1',
          severity: 'high',
          category: 'security',
          status: 'open',
          decision: 'block',
          file: 'src/secret.ts',
          line: 10,
          title: 'Hardcoded Secret',
          description: 'Secret detected',
          suggestion: 'Remove secret',
          confidence: 0.95,
          source: 'deterministic',
          ruleId: 'security.hardcoded-secret',
          evidence: ['const token = "secret12345";'],
        },
      ],
      analyzedFiles: 10,
      architecture: {
        nodes: ['src/secret.ts'],
        edges: [],
        cycles: [],
        drift: [{ type: 'forbidden_dependency', from: 'src/secret.ts', to: 'infra/db.ts', message: 'Forbidden' }],
      },
      dependencies: [
        { name: 'express', version: '4.18.0', ecosystem: 'npm', manifest: 'package.json', type: 'dependency' },
      ],
      coverage: {
        lines: { total: 100, covered: 70, missed: 30, percentage: 70.0 },
        functions: { total: 10, covered: 7, missed: 3, percentage: 70.0 },
        branches: { total: 10, covered: 7, missed: 3, percentage: 70.0 },
      },
      gate: { passed: false, decision: 'block', reasons: ['High severity vulnerability'] },
      status: 'COMPLETED',
      createdAt: '2026-09-01T10:00:00.000Z',
    };

    const revA2: Review = {
      id: `rev-a2-${Date.now()}`,
      projectId: projectA.id,
      organizationId: authA.organizationId,
      branch: 'feature/patch',
      score: 95,
      decision: 'approve',
      findings: [], // secret resolved
      analyzedFiles: 12,
      architecture: {
        nodes: ['src/secret.ts'],
        edges: [],
        cycles: [],
        drift: [], // drift resolved
      },
      dependencies: [
        { name: 'express', version: '4.19.2', ecosystem: 'npm', manifest: 'package.json', type: 'dependency' },
        { name: 'zod', version: '3.22.0', ecosystem: 'npm', manifest: 'package.json', type: 'dependency' },
      ],
      coverage: {
        lines: { total: 100, covered: 88, missed: 12, percentage: 88.0 },
        functions: { total: 10, covered: 9, missed: 1, percentage: 90.0 },
        branches: { total: 10, covered: 9, missed: 1, percentage: 90.0 },
      },
      gate: { passed: true, decision: 'approve', reasons: [] },
      status: 'COMPLETED',
      createdAt: '2026-09-15T10:00:00.000Z',
    };

    await store.createReview(revA1);
    await store.createReview(revA2);

    // 5. Unauthenticated request -> 401
    const unauth = await fetch(`${baseUrl}/projects/${projectA.id}/compare`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseReviewId: revA1.id, headReviewId: revA2.id }),
    });
    expect(unauth.status).toBe(401);

    // 6. Cross-tenant access: Tenant B requesting comparison for Project A -> 404
    const crossTenant = await fetch(`${baseUrl}/projects/${projectA.id}/compare`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authB.token}`,
      },
      body: JSON.stringify({ baseReviewId: revA1.id, headReviewId: revA2.id }),
    });
    expect(crossTenant.status).toBe(404);

    // 7. Missing base or head reference -> 400
    const missingRef = await fetch(`${baseUrl}/projects/${projectA.id}/compare`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authA.token}`,
      },
      body: JSON.stringify({ baseReviewId: revA1.id }),
    });
    expect(missingRef.status).toBe(400);

    // 8. Successful POST comparison by Tenant A with Review IDs
    const postCmpRes = await fetch(`${baseUrl}/projects/${projectA.id}/compare`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authA.token}`,
      },
      body: JSON.stringify({ baseReviewId: revA1.id, headReviewId: revA2.id }),
    });
    expect(postCmpRes.status).toBe(200);
    const postCmp = (await postCmpRes.json()) as any;
    expect(postCmp.projectId).toBe(projectA.id);
    expect(postCmp.score).toEqual({ baseline: 75, current: 95, delta: 20 });
    expect(postCmp.gate.transition).toBe('BLOCK -> APPROVE');
    expect(postCmp.gate.statusChanged).toBe(true);
    expect(postCmp.findings.resolved).toHaveLength(1);
    expect(postCmp.findings.introduced).toHaveLength(0);
    expect(postCmp.architecture.resolvedDrift).toHaveLength(1);
    expect(postCmp.dependencies.added).toHaveLength(1);
    expect(postCmp.dependencies.changed).toHaveLength(1);
    expect(postCmp.coverage.delta.lines.delta).toBe(18);

    // 9. Successful GET comparison by Tenant A with branch names
    const getCmpRes = await fetch(
      `${baseUrl}/projects/${projectA.id}/compare?base=main&head=feature/patch`,
      {
        method: 'GET',
        headers: { authorization: `Bearer ${authA.token}` },
      },
    );
    expect(getCmpRes.status).toBe(200);
    const getCmp = (await getCmpRes.json()) as any;
    expect(getCmp.score.delta).toBe(20);
    expect(getCmp.baseline.branch).toBe('main');
    expect(getCmp.current.branch).toBe('feature/patch');

    // 10. Non-existent branch name -> 404
    const notFoundBranch = await fetch(
      `${baseUrl}/projects/${projectA.id}/compare?base=nonexistent-branch&head=main`,
      {
        method: 'GET',
        headers: { authorization: `Bearer ${authA.token}` },
      },
    );
    expect(notFoundBranch.status).toBe(404);
  });
});
