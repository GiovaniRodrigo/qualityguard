# QualityGuard

> AI-powered software quality and architecture governance for teams shipping code with AI.

**Can this change safely enter the current architecture?**

QualityGuard combines deterministic analysis, architecture intelligence and optional AI review into an executable quality-control layer for software teams.

## Implemented product path

```text
CLI / GitHub PR
      ↓
Diff + repository context
      ↓
Deterministic rules ──→ baseline + deduplication
      ↓
AST + dependency graph ──→ architecture drift
      ↓
Optional AI providers ──→ strict schema validation
      ↓
Findings → score → Quality Gate
      ↓
GitHub Check / dashboard
      ↓
Organization → usage metering → Stripe subscription
```

## Capabilities

### Developer / engine
- Git diff and staged analysis
- YAML policy configuration
- Enable/disable rules and severity overrides
- Stable finding fingerprints and baseline suppression
- Quality Gate with minimum score and blocking severities
- Strict Zod finding validation
- Architecture dependency graph and cycle detection
- TypeScript AST extraction
- Architecture policy DSL and drift detection

### AI governance
- Provider abstraction
- OpenAI, Gemini, Anthropic and Ollama adapters
- Context-aware review prompt
- JSON-only finding contract
- Schema validation before findings reach the product domain

### GitHub
- Signed webhook verification
- PR event filtering
- Diff retrieval
- Check Run publishing
- PR summary comment client

### Commercial platform
- Authentication foundation
- Organizations and projects
- PostgreSQL schema
- Usage metering and plan limits
- Team policies
- Audit trail
- Dashboard/pricing surface
- Stripe customer creation
- Stripe Checkout subscriptions
- Stripe Billing Portal
- Signed Stripe subscription webhooks
- Self-hosted PostgreSQL/Redis/API Docker stack

## CLI

```bash
qualityguard analyze .
qualityguard analyze . --diff
qualityguard analyze . --staged
qualityguard check . --diff
qualityguard baseline .
```

## Billing

See `docs/commercial/BILLING.md` for Stripe configuration, webhook setup and production security requirements.

## Production status

The product primitives through **Billing (#35)** are implemented. Production launch still requires external configuration and validation: GitHub App credentials/installation, live Stripe Prices/webhook endpoint, PostgreSQL repository wiring, SSO/SCIM, secrets, HTTPS, rate limiting, observability and end-to-end acceptance tests.

See `ROADMAP.md` for the remaining production gates.
