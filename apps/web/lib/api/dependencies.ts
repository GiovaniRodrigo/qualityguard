import { apiFetch } from './client';
import type { DependencyItem } from './types';

export async function getDependencies(projectId: string): Promise<DependencyItem[]> {
  return apiFetch<DependencyItem[]>(`/projects/${projectId}/dependencies`);
}
