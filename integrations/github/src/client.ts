import { GitHubApiError, GitHubRateLimitError } from './errors.js';

export interface PullRequestDetails {
  number: number;
  title: string;
  owner: string;
  repo: string;
  baseSha: string;
  headSha: string;
  baseRef: string;
  headRef: string;
  cloneUrl: string;
}

export interface CheckRunOutput {
  title: string;
  summary: string;
  text?: string | undefined;
}

export interface CreateCheckRunParams {
  name?: string | undefined;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | undefined;
  output?: CheckRunOutput | undefined;
}

export interface UpdateCheckRunParams {
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | undefined;
  output?: CheckRunOutput | undefined;
}

export interface CheckRunResponse {
  id: number;
  status: string;
  conclusion?: string | null | undefined;
  html_url?: string | undefined;
}

export interface ReviewComment {
  path: string;
  line: number;
  side?: 'LEFT' | 'RIGHT' | undefined;
  start_line?: number | undefined;
  start_side?: 'LEFT' | 'RIGHT' | undefined;
  body: string;
}

export interface CreateReviewParams {
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  body: string;
  comments?: ReviewComment[] | undefined;
}

export interface ReviewResponse {
  id: number;
  state: string;
  html_url?: string | undefined;
}

export interface GitHubClient {
  getPullRequest(owner: string, repo: string, number: number): Promise<PullRequestDetails>;
  getPullRequestDiff(owner: string, repo: string, number: number): Promise<string>;
  createCheckRun(owner: string, repo: string, params: CreateCheckRunParams): Promise<CheckRunResponse>;
  updateCheckRun(owner: string, repo: string, checkRunId: number, params: UpdateCheckRunParams): Promise<CheckRunResponse>;
  createReview(owner: string, repo: string, number: number, params: CreateReviewParams): Promise<ReviewResponse>;
  createCheck?(owner: string, repo: string, sha: string, conclusion: 'success' | 'failure' | 'neutral', title: string, summary: string): Promise<void>;
  comment(owner: string, repo: string, number: number, body: string): Promise<void>;
}

export function createGitHubClient(token: string): GitHubClient {
  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.headers ?? {}),
      },
    });

    if (response.status === 429) {
      throw new GitHubRateLimitError(`GitHub API rate limit exceeded on ${path}`);
    }

    if (!response.ok) {
      let errMsg = `GitHub API request failed with status ${response.status}: ${path}`;
      try {
        const errJson = (await response.json()) as { message?: string };
        if (errJson?.message) errMsg += ` - ${errJson.message}`;
      } catch {}
      throw new GitHubApiError(response.status, path, errMsg);
    }

    return response;
  }

  return {
    async getPullRequest(owner: string, repo: string, number: number): Promise<PullRequestDetails> {
      const response = await request(`/repos/${owner}/${repo}/pulls/${number}`);
      const data = (await response.json()) as {
        number: number;
        title: string;
        base: { sha: string; ref: string };
        head: { sha: string; ref: string; repo?: { clone_url?: string } };
      };
      return {
        number: data.number,
        title: data.title,
        owner,
        repo,
        baseSha: data.base.sha,
        headSha: data.head.sha,
        baseRef: data.base.ref,
        headRef: data.head.ref,
        cloneUrl: data.head.repo?.clone_url ?? `https://github.com/${owner}/${repo}.git`,
      };
    },

    async getPullRequestDiff(owner: string, repo: string, number: number): Promise<string> {
      const response = await request(`/repos/${owner}/${repo}/pulls/${number}`, {
        headers: { Accept: 'application/vnd.github.v3.diff' },
      });
      return response.text();
    },

    async createCheckRun(owner: string, repo: string, params: CreateCheckRunParams): Promise<CheckRunResponse> {
      const payload = {
        name: params.name ?? 'QualityGuard Governance',
        head_sha: params.head_sha,
        status: params.status,
        ...(params.conclusion ? { conclusion: params.conclusion } : {}),
        ...(params.output ? { output: params.output } : {}),
      };

      const response = await request(`/repos/${owner}/${repo}/check-runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return (await response.json()) as CheckRunResponse;
    },

    async updateCheckRun(
      owner: string,
      repo: string,
      checkRunId: number,
      params: UpdateCheckRunParams,
    ): Promise<CheckRunResponse> {
      const payload = {
        status: params.status,
        ...(params.conclusion ? { conclusion: params.conclusion } : {}),
        ...(params.output ? { output: params.output } : {}),
      };

      const response = await request(`/repos/${owner}/${repo}/check-runs/${checkRunId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return (await response.json()) as CheckRunResponse;
    },

    async createReview(owner: string, repo: string, number: number, params: CreateReviewParams): Promise<ReviewResponse> {
      const payload = {
        event: params.event,
        body: params.body,
        ...(params.comments && params.comments.length > 0 ? { comments: params.comments } : {}),
      };

      const response = await request(`/repos/${owner}/${repo}/pulls/${number}/reviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return (await response.json()) as ReviewResponse;
    },

    async createCheck(
      owner: string,
      repo: string,
      sha: string,
      conclusion: 'success' | 'failure' | 'neutral',
      title: string,
      summary: string,
    ): Promise<void> {
      await request(`/repos/${owner}/${repo}/check-runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'QualityGuard',
          head_sha: sha,
          status: 'completed',
          conclusion,
          output: { title, summary },
        }),
      });
    },

    async comment(owner: string, repo: string, number: number, body: string): Promise<void> {
      await request(`/repos/${owner}/${repo}/issues/${number}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      });
    },
  };
}
