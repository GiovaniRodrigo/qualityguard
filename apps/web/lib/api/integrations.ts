import { apiFetch } from './client';
import type { GitHubStatus } from './types';

export async function getGitHubStatus(): Promise<GitHubStatus> {
  return apiFetch<GitHubStatus>('/integrations/github');
}
