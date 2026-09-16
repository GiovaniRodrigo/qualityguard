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

export interface Finding {
  id: string;
  severity: Severity;
  category: FindingCategory;
  status: FindingStatus;
  decision: ReviewDecision;
  file: string;
  line?: number;
  startLine?: number;
  endLine?: number;
  title: string;
  description: string;
  suggestion: string;
  confidence: number;
  source: 'deterministic' | 'ai' | 'correlated';
  ruleId?: string;
  body?: string;
  rationale?: string;
  impact?: string;
  evidence?: string[];
}

export interface User {
  id: string;
  email: string;
  role?: string;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  plan: 'community' | 'pro' | 'team' | 'enterprise';
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionStatus?: string | null;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  repository: string;
  branch?: string;
  createdAt: string;
  latestAnalysis?: {
    id: string;
    score: number;
    decision: string;
    findingsCount: number;
    createdAt: string;
    status: string;
  } | null;
}

export interface DependencyItem {
  name: string;
  version?: string;
  ecosystem?: string;
  manifest?: string;
  type?: string;
  optional?: boolean;
  indirect?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ArchitectureGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string; kind: 'import' | 'require' }>;
  cycles: string[][];
  drift: Array<{ type: string; from: string; to: string; message: string }>;
}

export interface CoverageMetrics {
  total: number;
  covered: number;
  missed: number;
  percentage: number | null;
}

export interface CoverageSummary {
  lines: CoverageMetrics;
  functions: CoverageMetrics;
  branches: CoverageMetrics;
}

export interface CoverageResponse {
  coverage: {
    lines: number | null;
    functions: number | null;
    branches: number | null;
  };
  summary?: CoverageSummary;
  format: 'lcov' | 'jacoco';
  files: number;
  analysisId: string;
  projectId: string;
  createdAt: string;
}

export interface Review {
  id: string;
  projectId: string;
  organizationId: string;
  projectName?: string;
  repository?: string;
  branch?: string;
  commitSha?: string;
  score: number;
  decision: string;
  findings: Finding[];
  analyzedFiles: number;
  architecture?: ArchitectureGraph;
  dependencies?: DependencyItem[];
  coverage?: CoverageSummary;
  gate?: {
    passed: boolean;
    reasons: string[];
    decision: string;
  };
  categoryScores?: {
    architecture: number;
    security: number;
    testing: number | null;
    dependencies: number;
  };
  aiInsight?: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  errorMessage?: string;
  createdAt: string;
}

export interface AnalysisJob {
  id: string;
  analysisId?: string;
  projectId: string;
  organizationId?: string;
  branch?: string;
  status: 'queued' | 'cloning' | 'analyzing' | 'completed' | 'failed';
  progress: number;
  startedAt: string;
  completedAt?: string | null;
  error?: string | null;
  result?: Review | null;
}

export interface GitHubStatus {
  configured: boolean;
  appId: string | null;
  status: 'connected' | 'not_configured';
}

export interface BillingSubscription {
  plan: 'community' | 'pro' | 'team' | 'enterprise';
  subscriptionStatus: string | null;
  stripeCustomerId: string | null;
  configured: boolean;
}

export type ArchitectureRuleType =
  | 'forbidden_dependency'
  | 'allowed_dependency'
  | 'forbidden_path_dependency'
  | 'no_cycles'
  | 'required_layer';

export interface ArchitectureRule {
  id: string;
  projectId: string;
  name: string;
  type: ArchitectureRuleType;
  enabled: boolean;
  severity: Severity;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewReference {
  reviewId?: string;
  projectId: string;
  projectName?: string;
  branch?: string;
  commitSha?: string;
  score: number;
  decision: string;
  createdAt?: string;
}

export interface FindingDiff {
  introduced: Finding[];
  resolved: Finding[];
  unchanged: Finding[];
  totalBaseline: number;
  totalCurrent: number;
}

export interface ScoreDelta {
  baseline: number;
  current: number;
  delta: number;
}

export interface QualityGateDeltaState {
  passed: boolean;
  decision: string;
  reasons: string[];
}

export interface QualityGateDelta {
  baseline: QualityGateDeltaState;
  current: QualityGateDeltaState;
  statusChanged: boolean;
  transition: string;
}

export interface ArchitectureDriftItem {
  type: string;
  from: string;
  to: string;
  message: string;
}

export interface ArchitectureDriftDelta {
  introducedDrift: ArchitectureDriftItem[];
  resolvedDrift: ArchitectureDriftItem[];
  unchangedDrift: ArchitectureDriftItem[];
  introducedCycles: string[][];
  resolvedCycles: string[][];
}

export interface DependencyChange {
  name: string;
  ecosystem: string;
  manifest: string;
  previousVersion?: string;
  currentVersion?: string;
  previousType?: string;
  currentType?: string;
}

export interface DependencyDriftDelta {
  added: DependencyItem[];
  removed: DependencyItem[];
  changed: DependencyChange[];
}

export interface CoverageMetricDelta {
  baselinePercentage: number | null;
  currentPercentage: number | null;
  delta: number | null;
  baselineCovered: number;
  currentCovered: number;
  baselineTotal: number;
  currentTotal: number;
}

export interface CoverageDelta {
  lines: CoverageMetricDelta;
  functions: CoverageMetricDelta;
  branches: CoverageMetricDelta;
}

export interface CoverageDriftDelta {
  baseline: CoverageSummary | null;
  current: CoverageSummary | null;
  delta: CoverageDelta | null;
}

export interface ReviewComparisonResult {
  id: string;
  projectId: string;
  baseline: ReviewReference;
  current: ReviewReference;
  findings: FindingDiff;
  score: ScoreDelta;
  gate: QualityGateDelta;
  architecture: ArchitectureDriftDelta;
  dependencies: DependencyDriftDelta;
  coverage: CoverageDriftDelta;
  generatedAt: string;
}

