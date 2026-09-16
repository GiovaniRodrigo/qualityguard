import { apiFetch } from './client';
import type { Finding } from './types';

export async function getFindings(projectId: string): Promise<Finding[]> {
  return apiFetch<Finding[]>(`/projects/${projectId}/findings`);
}
