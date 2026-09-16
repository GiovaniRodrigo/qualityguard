import type { Finding } from './finding.js';
import type { DependencyItem } from './dependency.js';
import type { CoverageSummary } from './coverage.js';

export interface ReviewReference {
  reviewId?: string | undefined;
  projectId: string;
  projectName?: string | undefined;
  branch?: string | undefined;
  commitSha?: string | undefined;
  score: number;
  decision: string;
  createdAt?: string | undefined;
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
  previousVersion?: string | undefined;
  currentVersion?: string | undefined;
  previousType?: string | undefined;
  currentType?: string | undefined;
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
