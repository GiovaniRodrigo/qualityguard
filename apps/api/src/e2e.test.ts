import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { handler } from './server.js';

describe('End-to-End Real Flow Validation', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      handler(req, res).catch((err: unknown) => {
        console.error(err);
        res.writeHead(500);
        res.end("Internal Server Error");
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

  it('runs complete real flow: Register -> Add Project -> Analyze akitaonrails/ai-memory (release/2.2) -> Real Results', async () => {
    // 1. Register User
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'developer@qualityguard.dev',
        password: 'SuperSecretPassword123!',
        organization: 'Akita Quality Lab',
      }),
    });
    expect(regRes.status).toBe(201);
    const authData = (await regRes.json()) as { token: string; userId: string; organizationId: string };
    expect(authData.token).toBeDefined();
    const token = authData.token;

    // 2. Add Project: akitaonrails/ai-memory, branch release/2.2
    const projRes = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'ai-memory',
        repository: 'akitaonrails/ai-memory',
        branch: 'release/2.2',
      }),
    });
    expect(projRes.status).toBe(201);
    const project = (await projRes.json()) as { id: string; name: string; repository: string; branch: string };
    expect(project.id).toBeDefined();
    expect(project.name).toBe('ai-memory');
    expect(project.repository).toBe('akitaonrails/ai-memory');
    expect(project.branch).toBe('release/2.2');

    // 2.5 Add Custom Architecture Governance Rule
    const ruleRes = await fetch(`${baseUrl}/projects/${project.id}/architecture-rules`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Enforce No Direct Cycle Policy',
        type: 'no_cycles',
        severity: 'high',
        enabled: true,
        config: {},
      }),
    });
    expect(ruleRes.status).toBe(201);
    const createdRule = (await ruleRes.json()) as any;
    expect(createdRule.id).toBeDefined();
    expect(createdRule.name).toBe('Enforce No Direct Cycle Policy');

    // List rules
    const listRulesRes = await fetch(`${baseUrl}/projects/${project.id}/architecture-rules`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listRulesRes.status).toBe(200);
    const rulesList = (await listRulesRes.json()) as any[];
    expect(rulesList.length).toBe(1);

    // 3. Trigger Real Analysis (Async Queue: returns 202 Accepted)
    const analysisRes = await fetch(`${baseUrl}/projects/${project.id}/analyses`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ branch: 'release/2.2' }),
    });
    expect(analysisRes.status).toBe(202);
    const triggerData = (await analysisRes.json()) as { analysisId: string; status: string; progress: number };

    expect(triggerData.analysisId).toBeDefined();
    expect(triggerData.status).toBe('queued');

    // 4. Poll GET /analyses/:id until completed
    let jobData: any = null;
    const startTime = Date.now();
    while (Date.now() - startTime < 60_000) {
      const pollRes = await fetch(`${baseUrl}/analyses/${triggerData.analysisId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(pollRes.status).toBe(200);
      jobData = await pollRes.json();
      if (jobData.status === 'completed' || jobData.status === 'failed') {
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    expect(jobData).toBeDefined();
    expect(jobData.status).toBe('completed');
    expect(jobData.progress).toBe(100);
    expect(jobData.error).toBeNull();
    expect(jobData.result).toBeDefined();

    const review = jobData.result;
    expect(review.id).toBeDefined();
    expect(review.projectId).toBe(project.id);
    expect(review.analyzedFiles).toBeGreaterThan(50);
    expect(review.findings.length).toBeGreaterThan(0);
    expect(review.architecture).toBeDefined();
    expect(review.architecture.nodes.length).toBeGreaterThan(50);
    expect(review.dependencies).toBeDefined();
    expect(review.gate).toBeDefined();
    expect(typeof review.score).toBe('number');

    // 5. Fetch Latest Analysis
    const latestRes = await fetch(`${baseUrl}/projects/${project.id}/analyses/latest`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(latestRes.status).toBe(200);
    const latest = (await latestRes.json()) as any;
    expect(latest.id).toBe(review.id);
    expect(latest.score).toBe(review.score);

    // 5. Fetch Architecture
    const archRes = await fetch(`${baseUrl}/projects/${project.id}/architecture`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(archRes.status).toBe(200);
    const arch = (await archRes.json()) as any;
    expect(arch.nodes.length).toBeGreaterThan(0);

    // 6. Fetch Dependencies
    const depsRes = await fetch(`${baseUrl}/projects/${project.id}/dependencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(depsRes.status).toBe(200);
    const deps = (await depsRes.json()) as any[];
    expect(deps.length).toBeGreaterThan(0);
    expect(deps.some((d) => d.ecosystem === 'cargo' && d.manifest.includes('Cargo.toml'))).toBe(true);

    // 7. Fetch Security
    const secRes = await fetch(`${baseUrl}/projects/${project.id}/security`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(secRes.status).toBe(200);
    const sec = (await secRes.json()) as any;
    expect(sec.findings.length).toBeGreaterThan(0);
  }, 120_000);
});
