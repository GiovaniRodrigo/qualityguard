import { apiFetch } from './client';
import type { ReviewComparisonResult } from './types';

export interface CompareReviewsParams {
  base: string;
  head: string;
}

/**
 * Compares two reviews or branches for a project via the QualityGuard API.
 */
export async function compareReviews(
  projectId: string,
  params: CompareReviewsParams,
  token?: string,
): Promise<ReviewComparisonResult> {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  return apiFetch<ReviewComparisonResult>(`/projects/${projectId}/compare`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      base: params.base,
      head: params.head,
    }),
  });
}

/**
 * Convenience helper to compare two review records by their explicit IDs.
 */
export async function compareReviewsById(
  projectId: string,
  baseReviewId: string,
  headReviewId: string,
  token?: string,
): Promise<ReviewComparisonResult> {
  return compareReviews(projectId, { base: baseReviewId, head: headReviewId }, token);
}
