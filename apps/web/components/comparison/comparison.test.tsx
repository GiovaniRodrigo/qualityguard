import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { Review } from '@/lib/api/types';
import { ReviewComparisonView } from './review-comparison';

const mockReviews: Review[] = [
  {
    id: 'rev-2',
    projectId: 'proj-1',
    organizationId: 'org-1',
    projectName: 'QualityGuard',
    branch: 'release/2.2',
    commitSha: 'abcdef123456',
    score: 90,
    decision: 'approve',
    findings: [],
    analyzedFiles: 20,
    status: 'COMPLETED',
    createdAt: '2026-09-15T12:00:00.000Z',
  },
  {
    id: 'rev-1',
    projectId: 'proj-1',
    organizationId: 'org-1',
    projectName: 'QualityGuard',
    branch: 'main',
    commitSha: '123456abcdef',
    score: 75,
    decision: 'block',
    findings: [
      {
        id: 'f-1',
        severity: 'high',
        category: 'security',
        status: 'open',
        decision: 'block',
        file: 'src/config.ts',
        line: 12,
        title: 'Hardcoded Secret',
        description: 'Secret detected in config',
        suggestion: 'Move to env',
        confidence: 0.95,
        source: 'deterministic',
        ruleId: 'security.hardcoded-secret',
      },
    ],
    analyzedFiles: 18,
    status: 'COMPLETED',
    createdAt: '2026-09-01T10:00:00.000Z',
  },
];

describe('ReviewComparisonView Component', () => {
  it('renders selector panel with available historical releases', () => {
    const html = renderToString(
      <ReviewComparisonView
        projectId="proj-1"
        projectName="QualityGuard"
        reviews={mockReviews}
      />,
    );

    expect(html).toContain('Analysis Comparison &amp; Architecture Drift');
    expect(html).toContain('Compare Releases');
    expect(html).toContain('Baseline (Base Reference)');
    expect(html).toContain('Current / Target (Compare Reference)');
    expect(html).toContain('release/2.2');
    expect(html).toContain('main');
  });

  it('renders notice when less than 2 reviews exist', () => {
    const html = renderToString(
      <ReviewComparisonView
        projectId="proj-1"
        projectName="QualityGuard"
        reviews={[mockReviews[0]!]}
      />,
    );

    expect(html).toContain('At least 2 analysis reviews are required');
  });
});
