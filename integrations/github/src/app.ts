import { createSign } from 'node:crypto';

interface GitHubTokenResponse { token: string; }

function appJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iat: now - 30, exp: now + 9 * 60, iss: appId })).toString('base64url');
  const data = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256').update(data).sign(privateKey).toString('base64url');
  return `${data}.${signature}`;
}

export async function createInstallationToken(appId: string, privateKey: string, installationId: number): Promise<string> {
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${appJwt(appId, privateKey)}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'content-type': 'application/json',
    },
  });
  if (!response.ok) throw new Error(`GitHub App installation token failed: ${response.status}`);
  const data = await response.json() as GitHubTokenResponse;
  return data.token;
}
