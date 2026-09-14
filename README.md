# QualityGuard

[![CI](https://github.com/GiovaniRodrigo/qualityguard/actions/workflows/ci.yml/badge.svg)](https://github.com/GiovaniRodrigo/qualityguard/actions/workflows/ci.yml)
[![Deploy Production](https://github.com/GiovaniRodrigo/qualityguard/actions/workflows/deploy-production.yml/badge.svg)](https://github.com/GiovaniRodrigo/qualityguard/actions/workflows/deploy-production.yml)

> AI-powered software quality and architecture governance for teams shipping code with AI.

**Can this change safely enter the current architecture?**

QualityGuard combines deterministic analysis, architecture intelligence and optional AI review into an executable quality-control layer for software teams.

---

## Architecture & Production Flow

```text
Developer ──( git push main )──► GitHub Actions CI (Typecheck / Test / Build)
                                         │
                                   [ CI Passes ]
                                         │
                                         ▼
                                GitHub Actions CD (SSH)
                                         │
                                         ▼
                                 VPS 2.25.92.154
                                         │
                                         ├── /opt/qualityguard (.env.production)
                                         │
                                         ▼
                                  Docker Compose
            ┌────────────────────────────┼────────────────────────────┐
            ▼                            ▼                            ▼
      Caddy (HTTPS :443)          Web (Next.js :3000)         API (Node.js :8787)
  [qualityguard.gfcode.com.br]           │                            │
                                         └─────────────┬──────────────┘
                                                       │
                                        ┌──────────────┴──────────────┐
                                        ▼                             ▼
                               PostgreSQL 16 (:5432)            Redis 7 (:6379)
                                (qualityguard_pg)             (qualityguard_redis)
```

---

## Implemented Product Path

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

---

## Capabilities

### Developer / Engine
- Git diff and staged analysis
- YAML policy configuration
- Enable/disable rules and severity overrides
- Stable finding fingerprints and baseline suppression
- Quality Gate with minimum score and blocking severities
- Strict Zod finding validation
- Architecture dependency graph and cycle detection
- TypeScript AST extraction
- Architecture policy DSL and drift detection

### AI Governance
- Provider abstraction
- OpenAI, Gemini, Anthropic and Ollama adapters
- Context-aware review prompt
- JSON-only finding contract
- Schema validation before findings reach the product domain

### GitHub Integration
- Signed webhook verification
- GitHub App JWT and installation token flow
- Pull request event filtering
- Pull request diff retrieval
- Deterministic QualityGuard Check Run publishing
- PR summary comment client

### Commercial Platform & Ops
- Authentication foundation with production secret enforcement
- Organizations and projects
- PostgreSQL persistence and automatic initial migration
- Usage metering and plan limits
- Team policies
- Audit trail
- Dashboard/pricing surface
- Stripe customer creation & Checkout subscriptions
- Stripe Billing Portal & signed idempotent webhooks
- Rate limiting and request size protection
- Hardened multi-stage Docker images running unprivileged users
- Self-hosted PostgreSQL/Redis/API/web Docker Compose stack
- Caddy HTTPS reverse proxy with automated TLS
- Automated backup cron with 14-day retention
- CI/CD with automated rollback and comprehensive smoke testing suite

---

## Local Development Quickstart

### Prerequisites
- Node.js >= 22
- pnpm 10.15.0+
- Docker & Docker Compose

### Setup & Run
```bash
# 1. Clone repository
git clone https://github.com/GiovaniRodrigo/qualityguard.git
cd qualityguard

# 2. Install workspace dependencies
pnpm install

# 3. Copy local environment variables
cp .env.example .env

# 4. Run full test suite & build
pnpm test
pnpm build

# 5. (Optional) Run local stack with Docker Compose
docker compose up -d
```

---

## CLI Usage

```bash
# Analyze full repository
qualityguard analyze .

# Analyze git diff only
qualityguard analyze . --diff

# Analyze staged git changes
qualityguard analyze . --staged

# Execute quality gate check
qualityguard check . --diff

# Generate or update baseline
qualityguard baseline .
```

---

## Production & Operations Documentation

- [VPS Deployment Guide](file:///docs/production/VPS-DEPLOYMENT.md): Initial server bootstrap, DNS, Docker setup, and environment configuration.
- [Operations Runbook](file:///docs/production/OPERATIONS.md): Daily operations, service logs, health monitoring, backup inspection, and secret rotation.
- [Rollback Strategy](file:///docs/production/ROLLBACK.md): Automated CI/CD rollback mechanics and manual recovery procedures.
- [Disaster Recovery Plan](file:///docs/production/DISASTER-RECOVERY.md): Backup validation, database restoration, and bare-metal server provisioning.
- [Billing & Stripe Configuration](file:///docs/commercial/BILLING.md): Stripe webhooks, products, and checkout setup.
- [Architecture Overview](file:///docs/architecture/ARCHITECTURE.md): Monorepo workspace architecture and engine structure.

---

## Product Roadmap

See [ROADMAP.md](file:///ROADMAP.md) for product evolution beyond the production MVP.