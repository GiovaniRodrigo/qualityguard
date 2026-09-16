import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import type { ReviewResult } from '@qualityguard/domain';
import {
  verifyAndProcessWebhook,
  handlePullRequestGovernance,
  type GitHubPRGovernanceRunner,
  type GitHubWebhookDeliveryStore,
} from './governance.js';
import type { GitHubClient, PullRequestDetails } from './client.js';
import {
  GitHubWebhookSignatureError,
  GitHubWebhookReplayError,
  GitHubPRValidationError,
  GitHubRateLimitError,
  GitHubApiError,
} from './errors.js';

describe('GitHub PR Governance & Webhook Hardening — QG-TDD-003', () => {
  const secret = 'webhook-secret-key-999';
  let memoryStore: GitHubWebhookDeliveryStore;

  beforeEach(() => {
    const deliverySet = new Set<string>();
    memoryStore = {
      async recordDelivery(id: string) {
        if (deliverySet.has(id)) return false;
        deliverySet.add(id);
        return true;
      },
    };
  });

  function signPayload(body: string, s = secret): string {
    return `sha256=${createHmac('sha256', s).update(body).digest('hex')}`;
  }

  describe('Webhook Security & HMAC Verification', () => {
    it('1. accepts authentic webhook signature on raw body', async () => {
      const rawBody = JSON.stringify({
        action: 'opened',
        repository: { full_name: 'test-org/test-repo', default_branch: 'main' },
        pull_request: { number: 42, head: { sha: 'sha-head-123' }, base: { sha: 'sha-base-456' }, title: 'Add auth' },
      });
      const sig = signPayload(rawBody);

      const result = await verifyAndProcessWebhook({
        rawBody,
        signature: sig,
        deliveryId: 'delivery-uuid-1',
        secret,
        store: memoryStore,
      });

      expect(result.accepted).toBe(true);
      expect(result.deliveryId).toBe('delivery-uuid-1');
      expect(result.duplicate).toBe(false);
    });

    it('2. rejects missing signature with GitHubWebhookSignatureError', async () => {
      const rawBody = JSON.stringify({ action: 'opened' });
      await expect(
        verifyAndProcessWebhook({
          rawBody,
          signature: undefined,
          deliveryId: 'delivery-uuid-2',
          secret,
          store: memoryStore,
        }),
      ).rejects.toThrow(GitHubWebhookSignatureError);
    });

    it('3. rejects forged or invalid signature with GitHubWebhookSignatureError', async () => {
      const rawBody = JSON.stringify({ action: 'opened' });
      await expect(
        verifyAndProcessWebhook({
          rawBody,
          signature: 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
          deliveryId: 'delivery-uuid-3',
          secret,
          store: memoryStore,
        }),
      ).rejects.toThrow(GitHubWebhookSignatureError);
    });

    it('4. rejects signature calculated with wrong secret', async () => {
      const rawBody = JSON.stringify({ action: 'opened' });
      const sig = signPayload(rawBody, 'wrong-secret-abc');
      await expect(
        verifyAndProcessWebhook({
          rawBody,
          signature: sig,
          deliveryId: 'delivery-uuid-4',
          secret,
          store: memoryStore,
        }),
      ).rejects.toThrow(GitHubWebhookSignatureError);
    });

    it('5. rejects payload tampered after signing', async () => {
      const rawBody = JSON.stringify({ action: 'opened' });
      const sig = signPayload(rawBody);
      const tamperedBody = JSON.stringify({ action: 'opened', injected: true });

      await expect(
        verifyAndProcessWebhook({
          rawBody: tamperedBody,
          signature: sig,
          deliveryId: 'delivery-uuid-5',
          secret,
          store: memoryStore,
        }),
      ).rejects.toThrow(GitHubWebhookSignatureError);
    });
  });

  describe('Replay Protection & Delivery Idempotency', () => {
    it('6. detects and prevents duplicate delivery processing (idempotency)', async () => {
      const rawBody = JSON.stringify({
        action: 'opened',
        repository: { full_name: 'test-org/test-repo', default_branch: 'main' },
        pull_request: { number: 42, head: { sha: 'sha-head-123' }, base: { sha: 'sha-base-456' }, title: 'Add auth' },
      });
      const sig = signPayload(rawBody);

      // First delivery
      const first = await verifyAndProcessWebhook({
        rawBody,
        signature: sig,
        deliveryId: 'delivery-unique-replay-test',
        secret,
        store: memoryStore,
      });
      expect(first.accepted).toBe(true);
      expect(first.duplicate).toBe(false);

      // Duplicate delivery replay
      const second = await verifyAndProcessWebhook({
        rawBody,
        signature: sig,
        deliveryId: 'delivery-unique-replay-test',
        secret,
        store: memoryStore,
      });
      expect(second.accepted).toBe(true);
      expect(second.duplicate).toBe(true);
    });
  });

  describe('Event Action Filtering', () => {
    it('7. processes opened, synchronize, and reopened actions', async () => {
      for (const action of ['opened', 'synchronize', 'reopened'] as const) {
        const rawBody = JSON.stringify({
          action,
          repository: { full_name: 'test-org/test-repo', default_branch: 'main' },
          pull_request: { number: 1, head: { sha: 'head-sha' }, base: { sha: 'base-sha' }, title: 'Test PR' },
        });
        const result = await verifyAndProcessWebhook({
          rawBody,
          signature: signPayload(rawBody),
          deliveryId: `del-${action}`,
          secret,
          store: memoryStore,
        });
        expect(result.shouldAnalyze).toBe(true);
      }
    });

    it('8. ignores non-reviewable actions like closed, labeled safely', async () => {
      const rawBody = JSON.stringify({
        action: 'closed',
        repository: { full_name: 'test-org/test-repo', default_branch: 'main' },
        pull_request: { number: 1, head: { sha: 'head-sha' }, base: { sha: 'base-sha' }, title: 'Test PR' },
      });
      const result = await verifyAndProcessWebhook({
        rawBody,
        signature: signPayload(rawBody),
        deliveryId: 'del-closed',
        secret,
        store: memoryStore,
      });
      expect(result.accepted).toBe(true);
      expect(result.shouldAnalyze).toBe(false);
    });
  });

  describe('End-to-End PR Governance Execution', () => {
    const SAMPLE_PR_DIFF = `
diff --git a/src/auth.ts b/src/auth.ts
index 1234567..89abcdef 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,10 @@ export function authenticate(token: string) {
   if (!token) return null;
+  const adminSecret = "sk-super-secret-key-12345";
+  if (token === adminSecret) {
+    return { role: 'admin' };
+  }
   return verify(token);
 }
`;

    it('9. blocks PR, creates in_progress check run, fails gate on critical finding, and submits inline comments', async () => {
      const createdChecks: any[] = [];
      const updatedChecks: any[] = [];
      const createdReviews: any[] = [];

      const mockClient: GitHubClient = {
        async getPullRequest(owner, repo, number) {
          return {
            number,
            title: 'Add admin bypass',
            owner,
            repo,
            baseSha: 'base-sha-111',
            headSha: 'head-sha-222',
            baseRef: 'main',
            headRef: 'feat/admin-bypass',
            cloneUrl: 'https://github.com/test-org/test-repo.git',
          };
        },
        async getPullRequestDiff(owner, repo, number) {
          return SAMPLE_PR_DIFF;
        },
        async createCheckRun(owner, repo, params) {
          const id = 12345;
          createdChecks.push({ owner, repo, id, ...params });
          return { id, ...params };
        },
        async updateCheckRun(owner, repo, checkRunId, params) {
          updatedChecks.push({ owner, repo, checkRunId, ...params });
          return { id: checkRunId, ...params };
        },
        async createReview(owner, repo, number, params) {
          createdReviews.push({ owner, repo, number, ...params });
          return { id: 999, state: 'CHANGES_REQUESTED' };
        },
        async comment(owner, repo, number, body) {},
      };

      const mockRunner: GitHubPRGovernanceRunner = async (diff) => {
        return {
          score: 60,
          decision: 'block',
          analyzedFiles: 1,
          findings: [
            {
              id: 'SEC-1',
              severity: 'critical',
              category: 'security',
              status: 'open',
              decision: 'block',
              file: 'src/auth.ts',
              line: 12,
              title: 'Hardcoded Secret Detected',
              description: 'Exposed secret string.',
              evidence: ['const adminSecret = "sk-super-secret-key-12345";'],
              suggestion: 'Use environment variables.',
              confidence: 0.99,
              source: 'deterministic',
              ruleId: 'security.hardcoded-secret',
            },
          ],
        };
      };

      await handlePullRequestGovernance({
        client: mockClient,
        owner: 'test-org',
        repo: 'test-repo',
        prNumber: 42,
        headSha: 'head-sha-222',
        runner: mockRunner,
      });

      // 1. Initial Check Run created
      expect(createdChecks).toHaveLength(1);
      expect(createdChecks[0].status).toBe('in_progress');
      expect(createdChecks[0].head_sha).toBe('head-sha-222');

      // 2. Updated Check Run with Failure
      expect(updatedChecks).toHaveLength(1);
      expect(updatedChecks[0].status).toBe('completed');
      expect(updatedChecks[0].conclusion).toBe('failure');
      expect(updatedChecks[0].output.title).toContain('FAILED');

      // 3. Review created with REQUEST_CHANGES and inline comment
      expect(createdReviews).toHaveLength(1);
      expect(createdReviews[0].event).toBe('REQUEST_CHANGES');
      expect(createdReviews[0].comments).toHaveLength(1);
      expect(createdReviews[0].comments[0]).toEqual({
        path: 'src/auth.ts',
        line: 12,
        side: 'RIGHT',
        body: expect.stringContaining('Hardcoded Secret Detected'),
      });
    });

    it('10. approves PR when Quality Gate passes with clean code', async () => {
      const createdChecks: any[] = [];
      const updatedChecks: any[] = [];
      const createdReviews: any[] = [];

      const mockClient: GitHubClient = {
        async getPullRequest() {
          return {
            number: 10,
            title: 'Clean refactor',
            owner: 'test-org',
            repo: 'test-repo',
            baseSha: 'b-sha',
            headSha: 'h-sha',
            baseRef: 'main',
            headRef: 'refactor',
            cloneUrl: 'https://github.com/test-org/test-repo.git',
          };
        },
        async getPullRequestDiff() {
          return SAMPLE_PR_DIFF;
        },
        async createCheckRun(owner, repo, params) {
          createdChecks.push(params);
          return { id: 1, ...params };
        },
        async updateCheckRun(owner, repo, checkRunId, params) {
          updatedChecks.push(params);
          return { id: checkRunId, ...params };
        },
        async createReview(owner, repo, number, params) {
          createdReviews.push(params);
          return { id: 2, state: 'APPROVED' };
        },
        async comment() {},
      };

      const mockRunner: GitHubPRGovernanceRunner = async () => ({
        score: 100,
        decision: 'approve',
        analyzedFiles: 1,
        findings: [],
      });

      await handlePullRequestGovernance({
        client: mockClient,
        owner: 'test-org',
        repo: 'test-repo',
        prNumber: 10,
        headSha: 'h-sha',
        runner: mockRunner,
      });

      expect(updatedChecks[0].conclusion).toBe('success');
      expect(createdReviews[0].event).toBe('APPROVE');
      expect(createdReviews[0].comments).toBeUndefined();
    });
  });

  describe('Error Handling & API Resilience', () => {
    it('11. maps GitHub API rate limiting (429) to GitHubRateLimitError', async () => {
      const mockClient: GitHubClient = {
        async createCheckRun() { throw new GitHubRateLimitError('GitHub API Rate Limit exceeded'); },
        async getPullRequest() { throw new Error('Not reached'); },
        async getPullRequestDiff() { throw new Error('Not reached'); },
        async updateCheckRun() { throw new Error('Not reached'); },
        async createReview() { throw new Error('Not reached'); },
        async comment() {},
      };

      await expect(
        handlePullRequestGovernance({
          client: mockClient,
          owner: 'test-org',
          repo: 'test-repo',
          prNumber: 1,
          headSha: 'sha',
          runner: async () => ({ score: 100, decision: 'approve', analyzedFiles: 1, findings: [] }),
        }),
      ).rejects.toThrow(GitHubRateLimitError);
    });
  });
});
