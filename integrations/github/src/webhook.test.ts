import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { shouldReviewPullRequest, verifyGitHubWebhook } from './webhook.js';
import { createGitHubClient } from './client.js';

describe('github integration', () => {
  const secret = 'test-secret-123456';
  const payload = JSON.stringify({ action: 'opened' });

  it('validates authentic webhook signatures', () => {
    const signature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    expect(verifyGitHubWebhook(payload, signature, secret)).toBe(true);
  });

  it('rejects forged webhook signatures', () => {
    expect(verifyGitHubWebhook(payload, 'sha256=invalid-signature', secret)).toBe(false);
  });

  it('identifies reviewable pull request events', () => {
    expect(
      shouldReviewPullRequest({
        action: 'opened',
        repository: { full_name: 'org/repo', default_branch: 'main' },
        pull_request: { number: 1, head: { sha: 'abc' }, base: { sha: 'def' }, title: 'Feature' },
      }),
    ).toBe(true);

    expect(
      shouldReviewPullRequest({
        action: 'closed',
        repository: { full_name: 'org/repo', default_branch: 'main' },
      }),
    ).toBe(false);
  });

  it('creates GitHub client and makes properly formatted API requests', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    try {
      const client = createGitHubClient('mock-token-xyz');
      await client.createCheck?.('test-org', 'test-repo', 'sha-123', 'success', 'Quality Check Passed', 'All gates passed');
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe('https://api.github.com/repos/test-org/test-repo/check-runs');
      expect((calls[0]!.init?.headers as Record<string, string>)?.Authorization).toBe('Bearer mock-token-xyz');

      await client.comment('test-org', 'test-repo', 42, 'LGTM from QualityGuard');
      expect(calls).toHaveLength(2);
      expect(calls[1]!.url).toBe('https://api.github.com/repos/test-org/test-repo/issues/42/comments');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
