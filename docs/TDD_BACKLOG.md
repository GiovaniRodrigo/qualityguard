# QualityGuard — TDD Engineering Backlog

This backlog converts all system requirements, architectural governance objectives, and identified gaps into rigorous, test-driven engineering items.

---

## Prioritization Model
- **P0 — Core Product**: Critical for core user flow (User ➔ Project ➔ Repository ➔ Analysis ➔ Persistence ➔ Findings ➔ Gates).
- **P1 — Essential Functionality**: Production readiness, asynchronous processing, sandboxing, and CI integration.
- **P2 — Supporting Features**: Extended language parsers, streaming, UI enhancements, and custom rule editors.
- **P3 — Enhancements**: Mutation testing, OpenTelemetry distributed tracing, and Swagger/OpenAPI UI.

---

## Backlog Items

### QG-TDD-001: Asynchronous Analysis Job Queue with State Polling [STATUS: COMPLETED & VERIFIED]
- **Category**: Core Platform / Scalability
- **Priority**: P1
- **Status**: **COMPLETED & VERIFIED** (Unit + Integration + E2E Passing)
- **Description**: Decouple Git cloning and AST parsing from the synchronous HTTP request cycle by introducing an asynchronous job lifecycle (`queued`, `cloning`, `analyzing`, `completed`, `failed`).
- **Preconditions**: Project exists with valid Git repository URL and target branch.
- **Acceptance Criteria**:
  - `POST /api/projects/:id/analyses` returns `202 Accepted` with `analysisId` and `status: 'queued'`.
  - `GET /api/analyses/:id` returns live job status and progress metrics.
  - Upon completion, `GET /api/analyses/:id` returns full `ReviewResult`, findings, and gate decision.
  - Timeout or Git clone failures transition job state to `status: 'failed'` with descriptive error reasons.
- **Unit Tests**:
  - `apps/api/src/queue.test.ts`: Enqueueing, state transitions (`queued` ➔ `cloning` ➔ `analyzing` ➔ `completed`), worker error handling (`failed` status), and concurrency limits (max 2 active workers).
  - `apps/web/lib/api/api.test.ts`: Async analysis trigger and status polling loop helper (`pollAnalysisUntilDone`).
- **Integration Tests**:
  - `POST /api/projects/:id/analyses` ➔ returns `202 Accepted` with `{ analysisId, status: 'queued', progress: 0 }`.
  - `GET /api/analyses/:id` ➔ status transition loop until `completed` with full result.
- **E2E Tests**:
  - `apps/api/src/e2e.test.ts`: Complete real pipeline with live cloning and analysis of `akitaonrails/ai-memory` (branch `release/2.2`), verifying 202 Accepted, polling state progression, and full metrics (Score 80/100, 1 finding, 43 files analyzed).
  - `apps/web/app/page.tsx`: Frontend triggers analysis asynchronously, displays live progress state, and renders real results without mock data.
- **Dependencies**: `apps/api`, `apps/web/lib/api`.
- **Implementation Notes**: Event-driven `AnalysisQueue` in `apps/api/src/queue.ts` with FIFO task buffer and concurrency limiter, fully integrated into API server and web client.
- **Definition of Done**: 100% test pass (vitest monorepo green), zero request timeouts, clean TypeScript compilation across monorepo.

---

### QG-TDD-002: Sandboxed Repository Cloner with Resource & Security Boundaries [STATUS: COMPLETED & VERIFIED]
- **Category**: Security / Infrastructure
- **Priority**: P1
- **Status**: **COMPLETED & VERIFIED** (Unit + Security + E2E Passing)
- **Description**: Protect the backend execution host from denial-of-service, recursive submodules, and malicious repository bloat by enforcing strict timeout and size limits during repository cloning.
- **Preconditions**: Repository URL is supplied by user.
- **Acceptance Criteria**:
  - Git clone command runs with `--depth 1`, `--no-tags`, `--recurse-submodules=no`, `-c protocol.file.allow=never`, `-c submodule.recurse=false`.
  - Execution timeout is hard-capped at 45 seconds with forced `SIGKILL` termination.
  - Repositories exceeding 50MB disk footprint are rejected with `RepositorySizeLimitError` (`PAYLOAD_TOO_LARGE`).
  - Temporary workspace folders (`/tmp/qualityguard/workspaces/job-<uuid>`) are strictly cleaned up in a `finally` block even on failure or timeout.
  - Full typed error model: `RepositoryValidationError`, `RepositoryCloneTimeoutError`, `RepositorySizeLimitError`, `RepositoryCloneError`, `RepositoryWorkspaceError`.
- **Unit & Security Tests**:
  - `apps/api/src/cloner.test.ts`: 17 tests verifying URL validation (HTTPS only), rejection of command/flag injections, branch sanitization, recursive directory size calculation, 45s hard timeout enforcement, concurrent workspace isolation, and automatic cleanup.
- **Integration & E2E Tests**:
  - `apps/api/src/e2e.test.ts`: Real shallow clone and analysis of `https://github.com/akitaonrails/ai-memory` (branch `release/2.2`) with commit SHA extraction, 43 files analyzed, score 80/100, and zero leaked temporary directories.
- **Dependencies**: `apps/api/src/cloner.ts`, `apps/api/src/analysis.ts`.
- **Definition of Done**: 100% tests passing, zero leaked temporary workspaces, zero shell concatenations, full security audit documented in `docs/QG-TDD-002-SECURITY.md`.

---

### QG-TDD-003: GitHub PR Inline Multi-Line Review Comments & Webhook Hardening [STATUS: COMPLETED & VERIFIED]
- **Category**: Integrations / CI
- **Priority**: P1
- **Status**: **COMPLETED & VERIFIED** (Unit + Security + PR Review & Check Runs Passing)
- **Description**: Extend the GitHub integration to submit line-specific and multi-line code review comments on Pull Requests using the GitHub Pull Request Review API and harden webhook ingress with HMAC verification and replay protection.
- **Preconditions**: GitHub App credentials configured; incoming PR webhook with changed diff.
- **Acceptance Criteria**:
  - Validates webhook signature with HMAC SHA-256 (`x-hub-signature-256`) timing-safely on raw body.
  - Replay protection and deduplication using `x-github-delivery` with idempotent responses.
  - Extended unified diff parser with hunk line ranges.
  - Correlates finding line numbers and multi-line ranges with the PR unified diff chunk line position.
  - Creates a GitHub PR Review with inline comments for each `high` and `critical` finding.
  - Creates and updates GitHub Check Runs (`in_progress` ➔ `completed` with `success`, `failure`, `neutral`).
  - Blocks PR checks (`REQUEST_CHANGES`) if the Quality Gate fails.
  - Full typed error model: `GitHubWebhookSignatureError`, `GitHubWebhookReplayError`, `GitHubPRValidationError`, `GitHubDiffMappingError`, `GitHubApiError`, `GitHubRateLimitError`, `GitHubReviewCommentError`.
- **Unit & Security Tests**:
  - `integrations/github/src/diff-mapping.test.ts`: Unified diff parsing, single and multi-line finding mapping, unmapped finding fallback, markdown comment and review body formatting.
  - `integrations/github/src/governance.test.ts`: Webhook signature verification, replay protection, delivery deduplication, Check Run lifecycle, PR Review generation with `APPROVE` and `REQUEST_CHANGES`, and rate limit handling.
  - `integrations/github/src/webhook.test.ts`: Signature validation and GitHub client operations.
- **Integration Tests**:
  - API endpoint `POST /webhooks/github` returns `202 Accepted` quickly and triggers asynchronous PR governance pipeline.
- **Dependencies**: `integrations/github`, `apps/api/src/server.ts`.
- **Definition of Done**: 100% tests passing across the monorepo, zero unmapped inline comment failures, full security audit documented in `docs/QG-TDD-003-SECURITY.md`.

---

### QG-TDD-004: Multi-Language Manifest Extractors (Python, Go, Java, Rust) [STATUS: COMPLETED & VERIFIED]
- **Category**: Analyzer / Dependencies
- **Priority**: P2
- **Status**: **COMPLETED & VERIFIED** (Unit + Polyglot Manifest Integration + E2E Passing)
- **Description**: Add manifest parsers for Python (`requirements.txt`, `pyproject.toml`), Go (`go.mod`), Java (`pom.xml`), and Rust (`Cargo.toml`) to extract normalized dependencies during repository analysis.
- **Preconditions**: Repository contains multi-language dependency manifests.
- **Acceptance Criteria**:
  - Extracts package names, versions, ecosystems, and dependency categories.
  - Handles semver ranges, pinned versions, XML namespace handling, and TOML sections.
- **Unit Tests**:
  - `parseRequirementsTxt()`, `parsePyprojectToml()`, `parseGoMod()`, `parsePomXml()`, `parseCargoToml()`.
- **Integration Tests**:
  - Repository analyzer extracts Rust crates, Node modules, Python packages, Maven artifacts, and Go modules into unified `DependencyItem[]`.
- **Dependencies**: `packages/analyzer`.
- **Definition of Done**: Tests pass with >90% branch coverage, zero unhandled parser crashes on malformed manifests.

---

### QG-TDD-005: Custom Architecture Governance Rule Builder & Persistence [STATUS: COMPLETED & VERIFIED]
- **Category**: Domain / Architecture
- **Priority**: P2
- **Status**: **COMPLETED & VERIFIED** (Unit + Multi-Tenant CRUD + Pipeline Gate + UI + Real E2E Passing)
- **Description**: Allow teams to define custom layer boundary constraints (`forbidden_dependency`, `allowed_dependency`, `forbidden_path_dependency`, `no_cycles`, `required_layer`) through the Web UI and API.
- **Preconditions**: Authenticated user with organization admin role.
- **Acceptance Criteria**:
  - `POST /api/projects/:id/architecture-rules` stores custom regex/layer boundary policies.
  - Custom rules execute deterministically alongside default rules during repository scans.
  - Violations are categorized under `architecture` with `decision: 'block'` or `'review_required'`.
  - Architecture Governance UI in web app allows rule creation, toggling, deletion, and violation inspection.
- **Unit Tests**:
  - `packages/architecture/src/engine.test.ts`: 15 unit tests covering all 5 rule types and config validation.
  - `apps/web/components/architecture/architecture.test.tsx`: UI component rendering tests.
- **Integration Tests**:
  - `apps/api/src/architecture-rules.test.ts`: Full CRUD API endpoints, tenant isolation, and analysis pipeline integration.
- **E2E Tests**:
  - `apps/api/src/e2e.test.ts`: Analysis of `akitaonrails/ai-memory` (branch `release/2.2`) with custom architecture rules.
- **Dependencies**: `packages/domain`, `packages/architecture`, `apps/api`, `apps/web`.
- **Definition of Done**: 100% test pass (133/133 tests green), persistent PostgreSQL storage, full rule spec documented in `docs/QG-TDD-005-RULE-SPEC.md`.

---

### QG-TDD-006: Streaming AI Remediation Engine with Real-Time Frontend Rendering [STATUS: COMPLETED & VERIFIED]
- **Category**: AI / Frontend UX
- **Priority**: P2
- **Status**: **COMPLETED & VERIFIED** (Unit + Multi-Tenant Isolation + SSE Protocol + UI Panel + Safe Markdown Passing)
- **Description**: Provide real-time streaming suggestions for complex finding remediation using HTTP chunked streaming / Server-Sent Events (SSE). AI acts strictly as an advisory engine with zero authority over scores, gates, or severities.
- **Preconditions**: AI provider configured or offline deterministic rule engine fallback.
- **Acceptance Criteria**:
  - `POST /findings/:id/remediate` and `/api/findings/:id/remediate` stream SSE events (`start`, `chunk`, `complete`, `error`).
  - Strict multi-tenant isolation: finding lookup scoped to tenant; unauthorized finding ID returns `404 Not Found`.
  - Automatic credential redaction (`redactSecrets()`) for AWS, GitHub, JWT, Bearer tokens, DB URIs, and private keys.
  - Context limits enforced: max 5 files, 16KB/file, 64KB total context, 8KB finding context.
  - Prompt injection defense using `<code_context untrusted="true">`.
  - Frontend `<FindingRemediationPanel />` renders streaming markdown with zero arbitrary HTML/script execution (`<SafeMarkdown />`).
  - AbortSignal support on client and server to stop stream generation cleanly.
- **Unit Tests**:
  - `packages/ai/src/prompt.test.ts`: 9 tests verifying prompt construction, context limits, prompt injection safety, and secret redaction.
- **Integration Tests**:
  - `apps/api/src/remediation.test.ts`: SSE protocol lifecycle, multi-tenant 404 security, secret sanitization, rate limiting.
  - `apps/web/lib/api/api.test.ts`: Streaming SSE consumption via `streamFindingRemediation()` with abort signal and event parsing.
  - `apps/web/components/findings/findings.test.tsx`: `<FindingRemediationPanel />` rendering, streaming state, error state, and token counters.
- **E2E Tests**:
  - `apps/api/src/e2e.test.ts`: Full real repository analysis on `akitaonrails/ai-memory` (`release/2.2`) with deterministic finding generation.
- **Dependencies**: `packages/domain`, `packages/ai`, `apps/api`, `apps/web`.
- **Definition of Done**: 100% test pass (142/142 tests green), zero runtime mocks, full implementation documented in `docs/QG-TDD-006-IMPLEMENTATION-REPORT.md`.

---

### QG-TDD-007: Codebase LCOV / JaCoCo Test Coverage Ingestion [STATUS: COMPLETED & VERIFIED]
- **Category**: Testing / Core Metrics
- **Priority**: P1
- **Status**: **COMPLETED & VERIFIED** (Unit + Multi-Tenant Integration + DB Persistence + UI Rendering Passing)
- **Description**: Ingest external test coverage artifacts (LCOV and JaCoCo XML) to compute real line, branch, and function coverage percentages, persist structured metrics in PostgreSQL, bind to review analyses, and render real percentages on the Frontend Overview and MetricCard.
- **Preconditions**: Project exists; coverage artifact is valid LCOV or JaCoCo XML.
- **Acceptance Criteria**:
  - `POST /api/projects/:id/coverage` accepts LCOV text / JaCoCo XML payloads up to 20MB.
  - Automatically detects format (`lcov` vs `jacoco_xml`).
  - Strict XXE injection validation (rejection of `<!ENTITY>` and system protocol DOCTYPEs).
  - Normalizes source file paths across OS and monorepo/workspace prefixes.
  - Computes total and per-file line, branch, and function coverage percentages safely (zero denominator gives `null`, no `NaN`/`Infinity`).
  - Binds coverage to specific review analysis (or latest review if omitted).
  - Updates historical review immutably without altering Quality Score or Quality Gate evaluation logic.
  - Multi-tenant isolation enforced (cross-tenant uploads/lookups return `404 Not Found`).
  - Frontend MetricCard and Overview progress bar render live percentages (e.g. `84.2%`) instead of `"Unavailable"`.
- **Unit Tests**:
  - `packages/analyzer/src/coverage/coverage.test.ts`: 17 tests verifying LCOV parser, JaCoCo XML parser, zero denominator handling, XXE protection, CRLF support, duplicate path merging, and malformed syntax rejection.
- **Integration Tests**:
  - `apps/api/src/coverage.test.ts`: Multi-tenant isolation, auth checks, LCOV upload, JaCoCo upload, 20MB payload handling, review score preservation, and historical snapshot isolation.
  - `apps/web/lib/api/api.test.ts`: Frontend coverage API client methods (`uploadCoverage`, `getLatestCoverage`, `getAnalysisCoverage`).
- **Definition of Done**: 100% test pass (160/160 tests green), zero runtime mocks, typecheck PASS, lint PASS, full documentation in `docs/QG-TDD-007-IMPLEMENTATION-REPORT.md`.

---

### QG-TDD-008: Multi-Branch PR Comparison & Architecture Drift [STATUS: COMPLETED & VERIFIED]
- **Category**: Architecture / Multi-Branch Governance
- **Priority**: P1
- **Status**: **COMPLETED & VERIFIED** (Unit + Multi-Tenant API + Drift Diffing + UI Component + Monorepo Tests Passing)
- **Description**: Allow comparing any two review snapshots or repository branches/releases (e.g. `main` vs `feature/auth` or `release/2.2`) across all dimensions: findings (introduced, resolved, unchanged), quality score delta, quality gate transition, architecture drift (introduced/resolved violations & cycles), dependency drift (added, removed, upgraded), and test coverage deltas.
- **Preconditions**: Project exists; at least two reviews or branches are available for comparison.
- **Acceptance Criteria**:
  - Stable finding fingerprinting using rule, normalized path, and content evidence signature (resilient to line shift false positives).
  - Deterministic score delta computation with zero precision loss.
  - Gate transition tracking (e.g. `BLOCK -> APPROVE`, `APPROVE -> BLOCK`).
  - Architecture drift difference identifying newly introduced vs resolved forbidden dependencies and cycle paths.
  - Dependency drift delta categorizing added, removed, and version-changed packages across manifests.
  - Coverage drift delta calculating line/func/branch deltas or safely returning `null` when coverage is absent without synthetic fallbacks.
  - Authenticated REST API (`POST /api/projects/:id/compare` and `GET /api/projects/:id/compare?base=...&head=...`) with strict multi-tenant isolation.
  - Interactive Web UI (`<ReviewComparisonView />` in Comparação tab and Análises tab) allowing release selection and rich delta inspection.
- **Unit Tests**:
  - `packages/analyzer/src/comparison.test.ts`: 15 tests verifying finding diffing, line shift resilience, duplicate finding disambiguation, score deltas, gate transitions, architecture drift, dependency drift, coverage deltas, and full end-to-end `compareReviews`.
  - `apps/web/components/comparison/comparison.test.tsx`: 2 tests verifying component rendering and empty/insufficient state notices.
- **Integration Tests**:
  - `apps/api/src/comparison.test.ts`: Multi-tenant authorization, cross-tenant 404 rejection, ref resolution (IDs and branch names), invalid ref 404, missing param 400.
  - `apps/web/lib/api/api.test.ts`: Frontend comparison client helper methods (`compareReviews`, `compareReviewsById`).
- **Dependencies**: `packages/domain`, `packages/analyzer`, `packages/architecture`, `apps/api`, `apps/web`.
- **Definition of Done**: 100% test pass (177/177 tests green), zero runtime mocks, typecheck PASS, lint PASS, full documentation in `docs/QG-TDD-008-IMPLEMENTATION-REPORT.md`.

---

### QG-PROD-001: Live SaaS Provisioning & Production Verification [STATUS: COMPLETED WITH CONDITIONS]
- **Category**: DevOps / Infrastructure / Production Verification
- **Priority**: P1
- **Status**: **COMPLETED WITH CONDITIONS (STAGING & PILOT READY)**
- **Description**: Validate the end-to-end production readiness of QualityGuard with live container stack (API, Web, Caddy, PostgreSQL, Redis), live database persistence across restarts, real repository cloning, AST analysis, LCOV coverage ingestion, streaming SSE AI remediation, and cryptographic signature rejection for external webhooks.
- **Preconditions**: Multi-container Docker Compose stack running with PostgreSQL 16 and Redis 7.
- **Acceptance Criteria**:
  - `GET /health` and `GET /ready` return 200 OK with live database probe.
  - PostgreSQL migrations (`001_initial.sql`, `002_coverage.sql`) applied; data survives container restarts on volume `qualityguard_pg`.
  - Redis connection and AOF persistence verified across container restarts on volume `qualityguard_redis`.
  - Real public Git repository cloning (`SandboxedRepositoryCloner`) with AST parsing and Quality Gate evaluation.
  - Real LCOV coverage ingestion with PostgreSQL persistence in `coverage_reports` table.
  - Streaming AI Remediation via SSE (`POST /findings/:id/remediate`) with regex secret scrubbing and deterministic fallback.
  - Cryptographic rejection of unauthorized/forged GitHub HMAC signatures (401) and Stripe signatures (400).
  - PostgreSQL backup (`pg_dump`) and full restoration into fresh database verified.
- **Evidence Documents**:
  - `docs/QG-PROD-001-AUDIT.md`: Prerequisite audit, required credentials, and test feasibility.
  - `docs/QG-PROD-001-SMOKE-TEST.md`: 16-step user journey verification log.
  - `docs/QG-PROD-001-IMPLEMENTATION-REPORT.md`: Comprehensive 19-section verification report and verdict.
- **Definition of Done**: 177/177 monorepo tests passing, 0 runtime mocks, live database persistence verified, live smoke test completed with conditions.

---

### QG-PROD-002: Public VPS & SaaS Activation [STATUS: COMPLETED WITH CONDITIONS]
- **Category**: DevOps / Infrastructure / Public Activation
- **Priority**: P0
- **Status**: **COMPLETED WITH CONDITIONS (STAGING & PILOT READY)**
- **Description**: Activate and verify QualityGuard for the production VPS target (`2.25.92.154` / `qualityguard.gfcode.com.br`) across full container topology (Caddy, Next.js, Fastify API, PostgreSQL 16, Redis 7), real repository cloning & AST analysis, test coverage ingestion, review comparison diffing, streaming AI remediation, and cryptographic webhook protection.
- **Preconditions**: DNS A Record configured pointing `qualityguard.gfcode.com.br` to `2.25.92.154`.
- **Acceptance Criteria**:
  - DNS A-record lookup resolves to `2.25.92.154`.
  - Caddy reverse proxy configured to route `/api/*`, `/webhooks/*`, `/health`, `/ready` to API, and other routes to Web.
  - HTTP port 80 issues `308 Permanent Redirect` to HTTPS.
  - Internal backend services (PostgreSQL 5432, Redis 6379, API 8787, Web 3000) have zero public WAN exposure.
  - PostgreSQL schema migration concurrency protected via `pg_advisory_lock`.
  - Database and Redis state persists across container teardown and restarts.
  - End-to-end repository cloning and AST analysis verified on real public repository (`akitaonrails/ai-memory`, branch `release/2.2`), identifying real findings.
  - Test coverage ingestion and SSE streaming AI remediation with regex secret scrubbing verified.
  - Cryptographic rejection of forged webhook signatures verified (GitHub 401, Stripe 400).
  - Production readiness verdict, defect matrix, and unblocking action plan documented.
- **Definition of Done**: 177/177 monorepo tests passing, 0 runtime mocks, typecheck PASS, lint PASS, full production documentation delivered.

---

### QG-PROD-002.2: GitHub App Live Activation [STATUS: CODE READY / NOT CONFIGURED]
- **Category**: Integrations / GitHub App / Production Activation
- **Priority**: P0
- **Status**: **CODE READY / NOT CONFIGURED**
- **Description**: Activate and verify real GitHub App integration connecting GitHub Pull Requests to QualityGuard via webhook (`/webhooks/github`), creating Check Runs, executing AST analysis on PR diffs, evaluating Quality Gate decisions, and submitting PR Reviews with line-level inline comments.
- **Preconditions**: GitHub App created with required permissions (Checks R/W, PRs R/W, Contents R, Metadata R) and webhook URL `https://qualityguard.gfcode.com.br/webhooks/github`.
- **Acceptance Criteria**:
  - Webhook endpoint `POST /webhooks/github` validates `x-hub-signature-256` timing-safely with HMAC SHA-256 on raw body.
  - Replay protection with `x-github-delivery` deduplication returning `200 OK` without triggering duplicate analyses.
  - Diff parser accurately maps finding lines and multi-line ranges to PR diff positions (`side: 'RIGHT'`).
  - Findings outside PR diff gracefully fall back to Check Run summary and review body without API errors.
  - Check Run lifecycle transitions from `in_progress` to `completed` (`success` on passing gate, `failure` on failing gate).
  - PR Review created with `APPROVE` on clean code or `REQUEST_CHANGES` on high/critical findings with structured markdown comments.
  - Zero private keys, secrets, or tokens exposed in logs or git repository.
- **Evidence Documents**:
  - `docs/QG-PROD-002-2-GITHUB-APP-AUDIT.md`: Architectural audit, required permissions, and environment variables status.
  - `docs/QG-PROD-002-2-GITHUB-APP-SMOKE-TEST.md`: 10-point smoke test execution log covering HMAC, replay, diff mapping, and gates.
  - `docs/QG-PROD-002-2-GITHUB-APP-IMPLEMENTATION-REPORT.md`: Comprehensive integration report, workflow sequence diagram, and activation guide.
- **Definition of Done**: 183/183 monorepo tests passing, 29/29 GitHub integration tests passing, 0 runtime mocks, typecheck PASS, lint PASS, full documentation delivered.



