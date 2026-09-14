import type { Finding } from '@qualityguard/domain';

export interface SourceFile {
  path: string;
  content: string;
}

export interface Rule {
  id: string;
  analyze(file: SourceFile): Finding[];
}

const infrastructureImport = /(?:from\s+['"]|import\s+['"]|require\(\s*['"])([^'"]*(?:infrastructure|infra|database|db|repositories|adapters)[^'"]*)['"]/i;

export const noInfrastructureImport: Rule = {
  id: 'architecture.no-infrastructure-import',
  analyze(file) {
    if (!/(^|\/)(application|domain)(\/)/i.test(file.path)) return [];

    const findings: Finding[] = [];
    const lines = file.content.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (!infrastructureImport.test(line)) return;
      findings.push({
        id: `ARCH-001-${index + 1}`,
        severity: 'high',
        category: 'architecture',
        status: 'open',
        decision: 'block',
        file: file.path,
        line: index + 1,
        title: 'Application or domain layer depends on infrastructure',
        description: 'A business-layer file imports an infrastructure implementation directly, coupling policy to technical details.',
        suggestion: 'Depend on an abstraction in the domain/application layer and inject the infrastructure implementation at the composition root.',
        confidence: 0.98,
        source: 'deterministic',
        ruleId: 'architecture.no-infrastructure-import',
        evidence: [line.trim()],
      });
    });

    return findings;
  },
};

export const defaultRules: Rule[] = [noInfrastructureImport];
