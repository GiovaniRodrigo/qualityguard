import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeDiff } from '@qualityguard/analyzer';
import { createGitHubClient, createInstallationToken, shouldReviewPullRequest, verifyGitHubWebhook, type PullRequestEvent } from '@qualityguard/github';
import { hashPassword, signToken, verifyPassword, verifyToken } from './auth.js';
import { healthDatabase, pool, PostgresStore, recordStripeEvent } from './db.js';
import { createCheckoutSession, createCustomer, createPortalSession, mapSubscriptionEvent, verifyStripeSignature, type Plan, type StripeSubscriptionEvent } from './billing.js';

const store = new PostgresStore();
const port = Number(process.env.PORT ?? 8787);
const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;
const rateBuckets = new Map<string, { startedAt: number; count: number }>();

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<string> {
  let total = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw new Error('request body too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function rateLimited(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const current = rateBuckets.get(address);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(address, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT;
}

function auth(req: IncomingMessage): string | null {
  const value = req.headers.authorization;
  return value?.startsWith('Bearer ') ? verifyToken(value.slice(7)) : null;
}

async function migrate(): Promise<void> {
  if (!pool) throw new Error('DATABASE_URL is required in production');
  const migrationPath = process.env.MIGRATION_FILE ?? join(__dirname, '../migrations/001_initial.sql');
  await pool.query(await readFile(migrationPath, 'utf8'));
}

async function processPullRequest(event: PullRequestEvent): Promise<void> {
  if (!shouldReviewPullRequest(event) || !event.installation?.id || !event.repository || !event.pull_request) return;
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!appId || !privateKey) throw new Error('GitHub App credentials are not configured');
  const token = await createInstallationToken(appId, privateKey, event.installation.id);
  const client = createGitHubClient(token);
  const [owner, repo] = event.repository.full_name.split('/');
  if (!owner || !repo) throw new Error(`Invalid GitHub repository: ${event.repository.full_name}`);
  const diff = await client.getPullRequestDiff(owner, repo, event.pull_request.number);
  const result = analyzeDiff(diff);
  const conclusion = result.decision === 'block' ? 'failure' : result.decision === 'review_required' ? 'neutral' : 'success';
  const summary = [`Score: ${result.score}/100`, `Decision: ${result.decision}`, `Changed files: ${result.changedFiles}`, `Additions: ${result.additions}`, `Deletions: ${result.deletions}`, `Findings: ${result.findings.length}`].join('\n');
  await client.createCheck(owner, repo, event.pull_request.head.sha, conclusion, 'QualityGuard review', summary);
}

async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    const database = await healthDatabase();
    return json(res, database ? 200 : 503, { ok: database, service: 'qualityguard-api', database });
  }
  if (req.method === 'GET' && url.pathname === '/ready') {
    const database = await healthDatabase();
    return json(res, database ? 200 : 503, { ready: database });
  }

  if (req.method === 'POST' && url.pathname === '/webhooks/github') {
    const payload = await body(req);
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret || !verifyGitHubWebhook(payload, req.headers['x-hub-signature-256'], secret)) return json(res, 401, { error: 'invalid GitHub signature' });
    let event: PullRequestEvent;
    try { event = JSON.parse(payload) as PullRequestEvent; } catch { return json(res, 400, { error: 'invalid JSON payload' }); }
    res.writeHead(202, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ accepted: true }));
    void processPullRequest(event).catch((error: unknown) => console.error('GitHub PR review failed', error));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/webhooks/stripe') {
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
      if (org) await store.updateSubscription(org.id, { subscriptionId: event.subscriptionId, status: event.status, plan: event.plan });
    }
    return json(res, 200, { received: true });
  }

  if ((req.method === 'POST' && (url.pathname === '/auth/register' || url.pathname === '/auth/login')) && rateLimited(req)) {
    res.setHeader('retry-after', '60');
    return json(res, 429, { error: 'too many authentication requests' });
  }

  if (req.method === 'POST' && url.pathname === '/auth/register') {
    const data = JSON.parse(await body(req)) as { email?: string; password?: string; organization?: string };
    const email = data.email?.trim().toLowerCase();
    if (!email || !data.password || data.password.length < 12) return json(res, 400, { error: 'email and password (12+ chars) are required' });
    if (await store.findUserByEmail(email)) return json(res, 409, { error: 'email already registered' });
    const id = randomUUID();
    await store.createUser({ id, email, passwordHash: hashPassword(data.password), createdAt: new Date().toISOString() });
    const orgId = randomUUID();
    const stripeCustomerId = process.env.STRIPE_SECRET_KEY ? (await createCustomer(email)).id : undefined;
    await store.createOrganization({ id: orgId, name: data.organization?.trim() || `${email} organization`, ownerId: id, plan: 'community', ...(stripeCustomerId ? { stripeCustomerId } : {}) });
    return json(res, 201, { token: signToken(id), userId: id, organizationId: orgId });
  }

  if (req.method === 'POST' && url.pathname === '/auth/login') {
    const data = JSON.parse(await body(req)) as { email?: string; password?: string };
    const user = data.email ? await store.findUserByEmail(data.email.trim().toLowerCase()) : undefined;
    if (!user || !data.password || !verifyPassword(data.password, user.passwordHash)) return json(res, 401, { error: 'invalid credentials' });
    return json(res, 200, { token: signToken(user.id), userId: user.id });
  }

  const userId = auth(req);
  if (!userId) return json(res, 401, { error: 'authentication required' });
  const user = await store.getUser(userId);
  const org = await store.findOrganizationByOwner(userId);
  if (!user || !org) return json(res, 403, { error: 'organization not found' });

  if (req.method === 'GET' && url.pathname === '/me') return json(res, 200, { user, organization: org, projects: await store.listProjects(org.id) });
  if (req.method === 'POST' && url.pathname === '/projects') {
    const data = JSON.parse(await body(req)) as { name?: string; repository?: string };
    if (!data.name?.trim() || !data.repository?.trim()) return json(res, 400, { error: 'name and repository are required' });
    const project = { id: randomUUID(), organizationId: org.id, name: data.name.trim(), repository: data.repository.trim(), createdAt: new Date().toISOString() };
    await store.createProject(project);
    return json(res, 201, project);
  }
  if (req.method === 'POST' && url.pathname === '/billing/checkout') {
    const data = JSON.parse(await body(req)) as { plan?: Plan; successUrl?: string; cancelUrl?: string };
    if (!data.plan || data.plan === 'community' || !data.successUrl || !data.cancelUrl) return json(res, 400, { error: 'plan, successUrl and cancelUrl are required' });
    if (!org.stripeCustomerId) return json(res, 400, { error: 'Stripe customer is not configured' });
    return json(res, 200, await createCheckoutSession({ customer: { id: org.stripeCustomerId, email: user.email }, organizationId: org.id, plan: data.plan, successUrl: data.successUrl, cancelUrl: data.cancelUrl }));
  }
  if (req.method === 'POST' && url.pathname === '/billing/portal') {
    const data = JSON.parse(await body(req)) as { returnUrl?: string };
    if (!data.returnUrl || !org.stripeCustomerId) return json(res, 400, { error: 'returnUrl and Stripe customer are required' });
    return json(res, 200, await createPortalSession(org.stripeCustomerId, data.returnUrl));
  }
  return json(res, 404, { error: 'not found' });
}

async function start(): Promise<void> {
  await migrate();
  createServer((req, res) => {
    handler(req, res).catch((error: unknown) => { console.error(error); const status = error instanceof Error && error.message === 'request body too large' ? 413 : 500; json(res, status, { error: status === 413 ? 'request body too large' : 'internal error' }); });
  }).listen(port, () => console.log(`QualityGuard API listening on :${port}`));
}

start().catch((error: unknown) => { console.error('QualityGuard API failed to start', error); process.exit(1); });
