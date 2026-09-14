import { describe, expect, it } from 'vitest';
import { buildReviewPrompt, parseAIFindings } from './index.js';

describe('ai review prompt and parser', () => {
  it('builds review prompt correctly', () => {
    const req = buildReviewPrompt({
      diff: 'diff --git a/src/index.ts b/src/index.ts',
      architecture: 'clean architecture',
      rules: 'no secrets',
    });
    expect(req.system).toContain('software quality auditor');
    expect(req.prompt).toContain('clean architecture');
    expect(req.prompt).toContain('no secrets');
  });

  it('parses valid AI findings JSON array', () => {
    const json = JSON.stringify([
      {
        severity: 'high',
        category: 'security',
        file: 'src/auth.ts',
        line: 12,
        title: 'Weak hashing algorithm',
        description: 'Using MD5 for passwords',
        suggestion: 'Use argon2 or scrypt',
        confidence: 0.99,
        decision: 'block',
      },
    ]);
    const findings = parseAIFindings(json);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.category).toBe('security');
    expect(findings[0]?.source).toBe('ai');
  });
});
