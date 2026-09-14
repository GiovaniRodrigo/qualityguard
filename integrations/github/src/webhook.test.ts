import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { shouldReviewPullRequest, verifyGitHubWebhook } from './webhook.js';

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
});
