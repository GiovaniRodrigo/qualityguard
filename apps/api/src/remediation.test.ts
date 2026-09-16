import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { handler } from './server.js';
import { getStore } from './db.js';

describe('AI Remediation SSE API & Multi-Tenant Isolation', () => {
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

  it('strictly isolates remediation requests and streams SSE events for authorized owner', async () => {
    // 1. Register Tenant Alpha
    const regAlpha = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'alpha-lead@company-a.com',
        password: 'Password1234!',
        organization: 'Tenant Alpha Org',
      }),
    });
    expect(regAlpha.status).toBe(201);
    const alphaAuth = (await regAlpha.json()) as { token: string; organizationId: string };

    // 2. Register Tenant Beta (Attacker / Unauthorized)
    const regBeta = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'beta-user@company-b.com',
        password: 'Password1234!',
        organization: 'Tenant Beta Org',
      }),
    });
    expect(regBeta.status).toBe(201);
    const betaAuth = (await regBeta.json()) as { token: string; organizationId: string };

    // 3. Tenant Alpha creates Project & Review with a security finding
    const store = getStore();
    const projectId = 'proj-alpha-1';
    const findingId = 'finding-alpha-sec-42';

    await store.createProject({
      id: projectId,
      organizationId: alphaAuth.organizationId,
      name: 'Alpha Backend',
      repository: 'tenant-alpha/backend',
      branch: 'main',
      createdAt: new Date().toISOString(),
    });

    await store.createReview({
      id: 'rev-alpha-1',
      projectId,
      organizationId: alphaAuth.organizationId,
      projectName: 'Alpha Backend',
      repository: 'tenant-alpha/backend',
      branch: 'main',
      score: 65,
      decision: 'block',
      analyzedFiles: 12,
      findings: [
        {
          id: findingId,
          severity: 'critical',
          category: 'security',
          status: 'open',
          decision: 'block',
          file: 'src/config/auth.ts',
          line: 18,
          title: 'Hardcoded Secret Detected',
          description: 'Hardcoded API secret in configuration file',
          suggestion: 'Load secret from environment variable',
          confidence: 0.98,
          source: 'deterministic',
          ruleId: 'security/hardcoded-secret',
          evidence: ['const secret = "sk-live-999999999999999999999999";'],
        },
      ],
      createdAt: new Date().toISOString(),
      status: 'COMPLETED',
    });

    // 4. Multi-Tenant Violation Attempt: Tenant Beta tries to remediate Tenant Alpha's finding
    const crossTenantRes = await fetch(`${baseUrl}/findings/${findingId}/remediate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${betaAuth.token}`,
      },
    });
    expect(crossTenantRes.status).toBe(404);
    const crossTenantErr = await crossTenantRes.json();
    expect(crossTenantErr.error).toBe('finding not found');

    // 5. Unauthenticated Request: returns 401
    const unauthRes = await fetch(`${baseUrl}/findings/${findingId}/remediate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(unauthRes.status).toBe(401);

    // 6. Authorized Owner (Tenant Alpha) requests remediation: Streams SSE
    const remediateRes = await fetch(`${baseUrl}/findings/${findingId}/remediate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${alphaAuth.token}`,
      },
      body: JSON.stringify({
        files: [
          {
            path: 'src/config/auth.ts',
            content: 'export const JWT_SECRET = "sk-live-999999999999999999999999";',
          },
        ],
      }),
    });

    expect(remediateRes.status).toBe(200);
    expect(remediateRes.headers.get('content-type')).toContain('text/event-stream');

    const bodyText = await remediateRes.text();
    expect(bodyText).toContain('event: start');
    expect(bodyText).toContain('event: chunk');
    expect(bodyText).toContain('event: complete');
    expect(bodyText).toContain('Problem Explanation');
    expect(bodyText).toContain('Step-by-Step Remediation');
    // Verify secret was redacted in prompt/stream
    expect(bodyText).not.toContain('sk-live-999999999999999999999999');
  });
});
