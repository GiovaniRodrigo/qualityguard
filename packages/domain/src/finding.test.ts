import { describe, expect, it } from 'vitest';
import type { Finding, ReviewResult } from './finding.js';

describe('domain models', () => {
  it('creates and validates finding shape', () => {
    const finding: Finding = {
      id: 'f-1',
      severity: 'critical',
      category: 'security',
      status: 'open',
      decision: 'block',
      file: 'src/config.ts',
      line: 10,
      title: 'Exposed secret',
      description: 'API key hardcoded',
      suggestion: 'Use environment variables',
      confidence: 0.95,
      source: 'deterministic',
    };
    expect(finding.id).toBe('f-1');
    expect(finding.severity).toBe('critical');
    expect(finding.decision).toBe('block');
  });

  it('creates and validates review result shape', () => {
    const result: ReviewResult = {
      score: 85,
      decision: 'review_required',
      findings: [],
      analyzedFiles: 10,
      generatedAt: new Date().toISOString(),
    };
    expect(result.score).toBe(85);
    expect(result.decision).toBe('review_required');
  });
});
