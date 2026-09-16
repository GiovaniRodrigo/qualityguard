import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeDiff, parseCoverage, CoverageParseError, compareReviews } from '@qualityguard/analyzer';
import { validateArchitectureRuleConfig } from '@qualityguard/architecture';
import { buildRemediationPrompt, getAIProvider } from '@qualityguard/ai';
import type { ArchitectureRule, CoverageReport, CoverageFormat, CoverageResponse, ReviewComparisonResult } from '@qualityguard/domain';
import {
  createGitHubClient,
  createInstallationToken,
  verifyAndProcessWebhook,
  handlePullRequestGovernance,
  type PullRequestEvent,
} from '@qualityguard/github';
import { hashPassword, signToken, verifyPassword, verifyToken } from './auth.js';
import { getStore, healthDatabase, pool, recordStripeEvent, recordUsage } from './db.js';
import { createCheckoutSession, createCustomer, createPortalSession, mapSubscriptionEvent, verifyStripeSignature, type Plan, type StripeSubscriptionEvent } from './billing.js';
import { runRepositoryAnalysis } from './analysis.js';
import { getAnalysisQueue } from './queue.js';
import type { Review } from './store.js';

const store = getStore();
const port = Number(process.env.PORT ?? 8787);
const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 20 * 1024 * 1024; // 20 MB for large coverage reports
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 100;
const rateBuckets = new Map<string, { startedAt: number; count: number }>();

const AI_RATE_WINDOW_MS = 60_000;
const AI_RATE_LIMIT = 30;
const aiRateBuckets = new Map<string, { startedAt: number; count: number }>();

function aiRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = aiRateBuckets.get(key);
  if (!bucket || now - bucket.startedAt > AI_RATE_WINDOW_MS) {
    aiRateBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count++;
  return bucket.count > AI_RATE_LIMIT;
}


function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new Error('payload too large');
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function rateLimited(req: IncomingMessage): boolean {
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.startedAt > RATE_WINDOW_MS) {
    rateBuckets.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count++;
  return bucket.count > RATE_LIMIT;
}

function auth(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return verifyToken(header.slice(7));
}

const MIGRATION_LOCK_ID = 842918492;

async function migrate(): Promise<void> {
  if (!pool) return;
  let client;
  try {
    client = await pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
      const migrationsDir = join(__dirname, '../migrations');
      if (existsSync(migrationsDir)) {
        const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
        for (const file of files) {
          await client.query(await readFile(join(migrationsDir, file), 'utf8'));
        }
      } else {
        const migrationPath = process.env.MIGRATION_FILE ?? join(__dirname, '../migrations/001_initial.sql');
        if (existsSync(migrationPath)) {
          await client.query(await readFile(migrationPath, 'utf8'));
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    }
  } catch (error) {
    console.warn('Migration warning:', error);
  } finally {
    if (client) client.release();
  }
}

async function processPullRequest(event: PullRequestEvent): Promise<void> {
  if (!event.installation?.id || !event.repository?.full_name || !event.pull_request) return;
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!appId || !privateKey) throw new Error('GitHub App credentials are not configured');
  const token = await createInstallationToken(appId, privateKey, event.installation.id);
  const client = createGitHubClient(token);
  const [owner, repo] = event.repository.full_name.split('/');
  if (!owner || !repo) throw new Error(`Invalid GitHub repository: ${event.repository.full_name}`);

  await handlePullRequestGovernance({
    client,
    owner,
    repo,
    prNumber: event.pull_request.number,
    headSha: event.pull_request.head.sha,
    runner: async (diff: string) => {
      const result = analyzeDiff(diff);
      return {
        score: result.score,
        decision: result.decision,
        analyzedFiles: result.changedFiles,
        findings: result.findings,
      };
    },
  });
}

export async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'access-control-allow-headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && pathname === '/health') {
    const database = await healthDatabase();
    return json(res, 200, {
      ok: true,
      service: 'qualityguard-api',
      version: process.env.npm_package_version ?? '0.3.0',
      commit: process.env.GIT_COMMIT ?? process.env.COMMIT_SHA ?? 'unknown',
      database,
    });
  }
  if (req.method === 'GET' && pathname === '/ready') {
    const database = await healthDatabase();
    return json(res, 200, { ready: true, database });
  }

  if (req.method === 'POST' && pathname === '/webhooks/github') {
    const rawPayload = await body(req);
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    const signature = typeof req.headers['x-hub-signature-256'] === 'string'
      ? req.headers['x-hub-signature-256']
      : undefined;
    const deliveryId = typeof req.headers['x-github-delivery'] === 'string'
      ? req.headers['x-github-delivery']
      : undefined;

    if (!secret || !signature) {
      return json(res, 401, { error: 'invalid GitHub signature' });
    }

    try {
      const result = await verifyAndProcessWebhook({
        rawBody: rawPayload,
        signature,
        deliveryId,
        secret,
        store: {
          recordDelivery: (id: string) => store.recordWebhookDelivery(id),
        },
      });

      if (result.duplicate) {
        return json(res, 200, { accepted: true, duplicate: true, deliveryId });
      }

      if (result.shouldAnalyze && result.event) {
        void processPullRequest(result.event).catch((error: unknown) => {
          console.error('GitHub PR governance failed:', error);
        });
      }

      return json(res, 202, {
        accepted: true,
        deliveryId: result.deliveryId ?? null,
        analyzing: result.shouldAnalyze,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Webhook verification failed';
      return json(res, 401, { error: msg });
    }
  }

  if (req.method === 'POST' && pathname === '/webhooks/stripe') {
    const payload = await body(req);
    const signature = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || typeof signature !== 'string' || !verifyStripeSignature(payload, signature, secret)) return json(res, 400, { error: 'invalid Stripe signature' });
    let parsed: StripeSubscriptionEvent;
    try { parsed = JSON.parse(payload) as StripeSubscriptionEvent; } catch { return json(res, 400, { error: 'invalid JSON payload' }); }
    if (!parsed.id || !parsed.type || !parsed.data?.object) return json(res, 400, { error: 'invalid Stripe event' });
    const fresh = await recordStripeEvent(parsed.id, parsed.type);
    if (!fresh) return json(res, 200, { received: true, duplicate: true });
    const event = mapSubscriptionEvent(parsed);
    if (event) {
      const org = await store.findOrganizationByStripeCustomer(event.customerId);
      if (org) {
        await store.updateSubscription(org.id, {
          ...(event.subscriptionId ? { subscriptionId: event.subscriptionId } : {}),
          ...(event.status ? { status: event.status } : {}),
          ...(event.plan ? { plan: event.plan } : {}),
        });
      }
    }
    return json(res, 200, { received: true });
  }

  if ((req.method === 'POST' && (pathname === '/auth/register' || pathname === '/auth/login')) && rateLimited(req)) {
    res.setHeader('retry-after', '60');
    return json(res, 429, { error: 'too many authentication requests' });
  }

  if (req.method === 'POST' && pathname === '/auth/register') {
    const data = JSON.parse(await body(req)) as { email?: string; password?: string; organization?: string };
    const email = data.email?.trim().toLowerCase();
    if (!email || !data.password || data.password.length < 8) return json(res, 400, { error: 'email and password (8+ chars) are required' });
    if (await store.findUserByEmail(email)) return json(res, 409, { error: 'email already registered' });
    const id = randomUUID();
    await store.createUser({ id, email, passwordHash: hashPassword(data.password), createdAt: new Date().toISOString() });
    const orgId = randomUUID();
    const stripeCustomerId = process.env.STRIPE_SECRET_KEY ? (await createCustomer(email)).id : undefined;
    await store.createOrganization({ id: orgId, name: data.organization?.trim() || `${email.split('@')[0]} workspace`, ownerId: id, plan: 'community', ...(stripeCustomerId ? { stripeCustomerId } : {}) });
    return json(res, 201, { token: signToken(id), userId: id, organizationId: orgId, email });
  }

  if (req.method === 'POST' && pathname === '/auth/login') {
    const data = JSON.parse(await body(req)) as { email?: string; password?: string };
    const user = data.email ? await store.findUserByEmail(data.email.trim().toLowerCase()) : undefined;
    if (!user || !data.password || !verifyPassword(data.password, user.passwordHash)) return json(res, 401, { error: 'invalid credentials' });
    return json(res, 200, { token: signToken(user.id), userId: user.id, email: user.email });
  }

  // Authenticated routes
  const userId = auth(req);
  if (!userId) return json(res, 401, { error: 'authentication required' });
  const user = await store.getUser(userId);
  if (!user) return json(res, 401, { error: 'user not found' });
  let org = await store.findOrganizationByOwner(userId);
  if (!org) {
    const orgId = randomUUID();
    org = { id: orgId, name: `${user.email.split('@')[0]} workspace`, ownerId: userId, plan: 'community' };
    await store.createOrganization(org);
  }

  if (req.method === 'GET' && pathname === '/me') {
    const projects = await store.listProjects(org.id);
    return json(res, 200, { user: { id: user.id, email: user.email, createdAt: user.createdAt }, organization: org, projects });
  }

  if (req.method === 'GET' && pathname === '/projects') {
    const projects = await store.listProjects(org.id);
    const projectsWithLatest = await Promise.all(
      projects.map(async (project) => {
        const latest = await store.getLatestReview(project.id);
        return {
          ...project,
          latestAnalysis: latest ? {
            id: latest.id,
            score: latest.score,
            decision: latest.decision,
            findingsCount: latest.findings.length,
            createdAt: latest.createdAt,
            status: latest.status,
          } : null,
        };
      }),
    );
    return json(res, 200, projectsWithLatest);
  }

  if (req.method === 'POST' && pathname === '/projects') {
    const data = JSON.parse(await body(req)) as { name?: string; repository?: string; branch?: string };
    if (!data.name?.trim() || !data.repository?.trim()) return json(res, 400, { error: 'name and repository are required' });
    const project = {
      id: randomUUID(),
      organizationId: org.id,
      name: data.name.trim(),
      repository: data.repository.trim(),
      branch: data.branch?.trim() || 'main',
      createdAt: new Date().toISOString(),
    };
    await store.createProject(project);
    return json(res, 201, project);
  }

  // Match /projects/:id
  const projectMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)$/);
  if (projectMatch) {
    const projectId = projectMatch[1]!;
    const project = await store.getProject(projectId);
    if (!project || project.organizationId !== org.id) return json(res, 404, { error: 'project not found' });

    if (req.method === 'GET') {
      const latest = await store.getLatestReview(projectId);
      return json(res, 200, { ...project, latestAnalysis: latest });
    }
    if (req.method === 'DELETE') {
      await store.deleteProject(projectId);
      return json(res, 200, { deleted: true, projectId });
    }
  }

  // Trigger analysis for a project: POST /projects/:id/analyses or POST /analyses
  const projectAnalyzeMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/analyses$/);
  if (req.method === 'POST' && (projectAnalyzeMatch || pathname === '/analyses')) {
    let projectId: string | undefined = projectAnalyzeMatch?.[1];
    let customBranch: string | undefined;

    const payloadText = await body(req);
    if (payloadText.trim()) {
      try {
        const parsed = JSON.parse(payloadText) as { projectId?: string; branch?: string; repository?: string; name?: string };
        if (parsed.projectId) projectId = parsed.projectId;
        if (parsed.branch) customBranch = parsed.branch;
      } catch {}
    }

    if (!projectId) return json(res, 400, { error: 'projectId is required' });
    const project = await store.getProject(projectId);
    if (!project || project.organizationId !== org.id) return json(res, 404, { error: 'project not found' });

    const targetBranch = customBranch || project.branch || 'main';
    const analysisId = randomUUID();

    const queue = getAnalysisQueue(store);
    const job = await queue.enqueue({
      id: analysisId,
      projectId: project.id,
      organizationId: org.id,
      branch: targetBranch,
    });

    await recordUsage(org.id, 'repository_scan', 1, { projectId: project.id, repository: project.repository });
    return json(res, 202, {
      analysisId: job.id,
      id: job.id,
      status: job.status,
      progress: job.progress,
      projectId: project.id,
      startedAt: job.startedAt,
    });
  }

  // Match /projects/:id/analyses/latest
  const projectLatestMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/analyses\/latest$/);
  if (req.method === 'GET' && projectLatestMatch) {
    const projectId = projectLatestMatch[1]!;
    const project = await store.getProject(projectId);
    if (!project || project.organizationId !== org.id) return json(res, 404, { error: 'project not found' });
    const latest = await store.getLatestReview(projectId);
    if (!latest) return json(res, 404, { error: 'no analysis available yet' });
    return json(res, 200, latest);
  }

  // Match /projects/:id/architecture
  const projectArchMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/architecture$/);
  if (req.method === 'GET' && projectArchMatch) {
    const projectId = projectArchMatch[1]!;
    const project = await store.getProject(projectId);
    if (!project || project.organizationId !== org.id) return json(res, 404, { error: 'project not found' });
    const latest = await store.getLatestReview(projectId);
    if (!latest || !latest.architecture) return json(res, 404, { error: 'no architecture analysis available' });
    return json(res, 200, latest.architecture);
  }

  // Match /projects/:id/findings
  const projectFindingsMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/findings$/);
  if (req.method === 'GET' && projectFindingsMatch) {
    const projectId = projectFindingsMatch[1]!;
    const project = await store.getProject(projectId);
    if (!project || project.organizationId !== org.id) return json(res, 404, { error: 'project not found' });
    const latest = await store.getLatestReview(projectId);
    return json(res, 200, latest?.findings ?? []);
  }

  // Match /findings/:id/remediate or /api/findings/:id/remediate
  const remediateMatch = pathname.match(/^(?:\/api)?\/findings\/([^/]+)\/remediate$/);
  if (req.method === 'POST' && remediateMatch) {
    const findingId = decodeURIComponent(remediateMatch[1]!);

    if (aiRateLimited(org.id)) {
      res.setHeader('retry-after', '60');
      return json(res, 429, { error: 'too many AI remediation requests' });
    }

    const found = await store.findFindingById(org.id, findingId);
    if (!found) {
      return json(res, 404, { error: 'finding not found' });
    }

    const { finding, review, project } = found;

    let customFiles: Array<{ path: string; content: string }> = [];
    const payloadText = await body(req).catch(() => '');
    if (payloadText.trim()) {
      try {
        const parsed = JSON.parse(payloadText) as { files?: Array<{ path: string; content: string }> };
        if (Array.isArray(parsed.files)) {
          customFiles = parsed.files;
        }
      } catch {}
    }

    const promptResult = buildRemediationPrompt({
      finding,
      repository: project.repository,
      branch: project.branch ?? 'main',
      relevantFiles: customFiles,
      architectureSummary: review.architecture
        ? `Nodes: ${review.architecture.nodes.length}, Edges: ${review.architecture.edges.length}, Cycles: ${review.architecture.cycles.length}`
        : undefined,
      dependencySummary: review.dependencies
        ? review.dependencies.map((d) => `${d.name}@${d.version ?? '*'}`).join(', ')
        : undefined,
    });

    const provider = getAIProvider();
    const abortController = new AbortController();

    req.on('close', () => {
      abortController.abort();
    });

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'Content-Type, Authorization',
    });

    res.write(
      `event: start\ndata: ${JSON.stringify({
        findingId: finding.id,
        provider: provider.name,
        wasLimited: promptResult.wasLimited,
        redacted: promptResult.redacted,
        limitReasons: promptResult.limitReasons,
      })}\n\n`,
    );

    try {
      for await (const chunk of provider.streamCompletion({
        ...promptResult.request,
        signal: abortController.signal,
      })) {
        if (abortController.signal.aborted) break;
        res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
      }

      if (!abortController.signal.aborted) {
        res.write(`event: complete\ndata: ${JSON.stringify({ status: 'completed' })}\n\n`);
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
      }
    } finally {
      res.end();
    }
    return;
  }


  // Match /projects/:id/security
  const projectSecurityMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/security$/);
  if (req.method === 'GET' && projectSecurityMatch) {
    const projectId = projectSecurityMatch[1]!;
    const project = await store.getProject(projectId);
    if (!project || project.organizationId !== org.id) return json(res, 404, { error: 'project not found' });
    const latest = await store.getLatestReview(projectId);
    const securityFindings = latest?.findings.filter((f) => f.category === 'security') ?? [];
    return json(res, 200, {
      score: latest?.categoryScores?.security ?? null,
      findings: securityFindings,
      totalSecurityFindings: securityFindings.length,
    });
  }

  // Match /projects/:id/dependencies
  const projectDepsMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/dependencies$/);
  if (req.method === 'GET' && projectDepsMatch) {
    const projectId = projectDepsMatch[1]!;
    const project = await store.getProject(projectId);
    if (!project || project.organizationId !== org.id) return json(res, 404, { error: 'project not found' });
    const latest = await store.getLatestReview(projectId);
    return json(res, 200, latest?.dependencies ?? []);
  }

  // Match /projects/:id/compare or /api/projects/:id/compare
  const projectCompareMatch = pathname.match(/^(?:\/api)?\/projects\/([a-zA-Z0-9_-]+)\/compare$/);
  if ((req.method === 'POST' || req.method === 'GET') && projectCompareMatch) {
    const projectId = projectCompareMatch[1]!;
    const project = await store.getProject(projectId);
    if (!project || project.organizationId !== org.id) return json(res, 404, { error: 'project not found' });

    let baseRef: string | undefined;
    let headRef: string | undefined;

    if (req.method === 'GET') {
      baseRef = url.searchParams.get('base') || url.searchParams.get('baseReviewId') || url.searchParams.get('baseBranch') || undefined;
      headRef = url.searchParams.get('head') || url.searchParams.get('headReviewId') || url.searchParams.get('headBranch') || undefined;
    } else {
      const payloadText = await body(req);
      if (payloadText.trim()) {
        try {
          const parsed = JSON.parse(payloadText) as {
            base?: string;
            head?: string;
            baseReviewId?: string;
            headReviewId?: string;
            baseBranch?: string;
            headBranch?: string;
          };
          baseRef = parsed.base || parsed.baseReviewId || parsed.baseBranch;
          headRef = parsed.head || parsed.headReviewId || parsed.headBranch;
        } catch {
          return json(res, 400, { error: 'Invalid JSON payload' });
        }
      }
    }

    if (!baseRef || !headRef) {
      return json(res, 400, { error: 'Both base and head references (review IDs or branch names) are required' });
    }

    const projectReviews = await store.listReviews(projectId);

    // Resolve base review
    let baseReview = projectReviews.find((r) => r.id === baseRef);
    if (!baseReview) {
      const matching = projectReviews
        .filter((r) => (r.branch ?? 'main') === baseRef)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      baseReview = matching[0];
    }
    if (!baseReview) {
      const directBase = await store.getReview(baseRef);
      if (directBase && directBase.projectId === project.id && directBase.organizationId === org.id) {
        baseReview = directBase;
      }
    }

    // Resolve head review
    let headReview = projectReviews.find((r) => r.id === headRef);
    if (!headReview) {
      const matching = projectReviews
        .filter((r) => (r.branch ?? 'main') === headRef)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      headReview = matching[0];
    }
    if (!headReview) {
      const directHead = await store.getReview(headRef);
      if (directHead && directHead.projectId === project.id && directHead.organizationId === org.id) {
        headReview = directHead;
      }
    }

    if (!baseReview) {
      return json(res, 404, { error: `Base reference '${baseRef}' not found for this project` });
    }

    if (!headReview) {
      return json(res, 404, { error: `Head reference '${headRef}' not found for this project` });
    }

    if (baseReview.organizationId !== org.id || headReview.organizationId !== org.id) {
      return json(res, 404, { error: 'review not found' });
    }

    const comparisonResult = compareReviews(
      {
        id: baseReview.id,
        projectId: project.id,
        projectName: project.name,
        branch: baseReview.branch,
        commitSha: baseReview.commitSha,
        score: baseReview.score,
        decision: baseReview.decision,
        findings: baseReview.findings ?? [],
        analyzedFiles: baseReview.analyzedFiles,
        architecture: baseReview.architecture,
        dependencies: baseReview.dependencies,
        coverage: baseReview.coverage,
        gate: baseReview.gate,
        createdAt: baseReview.createdAt,
      },
      {
        id: headReview.id,
        projectId: project.id,
        projectName: project.name,
        branch: headReview.branch,
        commitSha: headReview.commitSha,
        score: headReview.score,
        decision: headReview.decision,
        findings: headReview.findings ?? [],
        analyzedFiles: headReview.analyzedFiles,
        architecture: headReview.architecture,
        dependencies: headReview.dependencies,
        coverage: headReview.coverage,
        gate: headReview.gate,
        createdAt: headReview.createdAt,
      },
    );

    return json(res, 200, comparisonResult);
  }

  // Match /projects/:id/architecture-rules (list & create)
  const projectRulesMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/architecture-rules$/);
  if (projectRulesMatch) {
    const projectId = projectRulesMatch[1]!;
    const project = await store.getProject(projectId);
    if (!project || project.organizationId !== org.id) return json(res, 404, { error: 'project not found' });

    if (req.method === 'GET') {
      const rules = await store.listArchitectureRules(projectId);
      return json(res, 200, rules);
    }

    if (req.method === 'POST') {
      const data = JSON.parse(await body(req)) as {
        name?: string;
        description?: string;
        enabled?: boolean;
        severity?: string;
        type?: string;
        config?: Record<string, unknown>;
      };

      if (!data.name?.trim() || !data.type || !data.severity) {
        return json(res, 400, { error: 'name, type, and severity are required' });
      }

      const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
      if (!validSeverities.includes(data.severity)) {
        return json(res, 400, { error: `invalid severity: ${data.severity}` });
      }

      const config = data.config ?? {};
      const validation = validateArchitectureRuleConfig(data.type as any, config);
      if (!validation.valid) {
        return json(res, 400, { error: validation.error ?? 'invalid rule configuration' });
      }

      const now = new Date().toISOString();
      const rule: ArchitectureRule = {
        id: randomUUID(),
        projectId: project.id,
        organizationId: org.id,
        name: data.name.trim(),
        description: data.description?.trim(),
        enabled: data.enabled !== false,
        severity: data.severity as any,
        type: data.type as any,
        config,
        createdAt: now,
        updatedAt: now,
      };

      await store.createArchitectureRule(rule);
      return json(res, 201, rule);
    }
  }

  // Match /projects/:id/architecture-rules/:ruleId (get, update, delete)
  const projectSingleRuleMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/architecture-rules\/([a-zA-Z0-9_-]+)$/);
  if (projectSingleRuleMatch) {
    const projectId = projectSingleRuleMatch[1]!;
    const ruleId = projectSingleRuleMatch[2]!;
    const project = await store.getProject(projectId);
    if (!project || project.organizationId !== org.id) return json(res, 404, { error: 'project not found' });

    const rule = await store.getArchitectureRule(ruleId);
    if (!rule || rule.projectId !== project.id) return json(res, 404, { error: 'rule not found' });

    if (req.method === 'GET') {
      return json(res, 200, rule);
    }

    if (req.method === 'PATCH') {
      const data = JSON.parse(await body(req)) as {
        name?: string;
        description?: string;
        enabled?: boolean;
        severity?: string;
        type?: string;
        config?: Record<string, unknown>;
      };

      const newType = (data.type ?? rule.type) as any;
      const newConfig = (data.config ?? rule.config) as any;
      if (data.type || data.config) {
        const validation = validateArchitectureRuleConfig(newType, newConfig);
        if (!validation.valid) {
          return json(res, 400, { error: validation.error ?? 'invalid rule configuration' });
        }
      }

      if (data.severity) {
        const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
        if (!validSeverities.includes(data.severity)) {
          return json(res, 400, { error: `invalid severity: ${data.severity}` });
        }
      }

      const updated = await store.updateArchitectureRule(ruleId, {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description?.trim() } : {}),
        ...(data.enabled !== undefined ? { enabled: Boolean(data.enabled) } : {}),
        ...(data.severity ? { severity: data.severity as any } : {}),
        ...(data.type ? { type: data.type as any } : {}),
        ...(data.config ? { config: data.config } : {}),
      });

      return json(res, 200, updated);
    }

    if (req.method === 'DELETE') {
      await store.deleteArchitectureRule(ruleId);
      return json(res, 200, { deleted: true, ruleId });
    }
  }

  // List all recent analyses for the organization: GET /analyses
  if (req.method === 'GET' && pathname === '/analyses') {
    const reviews = await store.listRecentReviews(org.id, 50);
    return json(res, 200, reviews);
  }

  // Match /analyses/:id
  const analysisMatch = pathname.match(/^\/analyses\/([a-zA-Z0-9_-]+)$/);
  if (req.method === 'GET' && analysisMatch) {
    const analysisId = analysisMatch[1]!;
    const job = await store.getAnalysisJob(analysisId);
    if (job && job.organizationId === org.id) {
      return json(res, 200, {
        id: job.id,
        analysisId: job.id,
        projectId: job.projectId,
        organizationId: job.organizationId,
        branch: job.branch,
        status: job.status,
        progress: job.progress,
        startedAt: job.startedAt,
        completedAt: job.completedAt ?? null,
        error: job.error ?? null,
        result: job.result ?? null,
      });
    }

    const review = await store.getReview(analysisId);
    if (review && review.organizationId === org.id) {
      return json(res, 200, {
        id: review.id,
        analysisId: review.id,
        projectId: review.projectId,
        organizationId: review.organizationId,
        branch: review.branch,
        status: 'completed',
        progress: 100,
        startedAt: review.createdAt,
        completedAt: review.createdAt,
        error: null,
        result: review,
      });
    }

    return json(res, 404, { error: 'analysis not found' });
  }

  // Match /projects/:id/coverage or /api/projects/:id/coverage (POST / GET)
  const projectCoverageMatch = pathname.match(/^(?:\/api)?\/projects\/([a-zA-Z0-9_-]+)\/coverage$/);
  if (projectCoverageMatch) {
    const projectId = projectCoverageMatch[1]!;
    const project = await store.getProject(projectId);
    if (!project || project.organizationId !== org.id) return json(res, 404, { error: 'project not found' });

    if (req.method === 'GET') {
      const report = await store.getLatestCoverageReport(projectId);
      if (!report) return json(res, 404, { error: 'no coverage report found for project' });
      return json(res, 200, {
        coverage: {
          lines: report.summary.lines.percentage,
          functions: report.summary.functions.percentage,
          branches: report.summary.branches.percentage,
        },
        summary: report.summary,
        format: report.format,
        files: report.filesCount,
        analysisId: report.reviewId,
        projectId: report.projectId,
        createdAt: report.createdAt,
      });
    }

    if (req.method === 'POST') {
      let payloadText = '';
      try {
        payloadText = await body(req);
      } catch (err) {
        return json(res, 413, { error: 'payload too large' });
      }

      if (!payloadText || !payloadText.trim()) {
        return json(res, 400, { error: 'coverage payload cannot be empty' });
      }

      let rawContent = payloadText;
      let formatHint: CoverageFormat | undefined;
      let explicitAnalysisId: string | undefined;

      if (payloadText.trim().startsWith('{')) {
        try {
          const parsedJson = JSON.parse(payloadText) as {
            content?: string;
            format?: CoverageFormat;
            analysisId?: string;
            reviewId?: string;
          };
          if (parsedJson.content) {
            rawContent = parsedJson.content;
            formatHint = parsedJson.format;
          }
          if (parsedJson.analysisId) explicitAnalysisId = parsedJson.analysisId;
          if (parsedJson.reviewId) explicitAnalysisId = parsedJson.reviewId;
        } catch {
          // not JSON, treat payloadText as raw text
        }
      }

      const queryAnalysisId = url.searchParams.get('analysisId') || url.searchParams.get('reviewId');
      if (queryAnalysisId) explicitAnalysisId = queryAnalysisId;

      let targetReview: Review | undefined;
      if (explicitAnalysisId) {
        targetReview = await store.getReview(explicitAnalysisId);
        if (!targetReview || targetReview.projectId !== project.id || targetReview.organizationId !== org.id) {
          return json(res, 404, { error: 'analysis not found or does not belong to this project' });
        }
      } else {
        targetReview = await store.getLatestReview(project.id);
      }

      if (!targetReview) {
        const newReviewId = randomUUID();
        const now = new Date().toISOString();
        targetReview = {
          id: newReviewId,
          projectId: project.id,
          organizationId: org.id,
          projectName: project.name,
          repository: project.repository,
          branch: project.branch ?? 'main',
          score: 100,
          decision: 'approve',
          findings: [],
          analyzedFiles: 0,
          status: 'COMPLETED',
          createdAt: now,
        };
        await store.createReview(targetReview);
      }

      let parsedCoverage;
      try {
        parsedCoverage = parseCoverage(rawContent, formatHint);
      } catch (err) {
        return json(res, 400, { error: (err as Error).message });
      }

      const reportId = randomUUID();
      const now = new Date().toISOString();
      const report: CoverageReport = {
        id: reportId,
        projectId: project.id,
        reviewId: targetReview.id,
        organizationId: org.id,
        format: parsedCoverage.format,
        summary: parsedCoverage.summary,
        filesCount: parsedCoverage.filesCount,
        fileCoverage: parsedCoverage.files,
        createdAt: now,
      };

      await store.createCoverageReport(report);

      return json(res, 201, {
        coverage: {
          lines: report.summary.lines.percentage,
          functions: report.summary.functions.percentage,
          branches: report.summary.branches.percentage,
        },
        summary: report.summary,
        format: report.format,
        files: report.filesCount,
        analysisId: report.reviewId,
        projectId: report.projectId,
        createdAt: report.createdAt,
      });
    }
  }

  // Match /analyses/:id/coverage or /api/analyses/:id/coverage
  const analysisCoverageMatch = pathname.match(/^(?:\/api)?\/analyses\/([a-zA-Z0-9_-]+)\/coverage$/);
  if (req.method === 'GET' && analysisCoverageMatch) {
    const analysisId = analysisCoverageMatch[1]!;
    const review = await store.getReview(analysisId);
    if (!review || review.organizationId !== org.id) {
      return json(res, 404, { error: 'analysis not found' });
    }
    const report = await store.getCoverageReportByReview(analysisId);
    if (!report) {
      return json(res, 404, { error: 'no coverage report found for analysis' });
    }
    return json(res, 200, {
      coverage: {
        lines: report.summary.lines.percentage,
        functions: report.summary.functions.percentage,
        branches: report.summary.branches.percentage,
      },
      summary: report.summary,
      format: report.format,
      files: report.filesCount,
      analysisId: report.reviewId,
      projectId: report.projectId,
      createdAt: report.createdAt,
    });
  }

  // Integrations status: GET /integrations/github

  if (req.method === 'GET' && (pathname === '/integrations/github' || pathname === '/github/status')) {
    const configured = Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
    return json(res, 200, {
      configured,
      appId: process.env.GITHUB_APP_ID ?? null,
      status: configured ? 'connected' : 'not_configured',
    });
  }

  // Billing subscription info: GET /billing/subscription
  if (req.method === 'GET' && pathname === '/billing/subscription') {
    return json(res, 200, {
      plan: org.plan,
      subscriptionStatus: org.subscriptionStatus ?? null,
      stripeCustomerId: org.stripeCustomerId ?? null,
      configured: Boolean(process.env.STRIPE_SECRET_KEY),
    });
  }

  if (req.method === 'POST' && pathname === '/billing/checkout') {
    const data = JSON.parse(await body(req)) as { plan?: Plan; successUrl?: string; cancelUrl?: string };
    if (!data.plan || data.plan === 'community' || !data.successUrl || !data.cancelUrl) return json(res, 400, { error: 'plan, successUrl and cancelUrl are required' });
    if (!org.stripeCustomerId) return json(res, 400, { error: 'Stripe customer is not configured' });
    return json(res, 200, await createCheckoutSession({ customer: { id: org.stripeCustomerId, email: user.email }, organizationId: org.id, plan: data.plan, successUrl: data.successUrl, cancelUrl: data.cancelUrl }));
  }
  if (req.method === 'POST' && pathname === '/billing/portal') {
    const data = JSON.parse(await body(req)) as { returnUrl?: string };
    if (!data.returnUrl || !org.stripeCustomerId) return json(res, 400, { error: 'returnUrl and Stripe customer are required' });
    return json(res, 200, await createPortalSession(org.stripeCustomerId, data.returnUrl));
  }

  return json(res, 404, { error: 'not found' });
}

async function start(): Promise<void> {
  await migrate();
  createServer((req, res) => {
    handler(req, res).catch((error: unknown) => {
      console.error(error);
      const status = error instanceof Error && error.message === 'request body too large' ? 413 : 500;
      json(res, status, { error: status === 413 ? 'request body too large' : 'internal error' });
    });
  }).listen(port, () => console.log(`QualityGuard API listening on :${port}`));
}

if (process.env.NODE_ENV !== 'test') {
  start().catch((error: unknown) => { console.error('QualityGuard API failed to start', error); process.exit(1); });
}
