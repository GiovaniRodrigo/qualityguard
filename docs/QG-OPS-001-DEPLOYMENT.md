# QualityGuard — QG-OPS-001 Production Deployment Guide

**Task:** QG-OPS-001 — Production Deployment & Live GitHub Validation  
**Author:** QualityGuard Principal Infrastructure & DevOps Engineer  
**Target Environment:** Linux VPS (`qualityguard.gfcode.com.br` / `2.25.92.154`)  
**Stack Architecture:** Multi-Container Docker Compose with Caddy 2, Next.js 16 Web, Fastify API, PostgreSQL 16, Redis 7  
**Status:** Verified & Production Ready  

---

## 1. Production Architecture & Network Topology

QualityGuard runs in production as a containerized stack orchestrated via Docker Compose (`docker-compose.production.yml`). All services communicate over an isolated internal Docker bridge network (`backend`), ensuring zero WAN exposure for databases and internal API services.

```
                                [ Internet (WAN) ]
                                        │
                                        │ HTTP (80) / HTTPS (443) / HTTP/3 (UDP 443)
                                        ▼
                         ┌─────────────────────────────┐
                         │   Caddy 2 Reverse Proxy     │
                         │   - Automatic Let's Encrypt │
                         │   - Strict Security Headers │
                         └──────────────┬──────────────┘
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             │                                                     │
             ▼ /api/*, /webhooks/*, /health, /ready                ▼ /* (Web Frontend)
┌───────────────────────────────────────────┐         ┌─────────────────────────────────┐
│         QualityGuard Fastify API          │         │     Next.js 16 Standalone Web   │
│  - Sandboxed Repository Cloner (Git CLI)  │         │  - SSR & Server Components      │
│  - Analysis Queue (FIFO Worker Pool)      │         │  - Real-Time Analysis Polling   │
│  - GitHub PR Governance & Review Engine   │         │  - Architecture Explorer Graph  │
│  - Webhook HMAC-SHA256 Idempotent Handler │         └────────────────┬────────────────┘
└─────────────────────┬─────────────────────┘                          │
                      │                                                │ Internal API Proxy
                      │ PostgreSQL Wire Protocol                       │ (API_URL=http://api:8787)
                      ▼                                                │
┌───────────────────────────────────────────┐                          │
│           PostgreSQL 16 Database          │◄─────────────────────────┘
│  - Named Volume: qualityguard_pg          │
│  - Automatic schema migrations on boot    │
└───────────────────────────────────────────┘
```

### Port Matrix & Security Boundaries

| Service | Container Port | Host Port | WAN Exposure | Security Policy |
| :--- | :--- | :--- | :--- | :--- |
| **Caddy Proxy** | `80`, `443` | `80`, `443` | **Public** | Auto HTTPS TLS termination, HSTS, Rate Limiting |
| **Next.js Web** | `3000` | None | **Internal Only** | Accessible only via Caddy proxy |
| **Fastify API** | `8787` | None | **Internal Only** | Accessible only via Caddy proxy & Web SSR proxy |
| **PostgreSQL** | `5432` | None | **Internal Only** | Strictly bound to `backend` network |
| **Redis** | `6379` | None | **Internal Only** | Strictly bound to `backend` network |
| **Host SSH** | `22` | `22` | **Public** | Key-based auth only, fail2ban active |

---

## 2. Infrastructure Prerequisites & System Requirements

### Minimum Hardware
- **CPU:** 2 vCPU cores (x86_64 or arm64)
- **RAM:** 4 GB RAM (8 GB recommended for concurrent repository clones & AST parsing)
- **Disk:** 40 GB NVMe / SSD (ext4 filesystem)
- **OS:** Ubuntu 22.04 LTS / 24.04 LTS or Debian 12 (Bookworm)

### Host Software Dependencies
- Docker Engine version `>= 24.0.0`
- Docker Compose plugin version `>= 2.20.0`
- OpenSSL, curl, git, jq, fail2ban, ufw, cron

---

## 3. Step-by-Step Production Setup

### Step 1: VPS Host Initialization & Security Hardening
Execute the automated provisioning script [`deploy/bootstrap-vps.sh`](file:///home/isabelle/teste_qualityguard/qualityguard/deploy/bootstrap-vps.sh) as `root`:

```bash
curl -fsSL https://raw.githubusercontent.com/GiovaniRodrigo/qualityguard/main/deploy/bootstrap-vps.sh | bash
```

The bootstrap script automatically:
1. Installs base dependencies (`ca-certificates`, `curl`, `git`, `ufw`, `fail2ban`, `openssl`, `jq`, `cron`).
2. Configures dedicated non-root deploy user `qualityguard` with Docker group privileges.
3. Sets up directory structures at `/opt/qualityguard` and `/opt/backups/qualityguard`.
4. Configures UFW firewall (`default deny incoming`, allows `22/tcp`, `80/tcp`, `443/tcp`, `443/udp`).
5. Configures systemd automated PostgreSQL backup cron at `03:15 UTC`.
6. Enables `fail2ban` and `unattended-upgrades`.

### Step 2: Deploy Application Code & Configure Environment
Clone the repository and prepare `.env.production`:

```bash
sudo su - qualityguard
cd /opt/qualityguard
git clone https://github.com/GiovaniRodrigo/qualityguard.git .

# Copy and populate production secrets (NEVER commit .env.production to version control)
cp .env.example .env.production
chmod 600 .env.production
```

#### Production `.env.production` Reference Configuration:
```env
NODE_ENV=production
DOMAIN=qualityguard.gfcode.com.br
PORT=8787

# PostgreSQL Credentials
POSTGRES_DB=qualityguard
POSTGRES_USER=qualityguard
POSTGRES_PASSWORD=YOUR_SECURE_RANDOM_POSTGRES_PASSWORD_HERE
DATABASE_URL=postgresql://qualityguard:YOUR_SECURE_RANDOM_POSTGRES_PASSWORD_HERE@postgres:5432/qualityguard

# Redis Configuration
REDIS_URL=redis://redis:6379

# Cryptography & Session Secrets (Generate via: openssl rand -hex 32)
JWT_SECRET=GENERATED_64_CHAR_HEX_SECRET_FOR_JWT
ENCRYPTION_KEY=GENERATED_64_CHAR_HEX_SECRET_FOR_AT_REST_TOKENS

# GitHub App Integration
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=YOUR_GITHUB_WEBHOOK_HMAC_SECRET_HEX

# AI Analysis Engine (Optional / OpenRouter or DeepSeek)
DEEPSEEK_API_KEY=sk-or-v1-YOUR_DEEPSEEK_KEY
AI_PROVIDER=deepseek

# In-App SSR Proxy target
API_URL=http://api:8787
NEXT_PUBLIC_APP_URL=https://qualityguard.gfcode.com.br
```

### Step 3: Build & Launch Production Stack
Build the optimized multi-stage container images and launch the stack in detached mode:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

Verify all containers reach healthy status:
```bash
docker compose -f docker-compose.production.yml ps
```

Expected output:
```
NAME                      IMAGE                STATUS                    PORTS
qualityguard-caddy-1      caddy:2-alpine       Up (healthy)              0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
qualityguard-web-1        qualityguard-web     Up (healthy)              3000/tcp
qualityguard-api-1        qualityguard-api     Up (healthy)              8787/tcp
qualityguard-postgres-1   postgres:16-alpine   Up (healthy)              5432/tcp
qualityguard-redis-1      redis:7-alpine       Up (healthy)              6379/tcp
```

---

## 4. Automated Database Migrations & Lifecycle

The Fastify API automatically executes database migrations during startup prior to binding its HTTP listener:
- **Migration Source:** [`apps/api/migrations/001_initial.sql`](file:///home/isabelle/teste_qualityguard/qualityguard/apps/api/migrations/001_initial.sql)
- **Tables Initialized:** `users`, `organizations`, `organization_members`, `projects`, `reviews`, `stripe_events`, `team_policies`, `usage_events`, `audit_events`.
- **Idempotency:** Schema definitions utilize `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.
- **Isolation:** Multi-tenant constraints enforce foreign keys with `ON DELETE CASCADE`.

---

## 5. Reverse Proxy & Automatic SSL/TLS (Caddy)

Caddy automatically provisions and renews TLS certificates via Let's Encrypt / ZeroSSL using HTTP-01 or TLS-ALPN-01 challenges.

Configured routing in [`deploy/Caddyfile`](file:///home/isabelle/teste_qualityguard/qualityguard/deploy/Caddyfile):
- `GET /health`, `GET /ready` ➔ Proxied directly to `api:8787`.
- `POST /webhooks/*` ➔ Proxied directly to `api:8787` preserving client headers (`X-Hub-Signature-256`, `X-GitHub-Event`, `X-GitHub-Delivery`).
- `ALL /api/*` ➔ Strips `/api` prefix and proxies to `api:8787`.
- `ALL /*` ➔ Proxied directly to Next.js 16 standalone web server on `web:3000`.

---

## 6. Zero-Downtime Redeployment Procedure

When deploying new commits or releases:

```bash
cd /opt/qualityguard

# 1. Pull latest code
git pull origin main

# 2. Rebuild images with zero downtime using rolling restart
docker compose --env-file .env.production -f docker-compose.production.yml build api web

# 3. Recreate containers with updated images
docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-deps api web

# 4. Run automated smoke tests
./deploy/smoke-test.sh
```

---

## 7. PostgreSQL Automated Backup & Retention

- **Backup Script:** [`deploy/backup-postgres.sh`](file:///home/isabelle/teste_qualityguard/qualityguard/deploy/backup-postgres.sh)
- **Schedule:** Nightly at 03:15 UTC via systemd cron (`/etc/cron.d/qualityguard-backup`).
- **Retention:** 14 days rolling window with automatic pruning.
- **Output:** `/opt/backups/qualityguard/qualityguard-YYYYMMDDTHHMMSSZ.sql.gz`.

Manual backup trigger:
```bash
/opt/qualityguard/deploy/backup-postgres.sh
```

Manual restore trigger:
```bash
gunzip -c /opt/backups/qualityguard/qualityguard-20260915T031500Z.sql.gz | \
  docker compose -f docker-compose.production.yml exec -T postgres \
  psql -U qualityguard -d qualityguard
```
