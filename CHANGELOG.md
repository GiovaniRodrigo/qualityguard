# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Open-source project governance: `LICENSE` (AGPL-3.0-only), `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue/PR templates, and Dependabot.
- `license` metadata on all workspace `package.json` files.

### Changed

- Production host and domain are now configurable placeholders in public
  documentation and deploy scripts instead of hardcoded values.

## [0.1.0] - 2026-09-15

First public open-source release. QualityGuard provides an end-to-end quality
and architecture governance layer, from local analysis to an optional SaaS
surface.

### Added

- **Analyzer core** — git diff ingestion, file classification, deterministic
  rule engine, quality scoring, and a merge/quality gate.
  - Rule configuration: enable/disable, severity overrides, deduplication, and
    baselines.
  - Security, testability, complexity, and maintainability checks.
- **Architecture intelligence** — AST extraction, dependency graph, architecture
  map, an architecture-rules DSL, drift detection, and baseline comparison.
- **AI governance (optional)** — provider abstraction with OpenAI, Gemini,
  Anthropic, and local (Ollama) providers, context-aware prompting, and a strict
  validated JSON output contract.
- **CLI** — run analysis, apply configuration, and evaluate the quality gate
  locally.
- **API** — HTTP backend with authentication, organizations/projects,
  usage metering, analysis queue, and coverage ingestion, backed by PostgreSQL.
- **Web application** — Next.js dashboard for analyses, findings, architecture,
  coverage, comparison, and remediation.
- **GitHub integration** — webhook verification, PR event filtering,
  changed-file analysis, and PR summary/check publishing primitives.
- **Commercial foundation** — Stripe customer lifecycle, Checkout subscriptions,
  Billing Portal, and webhook signature verification; team policy and audit
  trail models.
- **Deployment** — Docker images, a Compose stack (API, web, PostgreSQL, Redis,
  Caddy), and operational runbooks.

### Security

- Signed/verified auth tokens with constant-time comparison.
- Verified GitHub and Stripe webhook signatures.
- No secrets in the repository or git history; only placeholder `*.example`
  files are tracked.

[Unreleased]: https://github.com/GiovaniRodrigo/qualityguard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/GiovaniRodrigo/qualityguard/releases/tag/v0.1.0
