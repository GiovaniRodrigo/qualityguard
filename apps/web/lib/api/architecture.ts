import { apiFetch } from './client';
import type { ArchitectureGraph, ArchitectureRule, ArchitectureRuleType, Severity } from './types';

export async function getArchitecture(projectId: string): Promise<ArchitectureGraph> {
  return apiFetch<ArchitectureGraph>(`/projects/${projectId}/architecture`);
}

export async function listArchitectureRules(projectId: string): Promise<ArchitectureRule[]> {
  return apiFetch<ArchitectureRule[]>(`/projects/${projectId}/architecture-rules`);
}

export async function createArchitectureRule(
  projectId: string,
  data: {
    name: string;
    type: ArchitectureRuleType;
    enabled?: boolean;
    severity?: Severity;
    config: Record<string, unknown>;
  }
): Promise<ArchitectureRule> {
  return apiFetch<ArchitectureRule>(`/projects/${projectId}/architecture-rules`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateArchitectureRule(
  projectId: string,
  ruleId: string,
  data: Partial<{
    name: string;
    type: ArchitectureRuleType;
    enabled: boolean;
    severity: Severity;
    config: Record<string, unknown>;
  }>
): Promise<ArchitectureRule> {
  return apiFetch<ArchitectureRule>(`/projects/${projectId}/architecture-rules/${ruleId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteArchitectureRule(
  projectId: string,
  ruleId: string
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/projects/${projectId}/architecture-rules/${ruleId}`, {
    method: 'DELETE',
  });
}

