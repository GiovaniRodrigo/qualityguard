import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  apiFetch,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
  login,
  register,
  getMe,
  logout,
  listProjects,
  createProject,
  getProject,
  deleteProject,
  triggerAnalysis,
  getAnalysisJob,
  pollAnalysisUntilDone,
  listAnalyses,
  getAnalysis,
  getLatestAnalysis,
  getFindings,
  getArchitecture,
  listArchitectureRules,
  createArchitectureRule,
  updateArchitectureRule,
  deleteArchitectureRule,
  getDependencies,
  getSecurity,
  getGitHubStatus,
  getBillingSubscription,
  streamFindingRemediation,
} from './index';



describe('Frontend API Client & Services', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearAuthToken();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Token management', () => {
    it('manages auth token in memory/storage', () => {
      expect(getAuthToken()).toBeNull();
      setAuthToken('test-token-123');
      expect(getAuthToken()).toBe('test-token-123');
      clearAuthToken();
      expect(getAuthToken()).toBeNull();
    });
  });

  describe('apiFetch client', () => {
    it('attaches Authorization header when token is present', async () => {
      setAuthToken('secret-jwt-token');
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
      global.fetch = mockFetch;

      const result = await apiFetch<{ success: boolean }>('/test-endpoint');
      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test-endpoint',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer secret-jwt-token',
            'content-type': 'application/json',
          }),
        }),
      );
    });

    it('extracts error message from JSON error response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid email format' }),
      });

      await expect(apiFetch('/bad-endpoint', { retryCount: 0 })).rejects.toThrow('Invalid email format');
    });

    it('clears token when response is 401 or session-level 403', async () => {
      setAuthToken('stale-token-xyz');
      expect(getAuthToken()).toBe('stale-token-xyz');

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'user not found' }),
      });

      await expect(apiFetch('/me', { retryCount: 0 })).rejects.toThrow('user not found');
      expect(getAuthToken()).toBeNull();
    });

    it('returns empty object for 204 No Content', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      });

      const res = await apiFetch('/no-content');
      expect(res).toEqual({});
    });
  });

  describe('Auth service', () => {
    it('stores token on successful login', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: 'jwt-abc-123', userId: 'u-1', email: 'dev@test.com' }),
      });

      const res = await login('dev@test.com', 'pass1234');
      expect(res.token).toBe('jwt-abc-123');
      expect(getAuthToken()).toBe('jwt-abc-123');
    });

    it('stores token on successful registration', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ token: 'jwt-new-user', userId: 'u-2', organizationId: 'o-2' }),
      });

      const res = await register('new@test.com', 'pass1234', 'Acme');
      expect(res.token).toBe('jwt-new-user');
      expect(getAuthToken()).toBe('jwt-new-user');
    });

    it('clears token on logout', () => {
      setAuthToken('sample-token');
      logout();
      expect(getAuthToken()).toBeNull();
    });

    it('fetches authenticated user info via getMe', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          user: { id: 'u-1', email: 'dev@test.com', createdAt: '2026-01-01' },
          organization: { id: 'o-1', name: 'Dev Org', ownerId: 'u-1', plan: 'community' },
          projects: [],
        }),
      });

      const me = await getMe();
      expect(me.user.email).toBe('dev@test.com');
      expect(me.organization.name).toBe('Dev Org');
    });
  });

  describe('Projects service', () => {
    it('lists, creates, gets and deletes projects', async () => {
      // listProjects
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: 'p-1', name: 'ai-memory', repository: 'akitaonrails/ai-memory' }],
      });
      const list = await listProjects();
      expect(list).toHaveLength(1);
      expect(list[0]?.name).toBe('ai-memory');

      // createProject
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 'p-2', name: 'new-proj', repository: 'owner/repo', branch: 'main' }),
      });
      const created = await createProject({ name: 'new-proj', repository: 'owner/repo', branch: 'main' });
      expect(created.id).toBe('p-2');

      // getProject
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'p-2', name: 'new-proj', repository: 'owner/repo' }),
      });
      const proj = await getProject('p-2');
      expect(proj.name).toBe('new-proj');

      // deleteProject
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ deleted: true, projectId: 'p-2' }),
      });
      const del = await deleteProject('p-2');
      expect(del.deleted).toBe(true);
    });
  });

  describe('Analyses & Inspection services', () => {
    it('triggers async analysis and polls job until completed', async () => {
      // triggerAnalysis
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => ({ analysisId: 'job-1', id: 'job-1', status: 'queued', progress: 0, projectId: 'p-1', startedAt: '2026-01-01' }),
      });
      const trigger = await triggerAnalysis('p-1', 'release/2.2');
      expect(trigger.analysisId).toBe('job-1');
      expect(trigger.status).toBe('queued');

      // pollAnalysisUntilDone
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'job-1',
            projectId: 'p-1',
            status: 'cloning',
            progress: 20,
            startedAt: '2026-01-01',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'job-1',
            projectId: 'p-1',
            status: 'completed',
            progress: 100,
            startedAt: '2026-01-01',
            result: { id: 'rev-1', score: 90, decision: 'approve', findings: [] },
          }),
        });

      const polled = await pollAnalysisUntilDone('job-1', undefined, 5, 5);
      expect(polled.status).toBe('completed');
      expect(polled.progress).toBe(100);
      expect(polled.result?.score).toBe(90);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'rev-1', score: 85, decision: 'review_required', findings: [] }),
      });
      const latest = await getLatestAnalysis('p-1');
      expect(latest.id).toBe('rev-1');

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: 'rev-1' }],
      });
      const all = await listAnalyses();
      expect(all).toHaveLength(1);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'rev-1' }),
      });
      const single = await getAnalysis('rev-1');
      expect(single.id).toBe('rev-1');
    });

    it('fetches architecture graph, dependencies, findings and security', async () => {
      // findings
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: 'f-1', severity: 'high', title: 'Cycle' }],
      });
      const findings = await getFindings('p-1');
      expect(findings).toHaveLength(1);

      // architecture
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ nodes: ['src/a.ts'], edges: [], cycles: [], drift: [] }),
      });
      const arch = await getArchitecture('p-1');
      expect(arch.nodes).toContain('src/a.ts');

      // architecture rules CRUD
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'rule-1',
            projectId: 'p-1',
            name: 'No UI to DB',
            type: 'forbidden_dependency',
            enabled: true,
            severity: 'high',
            config: { from: 'ui/**', to: 'db/**' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      });
      const rules = await listArchitectureRules('p-1');
      expect(rules).toHaveLength(1);
      expect(rules[0]?.name).toBe('No UI to DB');

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          id: 'rule-2',
          projectId: 'p-1',
          name: 'Layer Rule',
          type: 'required_layer',
          enabled: true,
          severity: 'critical',
          config: { layers: ['domain', 'infra'] },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
      const createdRule = await createArchitectureRule('p-1', {
        name: 'Layer Rule',
        type: 'required_layer',
        severity: 'critical',
        config: { layers: ['domain', 'infra'] },
      });
      expect(createdRule.id).toBe('rule-2');

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'rule-2',
          projectId: 'p-1',
          name: 'Layer Rule Updated',
          type: 'required_layer',
          enabled: false,
          severity: 'critical',
          config: { layers: ['domain', 'infra'] },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
      const updatedRule = await updateArchitectureRule('p-1', 'rule-2', { enabled: false });
      expect(updatedRule.enabled).toBe(false);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
      const delRes = await deleteArchitectureRule('p-1', 'rule-2');
      expect(delRes.success).toBe(true);

      // dependencies

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ name: 'tokio', version: '1.0', type: 'dependency' }],
      });
      const deps = await getDependencies('p-1');
      expect(deps[0]?.name).toBe('tokio');

      // security
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ score: 90, findings: [], totalSecurityFindings: 0 }),
      });
      const sec = await getSecurity('p-1');
      expect(sec.score).toBe(90);

      // github status
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ configured: true, appId: '12345', status: 'connected' }),
      });
      const gh = await getGitHubStatus();
      expect(gh.configured).toBe(true);

      // billing subscription
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ plan: 'pro', subscriptionStatus: 'active', stripeCustomerId: 'cus_1', configured: true }),
      });
      const bill = await getBillingSubscription();
      expect(bill.plan).toBe('pro');

      // AI streaming remediation
      const sseText = [
        'event: start\ndata: {"findingId":"f-1","provider":"offline"}\n\n',
        'event: chunk\ndata: {"text":"### Step-by-Step Fix\\n"}\n\n',
        'event: complete\ndata: {"status":"completed"}\n\n',
      ].join('');

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          getReader: () => {
            let read = false;
            return {
              read: async () => {
                if (!read) {
                  read = true;
                  return { done: false, value: new TextEncoder().encode(sseText) };
                }
                return { done: true, value: undefined };
              },
              releaseLock: () => {},
              cancel: async () => {},
            };
          },
        },
      });

      let started = false;
      let streamed = '';
      let completed = false;

      await streamFindingRemediation('f-1', {
        onStart: (info) => {
          started = true;
          expect(info.findingId).toBe('f-1');
        },
        onChunk: (chunk) => {
          streamed += chunk;
        },
        onComplete: () => {
          completed = true;
        },
        onError: () => {},
      });

      expect(started).toBe(true);
      expect(streamed).toBe('### Step-by-Step Fix\n');
      expect(completed).toBe(true);
    });

    it('uploads coverage and fetches latest/historical coverage metrics', async () => {
      const mockCoverageResponse = {
        coverage: { lines: 84.2, functions: 78.1, branches: 71.4 },
        format: 'lcov',
        files: 12,
        analysisId: 'analysis-123',
        projectId: 'proj-123',
        createdAt: new Date().toISOString(),
      };

      // Upload coverage
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockCoverageResponse,
      });

      const { uploadCoverage, getLatestCoverage, getAnalysisCoverage } = await import('./index');
      const uploadRes = await uploadCoverage('proj-123', 'SF:src/index.ts\nend_of_record', {
        format: 'lcov',
        analysisId: 'analysis-123',
      });
      expect(uploadRes.coverage.lines).toBe(84.2);
      expect(uploadRes.format).toBe('lcov');

      // Get latest coverage
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCoverageResponse,
      });
      const latestRes = await getLatestCoverage('proj-123');
      expect(latestRes?.coverage.lines).toBe(84.2);

      // Get analysis coverage
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCoverageResponse,
      });
      const analysisRes = await getAnalysisCoverage('analysis-123');
      expect(analysisRes?.coverage.lines).toBe(84.2);
    });

    it('compares two reviews or branches and returns ReviewComparisonResult', async () => {
      const mockComparisonResult = {
        id: 'cmp-123',
        projectId: 'proj-123',
        baseline: { reviewId: 'rev-1', branch: 'main', score: 80, decision: 'block' },
        current: { reviewId: 'rev-2', branch: 'feature/auth', score: 92, decision: 'approve' },
        findings: {
          introduced: [],
          resolved: [{ id: 'f-1', title: 'Resolved Vulnerability' }],
          unchanged: [],
          totalBaseline: 1,
          totalCurrent: 0,
        },
        score: { baseline: 80, current: 92, delta: 12 },
        gate: {
          baseline: { passed: false, decision: 'block', reasons: ['Score < 80'] },
          current: { passed: true, decision: 'approve', reasons: [] },
          statusChanged: true,
          transition: 'BLOCK -> APPROVE',
        },
        architecture: {
          introducedDrift: [],
          resolvedDrift: [{ type: 'forbidden_dependency', from: 'a', to: 'b', message: 'Resolved' }],
          unchangedDrift: [],
          introducedCycles: [],
          resolvedCycles: [],
        },
        dependencies: {
          added: [{ name: 'zod', version: '3.22.0', ecosystem: 'npm', manifest: 'package.json' }],
          removed: [],
          changed: [],
        },
        coverage: {
          baseline: { lines: { total: 100, covered: 70, missed: 30, percentage: 70.0 } },
          current: { lines: { total: 100, covered: 85, missed: 15, percentage: 85.0 } },
          delta: { lines: { delta: 15.0 } },
        },
        generatedAt: new Date().toISOString(),
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockComparisonResult,
      });

      const { compareReviews, compareReviewsById } = await import('./index');
      const result = await compareReviews('proj-123', { base: 'main', head: 'feature/auth' }, 'token-xyz');

      expect(result.id).toBe('cmp-123');
      expect(result.score.delta).toBe(12);
      expect(result.gate.transition).toBe('BLOCK -> APPROVE');
      expect(result.findings.resolved).toHaveLength(1);
      expect(result.dependencies.added[0]?.name).toBe('zod');

      // Test compareReviewsById helper
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockComparisonResult,
      });

      const resultById = await compareReviewsById('proj-123', 'rev-1', 'rev-2', 'token-xyz');
      expect(resultById.score.delta).toBe(12);
    });
  });
});


