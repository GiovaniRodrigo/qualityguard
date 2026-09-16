# QualityGuard

[![CI](https://github.com/GiovaniRodrigo/qualityguard/actions/workflows/ci.yml/badge.svg)](https://github.com/GiovaniRodrigo/qualityguard/actions/workflows/ci.yml)
[![Security](https://github.com/GiovaniRodrigo/qualityguard/actions/workflows/security.yml/badge.svg)](https://github.com/GiovaniRodrigo/qualityguard/actions/workflows/security.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)

> AI-powered software quality and architecture governance for teams shipping code with AI.

**Can this change safely enter the current architecture?**

QualityGuard combines deterministic analysis, architecture intelligence and optional AI review into an executable quality-control layer for software teams.

<p align="center">
  <img src="docs/images/dashboard-ky.png" alt="QualityGuard dashboard showing quality score, gate decision, severity breakdown and AI insight for an analyzed repository" width="100%">
</p>

<p align="center">
  <em>The workspace dashboard: quality score, gate decision, architecture &amp; security signals, severity breakdown and AI-generated insight — for every analyzed repository.</em>
</p>

---

## Screenshots

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/findings.png" alt="Findings command center with quality review, gate status, severity counters and prioritized findings"><br>
      <sub><b>Findings command center</b> — quality review, gate status, severity counters, prioritized findings and full-text search across every rule detection.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/images/architecture.png" alt="Architecture governance view listing detected circular dependency cycles"><br>
      <sub><b>Architecture governance</b> — module/edge graph from the TypeScript AST, custom policy rules and circular-dependency detection with remediation hints.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/security.png" alt="Security view listing hardcoded secret detections with remediation guidance"><br>
      <sub><b>Security signals</b> — static credential-exposure detections with file/line locations and remediation guidance.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/images/dependencies.png" alt="Dependency inventory extracted from project manifests"><br>
      <sub><b>Dependency inventory</b> — multi-language dependencies extracted from manifests (<code>package.json</code>, <code>requirements.txt</code>, <code>pyproject.toml</code>, <code>go.mod</code>, <code>pom.xml</code>, <code>Cargo.toml</code>).</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/dashboard-healthy.png" alt="Dashboard for a repository that passes the quality gate with a score of 100"><br>
      <sub><b>Passing quality gate</b> — a clean repository with zero open findings and a healthy, approved gate.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/images/cli-analyze.png" alt="Terminal output of the qualityguard analyze command"><br>
      <sub><b>CLI</b> — <code>qualityguard analyze</code> prints score, gate decision and every finding with rule id and suggested fix, ready for CI.</sub>
    </td>
  </tr>
</table>

> Screenshots use public open-source repositories as sample projects; the workspace and organization shown are illustrative.

---

## Architecture & Production Flow

```mermaid
flowchart TD
    Dev["Developer — git push main"] --> CI["GitHub Actions CI<br/>Typecheck / Test / Build"]
    CI --> Pass{{CI Passes}}
    Pass --> CD["GitHub Actions CD (SSH)"]
    CD --> VPS["VPS 203.0.113.10"]
    VPS --> Env["/opt/qualityguard<br/>(.env.production)"]
    Env --> Compose["Docker Compose"]
    Compose --> Caddy["Caddy — HTTPS :443<br/>qualityguard.example.com"]
    Compose --> Web["Web — Next.js :3000"]
    Compose --> API["API — Node.js :8787"]
    Web --> PG["PostgreSQL 16 :5432<br/>(qualityguard_pg)"]
    API --> PG
    Web --> Redis["Redis 7 :6379<br/>(qualityguard_redis)"]
    API --> Redis
```

---

## Implemented Product Path

```mermaid
flowchart TD
    A["CLI / GitHub PR"] --> B["Diff + repository context"]
    B --> C["Deterministic rules → baseline + deduplication"]
    C --> D["AST + dependency graph → architecture drift"]
    D --> E["Optional AI providers → strict schema validation"]
    E --> F["Findings → score → Quality Gate"]
    F --> G["GitHub Check / dashboard"]
    G --> H["Organization → usage metering → Stripe subscription"]
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

- [VPS Deployment Guide](docs/production/VPS-DEPLOYMENT.md): Initial server bootstrap, DNS, Docker setup, and environment configuration.
- [Operations Runbook](docs/production/OPERATIONS.md): Daily operations, service logs, health monitoring, backup inspection, and secret rotation.
- [Rollback Strategy](docs/production/ROLLBACK.md): Automated CI/CD rollback mechanics and manual recovery procedures.
- [Disaster Recovery Plan](docs/production/DISASTER-RECOVERY.md): Backup validation, database restoration, and bare-metal server provisioning.
- [Billing & Stripe Configuration](docs/commercial/BILLING.md): Stripe webhooks, products, and checkout setup.
- [Architecture Overview](docs/architecture/ARCHITECTURE.md): Monorepo workspace architecture and engine structure.

---

## Product Roadmap

See [ROADMAP.md](ROADMAP.md) for product evolution and the open-source / cloud
boundary.

---

## Open Source vs. Cloud

QualityGuard's **Open Source Core** (this repository, AGPL-3.0) is a fully
functional quality and architecture engine: analyzer, architecture
intelligence, AI adapters, CLI, API, web app, and GitHub integration. It runs
end-to-end locally and self-hosted with no proprietary dependency.

**Cloud / commercial** concerns — managed hosting, billing operations, and
enterprise governance — are documented as a separate boundary in
[ROADMAP.md](ROADMAP.md) and [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md).

---

## Contributing

Contributions are welcome! Please read:

- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, workflow, testing, and PR process
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community expectations
- [SECURITY.md](SECURITY.md) — how to report vulnerabilities privately

A good first contribution is a new analyzer rule in `packages/analyzer` or a
documentation improvement.

---

## License

QualityGuard is licensed under the **GNU Affero General Public License v3.0**
(AGPL-3.0-only). See [LICENSE](LICENSE) for the full text.

The AGPL requires that if you run a modified version of QualityGuard as a network
service, you must make the corresponding source code available to its users. For
commercial licensing inquiries, contact the maintainers.