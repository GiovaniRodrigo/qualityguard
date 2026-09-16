export { analyze, calculateScore } from './analyzer.js';
export { analyzeDiff } from './diff-review.js';
export { parseUnifiedDiff, changedSourceFiles } from './diff.js';
export { defaultRules, noInfrastructureImport, hardcodedSecret, highComplexity, missingTest } from './rules.js';
export { loadConfig, normalizeConfig, configuredRules, applySeverityOverrides } from './policy.js';
export { findingSchema, validateFinding, validateFindings } from './validation.js';
export { findingFingerprint, deduplicateFindings } from './fingerprint.js';
export { loadBaseline, writeBaseline, excludeBaselineFindings } from './baseline.js';
export { evaluateGate } from './gate.js';
export {
  extractAllDependencies,
  extractRequirementsTxt,
  extractPyprojectToml,
  extractGoMod,
  extractPomXml,
  extractCargoToml,
  extractPackageJson,
} from './manifests/index.js';
export * from './coverage/index.js';
export {
  compareReviews,
  diffFindings,
  computeStableFindingKey,
  computeScoreDelta,
  computeQualityGateDelta,
  computeArchitectureDriftDelta,
  computeDependencyDriftDelta,
  computeCoverageMetricDelta,
  computeCoverageDriftDelta,
  type ReviewSnapshot,
} from './comparison.js';
export type { AnalyzeInput } from './analyzer.js';
export type { DiffReviewResult } from './diff-review.js';
export type { Rule, SourceFile } from './rules.js';
export type { DiffFile, DiffChangeType } from './diff.js';
export type { QualityGuardConfig } from './policy.js';
export type { Baseline } from './baseline.js';
export type { QualityGatePolicy, QualityGateResult } from './gate.js';
