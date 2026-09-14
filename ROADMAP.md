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

## Definition of ready

The repository now contains an end-to-end implementation foundation from local quality analysis through SaaS authentication, organizations, GitHub integration, AI adapters, architecture intelligence, metering and Stripe billing. Remaining unchecked items are production validation/infrastructure rather than missing product primitives.
