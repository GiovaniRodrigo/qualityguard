import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { analyze, calculateScore, defaultRules, evaluateGate, extractAllDependencies, parseCoverage, CoverageParseError, compareReviews, type SourceFile } from '@qualityguard/analyzer';
import { buildDependencyGraph, findCycles, detectDrift, evaluateArchitectureRules, validateArchitectureRuleConfig, type ArchitectureGraph, type Drift } from '@qualityguard/architecture';
import { buildRemediationPrompt, getAIProvider } from '@qualityguard/ai';
import type { Finding, DependencyItem, ArchitectureRule, CoverageReport, CoverageFormat, ReviewComparisonResult } from '@qualityguard/domain';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const execFileAsync = promisify(execFile);

// Auth helpers
function getSecret(): string {
  return process.env.QUALITYGUARD_AUTH_SECRET ?? 'development-only-change-me';
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 32).toString('hex');
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function signToken(subject: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: subject, iat: now, exp: now + 60 * 60 * 24 * 7 })).toString('base64url');
  const data = `${header}.${payload}`;
  const signature = createHmac('sha256', getSecret()).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function verifyToken(token: string): string | null {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;
  const data = `${header}.${payload}`;
  const expected = createHmac('sha256', getSecret()).update(data).digest('base64url');
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub?: string; exp?: number };
    return value.sub && value.exp && value.exp > Date.now() / 1000 ? value.sub : null;
  } catch {
    return null;
  }
}

// In-memory data store for standalone web runtime
interface UserData { id: string; email: string; passwordHash: string; createdAt: string; }
interface OrgData { id: string; name: string; ownerId: string; plan: 'community' | 'pro' | 'team' | 'enterprise'; stripeCustomerId?: string; subscriptionStatus?: string; }
interface ProjectData { id: string; organizationId: string; name: string; repository: string; branch?: string; createdAt: string; }
interface ReviewData {
  id: string;
  projectId: string;
  organizationId: string;
  projectName?: string;
  repository?: string;
  branch?: string;
  commitSha?: string;
  score: number;
  decision: string;
  findings: Finding[];
  analyzedFiles: number;
  architecture?: {
    nodes: string[];
    edges: Array<{ from: string; to: string; kind: 'import' | 'require' }>;
    cycles: string[][];
    drift: Array<{ type: string; from: string; to: string; message: string }>;
  };
  dependencies?: DependencyItem[];
  coverage?: any;
  gate?: { passed: boolean; reasons: string[]; decision: string };
  categoryScores?: { architecture: number; security: number; testing: number | null; dependencies: number };
  aiInsight?: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
}

interface JobData {
  id: string;
  projectId: string;
  organizationId: string;
  branch: string;
  status: 'queued' | 'cloning' | 'analyzing' | 'completed' | 'failed';
  progress: number;
  startedAt: string;
  completedAt?: string | null;
  error?: string | null;
  result?: ReviewData | null;
}

const usersMap = new Map<string, UserData>();
const orgsMap = new Map<string, OrgData>();
const projectsMap = new Map<string, ProjectData>();
const reviewsMap = new Map<string, ReviewData>();
const jobsMap = new Map<string, JobData>();
const rulesMap = new Map<string, ArchitectureRule>();
const coverageReportsMap = new Map<string, CoverageReport>();

// File collection & real analysis
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.rs', '.py', '.go', '.java', '.rb', '.cs',
  '.json', '.toml', '.yaml', '.yml', '.xml', '.txt',
]);
const IGNORED_DIRECTORIES = new Set([
  'node_modules', '.git', 'target', 'dist', 'build',
  'coverage', '.next', '.turbo', '.cache', 'vendor',
]);

async function collectFilesFromDir(baseDir: string, currentDir = baseDir, maxFiles = 2000): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  async function walk(dir: string): Promise<void> {
    if (files.length >= maxFiles) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && (SOURCE_EXTENSIONS.has(extname(entry.name)) || entry.name === 'go.mod' || entry.name === 'pom.xml' || entry.name === 'requirements.txt' || entry.name === 'Cargo.toml')) {
        try {
          const content = await readFile(fullPath, 'utf8');
          files.push({ path: relative(baseDir, fullPath).replace(/\\/g, '/'), content });
        } catch {}
      }
    }
  }
  await walk(baseDir);
  return files;
}

async function runAnalysisPipeline(repository: string, branch?: string, architectureRules: ArchitectureRule[] = []) {
  const isLocal = repository.startsWith('/') || repository.startsWith('./') || repository.startsWith('../');
  let targetDir = repository;
  let isTemp = false;
  let commitSha: string | undefined;

  if (!isLocal) {
    let repoUrl = repository;
    if (!repository.startsWith('http://') && !repository.startsWith('https://') && !repository.startsWith('git@')) {
      repoUrl = `https://github.com/${repository}.git`;
    }
    const tempDir = await mkdtemp(join(tmpdir(), 'qg-repo-'));
    targetDir = tempDir;
    isTemp = true;

    const gitArgs = [
      '-c', 'protocol.file.allow=never',
      '-c', 'submodule.recurse=false',
      'clone',
      '--depth', '1',
      '--no-tags',
      '--recurse-submodules=no',
    ];
    if (branch) gitArgs.push('--branch', branch);
    gitArgs.push('--', repoUrl, tempDir);

    try {
      await execFileAsync('git', gitArgs, { timeout: 30000 });
      try {
        const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: tempDir });
        commitSha = stdout.trim();
      } catch {}
    } catch {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw new Error(`Failed to clone repository: ${repository}`);
    }
  }

  try {
    const files = await collectFilesFromDir(targetDir);
    const result = analyze({ files, rules: defaultRules });
    const graph: ArchitectureGraph = buildDependencyGraph(files);
    const cycles = findCycles(graph);
    const drift: Drift[] = detectDrift(graph, {});

    if (architectureRules && architectureRules.length > 0) {
      const customFindings = evaluateArchitectureRules(graph, architectureRules);
      result.findings.push(...customFindings);
    } else {
      for (const cycle of cycles) {
        result.findings.push({
          id: `ARCH-CYCLE-${cycle.join('-')}`,
          severity: 'high',
          category: 'architecture',
          status: 'open',
          decision: 'review_required',
          file: cycle[0] ?? 'unknown',
          title: 'Circular dependency cycle detected',
          description: `Cycle: ${cycle.join(' -> ')}`,
          suggestion: 'Decouple circular module dependencies into separate abstractions.',
          confidence: 0.95,
          source: 'deterministic',
          ruleId: 'architecture.cycle-detected',
        });
      }
    }

    result.score = calculateScore(result.findings);

    const dependencies = extractAllDependencies(files);
    const archFindings = result.findings.filter((f) => f.category === 'architecture' && f.status === 'open');
    const secFindings = result.findings.filter((f) => f.category === 'security' && f.status === 'open');
    const depFindings = result.findings.filter((f) => f.category === 'dependency' && f.status === 'open');

    const penalties = { critical: 35, high: 20, medium: 10, low: 3, info: 0 } as const;
    const calcCategory = (findings: Finding[]) =>
      Math.max(0, Math.min(100, 100 - findings.reduce((acc, f) => acc + (penalties[f.severity] ?? 0), 0)));

    const gate = evaluateGate(result.score, result.findings, { minimumScore: 80, blockOn: ['critical', 'high'] });
    const aiInsight = result.findings.length > 0
      ? `QualityGuard detected ${result.findings.length} findings across ${files.length} analyzed files. Primary area to address: ${result.findings[0]?.title} in ${result.findings[0]?.file}.`
      : `Clean architecture and zero open findings across ${files.length} analyzed files. Quality gate passed.`;

    return {
      score: result.score,
      decision: gate.decision,
      analyzedFiles: files.length,
      findings: result.findings,
      architecture: { nodes: graph.nodes, edges: graph.edges, cycles, drift },
      dependencies,
      gate,
      categoryScores: {
        architecture: calcCategory(archFindings),
        security: calcCategory(secFindings),
        testing: null,
        dependencies: calcCategory(depFindings),
      },
      commitSha,
      aiInsight,
    };
  } finally {
    if (isTemp) {
      await rm(targetDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

// Check authorization header
function getAuthUserId(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyToken(authHeader.slice(7));
}

// Central Request Dispatcher
async function handleRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: pathSegments } = await params;
  const pathname = '/' + pathSegments.join('/');
  const method = req.method;

  // 1. Check if external API is running on port 8787 or API_URL
  const externalApiUrl = process.env.API_URL || 'http://127.0.0.1:8787';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 350);
    const healthCheck = await fetch(`${externalApiUrl}/health`, { signal: controller.signal }).catch(() => null);
    clearTimeout(timeoutId);

    if (healthCheck && healthCheck.ok) {
      // Proxy request to external API
      const targetUrl = `${externalApiUrl}${pathname}${req.nextUrl.search}`;
      const headers = new Headers(req.headers);
      headers.delete('host');

      const body = ['GET', 'HEAD', 'OPTIONS'].includes(method) ? undefined : await req.arrayBuffer();
      const response = await fetch(targetUrl, {
        method,
        headers,
        body,
      });

      return new NextResponse(response.body, {
        status: response.status,
        headers: response.headers,
      });
    }
  } catch {}

  // 2. Fallback: Internal in-app handler
  if (method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (method === 'GET' && pathname === '/health') {
    return NextResponse.json({ ok: true, service: 'qualityguard-api-inapp', version: '0.3.0' });
  }
  if (method === 'GET' && pathname === '/ready') {
    return NextResponse.json({ ready: true });
  }

  // Auth: Register
  if (method === 'POST' && pathname === '/auth/register') {
    let data: { email?: string; password?: string; organization?: string };
    try { data = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
    const email = data.email?.trim().toLowerCase();
    if (!email || !data.password || data.password.length < 8) {
      return NextResponse.json({ error: 'email and password (8+ chars) are required' }, { status: 400 });
    }

    const existingUser = [...usersMap.values()].find((u) => u.email === email);
    if (existingUser) {
      return NextResponse.json({ error: 'email already registered' }, { status: 409 });
    }

    const userId = randomUUID();
    const user: UserData = { id: userId, email, passwordHash: hashPassword(data.password), createdAt: new Date().toISOString() };
    usersMap.set(userId, user);

    const orgId = randomUUID();
    const org: OrgData = { id: orgId, name: data.organization?.trim() || `${email.split('@')[0]} workspace`, ownerId: userId, plan: 'community' };
    orgsMap.set(orgId, org);

    return NextResponse.json({ token: signToken(userId), userId, organizationId: orgId, email }, { status: 201 });
  }

  // Auth: Login
  if (method === 'POST' && pathname === '/auth/login') {
    let data: { email?: string; password?: string };
    try { data = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
    const email = data.email?.trim().toLowerCase();
    const user = email ? [...usersMap.values()].find((u) => u.email === email) : undefined;
    if (!user || !data.password || !verifyPassword(data.password, user.passwordHash)) {
      return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
    }
    return NextResponse.json({ token: signToken(user.id), userId: user.id, email: user.email }, { status: 200 });
  }

  // Authenticated routes check
  const userId = getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'authentication required' }, { status: 401 });
  }
  const user = usersMap.get(userId);
  if (!user) {
    return NextResponse.json({ error: 'user not found' }, { status: 401 });
  }
  let org = [...orgsMap.values()].find((o) => o.ownerId === userId);
  if (!org) {
    const orgId = randomUUID();
    org = { id: orgId, name: `${user.email.split('@')[0]} workspace`, ownerId: userId, plan: 'community' };
    orgsMap.set(orgId, org);
  }

  // GET /me
  if (method === 'GET' && pathname === '/me') {
    const projects = [...projectsMap.values()].filter((p) => p.organizationId === org.id);
    return NextResponse.json({
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
      organization: org,
      projects,
    });
  }

  // GET /projects
  if (method === 'GET' && pathname === '/projects') {
    const projects = [...projectsMap.values()].filter((p) => p.organizationId === org.id);
    const withLatest = projects.map((p) => {
      const reviews = [...reviewsMap.values()].filter((r) => r.projectId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const latest = reviews[0];
      return {
        ...p,
        latestAnalysis: latest ? {
          id: latest.id,
          score: latest.score,
          decision: latest.decision,
          findingsCount: latest.findings.length,
          createdAt: latest.createdAt,
          status: latest.status,
        } : null,
      };
    });
    return NextResponse.json(withLatest);
  }

  // POST /projects
  if (method === 'POST' && pathname === '/projects') {
    let data: { name?: string; repository?: string; branch?: string };
    try { data = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
    if (!data.name?.trim() || !data.repository?.trim()) {
      return NextResponse.json({ error: 'name and repository are required' }, { status: 400 });
    }
    const project: ProjectData = {
      id: randomUUID(),
      organizationId: org.id,
      name: data.name.trim(),
      repository: data.repository.trim(),
      branch: data.branch?.trim() || 'main',
      createdAt: new Date().toISOString(),
    };
    projectsMap.set(project.id, project);
    return NextResponse.json(project, { status: 201 });
  }

  // Match /projects/:id
  const projectMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)$/);
  if (projectMatch) {
    const projectId = projectMatch[1]!;
    const project = projectsMap.get(projectId);
    if (!project || project.organizationId !== org.id) return NextResponse.json({ error: 'project not found' }, { status: 404 });

    if (method === 'GET') {
      const reviews = [...reviewsMap.values()].filter((r) => r.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return NextResponse.json({ ...project, latestAnalysis: reviews[0] ?? null });
    }
    if (method === 'DELETE') {
      projectsMap.delete(projectId);
      for (const [revId, rev] of reviewsMap.entries()) {
        if (rev.projectId === projectId) reviewsMap.delete(revId);
      }
      return NextResponse.json({ deleted: true, projectId });
    }
  }

  // Trigger analysis: POST /projects/:id/analyses or POST /analyses
  const projectAnalyzeMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/analyses$/);
  if (method === 'POST' && (projectAnalyzeMatch || pathname === '/analyses')) {
    let projectId: string | undefined = projectAnalyzeMatch?.[1];
    let customBranch: string | undefined;

    try {
      const parsed = await req.json();
      if (parsed.projectId) projectId = parsed.projectId;
      if (parsed.branch) customBranch = parsed.branch;
    } catch {}

    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    const project = projectsMap.get(projectId);
    if (!project || project.organizationId !== org.id) return NextResponse.json({ error: 'project not found' }, { status: 404 });

    const targetBranch = customBranch || project.branch || 'main';
    const analysisId = randomUUID();
    const job: JobData = {
      id: analysisId,
      projectId: project.id,
      organizationId: org.id,
      branch: targetBranch,
      status: 'queued',
      progress: 0,
      startedAt: new Date().toISOString(),
      error: null,
      result: null,
    };
    jobsMap.set(analysisId, job);

    setTimeout(async () => {
      try {
        job.status = 'cloning';
        job.progress = 20;
        const projectRules = [...rulesMap.values()].filter((r) => r.projectId === project.id);
        const analysisOutput = await runAnalysisPipeline(project.repository, targetBranch, projectRules);
        job.status = 'analyzing';
        job.progress = 70;
        const review: ReviewData = {
          id: randomUUID(),
          projectId: project.id,
          organizationId: org.id,
          projectName: project.name,
          repository: project.repository,
          branch: targetBranch,
          commitSha: analysisOutput.commitSha,
          score: analysisOutput.score,
          decision: analysisOutput.decision,
          findings: analysisOutput.findings,
          analyzedFiles: analysisOutput.analyzedFiles,
          architecture: analysisOutput.architecture,
          dependencies: analysisOutput.dependencies,
          gate: analysisOutput.gate,
          categoryScores: analysisOutput.categoryScores,
          aiInsight: analysisOutput.aiInsight,
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        };
        reviewsMap.set(review.id, review);
        job.status = 'completed';
        job.progress = 100;
        job.result = review;
        job.completedAt = new Date().toISOString();
      } catch (err) {
        job.status = 'failed';
        job.error = (err as Error).message;
        job.completedAt = new Date().toISOString();
      }
    }, 10);

    return NextResponse.json({
      analysisId: job.id,
      id: job.id,
      status: job.status,
      progress: job.progress,
      projectId: project.id,
      startedAt: job.startedAt,
    }, { status: 202 });
  }

  // GET /projects/:id/analyses/latest
  const latestMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/analyses\/latest$/);
  if (method === 'GET' && latestMatch) {
    const projectId = latestMatch[1]!;
    const project = projectsMap.get(projectId);
    if (!project || project.organizationId !== org.id) return NextResponse.json({ error: 'project not found' }, { status: 404 });
    const reviews = [...reviewsMap.values()].filter((r) => r.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!reviews[0]) return NextResponse.json({ error: 'no analysis available yet' }, { status: 404 });
    return NextResponse.json(reviews[0]);
  }

  // GET /projects/:id/architecture
  const archMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/architecture$/);
  if (method === 'GET' && archMatch) {
    const projectId = archMatch[1]!;
    const reviews = [...reviewsMap.values()].filter((r) => r.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!reviews[0]?.architecture) return NextResponse.json({ error: 'no architecture analysis available' }, { status: 404 });
    return NextResponse.json(reviews[0].architecture);
  }

  // GET /projects/:id/findings
  const findingsMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/findings$/);
  if (method === 'GET' && findingsMatch) {
    const projectId = findingsMatch[1]!;
    const reviews = [...reviewsMap.values()].filter((r) => r.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json(reviews[0]?.findings ?? []);
  }

  // POST /findings/:id/remediate
  const remediateMatch = pathname.match(/^(?:\/api)?\/findings\/([^/]+)\/remediate$/);
  if (method === 'POST' && remediateMatch) {
    const findingId = decodeURIComponent(remediateMatch[1]!);

    // Search across reviews belonging to org
    let targetFinding: Finding | undefined;
    let targetReview: ReviewData | undefined;
    let targetProject: ProjectData | undefined;

    for (const rev of reviewsMap.values()) {
      if (rev.organizationId === org.id) {
        const f = rev.findings.find((item) => item.id === findingId);
        if (f) {
          targetFinding = f;
          targetReview = rev;
          targetProject = projectsMap.get(rev.projectId);
          break;
        }
      }
    }

    if (!targetFinding || !targetProject) {
      return NextResponse.json({ error: 'finding not found' }, { status: 404 });
    }

    let customFiles: Array<{ path: string; content: string }> = [];
    try {
      const data = await req.json();
      if (Array.isArray(data.files)) {
        customFiles = data.files;
      }
    } catch {}

    const promptResult = buildRemediationPrompt({
      finding: targetFinding,
      repository: targetProject.repository,
      branch: targetProject.branch ?? 'main',
      relevantFiles: customFiles,
      architectureSummary: targetReview?.architecture
        ? `Nodes: ${targetReview.architecture.nodes.length}, Edges: ${targetReview.architecture.edges.length}, Cycles: ${targetReview.architecture.cycles.length}`
        : undefined,
      dependencySummary: targetReview?.dependencies
        ? targetReview.dependencies.map((d) => `${d.name}@${d.version ?? '*'}`).join(', ')
        : undefined,
    });

    const provider = getAIProvider();

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            `event: start\ndata: ${JSON.stringify({
              findingId: targetFinding.id,
              provider: provider.name,
              wasLimited: promptResult.wasLimited,
              redacted: promptResult.redacted,
              limitReasons: promptResult.limitReasons,
            })}\n\n`,
          ),
        );

        try {
          for await (const chunk of provider.streamCompletion({
            ...promptResult.request,
            signal: req.signal,
          })) {
            if (req.signal?.aborted) break;
            controller.enqueue(encoder.encode(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`));
          }

          if (!req.signal?.aborted) {
            controller.enqueue(encoder.encode(`event: complete\ndata: ${JSON.stringify({ status: 'completed' })}\n\n`));
          }
        } catch (err) {
          if (!req.signal?.aborted) {
            controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: (err as Error).message })}\n\n`));
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'connection': 'keep-alive',
      },
    });
  }


  // GET /projects/:id/security
  const securityMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/security$/);
  if (method === 'GET' && securityMatch) {
    const projectId = securityMatch[1]!;
    const reviews = [...reviewsMap.values()].filter((r) => r.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const secFindings = reviews[0]?.findings.filter((f) => f.category === 'security') ?? [];
    return NextResponse.json({
      score: reviews[0]?.categoryScores?.security ?? null,
      findings: secFindings,
      totalSecurityFindings: secFindings.length,
    });
  }

  // GET /projects/:id/dependencies
  const depsMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/dependencies$/);
  if (method === 'GET' && depsMatch) {
    const projectId = depsMatch[1]!;
    const reviews = [...reviewsMap.values()].filter((r) => r.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json(reviews[0]?.dependencies ?? []);
  }

  // /projects/:id/compare (POST & GET)
  const compareMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/compare$/);
  if (compareMatch && (method === 'POST' || method === 'GET')) {
    const projectId = compareMatch[1]!;
    const project = projectsMap.get(projectId);
    if (!project || project.organizationId !== org.id) {
      return NextResponse.json({ error: 'project not found' }, { status: 404 });
    }

    let baseRef: string | undefined;
    let headRef: string | undefined;

    if (method === 'GET') {
      const url = new URL(req.url);
      baseRef = url.searchParams.get('base') || url.searchParams.get('baseReviewId') || url.searchParams.get('baseBranch') || undefined;
      headRef = url.searchParams.get('head') || url.searchParams.get('headReviewId') || url.searchParams.get('headBranch') || undefined;
    } else {
      try {
        const bodyData = await req.json() as {
          base?: string;
          head?: string;
          baseReviewId?: string;
          headReviewId?: string;
          baseBranch?: string;
          headBranch?: string;
        };
        baseRef = bodyData.base || bodyData.baseReviewId || bodyData.baseBranch;
        headRef = bodyData.head || bodyData.headReviewId || bodyData.headBranch;
      } catch {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
      }
    }

    if (!baseRef || !headRef) {
      return NextResponse.json({ error: 'Both base and head references are required' }, { status: 400 });
    }

    const projectReviews = [...reviewsMap.values()].filter((r) => r.projectId === projectId);

    let baseReview = projectReviews.find((r) => r.id === baseRef);
    if (!baseReview) {
      const matching = projectReviews
        .filter((r) => (r.branch ?? 'main') === baseRef)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      baseReview = matching[0];
    }

    let headReview = projectReviews.find((r) => r.id === headRef);
    if (!headReview) {
      const matching = projectReviews
        .filter((r) => (r.branch ?? 'main') === headRef)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      headReview = matching[0];
    }

    if (!baseReview) {
      return NextResponse.json({ error: `Base reference '${baseRef}' not found for this project` }, { status: 404 });
    }

    if (!headReview) {
      return NextResponse.json({ error: `Head reference '${headRef}' not found for this project` }, { status: 404 });
    }

    if (baseReview.organizationId !== org.id || headReview.organizationId !== org.id) {
      return NextResponse.json({ error: 'review not found' }, { status: 404 });
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

    return NextResponse.json(comparisonResult);
  }

  // /projects/:id/architecture-rules (list & create)
  const rulesListMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/architecture-rules$/);
  if (rulesListMatch) {
    const projectId = rulesListMatch[1]!;
    const project = projectsMap.get(projectId);
    if (!project || project.organizationId !== org.id) return NextResponse.json({ error: 'project not found' }, { status: 404 });

    if (method === 'GET') {
      const rules = [...rulesMap.values()].filter((r) => r.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return NextResponse.json(rules);
    }

    if (method === 'POST') {
      const data = await req.json();
      if (!data.name?.trim() || !data.type || !data.severity) {
        return NextResponse.json({ error: 'name, type, and severity are required' }, { status: 400 });
      }

      const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
      if (!validSeverities.includes(data.severity)) {
        return NextResponse.json({ error: `invalid severity: ${data.severity}` }, { status: 400 });
      }

      const config = data.config ?? {};
      const validation = validateArchitectureRuleConfig(data.type, config);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error ?? 'invalid rule configuration' }, { status: 400 });
      }

      const now = new Date().toISOString();
      const rule: ArchitectureRule = {
        id: randomUUID(),
        projectId: project.id,
        organizationId: org.id,
        name: data.name.trim(),
        description: data.description?.trim(),
        enabled: data.enabled !== false,
        severity: data.severity,
        type: data.type,
        config,
        createdAt: now,
        updatedAt: now,
      };

      rulesMap.set(rule.id, rule);
      return NextResponse.json(rule, { status: 201 });
    }
  }

  // /projects/:id/architecture-rules/:ruleId (get, update, delete)
  const singleRuleMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/architecture-rules\/([a-zA-Z0-9_-]+)$/);
  if (singleRuleMatch) {
    const projectId = singleRuleMatch[1]!;
    const ruleId = singleRuleMatch[2]!;
    const project = projectsMap.get(projectId);
    if (!project || project.organizationId !== org.id) return NextResponse.json({ error: 'project not found' }, { status: 404 });

    const rule = rulesMap.get(ruleId);
    if (!rule || rule.projectId !== project.id) return NextResponse.json({ error: 'rule not found' }, { status: 404 });

    if (method === 'GET') {
      return NextResponse.json(rule);
    }

    if (method === 'PATCH') {
      const data = await req.json();
      const newType = data.type ?? rule.type;
      const newConfig = data.config ?? rule.config;
      if (data.type || data.config) {
        const validation = validateArchitectureRuleConfig(newType, newConfig);
        if (!validation.valid) {
          return NextResponse.json({ error: validation.error ?? 'invalid rule configuration' }, { status: 400 });
        }
      }

      if (data.severity) {
        const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
        if (!validSeverities.includes(data.severity)) {
          return NextResponse.json({ error: `invalid severity: ${data.severity}` }, { status: 400 });
        }
      }

      const updated: ArchitectureRule = {
        ...rule,
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description?.trim() } : {}),
        ...(data.enabled !== undefined ? { enabled: Boolean(data.enabled) } : {}),
        ...(data.severity ? { severity: data.severity } : {}),
        ...(data.type ? { type: data.type } : {}),
        ...(data.config ? { config: data.config } : {}),
        updatedAt: new Date().toISOString(),
      };

      rulesMap.set(ruleId, updated);
      return NextResponse.json(updated);
    }

    if (method === 'DELETE') {
      rulesMap.delete(ruleId);
      return NextResponse.json({ deleted: true, ruleId });
    }
  }

  // /projects/:id/coverage (POST & GET)
  const projCoverageMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)\/coverage$/);
  if (projCoverageMatch) {
    const projectId = projCoverageMatch[1]!;
    const project = projectsMap.get(projectId);
    if (!project || project.organizationId !== org.id) return NextResponse.json({ error: 'project not found' }, { status: 404 });

    if (method === 'GET') {
      const reports = [...coverageReportsMap.values()]
        .filter((c) => c.projectId === projectId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (reports.length === 0) return NextResponse.json({ error: 'no coverage report found for project' }, { status: 404 });
      const report = reports[0]!;
      return NextResponse.json({
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

    if (method === 'POST') {
      const payloadText = await req.text();
      if (!payloadText || !payloadText.trim()) {
        return NextResponse.json({ error: 'coverage payload cannot be empty' }, { status: 400 });
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
        } catch {}
      }

      const urlObj = new URL(req.url);
      const queryAnalysisId = urlObj.searchParams.get('analysisId') || urlObj.searchParams.get('reviewId');
      if (queryAnalysisId) explicitAnalysisId = queryAnalysisId;

      let targetReview: ReviewData | undefined;
      if (explicitAnalysisId) {
        targetReview = reviewsMap.get(explicitAnalysisId);
        if (!targetReview || targetReview.projectId !== project.id || targetReview.organizationId !== org.id) {
          return NextResponse.json({ error: 'analysis not found or does not belong to this project' }, { status: 404 });
        }
      } else {
        const reviews = [...reviewsMap.values()]
          .filter((r) => r.projectId === projectId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        targetReview = reviews[0];
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
        reviewsMap.set(newReviewId, targetReview);
      }

      let parsedCoverage;
      try {
        parsedCoverage = parseCoverage(rawContent, formatHint);
      } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 400 });
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

      coverageReportsMap.set(reportId, report);

      // Update target review
      targetReview.coverage = report.summary;
      if (!targetReview.categoryScores) {
        targetReview.categoryScores = { architecture: 100, security: 100, testing: null, dependencies: 100 };
      }
      targetReview.categoryScores.testing = report.summary.lines.percentage;

      return NextResponse.json(
        {
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
        },
        { status: 201 },
      );
    }
  }

  // /analyses/:id/coverage (GET)
  const analysisCoverageMatch = pathname.match(/^\/analyses\/([a-zA-Z0-9_-]+)\/coverage$/);
  if (method === 'GET' && analysisCoverageMatch) {
    const analysisId = analysisCoverageMatch[1]!;
    const review = reviewsMap.get(analysisId);
    if (!review || review.organizationId !== org.id) {
      return NextResponse.json({ error: 'analysis not found' }, { status: 404 });
    }
    const report = [...coverageReportsMap.values()].find((c) => c.reviewId === analysisId);
    if (!report) {
      return NextResponse.json({ error: 'no coverage report found for analysis' }, { status: 404 });
    }
    return NextResponse.json({
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

  // GET /analyses

  if (method === 'GET' && pathname === '/analyses') {
    const reviews = [...reviewsMap.values()].filter((r) => r.organizationId === org.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json(reviews);
  }

  // GET /analyses/:id
  const singleAnalysisMatch = pathname.match(/^\/analyses\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && singleAnalysisMatch) {
    const analysisId = singleAnalysisMatch[1]!;
    const job = jobsMap.get(analysisId);
    if (job && job.organizationId === org.id) {
      return NextResponse.json(job);
    }
    const review = reviewsMap.get(analysisId);
    if (!review || review.organizationId !== org.id) return NextResponse.json({ error: 'analysis not found' }, { status: 404 });
    return NextResponse.json({
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

  // GET /integrations/github
  if (method === 'GET' && (pathname === '/integrations/github' || pathname === '/github/status')) {
    const configured = Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
    return NextResponse.json({ configured, appId: process.env.GITHUB_APP_ID ?? null, status: configured ? 'connected' : 'not_configured' });
  }

  // GET /billing/subscription
  if (method === 'GET' && pathname === '/billing/subscription') {
    return NextResponse.json({ plan: org.plan, subscriptionStatus: org.subscriptionStatus ?? null, stripeCustomerId: org.stripeCustomerId ?? null, configured: Boolean(process.env.STRIPE_SECRET_KEY) });
  }

  return NextResponse.json({ error: 'not found' }, { status: 404 });
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const DELETE = handleRequest;
export const OPTIONS = handleRequest;
