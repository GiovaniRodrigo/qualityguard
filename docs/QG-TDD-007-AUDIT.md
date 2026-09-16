# QG-TDD-007 — LCOV / JaCoCo Coverage Ingestion Audit

**Date:** 2026-09-15  
**Role:** Principal Engineer / QA Lead  
**Milestone:** QG-TDD-007 — Codebase LCOV / JaCoCo Test Coverage Ingestion  
**Current Status:** AUDIT COMPLETE — READY FOR IMPLEMENTATION  

---

## 1. Executive Summary & Context

QualityGuard provides robust static analysis, AST vulnerability detection, architecture governance rules, and dependency extraction. However, test coverage is currently uninstrumented at runtime, displaying static `"Unavailable"` placeholders across the web interface and leaving `FEAT-017` in a `PLANNED_ONLY` state.

The objective of **QG-TDD-007** is to implement real artifact ingestion for **LCOV** and **JaCoCo XML** formats, persist normalized line, branch, and function metrics in PostgreSQL and MemoryStore, bind them to explicit analysis reviews, expose authenticated REST endpoints, and update the Frontend Findings Command Center and Overview MetricCards with real metrics when artifacts are ingested.

---

## 2. Codebase Audit: Current State of Coverage

| Area / File | Current State | Target State in QG-TDD-007 |
| :--- | :--- | :--- |
| **`packages/domain`** | `Review.categoryScores?.testing` exists as `number \| null`, but no `CoverageReport` or `FileCoverage` types exist. | Add `CoverageReport`, `CoverageSummary`, `CoverageMetrics`, `FileCoverage`, `CoverageFormat` in `packages/domain/src/coverage.ts`. |
| **`packages/analyzer`** | No parser for LCOV or JaCoCo XML. | Implement `parseLcov()`, `parseJacocoXml()`, path normalizer, and format auto-detector in `packages/analyzer/src/coverage/`. |
| **`apps/api` (Persistence)** | Database schema does not have a `coverage_reports` table. | Add migration `002_coverage.sql`, implement `IStore.createCoverageReport`, `getCoverageReportByReview`, `getLatestCoverageReport`. |
| **`apps/api` (Routes)** | No endpoint for coverage ingestion. | Implement `POST /api/projects/:id/coverage` and `GET /api/projects/:id/coverage` with tenant validation, payload limits, and review association. |
| **`apps/web` (Dashboard)** | Displays hardcoded `"Unavailable"` and `"Coverage data unavailable"` in `MetricCard` and Overview section. | Dynamically render real percentage (e.g. `84.2%`) and breakdown when coverage exists; preserve `"Unavailable"` only when no coverage has been uploaded. |
| **`FEATURE_MATRIX.md`** | `FEAT-017` marked as `PLANNED_ONLY`. | Transition to `IMPLEMENTED` with full automated test coverage. |

---

## 3. Architecture & Functional Specification

### 3.1 Supported Formats & Metric Derivation

1. **LCOV Text Format:**
   - Parses `TN:`, `SF:`, `FN:`, `FNDA:`, `FNF:`, `FNH:`, `DA:`, `LF:`, `LH:`, `BRDA:`, `BRF:`, `BRH:`, `end_of_record`.
   - Computes:
     - Line Coverage % = `LH / LF * 100`
     - Function Coverage % = `FNH / FNF * 100`
     - Branch Coverage % = `BRH / BRF * 100`
   - Handles CRLF (`\r\n`), LF (`\n`), duplicate records per source file, zero lines/functions/branches without `NaN`.

2. **JaCoCo XML Format:**
   - Safely parses root/package/sourcefile/class counters without XXE.
   - Maps `LINE`, `METHOD` (functions), `BRANCH` counters.
   - Computes: `covered / (covered + missed) * 100`.
   - Handles aggregated report-level counters and nested sourcefile counters.

3. **Path Normalization:**
   - Unifies Windows (`\`) and POSIX (`/`) separators.
   - Strips leading `./` and `/workspace/...` or absolute prefix segments.
   - Resolves paths relative to the repository root for monorepos (`apps/api/...`, `packages/core/...`).

### 3.2 Security & Protection Boundaries
- **XXE Prevention:** XML parser configured without external entity resolution or DTD loading.
- **Payload Limits:** Maximum 20MB payload limit to prevent memory exhaustion DoS.
- **Multi-Tenant Isolation:** Strictly verify project ownership before accepting or serving coverage artifacts.
- **Review Association:** Coverage snapshots are linked to explicit `Review` records and never ambiguously overwrite historical reviews.

---

## 4. Implementation Plan & Test Strategy

1. **Phase 1: Domain Models:** Create `packages/domain/src/coverage.ts`.
2. **Phase 2: Analyzer Coverage Engine:**
   - `packages/analyzer/src/coverage/normalize.ts`
   - `packages/analyzer/src/coverage/lcov.ts`
   - `packages/analyzer/src/coverage/jacoco.ts`
   - `packages/analyzer/src/coverage/index.ts`
   - Unit tests covering edge cases (zero denominator, malformed syntax, multi-package, CRLF).
3. **Phase 3: Database & Store Persistence:**
   - Migration `apps/api/migrations/002_coverage.sql`.
   - `apps/api/src/store.ts` & `apps/api/src/db.ts` methods.
4. **Phase 4: API Endpoint & Routing:**
   - `POST /projects/:id/coverage` (and `/api/projects/:id/coverage`)
   - `GET /projects/:id/coverage`
   - `GET /analyses/:id/coverage`
5. **Phase 5: Frontend Command Center Integration:**
   - Bind `MetricCard` and Overview section in `apps/web/app/page.tsx` to real coverage data.
   - Add frontend tests verifying `"Unavailable"` -> `"84.2%"` transition.
6. **Phase 6: Real Fixtures & End-to-End Test:**
   - Create fixtures `fixtures/coverage/sample.lcov` and `fixtures/coverage/jacoco.xml`.
   - Write comprehensive test suite in `apps/api/src/coverage.test.ts`.
7. **Phase 7: Matrix & Backlog Updates:**
   - Update `docs/FEATURE_MATRIX.md` and `docs/TDD_BACKLOG.md`.
   - Produce `docs/QG-TDD-007-IMPLEMENTATION-REPORT.md`.
