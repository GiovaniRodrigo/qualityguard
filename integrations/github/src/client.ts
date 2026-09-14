export interface GitHubClient { getPullRequestDiff(owner: string, repo: string, number: number): Promise<string>; createCheck(owner: string, repo: string, sha: string, conclusion: 'success'|'failure'|'neutral', title: string, summary: string): Promise<void>; comment(owner: string, repo: string, number: number, body: string): Promise<void>; }

export function createGitHubClient(token: string): GitHubClient {
  async function request(path: string, init: RequestInit = {}) { const response = await fetch(`https://api.github.com${path}`, { ...init, headers: { Accept:'application/vnd.github+json', Authorization:`Bearer ${token}`, 'X-GitHub-Api-Version':'2022-11-28', ...(init.headers ?? {}) } }); if (!response.ok) throw new Error(`GitHub API ${response.status}: ${path}`); return response; }
  return {
    async getPullRequestDiff(owner, repo, number) { const response = await request(`/repos/${owner}/${repo}/pulls/${number}`, { headers: { Accept:'application/vnd.github.v3.diff' } }); return response.text(); },
    async createCheck(owner, repo, sha, conclusion, title, summary) { await request(`/repos/${owner}/${repo}/check-runs`, { method:'POST', body:JSON.stringify({ name:'QualityGuard', head_sha:sha, status:'completed', conclusion, output:{ title, summary } }), headers:{'content-type':'application/json'} }); },
    async comment(owner, repo, number, body) { await request(`/repos/${owner}/${repo}/issues/${number}/comments`, { method:'POST', body:JSON.stringify({body}), headers:{'content-type':'application/json'} }); },
  };
}
