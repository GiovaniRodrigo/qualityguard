import { describe, expect, it } from 'vitest';
import { emptyCatchBlock, hardcodedSecret, highComplexity, missingTest, noInfrastructureImport, sqlInjectionRisk } from './rules.js';

describe('deterministic rules', () => {
  it('blocks infrastructure imports from application code', () => {
    const findings = noInfrastructureImport.analyze({ path: 'src/application/UserService.ts', content: "import { UserRepository } from '../infrastructure/database/UserRepository';" });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.decision).toBe('block');
    expect(findings[0]!.severity).toBe('high');
  });

  it('detects hardcoded credentials', () => {
    const findings = hardcodedSecret.analyze({ path: 'src/auth.ts', content: "const apiKey = '123456789abcdef';" });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('critical');
  });

  it('ignores environment-backed credentials', () => {
    const findings = hardcodedSecret.analyze({ path: 'src/auth.ts', content: "const apiKey = process.env.API_KEY;" });
    expect(findings).toHaveLength(0);
  });

  it('flags highly branched files', () => {
    const content = Array.from({ length: 12 }, (_, i) => `if (value === ${i}) return ${i};`).join('\n');
    const findings = highComplexity.analyze({ path: 'src/service.ts', content });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe('maintainability.high-complexity');
  });

  it('flags exported production files without a test convention', () => {
    const findings = missingTest.analyze({ path: 'src/service.ts', content: 'export function createService() { return {}; }' });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.category).toBe('testing');
  });

  it('does not flag test files for missing tests', () => {
    const findings = missingTest.analyze({ path: 'src/service.test.ts', content: 'export function createService() { return {}; }' });
    expect(findings).toHaveLength(0);
  });

  it('detects potential SQL injection via string concatenation or template literals', () => {
    const code = 'const result = db.query(`SELECT * FROM users WHERE id = ${userId}`);';
    const findings = sqlInjectionRisk.analyze({ path: 'src/db.ts', content: code });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('high');
    expect(findings[0]!.category).toBe('security');
    expect(findings[0]!.ruleId).toBe('security.sql-injection');
  });

  it('detects empty catch blocks that swallow errors', () => {
    const code = 'try { doSomething(); } catch (err) {}';
    const findings = emptyCatchBlock.analyze({ path: 'src/service.ts', content: code });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.category).toBe('clean_code');
    expect(findings[0]!.ruleId).toBe('clean_code.empty-catch');
  });
});

