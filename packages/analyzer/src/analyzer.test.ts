import { describe, expect, it } from 'vitest';
import { analyze, calculateScore } from './analyzer.js';
import { noInfrastructureImport } from './rules.js';

describe('noInfrastructureImport', () => {
  it('detects infrastructure imports in application files', () => {
    const findings = noInfrastructureImport.analyze({
      path: 'src/application/UserService.ts',
      content: "import { UserRepository } from '../infrastructure/database/UserRepository';",
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.decision).toBe('block');
    expect(findings[0]?.line).toBe(1);
  });

  it('ignores infrastructure imports outside business layers', () => {
    const findings = noInfrastructureImport.analyze({
      path: 'src/infrastructure/UserRepository.ts',
      content: "import { Pool } from 'database';",
    });

    expect(findings).toHaveLength(0);
  });
});

describe('analyze', () => {
  it('blocks a review with a blocking finding', () => {
    const result = analyze({
      files: [{
        path: 'src/application/UserService.ts',
        content: "import { UserRepository } from '../infrastructure/database/UserRepository';",
      }],
    });

    expect(result.decision).toBe('block');
    expect(result.score).toBe(80);
    expect(result.analyzedFiles).toBe(1);
  });

  it('never returns a score below zero', () => {
    expect(calculateScore(Array.from({ length: 4 }, (_, index) => ({
      id: `x-${index}`,
      severity: 'critical' as const,
      category: 'architecture' as const,
      status: 'open' as const,
      decision: 'block' as const,
      file: 'x.ts',
      title: 'x',
      description: 'x',
      suggestion: 'x',
      confidence: 1,
      source: 'deterministic' as const,
    })))).toBe(0);
  });
});
