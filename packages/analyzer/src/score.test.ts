import { describe, expect, it } from 'vitest';
import type { Finding } from '@qualityguard/domain';
import { analyze, calculateScore } from './analyzer.js';

const base = (severity: Finding['severity'], decision: Finding['decision']): Finding => ({
  id: `TEST-${severity}`, severity, category: 'maintainability', status: 'open', decision,
  file: 'src/example.ts', line: 1, title: 'Test finding', description: 'Test', suggestion: 'Fix', confidence: 1, source: 'deterministic',
});

describe('review scoring', () => {
  it('applies severity penalties', () => {
    expect(calculateScore([base('critical', 'block')])).toBe(65);
    expect(calculateScore([base('high', 'block'), base('medium', 'review_required')])).toBe(70);
  });

  it('blocks when an open finding blocks', () => {
    const result = analyze({ files: [{ path: 'src/example.ts', content: '' }], rules: [{ id: 'test', analyze: () => [base('high', 'block')] }] });
    expect(result.decision).toBe('block');
    expect(result.score).toBe(80);
  });

  it('approves when there are no findings', () => {
    const result = analyze({ files: [], rules: [] });
    expect(result.decision).toBe('approve');
    expect(result.score).toBe(100);
  });
});
