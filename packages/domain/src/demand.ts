/**
 * Demand Validation domain models.
 *
 * A demand is a unit of traceability that links a requirement to its
 * acceptance criteria, and each criterion to the code, tests and evidence
 * that prove it. The domain layer only describes the data; deterministic
 * status aggregation and quality-gate evaluation live in the validation
 * engine (see the analyzer-style modules added in a later phase).
 *
 * Casing note: the spec (§2, §4, §5, §7) enumerates its states in
 * UPPER_CASE and those values surface directly in the API and UI
 * (e.g. "PARTIAL", "VALIDATED"), consistent with `Review.status`
 * ('QUEUED' | 'COMPLETED' | ...). The demand-validation module therefore
 * uses UPPER_CASE for its spec-defined enums. Tool identifiers that are not
 * domain states (test framework ids) stay lowercase, matching how tools are
 * named elsewhere.
 */

/** Where a demand originates. Providers are added incrementally (§4). */
export const DEMAND_SOURCES = [
  'INTERNAL',
  'GITHUB',
  'GITLAB',
  'JIRA',
  'LINEAR',
  'AZURE_DEVOPS',
  'OTHER',
] as const;
export type DemandSource = (typeof DEMAND_SOURCES)[number];

/**
 * Demand priority. Not enumerated by the spec (§4 lists the column only);
 * this is the conventional four-level set and is documented here as the
 * single source of truth for API validation and the UI.
 */
export const DEMAND_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type DemandPriority = (typeof DEMAND_PRIORITIES)[number];

/** Acceptance-criterion classification (§5). */
export const CRITERION_TYPES = [
  'FUNCTIONAL',
  'BUSINESS_RULE',
  'SECURITY',
  'PERFORMANCE',
  'DATA',
  'INTEGRATION',
  'OTHER',
] as const;
export type CriterionType = (typeof CRITERION_TYPES)[number];

/**
 * Validation states (§2). Shared vocabulary for both a criterion's status
 * and a demand's aggregated status:
 *   PENDING     — not yet validated
 *   VALIDATED   — sufficient evidence and related tests pass
 *   PARTIAL     — partial implementation / evidence
 *   FAILED      — evidence of failure
 *   NO_EVIDENCE — insufficient evidence found (criterion-level)
 *   BLOCKED     — validation could not be completed
 * The aggregation rules (§14) are deterministic and computed by the
 * validation engine, never by an LLM.
 */
export const VALIDATION_STATUSES = [
  'PENDING',
  'VALIDATED',
  'PARTIAL',
  'FAILED',
  'NO_EVIDENCE',
  'BLOCKED',
] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

/** Kinds of verifiable evidence a criterion can accumulate (§7). */
export const EVIDENCE_TYPES = [
  'SOURCE_CODE',
  'TEST',
  'TEST_RESULT',
  'COVERAGE',
  'STATIC_ANALYSIS',
  'SECURITY_SCAN',
  'PULL_REQUEST',
  'COMMIT',
  'CI_RUN',
  'DOCUMENTATION',
  'MANUAL',
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

/**
 * Outcome an individual evidence item asserts. Not enumerated by the spec
 * (§7 lists the column); chosen to be expressive enough for the engine to
 * map evidence to a criterion status:
 *   PASS / FAIL / PARTIAL — result-bearing evidence (TEST_RESULT, CI_RUN…)
 *   PRESENT               — existence evidence (SOURCE_CODE, TEST, DOCS…)
 *   MISSING               — expected evidence not found
 *   ERROR                 — evidence could not be collected (feeds BLOCKED)
 */
export const EVIDENCE_STATUSES = ['PASS', 'FAIL', 'PARTIAL', 'PRESENT', 'MISSING', 'ERROR'] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

/**
 * Origin of a code/test mapping. The spec (§8) is explicit that AI
 * confidence is metadata, not proof, so the mapping records how it was
 * produced. Not spec-enumerated; kept UPPER_CASE for module consistency.
 */
export const MAPPING_SOURCES = ['AI', 'STATIC', 'HEURISTIC', 'MANUAL'] as const;
export type MappingSource = (typeof MAPPING_SOURCES)[number];

/**
 * Test frameworks the module can map against (§24). Only frameworks the
 * project actually supports get a runner; the type stays open so new
 * frameworks can be added without a fictional runner. Lowercase because
 * these are tool identifiers, not domain states.
 */
export const TEST_FRAMEWORKS = ['vitest', 'jest', 'pytest', 'phpunit', 'pest'] as const;
export type TestFramework = (typeof TEST_FRAMEWORKS)[number];

/** A demand: the traceability root linking a requirement to evidence (§4). */
export interface Demand {
  id: string;
  projectId: string;
  organizationId: string;
  externalId?: string | undefined;
  title: string;
  description: string;
  source: DemandSource;
  sourceUrl?: string | undefined;
  status: ValidationStatus;
  priority: DemandPriority;
  createdAt: string;
  updatedAt: string;
}

/** A single acceptance criterion of a demand (§5, §16). */
export interface DemandCriterion {
  id: string;
  demandId: string;
  description: string;
  position: number;
  type: CriterionType;
  status: ValidationStatus;
  /** A blocking criterion fails the whole demand and quality gate (§16). */
  isBlocking: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A verifiable piece of evidence attached to a criterion (§7). */
export interface DemandEvidence {
  id: string;
  criterionId: string;
  type: EvidenceType;
  /** Origin of the evidence (tool/provider), e.g. 'vitest', 'github'. */
  source: string;
  /** Locator: test id, file path, PR url, commit sha, etc. */
  reference: string;
  description?: string | undefined;
  status: EvidenceStatus;
  metadata?: Record<string, unknown> | undefined;
  createdAt: string;
}

/** Maps a criterion to the code that implements it (§8). */
export interface DemandCodeMapping {
  id: string;
  criterionId: string;
  filePath: string;
  symbol?: string | undefined;
  lineStart?: number | undefined;
  lineEnd?: number | undefined;
  /** 0..1 confidence — metadata, never treated as proof (§8). */
  confidence: number;
  source: MappingSource;
  createdAt: string;
}

/** Maps a criterion to the test that exercises it (§9). */
export interface DemandTestMapping {
  id: string;
  criterionId: string;
  testFile: string;
  testName: string;
  framework: TestFramework;
  /** 0..1 confidence — metadata, never treated as proof (§9). */
  confidence: number;
  createdAt: string;
}

function includes<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

export function isDemandSource(value: string): value is DemandSource {
  return includes(DEMAND_SOURCES, value);
}

export function isDemandPriority(value: string): value is DemandPriority {
  return includes(DEMAND_PRIORITIES, value);
}

export function isCriterionType(value: string): value is CriterionType {
  return includes(CRITERION_TYPES, value);
}

export function isEvidenceType(value: string): value is EvidenceType {
  return includes(EVIDENCE_TYPES, value);
}

export function isEvidenceStatus(value: string): value is EvidenceStatus {
  return includes(EVIDENCE_STATUSES, value);
}

export function isValidationStatus(value: string): value is ValidationStatus {
  return includes(VALIDATION_STATUSES, value);
}

export function isMappingSource(value: string): value is MappingSource {
  return includes(MAPPING_SOURCES, value);
}

export function isTestFramework(value: string): value is TestFramework {
  return includes(TEST_FRAMEWORKS, value);
}
