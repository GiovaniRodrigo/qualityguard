import { apiFetch } from './client';
import type { Project } from './types';

export interface CreateProjectInput {
  name: string;
  repository: string;
  branch?: string;
}

export async function listProjects(): Promise<Project[]> {
  return apiFetch<Project[]>('/projects');
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  return apiFetch<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getProject(id: string): Promise<Project> {
  return apiFetch<Project>(`/projects/${id}`);
}

export async function deleteProject(id: string): Promise<{ deleted: boolean; projectId: string }> {
  return apiFetch<{ deleted: boolean; projectId: string }>(`/projects/${id}`, {
    method: 'DELETE',
  });
}
