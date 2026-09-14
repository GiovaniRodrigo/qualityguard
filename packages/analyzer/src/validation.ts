import { z } from 'zod';
import type { Finding } from '@qualityguard/domain';

export const findingSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  category: z.enum(['architecture', 'security', 'performance', 'clean_code', 'testing', 'dependency', 'scalability', 'maintainability']),
  status: z.enum(['open', 'accepted', 'resolved', 'false_positive']),
  decision: z.enum(['approve', 'review_required', 'block']),
  file: z.string().min(1),
  line: z.number().int().positive().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  suggestion: z.string().min(1),
  confidence: z.number().min(0).max(1),
  source: z.enum(['deterministic', 'ai', 'correlated']),
  ruleId: z.string().min(1).optional(),
  body: z.string().optional(),
  rationale: z.string().optional(),
  impact: z.string().optional(),
  evidence: z.array(z.string()).optional(),
}).superRefine((value, ctx) => {
  if (value.decision === 'block' && value.severity !== 'critical' && value.severity !== 'high') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['decision'], message: 'block requires critical or high severity' });
  }
});

export function validateFinding(value: unknown): Finding {
  return findingSchema.parse(value) as Finding;
}

export function validateFindings(values: unknown[]): Finding[] {
  return values.map(validateFinding);
}
