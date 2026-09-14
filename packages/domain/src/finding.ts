export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingCategory =
  | 'architecture'
  | 'security'
  | 'performance'
  | 'clean_code'
  | 'testing'
  | 'dependency'
  | 'scalability'
  | 'maintainability';

export type FindingStatus = 'open' | 'accepted' | 'resolved' | 'false_positive';

export type ReviewDecision = 'approve' | 'review_required' | 'block';

export type FindingSource = 'deterministic' | 'ai' | 'correlated';

export interface Finding {
  id: string;
  severity: Severity;
  category: FindingCategory;
  status: FindingStatus;
  decision: ReviewDecision;
  file: string;
  line?: number;
  title: string;
  description: string;
  suggestion: string;
  confidence: number;
  source: FindingSource;
  ruleId?: string;
  body?: string;
  rationale?: string;
  impact?: string;
  evidence?: string[];
}

export interface ReviewResult {
  score: number;
  decision: ReviewDecision;
  findings: Finding[];
  analyzedFiles: number;
  generatedAt: string;
}
