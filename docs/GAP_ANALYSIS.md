# QualityGuard — System Gap Analysis & Remediation Strategy

This document provides a thorough audit of gaps identified across the QualityGuard ecosystem, categorizing discrepancies, architectural risks, and missing capabilities.

---

## Gap Inventory

### 1. PRODUCT GAP: Runtime Test Coverage Measurement
- **Problem**: The UI displays a card for "Test coverage", but static analysis alone cannot calculate line/branch runtime coverage without executing tests or parsing an LCOV / Cobertura report.
- **Evidence**: `apps/web/app/page.tsx` explicitly shows `"Coverage data unavailable"`.
- **Impact**: Users cannot assess dynamic test execution coverage from repository static scans alone.
- **Dependencies**: CI/CD pipeline integration, test runner instrumentation (`vitest --coverage`, `cargo tarpaulin`, `pytest-cov`).
- **Priority**: P3 (Enhancement)
- **Suggested Solution**: Add an artifact ingestion endpoint (`POST /api/projects/:id/coverage`) accepting LCOV / JaCoCo XML format files uploaded from CI/CD runs.

---

### 2. UI GAP: Multi-Branch Selector & Real-Time Diff Viewer
- **Problem**: The project modal allows choosing a branch (default `release/2.2`), but the UI does not currently offer interactive side-by-side git diff view per finding.
- **Evidence**: `apps/web/app/page.tsx` shows code evidence lines but not a full syntax-highlighted git diff split view.
- **Impact**: Developers must open their local editor or GitHub to inspect the full file context surrounding a violation.
- **Dependencies**: Monaco editor / syntax highlighter component in `apps/web`.
- **Priority**: P2 (Supporting)
- **Suggested Solution**: Integrate a lightweight unified diff viewer component rendering `finding.evidence` with line context.

---

### 3. API GAP: Asynchronous Background Job Queue for Large Repositories
- **Problem**: The `POST /api/projects/:id/analyses` endpoint executes git cloning and AST parsing synchronously in the HTTP request cycle.
- **Evidence**: `apps/api/src/analysis.ts` clones and analyzes directly within the route handler. For huge repositories, requests may exceed HTTP timeouts (e.g. 30–60s).
- **Impact**: Large enterprise repositories could timeout on slow networks or large disk footprints.
- **Dependencies**: Background worker (BullMQ, Redis, or Node worker threads).
- **Priority**: P1 (Essential)
- **Suggested Solution**: Implement an asynchronous job status machine (`queued` ➔ `in_progress` ➔ `completed` / `failed`) with polling or SSE / WebSocket notifications.

---

### 4. DOMAIN GAP: Custom Rule Definition Entity
- **Problem**: Domain entities support `Finding`, `ReviewResult`, `Severity`, `ReviewDecision`, but custom user-defined architectural policy rules are loaded only via `.qualityguard.yml` and not persisted as first-class domain models.
- **Evidence**: `packages/domain/src/finding.ts` defines findings and reviews, while policy models reside in `packages/analyzer/src/policy.ts`.
- **Impact**: Users cannot configure custom rules via the web UI without editing repository config files.
- **Dependencies**: `packages/domain`, `apps/api/src/store.ts`.
- **Priority**: P2 (Supporting)
- **Suggested Solution**: Promote `ArchitecturePolicy` and `RuleConfig` to `@qualityguard/domain` with API endpoints for custom workspace rules.

---

### 5. ANALYZER GAP: Multi-Language Manifest Parsers (Python, Go, Java)
- **Problem**: The repository dependency extractor supports `Cargo.toml` (Rust) and `package.json` (JavaScript/TypeScript), but does not yet parse `requirements.txt`/`pyproject.toml` (Python) or `go.mod` (Go).
- **Evidence**: `apps/api/src/analysis.ts` lines checking `package.json` and `Cargo.toml`.
- **Impact**: Python and Go repositories show 0 extracted manifest dependencies.
- **Dependencies**: `@qualityguard/analyzer`.
- **Priority**: P2 (Supporting)
- **Suggested Solution**: Expand `packages/analyzer` manifest parsing utilities to parse `requirements.txt`, `Pipfile`, `pyproject.toml`, `go.mod`, and `pom.xml`.

---

### 6. ARCHITECTURE GAP: Cross-Language AST Import Parsers
- **Problem**: The AST import extractor in `packages/architecture` parses TypeScript/JavaScript imports (`import ... from '...'`, `require('...')`) and Rust `use` statements, but lacks full tree-sitter AST parsing for C++, Java, or Go.
- **Evidence**: `packages/architecture/src/graph.ts` regex-based import collectors.
- **Impact**: Module coupling and circular dependency analysis are most precise for JS/TS and Rust.
- **Dependencies**: Tree-sitter bindings or extended regex grammars.
- **Priority**: P2 (Supporting)
- **Suggested Solution**: Standardize multi-language AST extraction using tree-sitter or language-specific grammar plugins.

---

### 7. AI GAP: Streaming AI Remediation Responses
- **Problem**: AI completions via `HttpAIProvider` wait for the complete HTTP response before returning finding suggestions.
- **Evidence**: `packages/ai/src/index.ts` uses `complete()` returning `Promise<string>`.
- **Impact**: Slower perceived response times when running large-scale LLM code reviews.
- **Dependencies**: Server-Sent Events (SSE) in API, streaming reader in frontend.
- **Priority**: P2 (Supporting)
- **Suggested Solution**: Add `streamComplete()` to `AIProvider` using HTTP chunked streaming.

---

### 8. GITHUB GAP: Automated PR Inline Review Comments
- **Problem**: `integrations/github` provides `createCheck()` and `comment()` for issues/PRs, but does not yet post line-specific review comments on multi-line diff chunks via the GitHub Pull Request Review API (`POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews`).
- **Evidence**: `integrations/github/src/client.ts` implements issue comments and check runs.
- **Impact**: Findings appear as a general check run summary rather than inline PR comments on specific lines.
- **Dependencies**: GitHub Pull Request Review API.
- **Priority**: P1 (Essential)
- **Suggested Solution**: Implement `createReview({ comments: [{ path, position, body }] })` in `integrations/github/src/client.ts`.

---

### 9. DATABASE GAP: Production Database Migrations Runner
- **Problem**: PostgreSQL schema is created on startup via `PostgresStore.initSchema()`, but lacks an incremental migration tracking table (`_migrations`).
- **Evidence**: `apps/api/src/db.ts` executes `CREATE TABLE IF NOT EXISTS`.
- **Impact**: Complex future schema alterations (e.g., adding columns with constraints) require careful migration orchestration.
- **Dependencies**: Migration runner script.
- **Priority**: P2 (Supporting)
- **Suggested Solution**: Add a lightweight SQL migration version manager executing numbered `.sql` scripts in order.

---

### 10. TEST GAP: Mutation Testing & Performance Benchmarks
- **Problem**: The monorepo has 48 passing unit, integration, and E2E tests across all 9 packages, but lacks mutation testing (Stryker) and large-scale repository benchmarking.
- **Evidence**: Vitest test suites exist, but no Stryker configuration or load testing scripts.
- **Impact**: Edge cases in complex regex matching might have surviving mutations.
- **Dependencies**: Stryker Mutator for TypeScript.
- **Priority**: P3 (Enhancement)
- **Suggested Solution**: Introduce `@stryker-mutator/core` in `packages/analyzer` and `packages/architecture` to measure test mutation scores.

---

### 11. SECURITY GAP: Sandboxed Repository Cloning & Resource Limits
- **Problem**: Git cloning runs via `git clone --depth 1` into temp directories. Large malicious repositories or recursive submodule bombs could consume disk or RAM.
- **Evidence**: `apps/api/src/analysis.ts` clones into `os.tmpdir()`.
- **Impact**: Potential Denial of Service (DoS) if scanning untrusted public repos with massive blobs.
- **Dependencies**: Git flags (`--no-tags`, `--recurse-submodules=no`, clone timeout limits, disk quotas).
- **Priority**: P1 (Essential)
- **Suggested Solution**: Enforce maximum repository size thresholds (e.g. 50MB clone limit) and process timeouts.

---

### 12. OBSERVABILITY GAP: Structured Tracing & OpenTelemetry Metrics
- **Problem**: Logging uses standard console outputs with ISO timestamps, but lacks distributed tracing spans (OpenTelemetry / Jaeger).
- **Evidence**: `apps/api/src/server.ts` logs structured JSON.
- **Impact**: Difficult to trace analysis execution times across distributed microservices in production.
- **Dependencies**: `@opentelemetry/api`, `@opentelemetry/sdk-node`.
- **Priority**: P3 (Enhancement)
- **Suggested Solution**: Add OpenTelemetry instrumentation to trace clone duration, parse duration, and gate evaluation time.

---

### 13. DOCUMENTATION GAP: Interactive API OpenAPI / Swagger Specification
- **Problem**: REST endpoints are fully implemented and typed, but no live Swagger UI is rendered at `/api/docs`.
- **Evidence**: `apps/api/src/server.ts` handles REST routes natively.
- **Impact**: External developers integrating QualityGuard via API must refer to markdown docs rather than interactive Swagger UI.
- **Dependencies**: `@scalar/openapi-parser` or `swagger-ui-dist`.
- **Priority**: P3 (Enhancement)
- **Suggested Solution**: Serve an `openapi.json` specification generated from Zod schemas at `/api/docs`.
