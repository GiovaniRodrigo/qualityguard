# QualityGuard Roadmap

## Phase 0 — Validate the problem

- [x] Define product positioning.
- [x] Define structured finding contract.
- [ ] Create a demonstrable PR analysis.
- [ ] Run the analyzer against 3 real open-source repositories.
- [ ] Identify the first 5 high-value rules.
- [ ] Produce a sample customer-facing report.
- [ ] Offer the first architecture/quality audit as a paid service.

## Phase 1 — MVP analyzer

- [x] Git diff ingestion.
- [x] File classification.
- [x] Deterministic rule engine.
- [x] Architecture dependency checks.
- [x] Testability checks.
- [x] Security checks.
- [x] Complexity and maintainability checks.
- [x] Structured finding validation.
- [x] Quality score.
- [x] Merge recommendation / quality gate.
- [x] CLI interface.
- [x] Config, rule enable/disable, severity overrides, deduplication and baseline.

## Phase 2 — GitHub integration

- [x] GitHub webhook verification and PR event filter.
- [x] Changed-file analysis client.
- [x] PR summary/check publishing primitives.
- [x] Optional CI gate integration point.
- [ ] Production GitHub App credentials and installation flow.
- [ ] Inline findings with exact diff positions.

## Phase 3 — AI governance

- [x] Provider abstraction.
- [x] OpenAI provider.
- [x] Gemini provider.
- [x] Anthropic provider interface.
- [x] Ollama/local provider.
- [x] Context-aware prompting.
- [x] Strict JSON output contract.
- [x] Schema validation.
- [ ] Empirical confidence calibration.
- [ ] AI risk assessment evaluation set.

## Phase 4 — Architecture intelligence

- [x] AST extraction.
- [x] Dependency graph.
- [x] Architecture map.
- [x] Architecture rules DSL.
- [x] Architecture drift detection.
- [x] Baseline comparison.
- [ ] Persistent historical quality trends.

## Phase 5 — Commercial platform

- [x] Authentication foundation.
- [x] Organizations and projects foundation.
- [x] Usage metering model and plan limits.
- [x] Stripe customer lifecycle.
- [x] Stripe Checkout subscriptions.
- [x] Stripe Billing Portal.
- [x] Stripe webhook signature verification and subscription state mapping.
- [x] Team policy model.
- [x] Audit trail model.
- [x] Dashboard and pricing surface.
- [x] Self-hosted Docker stack foundation.
- [x] Enterprise governance primitives.
- [ ] Production PostgreSQL repository wired into API.
- [ ] Production SSO / SCIM.
- [ ] Production deployment, secrets and observability.

## Open Source / Cloud Boundary

QualityGuard is split into an **Open Source Core** (this repository, AGPL-3.0)
and **Cloud / commercial** concerns. The core runs end-to-end locally and
self-hosted with no proprietary dependency.

### Open Source Core (AGPL-3.0)

- Analyzer engine: rules, scoring, quality gate, baselines, deduplication.
- Architecture intelligence: AST extraction, dependency graph, drift, rules DSL.
- AI adapters: OpenAI, Gemini, Anthropic, Ollama (bring your own key/model).
- CLI (`qualityguard analyze | check | baseline`).
- API and web app with local persistence (PostgreSQL) and in-memory fallback.
- GitHub integration: webhook verification, PR analysis, check publishing.
- Self-hosted Docker Compose stack (PostgreSQL, Redis, API, web, Caddy).

### Cloud / Commercial (separate operation)

- Managed multi-tenant hosting and infrastructure.
- Billing operations: Stripe subscription lifecycle as a managed service.
  *(The billing primitives are in the core; running them as a paid SaaS is the
  commercial boundary.)*
- Enterprise SSO / SCIM provisioning.
- Advanced governance and proprietary analytics.

### Team / Enterprise (planned)

- Team-level policy inheritance and role management.
- Organization-wide audit and compliance reporting.
- Persistent historical quality trends across projects.

### Future

- Inline findings with exact diff positions.
- Empirical AI confidence calibration and an evaluation set.
- GitLab integration parity with GitHub.

See [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md) for per-feature
implementation status and traceability.

## Definition of ready

The repository now contains an end-to-end implementation foundation from local quality analysis through SaaS authentication, organizations, GitHub integration, AI adapters, architecture intelligence, metering and Stripe billing. Remaining unchecked items are production validation/infrastructure rather than missing product primitives.
