import { apiFetch } from './client';
import type { Finding } from './types';

export interface SecurityResponse {
  score: number | null;
  findings: Finding[];
  totalSecurityFindings: number;
}

export async function getSecurity(projectId: string): Promise<SecurityResponse> {
  return apiFetch<SecurityResponse>(`/projects/${projectId}/security`);
}
