import { describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { handler } from './server.js';
import { signToken } from './auth.js';
import { getStore } from './db.js';
import type { Project, Review, User, Organization } from './store.js';

const fixturesDir = join(process.cwd(), '..', '..', 'fixtures', 'coverage');

function createTestServer() {
  const srv = createServer((req: IncomingMessage, res: ServerResponse) => {
    handler(req, res).catch((err: unknown) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    });
  });
  return srv;
}

describe('Coverage Ingestion API & Multi-Tenant Isolation — QG-TDD-007', () => {
  it('performs full coverage lifecycle: upload LCOV, upload JaCoCo, verify isolation and review binding', async () => {
    const store = getStore();
    const server = createTestServer();

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://localhost:${port}`;

    try {
      // 1. Setup Tenant Alpha
      const userA: User = {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'tenant-a-lead@example.com',
        passwordHash: 'hash',
        createdAt: new Date().toISOString(),
      };
      const orgA: Organization = {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Tenant Alpha Workspace',
        ownerId: userA.id,
        plan: 'community',
      };
      const projectA: Project = {
        id: '33333333-3333-4333-8333-333333333333',
        organizationId: orgA.id,
        name: 'Alpha Core',
        repository: 'https://github.com/org/alpha-core',
        branch: 'main',
        createdAt: new Date().toISOString(),
      };
      const reviewA1: Review = {
        id: '44444444-4444-4444-8444-444444444441',
        projectId: projectA.id,
        organizationId: orgA.id,
        projectName: projectA.name,
        repository: projectA.repository,
        branch: 'main',
        score: 85,
        decision: 'approve',
        findings: [],
        analyzedFiles: 10,
        status: 'COMPLETED',
        createdAt: new Date(Date.now() - 10000).toISOString(),
      };

      await store.createUser(userA);
      await store.createOrganization(orgA);
      await store.createProject(projectA);
      await store.createReview(reviewA1);

      // 2. Setup Tenant Beta (Attacker)
      const userB: User = {
        id: '55555555-5555-4555-8555-555555555555',
        email: 'tenant-b-attacker@example.com',
        passwordHash: 'hash',
        createdAt: new Date().toISOString(),
      };
      const orgB: Organization = {
        id: '66666666-6666-4666-8666-666666666666',
        name: 'Tenant Beta Workspace',
        ownerId: userB.id,
        plan: 'community',
      };
      await store.createUser(userB);
      await store.createOrganization(orgB);

      const tokenA = signToken(userA.id);
      const tokenB = signToken(userB.id);

      const sampleLcov = readFileSync(join(fixturesDir, 'sample.lcov'), 'utf-8');
      const sampleJacoco = readFileSync(join(fixturesDir, 'jacoco.xml'), 'utf-8');

      // 3. Security: Unauthenticated request -> 401
      const unauthRes = await fetch(`${baseUrl}/projects/${projectA.id}/coverage`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: sampleLcov,
      });
      expect(unauthRes.status).toBe(401);

      // 4. Security: Cross-tenant upload attempt (Tenant B uploading to Tenant A project) -> 404
      const crossUploadRes = await fetch(`${baseUrl}/projects/${projectA.id}/coverage`, {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          authorization: `Bearer ${tokenB}`,
        },
        body: sampleLcov,
      });
      expect(crossUploadRes.status).toBe(404);

      // 5. Payload Validation: Empty payload -> 400
      const emptyRes = await fetch(`${baseUrl}/projects/${projectA.id}/coverage`, {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          authorization: `Bearer ${tokenA}`,
        },
        body: '   ',
      });
      expect(emptyRes.status).toBe(400);

      // 6. Payload Validation: Malformed content -> 400
      const malformedRes = await fetch(`${baseUrl}/projects/${projectA.id}/coverage`, {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          authorization: `Bearer ${tokenA}`,
        },
        body: 'this is not valid coverage data',
      });
      expect(malformedRes.status).toBe(400);

      // 7. Successful Ingestion of LCOV for Review A1
      const lcovRes = await fetch(`${baseUrl}/projects/${projectA.id}/coverage?analysisId=${reviewA1.id}`, {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          authorization: `Bearer ${tokenA}`,
        },
        body: sampleLcov,
      });
      expect(lcovRes.status).toBe(201);
      const lcovJson = await lcovRes.json();
      expect(lcovJson.format).toBe('lcov');
      expect(lcovJson.coverage.lines).toBe(70);
      expect(lcovJson.coverage.functions).toBe(75);
      expect(lcovJson.coverage.branches).toBe(50);
      expect(lcovJson.files).toBe(2);
      expect(lcovJson.analysisId).toBe(reviewA1.id);
      expect(lcovJson.projectId).toBe(projectA.id);

      // Verify review A1 testing score updated
      const updatedReview1 = await store.getReview(reviewA1.id);
      expect(updatedReview1?.categoryScores?.testing).toBe(70);
      expect(updatedReview1?.coverage?.lines.percentage).toBe(70);

      // 8. GET /projects/:id/coverage (Latest)
      const getLatestRes = await fetch(`${baseUrl}/projects/${projectA.id}/coverage`, {
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(getLatestRes.status).toBe(200);
      const getLatestJson = await getLatestRes.json();
      expect(getLatestJson.coverage.lines).toBe(70);
      expect(getLatestJson.analysisId).toBe(reviewA1.id);

      // 9. Security: Cross-tenant GET -> 404
      const crossGetRes = await fetch(`${baseUrl}/projects/${projectA.id}/coverage`, {
        headers: { authorization: `Bearer ${tokenB}` },
      });
      expect(crossGetRes.status).toBe(404);

      // 10. Historical Ingestion: New Analysis Review A2 + JaCoCo XML Upload
      const reviewA2: Review = {
        id: '44444444-4444-4444-8444-444444444442',
        projectId: projectA.id,
        organizationId: orgA.id,
        projectName: projectA.name,
        repository: projectA.repository,
        branch: 'main',
        score: 92,
        decision: 'approve',
        findings: [],
        analyzedFiles: 15,
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
      };
      await store.createReview(reviewA2);

      const jacocoRes = await fetch(`${baseUrl}/projects/${projectA.id}/coverage`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          content: sampleJacoco,
          analysisId: reviewA2.id,
        }),
      });
      expect(jacocoRes.status).toBe(201);
      const jacocoJson = await jacocoRes.json();
      expect(jacocoJson.format).toBe('jacoco');
      expect(jacocoJson.coverage.lines).toBe(80);
      expect(jacocoJson.coverage.functions).toBe(100);
      expect(jacocoJson.coverage.branches).toBe(75);
      expect(jacocoJson.analysisId).toBe(reviewA2.id);

      // 11. Verify historical isolation: Review A1 still has 70%, Review A2 has 80%
      const r1After = await store.getReview(reviewA1.id);
      const r2After = await store.getReview(reviewA2.id);
      expect(r1After?.categoryScores?.testing).toBe(70);
      expect(r2After?.categoryScores?.testing).toBe(80);

      // 12. GET /analyses/:id/coverage for specific historical review
      const histGet1 = await fetch(`${baseUrl}/analyses/${reviewA1.id}/coverage`, {
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(histGet1.status).toBe(200);
      const histJson1 = await histGet1.json();
      expect(histJson1.coverage.lines).toBe(70);
      expect(histJson1.format).toBe('lcov');

      const histGet2 = await fetch(`${baseUrl}/analyses/${reviewA2.id}/coverage`, {
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(histGet2.status).toBe(200);
      const histJson2 = await histGet2.json();
      expect(histJson2.coverage.lines).toBe(80);
      expect(histJson2.format).toBe('jacoco');
    } finally {
      server.close();
    }
  });
});
