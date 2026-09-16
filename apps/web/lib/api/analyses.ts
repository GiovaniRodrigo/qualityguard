import { apiFetch } from './client';
import type { AnalysisJob, Review } from './types';

export interface TriggerAnalysisResponse {
  analysisId: string;
  id: string;
  status: 'queued' | 'cloning' | 'analyzing' | 'completed' | 'failed';
  progress: number;
  projectId: string;
  startedAt: string;
}

export async function triggerAnalysis(projectId: string, branch?: string): Promise<TriggerAnalysisResponse> {
  return apiFetch<TriggerAnalysisResponse>(`/projects/${projectId}/analyses`, {
    method: 'POST',
    body: JSON.stringify({ branch }),
  });
}

export async function getAnalysisJob(analysisId: string): Promise<AnalysisJob> {
  return apiFetch<AnalysisJob>(`/analyses/${analysisId}`);
}

export async function pollAnalysisUntilDone(
  analysisId: string,
  onProgress?: (job: AnalysisJob) => void,
  maxAttempts = 120,
  intervalMs = 500,
): Promise<AnalysisJob> {
  for (let i = 0; i < maxAttempts; i++) {
    const job = await getAnalysisJob(analysisId);
    onProgress?.(job);
    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Analysis polling timed out');
}

export async function listAnalyses(): Promise<Review[]> {
  return apiFetch<Review[]>('/analyses');
}

export async function getAnalysis(id: string): Promise<Review> {
  return apiFetch<Review>(`/analyses/${id}`);
}

export async function getLatestAnalysis(projectId: string): Promise<Review> {
  return apiFetch<Review>(`/projects/${projectId}/analyses/latest`);
}
