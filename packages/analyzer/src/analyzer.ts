import type { ReviewResult } from '@qualityguard/domain';
import { defaultRules, type Rule, type SourceFile } from './rules.js';

export interface AnalyzeInput {
  files: SourceFile[];
  rules?: Rule[];
}

export function calculateScore(findings: ReviewResult['findings']): number {
  const penalties = { critical: 35, high: 20, medium: 10, low: 3, info: 0 } as const;
  const penalty = findings
    .filter((finding) => finding.status === 'open')
    .reduce((total, finding) => total + penalties[finding.severity], 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function analyze(input: AnalyzeInput): ReviewResult {
  const rules = input.rules ?? defaultRules;
  const findings = rules.flatMap((rule) => input.files.flatMap((file) => rule.analyze(file)));
  const score = calculateScore(findings);
  const decision = findings.some((finding) => finding.status === 'open' && finding.decision === 'block')
    ? 'block'
    : findings.some((finding) => finding.status === 'open' && finding.decision === 'review_required')
      ? 'review_required'
      : 'approve';

  return {
    score,
    decision,
    findings,
    analyzedFiles: input.files.length,
    generatedAt: new Date().toISOString(),
  };
}
