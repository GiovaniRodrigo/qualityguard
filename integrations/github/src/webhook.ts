import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyGitHubWebhook(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const actual = signature.slice(7);
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export interface PullRequestEvent { action: string; installation?: { id: number }; repository?: { full_name: string; default_branch: string }; pull_request?: { number: number; head: { sha: string }; base: { sha: string }; title: string; } }
export function shouldReviewPullRequest(event: PullRequestEvent): boolean { return ['opened','synchronize','reopened'].includes(event.action) && Boolean(event.repository?.full_name && event.pull_request); }
