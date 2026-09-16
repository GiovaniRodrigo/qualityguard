import { apiFetch } from './client';
import type { CoverageResponse } from './types';

export async function uploadCoverage(
  projectId: string,
  content: string,
  options?: { format?: 'lcov' | 'jacoco'; analysisId?: string },
): Promise<CoverageResponse> {
  const query = options?.analysisId ? `?analysisId=${encodeURIComponent(options.analysisId)}` : '';
  return apiFetch<CoverageResponse>(`/projects/${projectId}/coverage${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content,
      format: options?.format,
      analysisId: options?.analysisId,
    }),
  });
}

export async function getLatestCoverage(projectId: string): Promise<CoverageResponse | null> {
  try {
    return await apiFetch<CoverageResponse>(`/projects/${projectId}/coverage`);
  } catch {
    return null;
  }
}

export async function getAnalysisCoverage(analysisId: string): Promise<CoverageResponse | null> {
  try {
    return await apiFetch<CoverageResponse>(`/analyses/${analysisId}/coverage`);
  } catch {
    return null;
  }
}
