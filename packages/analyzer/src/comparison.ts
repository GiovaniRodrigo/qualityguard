import type {
  Finding,
  DependencyItem,
  CoverageSummary,
  ReviewComparisonResult,
  ReviewReference,
  FindingDiff,
  ScoreDelta,
  QualityGateDelta,
  QualityGateDeltaState,
  ArchitectureDriftItem,
  ArchitectureDriftDelta,
  DependencyChange,
  DependencyDriftDelta,
  CoverageMetricDelta,
  CoverageDelta,
  CoverageDriftDelta,
} from '@qualityguard/domain';
import { findingFingerprint } from './fingerprint.js';

export interface ReviewSnapshot {
  id?: string | undefined;
  projectId: string;
  projectName?: string | undefined;
  branch?: string | undefined;
  commitSha?: string | undefined;
  score: number;
  decision: string;
  findings: Finding[];
  analyzedFiles?: number | undefined;
  architecture?: {
    nodes?: string[] | undefined;
    edges?: Array<{ from: string; to: string; kind: 'import' | 'require' }> | undefined;
    cycles?: string[][] | undefined;
    drift?: Array<{ type: string; from: string; to: string; message: string }> | undefined;
  } | undefined;
  dependencies?: DependencyItem[] | undefined;
  coverage?: CoverageSummary | null | undefined;
  gate?: {
    passed: boolean;
    reasons: string[];
    decision: string;
  } | undefined;
  createdAt?: string | undefined;
}

/**
 * Computes a stable semantic identity for a finding across commits/branches.
 * Does not depend solely on volatile line numbers, enabling resilience to line shifts.
 */
export function computeStableFindingKey(finding: Finding): string {
  const rule = finding.ruleId ?? 'rule';
  const file = finding.file.replaceAll('\\', '/').replace(/^\.\//, '');

  if (finding.evidence && finding.evidence.length > 0 && finding.evidence[0]?.trim()) {
    const evidenceSig = finding.evidence.map((e) => e.trim().replace(/\s+/g, ' ')).join(';;');
    return `${rule}::${file}::evidence:${evidenceSig}`;
  }

  if (finding.title) {
    return `${rule}::${file}::title:${finding.title.trim().toLowerCase()}`;
  }

  return `${rule}::${file}::line:${finding.line ?? 0}`;
}

/**
 * Compares two sets of findings deterministically using multi-pass matching:
 * 1. Exact fingerprint match (rule + file + line + title + evidence).
 * 2. Semantic content signature match (rule + file + evidence/title).
 * 3. Fallback exact ID match.
 */
export function diffFindings(baselineFindings: Finding[], currentFindings: Finding[]): FindingDiff {
  const baseline = [...baselineFindings];
  const current = [...currentFindings];

  const introduced: Finding[] = [];
  const resolved: Finding[] = [];
  const unchanged: Finding[] = [];

  const matchedCurrentIndices = new Set<number>();
  const matchedBaselineIndices = new Set<number>();

  // Pass 1: Exact fingerprint matching (includes exact line)
  const currentFingerprints = new Map<string, number[]>();
  for (let i = 0; i < current.length; i++) {
    const item = current[i];
    if (!item) continue;
    const fp = findingFingerprint(item);
    const list = currentFingerprints.get(fp) ?? [];
    list.push(i);
    currentFingerprints.set(fp, list);
  }

  for (let b = 0; b < baseline.length; b++) {
    const bFinding = baseline[b];
    if (!bFinding) continue;
    const fp = findingFingerprint(bFinding);
    const available = currentFingerprints.get(fp);
    if (available && available.length > 0) {
      const matchIdx = available.shift()!;
      matchedBaselineIndices.add(b);
      matchedCurrentIndices.add(matchIdx);
      const matchedFinding = current[matchIdx];
      if (matchedFinding) {
        unchanged.push(matchedFinding);
      }
    }
  }

  // Pass 2: Semantic content signature matching (handles line shifts during edits)
  const currentSignatures = new Map<string, number[]>();
  for (let i = 0; i < current.length; i++) {
    if (matchedCurrentIndices.has(i)) continue;
    const item = current[i];
    if (!item) continue;
    const sig = computeStableFindingKey(item);
    const list = currentSignatures.get(sig) ?? [];
    list.push(i);
    currentSignatures.set(sig, list);
  }

  for (let b = 0; b < baseline.length; b++) {
    if (matchedBaselineIndices.has(b)) continue;
    const bFinding = baseline[b];
    if (!bFinding) continue;
    const sig = computeStableFindingKey(bFinding);
    const available = currentSignatures.get(sig);
    if (available && available.length > 0) {
      const matchIdx = available.shift()!;
      matchedBaselineIndices.add(b);
      matchedCurrentIndices.add(matchIdx);
      const matchedFinding = current[matchIdx];
      if (matchedFinding) {
        unchanged.push(matchedFinding);
      }
    }
  }

  // Pass 3: Check unresolved vs introduced
  for (let b = 0; b < baseline.length; b++) {
    if (!matchedBaselineIndices.has(b)) {
      const item = baseline[b];
      if (item) resolved.push(item);
    }
  }

  for (let i = 0; i < current.length; i++) {
    if (!matchedCurrentIndices.has(i)) {
      const item = current[i];
      if (item) introduced.push(item);
    }
  }

  // Sort deterministically
  const sortFn = (a: Finding, b: Finding) => {
    const fComp = a.file.localeCompare(b.file);
    if (fComp !== 0) return fComp;
    const lComp = (a.line ?? 0) - (b.line ?? 0);
    if (lComp !== 0) return lComp;
    return (a.ruleId ?? '').localeCompare(b.ruleId ?? '');
  };

  introduced.sort(sortFn);
  resolved.sort(sortFn);
  unchanged.sort(sortFn);

  return {
    introduced,
    resolved,
    unchanged,
    totalBaseline: baseline.length,
    totalCurrent: current.length,
  };
}

/**
 * Computes Score delta between current and baseline.
 */
export function computeScoreDelta(baselineScore: number, currentScore: number): ScoreDelta {
  const delta = Math.round((currentScore - baselineScore) * 100) / 100;
  return {
    baseline: baselineScore,
    current: currentScore,
    delta,
  };
}

/**
 * Computes Quality Gate transition and delta state.
 */
export function computeQualityGateDelta(
  baselineGate?: { passed: boolean; decision: string; reasons: string[] } | null | undefined,
  currentGate?: { passed: boolean; decision: string; reasons: string[] } | null | undefined,
  baselineDecision = 'review_required',
  currentDecision = 'review_required',
): QualityGateDelta {
  const baselineState: QualityGateDeltaState = {
    passed: baselineGate !== undefined && baselineGate !== null ? Boolean(baselineGate.passed) : baselineDecision === 'approve',
    decision: (baselineGate?.decision ?? baselineDecision).toLowerCase(),
    reasons: baselineGate?.reasons ?? [],
  };

  const currentState: QualityGateDeltaState = {
    passed: currentGate !== undefined && currentGate !== null ? Boolean(currentGate.passed) : currentDecision === 'approve',
    decision: (currentGate?.decision ?? currentDecision).toLowerCase(),
    reasons: currentGate?.reasons ?? [],
  };

  const statusChanged =
    baselineState.passed !== currentState.passed || baselineState.decision !== currentState.decision;
  const transition = `${baselineState.decision.toUpperCase()} -> ${currentState.decision.toUpperCase()}`;

  return {
    baseline: baselineState,
    current: currentState,
    statusChanged,
    transition,
  };
}

/**
 * Computes Architecture Drift differences (introduced vs resolved drift and cycles).
 */
export function computeArchitectureDriftDelta(
  baselineArch?: {
    drift?: Array<{ type: string; from: string; to: string; message: string }> | undefined;
    cycles?: string[][] | undefined;
  } | null | undefined,
  currentArch?: {
    drift?: Array<{ type: string; from: string; to: string; message: string }> | undefined;
    cycles?: string[][] | undefined;
  } | null | undefined,
): ArchitectureDriftDelta {
  const baseDrifts = baselineArch?.drift ?? [];
  const currDrifts = currentArch?.drift ?? [];

  const driftKey = (d: ArchitectureDriftItem) => `${d.type}::${d.from}::${d.to}`;
  const baseDriftMap = new Map<string, ArchitectureDriftItem>();
  for (const d of baseDrifts) baseDriftMap.set(driftKey(d), d);

  const currDriftMap = new Map<string, ArchitectureDriftItem>();
  for (const d of currDrifts) currDriftMap.set(driftKey(d), d);

  const introducedDrift: ArchitectureDriftItem[] = [];
  const resolvedDrift: ArchitectureDriftItem[] = [];
  const unchangedDrift: ArchitectureDriftItem[] = [];

  for (const [key, drift] of currDriftMap.entries()) {
    if (baseDriftMap.has(key)) {
      unchangedDrift.push(drift);
    } else {
      introducedDrift.push(drift);
    }
  }

  for (const [key, drift] of baseDriftMap.entries()) {
    if (!currDriftMap.has(key)) {
      resolvedDrift.push(drift);
    }
  }

  // Cycles comparison
  const cycleKey = (cycle: string[]) => [...new Set(cycle)].sort().join('->');
  const baseCycles = baselineArch?.cycles ?? [];
  const currCycles = currentArch?.cycles ?? [];

  const baseCycleMap = new Map<string, string[]>();
  for (const c of baseCycles) baseCycleMap.set(cycleKey(c), c);

  const currCycleMap = new Map<string, string[]>();
  for (const c of currCycles) currCycleMap.set(cycleKey(c), c);

  const introducedCycles: string[][] = [];
  const resolvedCycles: string[][] = [];

  for (const [key, cycle] of currCycleMap.entries()) {
    if (!baseCycleMap.has(key)) {
      introducedCycles.push(cycle);
    }
  }

  for (const [key, cycle] of baseCycleMap.entries()) {
    if (!currCycleMap.has(key)) {
      resolvedCycles.push(cycle);
    }
  }

  return {
    introducedDrift,
    resolvedDrift,
    unchangedDrift,
    introducedCycles,
    resolvedCycles,
  };
}

/**
 * Computes Dependency changes between baseline and current manifests.
 */
export function computeDependencyDriftDelta(
  baselineDeps: DependencyItem[] = [],
  currentDeps: DependencyItem[] = [],
): DependencyDriftDelta {
  const depKey = (d: DependencyItem) => `${d.ecosystem}::${d.name}`;

  const baseMap = new Map<string, DependencyItem>();
  for (const dep of baselineDeps) baseMap.set(depKey(dep), dep);

  const currMap = new Map<string, DependencyItem>();
  for (const dep of currentDeps) currMap.set(depKey(dep), dep);

  const added: DependencyItem[] = [];
  const removed: DependencyItem[] = [];
  const changed: DependencyChange[] = [];

  for (const [key, curr] of currMap.entries()) {
    const base = baseMap.get(key);
    if (!base) {
      added.push(curr);
    } else if (base.version !== curr.version || base.type !== curr.type) {
      changed.push({
        name: curr.name,
        ecosystem: curr.ecosystem,
        manifest: curr.manifest,
        previousVersion: base.version,
        currentVersion: curr.version,
        previousType: base.type ? String(base.type) : undefined,
        currentType: curr.type ? String(curr.type) : undefined,
      });
    }
  }

  for (const [key, base] of baseMap.entries()) {
    if (!currMap.has(key)) {
      removed.push(base);
    }
  }

  const sortDep = (a: DependencyItem, b: DependencyItem) =>
    `${a.ecosystem}:${a.name}`.localeCompare(`${b.ecosystem}:${b.name}`);

  added.sort(sortDep);
  removed.sort(sortDep);
  changed.sort((a, b) => `${a.ecosystem}:${a.name}`.localeCompare(`${b.ecosystem}:${b.name}`));

  return { added, removed, changed };
}

/**
 * Calculates metric percentage delta safely without NaN / Infinity.
 */
export function computeCoverageMetricDelta(
  baselineMetric?: { percentage: number | null; covered: number; total: number } | null | undefined,
  currentMetric?: { percentage: number | null; covered: number; total: number } | null | undefined,
): CoverageMetricDelta {
  const basePct = baselineMetric?.percentage ?? null;
  const currPct = currentMetric?.percentage ?? null;

  const delta =
    basePct !== null && currPct !== null ? Math.round((currPct - basePct) * 10) / 10 : null;

  return {
    baselinePercentage: basePct,
    currentPercentage: currPct,
    delta,
    baselineCovered: baselineMetric?.covered ?? 0,
    currentCovered: currentMetric?.covered ?? 0,
    baselineTotal: baselineMetric?.total ?? 0,
    currentTotal: currentMetric?.total ?? 0,
  };
}

/**
 * Computes Coverage drift delta across lines, functions, and branches.
 * Returns null delta if either baseline or current lacks coverage.
 */
export function computeCoverageDriftDelta(
  baselineCoverage?: CoverageSummary | null | undefined,
  currentCoverage?: CoverageSummary | null | undefined,
): CoverageDriftDelta {
  const baseline = baselineCoverage ?? null;
  const current = currentCoverage ?? null;

  if (!baseline && !current) {
    return { baseline: null, current: null, delta: null };
  }

  if (!baseline || !current) {
    return {
      baseline,
      current,
      delta: null,
    };
  }

  const delta: CoverageDelta = {
    lines: computeCoverageMetricDelta(baseline.lines, current.lines),
    functions: computeCoverageMetricDelta(baseline.functions, current.functions),
    branches: computeCoverageMetricDelta(baseline.branches, current.branches),
  };

  return {
    baseline,
    current,
    delta,
  };
}

/**
 * Main Comparison Function: Compares two review snapshots end-to-end.
 */
export function compareReviews(
  baseline: ReviewSnapshot,
  current: ReviewSnapshot,
  comparisonId?: string,
): ReviewComparisonResult {
  const findings = diffFindings(baseline.findings ?? [], current.findings ?? []);
  const score = computeScoreDelta(baseline.score, current.score);
  const gate = computeQualityGateDelta(baseline.gate, current.gate, baseline.decision, current.decision);
  const architecture = computeArchitectureDriftDelta(baseline.architecture, current.architecture);
  const dependencies = computeDependencyDriftDelta(baseline.dependencies ?? [], current.dependencies ?? []);
  const coverage = computeCoverageDriftDelta(baseline.coverage, current.coverage);

  const baselineRef: ReviewReference = {
    reviewId: baseline.id,
    projectId: baseline.projectId,
    projectName: baseline.projectName,
    branch: baseline.branch,
    commitSha: baseline.commitSha,
    score: baseline.score,
    decision: baseline.decision,
    createdAt: baseline.createdAt,
  };

  const currentRef: ReviewReference = {
    reviewId: current.id,
    projectId: current.projectId,
    projectName: current.projectName,
    branch: current.branch,
    commitSha: current.commitSha,
    score: current.score,
    decision: current.decision,
    createdAt: current.createdAt,
  };

  return {
    id: comparisonId ?? `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    projectId: current.projectId || baseline.projectId,
    baseline: baselineRef,
    current: currentRef,
    findings,
    score,
    gate,
    architecture,
    dependencies,
    coverage,
    generatedAt: new Date().toISOString(),
  };
}
