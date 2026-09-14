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
- GitHub App JWT and installation token flow
- Pull request event filtering
- Pull request diff retrieval
- Deterministic QualityGuard Check Run publishing
- PR summary comment client

### Commercial platform
- Authentication foundation with production secret enforcement
- Organizations and projects
- PostgreSQL persistence and automatic initial migration
- Usage metering and plan limits
- Team policies
- Audit trail
- Dashboard/pricing surface
- Stripe customer creation
- Stripe Checkout subscriptions
- Stripe Billing Portal
- Signed and idempotent Stripe subscription webhooks
- Authentication request rate limiting and request-size limits
- Self-hosted PostgreSQL/Redis/API/web Docker stack
- Caddy HTTPS reverse proxy
- VPS bootstrap, backups and GitHub Actions deployment

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

## Production

Production deployment is prepared for `qualityguard.gfcode.com.br` on a single VPS using Docker Compose, PostgreSQL, Redis, API, Next.js and Caddy.

See `docs/production/VPS-DEPLOYMENT.md` for DNS, secrets, Stripe, GitHub App, deployment and backup setup.

The remaining launch work is external configuration and acceptance validation: DNS, live Stripe products/webhook secret, GitHub App registration/installation, VPS `.env.production`, SSH deploy credentials and end-to-end smoke tests. Enterprise SSO/SCIM and multi-node distributed infrastructure remain post-MVP capabilities.

See `ROADMAP.md` for product evolution beyond the production MVP.