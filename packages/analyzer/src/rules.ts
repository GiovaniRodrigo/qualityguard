import type { Finding } from '@qualityguard/domain';

export interface SourceFile { path: string; content: string; }
export interface Rule { id: string; analyze(file: SourceFile): Finding[]; }

function finding(file: SourceFile, line: number, data: Omit<Finding, 'id' | 'file' | 'line' | 'source'>): Finding {
  const fileKey = file.path.replace(/[^a-zA-Z0-9_-]/g, '_');
  return { ...data, id: `${data.ruleId ?? 'QG'}-${fileKey}-${line}`, file: file.path, line, source: 'deterministic' };
}

const importPattern = /(?:from\s+['"]|import\s+['"]|require\(\s*['"])([^'"]+)['"]/i;
const infrastructureImport = /(?:^|[/\\])(infrastructure|infra|database|db|repositories|adapters)(?:[/\\]|$)/i;
const secretPattern = /\b(api[_-]?key|secret|token|password|passwd|private[_-]?key)\b\s*(?:=|:|=>)\s*['"][^'"]{8,}['"]/i;
const complexityPattern = /\b(if|for|while|catch|case)\b|&&|\|\|/g;

export const noInfrastructureImport: Rule = {
  id: 'architecture.no-infrastructure-import',
  analyze(file) {
    if (!/(^|[/\\])(application|domain)([/\\])/i.test(file.path)) return [];
    return file.content.split(/\r?\n/).flatMap((line, index) => {
      const match = line.match(importPattern);
      if (!match || !match[1] || !infrastructureImport.test(match[1])) return [];
      return [finding(file, index + 1, {
        severity: 'high', category: 'architecture', status: 'open', decision: 'block',
        title: 'Application or domain layer depends on infrastructure',
        description: 'A business-layer file imports a concrete infrastructure implementation, coupling policy to technical details.',
        suggestion: 'Depend on an abstraction in the domain/application layer and inject the infrastructure implementation at the composition root.',
        confidence: 0.98, ruleId: 'architecture.no-infrastructure-import', evidence: [line.trim()],
      })];
    });
  },
};

export const hardcodedSecret: Rule = {
  id: 'security.hardcoded-secret',
  analyze(file) {
    return file.content.split(/\r?\n/).flatMap((line, index) => {
      if (!secretPattern.test(line) || /process\.env\.|import\.meta\.env\./.test(line)) return [];
      return [finding(file, index + 1, {
        severity: 'critical', category: 'security', status: 'open', decision: 'block',
        title: 'Potential hardcoded secret',
        description: 'A credential-like value appears to be embedded directly in source code.',
        suggestion: 'Move the secret to a secure environment or secret manager and rotate the exposed credential if it is real.',
        confidence: 0.91, ruleId: 'security.hardcoded-secret', evidence: [line.trim()],
      })];
    });
  },
};

export const highComplexity: Rule = {
  id: 'maintainability.high-complexity',
  analyze(file) {
    const lines = file.content.split(/\r?\n/);
    let branches = 0; let firstBranch = 0;
    for (const [index, line] of lines.entries()) {
      const matches = line.match(complexityPattern)?.length ?? 0;
      if (matches && !firstBranch) firstBranch = index + 1;
      branches += matches;
    }
    if (branches < 12) return [];
    return [finding(file, firstBranch || 1, {
      severity: 'medium', category: 'maintainability', status: 'open', decision: 'review_required',
      title: 'High branching complexity detected',
      description: `The file contains approximately ${branches} branching constructs, increasing cognitive and maintenance cost.`,
      suggestion: 'Split complex logic into smaller functions and reduce nested conditionals.',
      confidence: 0.78, ruleId: 'maintainability.high-complexity',
    })];
  },
};

export const missingTest: Rule = {
  id: 'testing.missing-test',
  analyze(file) {
    if (!/\.(ts|tsx|js|jsx)$/.test(file.path) || /(^|[/\\])(test|tests|__tests__)([/\\])|\.(test|spec)\./i.test(file.path)) return [];
    if (!/export\s+(?:async\s+)?function|export\s+class|export\s+const\s+\w+\s*=/.test(file.content)) return [];
    return [finding(file, 1, {
      severity: 'low', category: 'testing', status: 'open', decision: 'review_required',
      title: 'Exported production code has no nearby test file',
      description: 'The analyzer found exported production code but no test/spec naming convention for this file.',
      suggestion: 'Add focused unit tests for the exported behavior and critical branches.',
      confidence: 0.58, ruleId: 'testing.missing-test',
    })];
  },
};

export const sqlInjectionRisk: Rule = {
  id: 'security.sql-injection',
  analyze(file) {
    const sqlPattern = /\.(?:query|execute|raw)\s*\(\s*`[^`]*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)[^`]*\$\{/i;
    const sqlConcatPattern = /\.(?:query|execute|raw)\s*\(\s*['"][^'"]*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)[^'"]*['"]\s*\+/i;
    return file.content.split(/\r?\n/).flatMap((line, index) => {
      if (!sqlPattern.test(line) && !sqlConcatPattern.test(line)) return [];
      return [finding(file, index + 1, {
        severity: 'high', category: 'security', status: 'open', decision: 'block',
        title: 'Potential SQL injection vulnerability',
        description: 'Direct string interpolation or concatenation in a database query execution method can allow malicious SQL execution.',
        suggestion: 'Use parameterized queries or prepared statements instead of string concatenation.',
        confidence: 0.94, ruleId: 'security.sql-injection', evidence: [line.trim()],
      })];
    });
  },
};

export const emptyCatchBlock: Rule = {
  id: 'clean_code.empty-catch',
  analyze(file) {
    const emptyCatchPattern = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/;
    return file.content.split(/\r?\n/).flatMap((line, index) => {
      if (!emptyCatchPattern.test(line)) return [];
      return [finding(file, index + 1, {
        severity: 'medium', category: 'clean_code', status: 'open', decision: 'review_required',
        title: 'Empty catch block silently swallowing exceptions',
        description: 'An empty catch block discards error state without logging or handling, making debugging difficult and masking failures.',
        suggestion: 'Log the error or handle the exception explicitly.',
        confidence: 0.89, ruleId: 'clean_code.empty-catch', evidence: [line.trim()],
      })];
    });
  },
};

export const defaultRules: Rule[] = [
  noInfrastructureImport,
  hardcodedSecret,
  highComplexity,
  missingTest,
  sqlInjectionRisk,
  emptyCatchBlock,
];
