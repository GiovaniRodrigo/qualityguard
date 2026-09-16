# QualityGuard — QG-TDD-008 Technical & Architectural Audit
## Milestone: Multi-Branch Comparison & Architecture Drift (FEAT-018)

**Author:** Principal Software Engineer & Architect  
**Date:** 2026-09-15  
**Milestone:** QG-TDD-008 — Multi-Branch PR Comparison & Architecture Drift  
**Feature:** FEAT-018 (`PARTIALLY_IMPLEMENTED` ➔ `IMPLEMENTED`)  
**Current Status:** AUDIT COMPLETED  

---

## 1. Executive Summary

This audit establishes the baseline state, identifies technical gaps, and defines the implementation architecture for **FEAT-018: Multi-Branch PR Comparison & Drift Diffing** in QualityGuard.

Prior to this milestone, QualityGuard possessed primitive diff-parsing capabilities (`parseUnifiedDiff` and `analyzeDiff` in `packages/analyzer`), pull request patch mapping in `integrations/github`, and static architecture drift detection against a fixed policy (`detectDrift` in `packages/architecture`). However, there was no end-to-end capability to compare two analysis reviews (e.g., base branch vs feature branch, main vs release/2.2, commit A vs commit B, or prior review vs latest review) across all quality dimensions (Findings, Score, Quality Gate, Architecture Drift, Dependencies, and Test Coverage).

---

## 2. Audit of Existing Codebase

### 2.1 What Already Exists

1. **`packages/analyzer`**:
   - [`src/diff.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/packages/analyzer/src/diff.ts): `parseUnifiedDiff` parses additions, deletions, hunks, file renames, additions, and deletions. `changedSourceFiles` filters modified source files.
   - [`src/diff-review.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/packages/analyzer/src/diff-review.ts): `DiffReviewResult` interface (extending `ReviewResult` with `changedFiles`, `additions`, `deletions`) and `analyzeDiff(diff)` which runs static AST rules against unified diff patches.
   - [`src/rules.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/packages/analyzer/src/rules.ts): Deterministic rules generating findings with IDs like `${ruleId}-${fileKey}-${line}`.
   - [`src/manifests/`](file:///home/isabelle/teste_qualityguard/qualityguard/packages/analyzer/src/manifests/): Polyglot dependency extractors returning normalized `DependencyItem[]`.
   - [`src/coverage/`](file:///home/isabelle/teste_qualityguard/qualityguard/packages/analyzer/src/coverage/): LCOV and JaCoCo XML parsers producing `CoverageSummary`.

2. **`packages/architecture`**:
   - [`src/index.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/packages/architecture/src/index.ts): `buildDependencyGraph`, `findCycles`.
   - [`src/governance.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/packages/architecture/src/governance.ts): `detectDrift` evaluates forbidden edges and layer violations against an `ArchitecturePolicy`.
   - [`src/engine.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/packages/architecture/src/engine.ts): Custom architecture rule evaluation engine (`evaluateArchitectureRules`).

3. **`integrations/github`**:
   - [`src/diff-mapping.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/integrations/github/src/diff-mapping.ts): `parseUnifiedDiffExtended`, `mapFindingToDiffPosition`, `formatInlineComment`, `formatReviewBody`.
   - [`src/governance.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/integrations/github/src/governance.ts): Webhook ingestion, Check Run updates, inline PR reviews.

4. **`apps/api`**:
   - [`src/store.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/apps/api/src/store.ts) & [`src/db.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/apps/api/src/db.ts): Persistent `Review` model storing score, findings, architecture (nodes, edges, cycles, drift), dependencies, and coverage summary.
   - [`src/analysis.ts`](file:///home/isabelle/teste_qualityguard/qualityguard/apps/api/src/analysis.ts): `runRepositoryAnalysis` executing sandboxed cloning and full static analysis pipeline.

5. **`apps/web`**:
   - Full dashboard, findings command center, architecture governance, and analysis history views.

---

## 3. What Works & What Has Tests

- **Unit Tests for Diff Parsing:** `packages/analyzer/src/diff.test.ts` (3 tests for additions, deletions, hunks, renames).
- **Unit Tests for PR Diff Mapping:** `integrations/github/src/diff-mapping.test.ts` (8 tests for hunks, line mappings, multi-line findings).
- **Unit Tests for Architecture Graphs & Cycles:** `packages/architecture/src/architecture.test.ts` and `engine.test.ts` (15 tests).
- **Integration Tests for Reviews & Coverage:** `apps/api/src/coverage.test.ts` and `apps/api/src/e2e.test.ts` (32 tests).
- **Total Monorepo Passing Tests:** 160 / 160 passing.

---

## 4. What Is Missing (Identified Gaps)

| Area | Current State | Target State (QG-TDD-008) |
|---|---|---|
| **Domain Model** | Only `DiffReviewResult` (patch diff) exists. | Add `ReviewComparisonResult`, `FindingDiff`, `ScoreDelta`, `QualityGateDelta`, `ArchitectureDriftDelta`, `DependencyDriftDelta`, and `CoverageDriftDelta` to `packages/domain`. |
| **Comparison Engine** | Only `analyzeDiff(diff)` exists for single patches. | Create deterministic `compareReviews(baseline, current)` in `packages/analyzer` computing exact deltas for findings, scores, gates, architecture drift, dependencies, and coverage. |
| **Stable Finding Identity** | Findings have line-specific IDs (`QG-fileKey-line`). Line number shifts across commits cause false positive introduced/resolved findings. | Implement stable finding identity generator using `ruleId + normalizedFilePath + (evidenceSignature || title)` with line tolerance. |
| **API Endpoints** | No comparison endpoint exists. | Implement `POST /api/projects/:id/compare` and `GET /api/projects/:id/compare` supporting `{ baseReviewId, headReviewId }` and `{ baseBranch, headBranch }`. |
| **API Security** | N/A | Strict multi-tenant authorization (both baseline and current reviews must belong to the tenant's project), sanitized inputs, error handling (404 on cross-tenant, 400 on invalid refs). |
| **Persistence Decision** | Historical reviews are stored immutably. | Comparisons are computed deterministically on demand from stored `Review` snapshots. This guarantees 100% data consistency and eliminates cache desynchronization. |
| **Frontend UI** | No comparison view in `apps/web`. | Implement dedicated `<ReviewComparisonView />` and comparison selectors in the Análises/Dashboard tabs, rendering deltas for score (+/-), gate transitions, introduced/resolved findings, architecture drift, dependency drift, and coverage deltas. |
| **E2E & Integration Tests** | No tests for multi-branch/review comparison. | Comprehensive test suite covering finding introduced/resolved/unchanged, score deltas, gate transitions, architecture drift, dependency changes, coverage deltas, missing coverage handling, and cross-tenant security. |

---

## 5. Architectural & Technical Decisions

### 5.1 Stable Finding Fingerprinting Strategy
To prevent line shifts in PRs or branch updates from classifying existing findings as "resolved" and "introduced", finding identity must be stable:
$$\text{Fingerprint} = \text{ruleId} \mathbin{\Vert} \text{normalizePath}(\text{file}) \mathbin{\Vert} \text{normalize}(\text{evidence} \lor \text{title})$$
- When `evidence` is present (e.g. line content with secret or bad import), trim whitespace and normalize.
- If two findings in the same file share the same rule and evidence, disambiguate with line index.
- Findings matching the fingerprint in both baseline and current are classified as **`unchanged`**.
- Findings present only in current are **`introduced`**.
- Findings present only in baseline are **`resolved`**.

### 5.2 Quality Gate Transition Tracking
The gate delta explicitly computes:
- `baseline`: `{ passed, decision, reasons }`
- `current`: `{ passed, decision, reasons }`
- `statusChanged`: boolean (`baseline.passed !== current.passed || baseline.decision !== current.decision`)
- `transition`: e.g. `"PASS -> PASS"`, `"BLOCK -> PASS"`, `"PASS -> BLOCK"`, `"BLOCK -> BLOCK"`, `"REVIEW_REQUIRED -> PASS"`.

### 5.3 Architecture Drift Difference
Compares architecture graph cycles and drift records between baseline and current:
- `introducedDrift`: Drifts present in current but not in baseline.
- `resolvedDrift`: Drifts present in baseline but not in current.
- `unchangedDrift`: Drifts present in both.
- `introducedCycles` / `resolvedCycles`: Graph cycle differences.

### 5.4 Dependency Drift Classification
Compares dependencies by `ecosystem + name`:
- **`added`**: Dependency exists in current but not baseline.
- **`removed`**: Dependency exists in baseline but not current.
- **`changed`**: Dependency exists in both, but `version` or `type` differs.

### 5.5 Coverage Delta Calculation
- If both baseline and current have coverage:
  $$\Delta_{\text{metric}} = \text{round}(\text{current.\%} - \text{baseline.\%}, 2)$$
- If either baseline or current is missing coverage (`null`):
  $$\Delta_{\text{metric}} = \text{null}$$
  *(No synthetic 0% or fabricated numbers).*

---

## 6. Architectural Risk Assessment & Mitigations

1. **Risk: Cross-Tenant Information Leakage via Comparison API**
   - *Mitigation:* Verify `project.organizationId === req.user.organizationId`, and verify `baselineReview.projectId === project.id` and `currentReview.projectId === project.id`. Any mismatch returns `404 Not Found`.
2. **Risk: False Positives in Finding Diffing on Refactoring**
   - *Mitigation:* Use normalized rule and content evidence signatures rather than strict line numbers.
3. **Risk: Performance Bottlenecks with Large Graphs/Reviews**
   - *Mitigation:* Compare using $O(N)$ hash maps with fingerprint keys rather than nested array scans ($O(N^2)$).

---

## 7. Next Implementation Steps (Execution Plan)

1. **Domain Layer:** Define comparison types in `packages/domain/src/comparison.ts` and export from `packages/domain/src/index.ts`.
2. **Analyzer Layer:** Implement `compareReviews` and stable finding fingerprinting in `packages/analyzer/src/comparison.ts`. Add comprehensive unit tests in `packages/analyzer/src/comparison.test.ts`.
3. **API Layer:** Implement `POST /api/projects/:id/compare` and `GET /api/projects/:id/compare` in `apps/api/src/server.ts`. Add integration & security tests in `apps/api/src/comparison.test.ts`.
4. **Frontend Layer:** Add comparison API client methods in `apps/web/lib/api/comparison.ts`, update types, and build the Comparison UI component in `apps/web/components/comparison/review-comparison.tsx`.
5. **Validation:** Run full test suite, verify 0 regressions, execute typecheck, lint, and build.
6. **Documentation & Feature Matrix:** Update `docs/FEATURE_MATRIX.md`, `docs/TDD_BACKLOG.md`, and produce `docs/QG-TDD-008-IMPLEMENTATION-REPORT.md`.
