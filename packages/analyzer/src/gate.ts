import type { Finding, ReviewDecision, Severity } from '@qualityguard/domain';

export interface QualityGatePolicy { minimumScore: number; blockOn: Severity[]; }
export interface QualityGateResult { passed: boolean; decision: ReviewDecision; score: number; reasons: string[]; }

export function evaluateGate(score: number, findings: Finding[], policy: QualityGatePolicy): QualityGateResult {
  const reasons: string[] = [];
  const blocking = findings.filter((f) => f.status === 'open' && policy.blockOn.includes(f.severity));
  if (blocking.length) reasons.push(`${blocking.length} blocking finding(s)`);
  if (score < policy.minimumScore) reasons.push(`score ${score} is below minimum ${policy.minimumScore}`);
  const passed = reasons.length === 0;
  const decision: ReviewDecision = blocking.some((f) => f.severity === 'critical') ? 'block' : passed ? 'approve' : 'review_required';
  return { passed, decision, score, reasons };
}
