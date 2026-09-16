# QualityGuard — QG-OPS-001 Environment & Production Architecture Audit

**Task:** QG-OPS-001 — Production Deployment & Live GitHub Validation  
**Date:** September 2026  
**Auditor:** QualityGuard Principal Infrastructure & DevOps Engineer  
**Status:** Audit Complete  

---

## 1. Executive Environment Audit

| Component | Target Specification | Current State & Configuration | Verification / Findings |
| :--- | :--- | :--- | :--- |
| **Target Host / Domain** | `qualityguard.gfcode.com.br` | DNS A record resolves to `2.25.92.154` (TTL 300) | Validated via DNS lookup |
| **Deployment Mode** | Docker Compose Single-Node Stack | Configured in `docker-compose.production.yml` | Isolated bridge network `backend` |
| **Container Engine** | Docker 29.8.0 / Compose v5.5.1 | Available and active | Supports compose v2/v5 spec |
| **Node.js Runtime** | Node.js v22 (Alpine) | Dockerfiles target `node:22-alpine` | Monorepo pnpm 10 compatible |
| **Database** | PostgreSQL 16 (Alpine) | Service `postgres:16-alpine` | Persistent named volume `qualityguard_pg` |
| **Cache / Queue State** | Redis 7 (Alpine) | Service `redis:7-alpine` | Volume `qualityguard_redis` (AOF persistence) |
| **API Server** | QualityGuard Fastify/HTTP API | Service `api` listening on `:8787` (internal) | Dynamic Postgres migration & health check |
| **Web Frontend** | Next.js 16 (Standalone) | Service `web` listening on `:3000` (internal) | Direct proxy connection to API |
| **Reverse Proxy / TLS** | Caddy 2 (Alpine) | Service `caddy:2-alpine` on `:80` and `:443` | Auto HTTPS via Let's Encrypt / ZeroSSL |
| **Firewall (UFW)** | Ports 22, 80, 443 open | Configured via `deploy/bootstrap-vps.sh` | 5432 & 6379 strictly closed to WAN |

---

## 2. Production Topology & Traffic Flow

```
                            [ Internet (WAN) ]
                                    │
                                    │ HTTPS (443) / HTTP (80)
                                    ▼
                     ┌─────────────────────────────┐
                     │     Caddy 2 Reverse Proxy   │ (caddy:2-alpine)
                     │  - Automatic TLS Certificate│
                     │  - Security Headers (HSTS)  │
                     └──────────────┬──────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          │                                                   │
          ▼ /api/*, /webhooks/*, /health, /ready              ▼ /* (Web UI)
┌─────────────────────────────────┐                 ┌─────────────────────────────────┐
│     QualityGuard API Service    │                 │   Next.js 16 Standalone Web UI  │
│  - Sandboxed Repository Cloner  │                 │  - Dynamic Dashboard            │
│  - Analysis Queue (FIFO)        │                 │  - Interactive Graph Explorer   │
│  - GitHub PR Governance Engine  │                 │  - Real-Time Analysis Polling   │
│  - Webhook HMAC-SHA256 Validator│                 └─────────────────────────────────┘
└────────────────┬────────────────┘                                   ▲
                 │                                                    │
                 │ Internal DB Queries                                │ Internal API Proxy
                 ▼                                                    │ (API_URL=http://api:8787)
┌─────────────────────────────────┐                                   │
│    PostgreSQL 16 (Alpine)       │───────────────────────────────────┘
│  - Volume: qualityguard_pg      │
│  - Tables: users, orgs, projects│
│    reviews, usage, audit, events│
└─────────────────────────────────┘
```

---

## 3. Ten Core Audit Questions & Determinations

### 1. How the project must be executed in production
The project is executed as an immutable, multi-container Docker Compose stack (`docker-compose.production.yml`) managed by systemd/docker daemon, with `NODE_ENV=production`.

### 2. What containers exist in the stack
1. `caddy` — Ingress reverse proxy and TLS terminator (`caddy:2-alpine`).
2. `web` — Production Next.js 16 web application (`node:22-alpine`, standalone output).
3. `api` — Core backend API, queue worker pool, and GitHub PR governance (`node:22-alpine`).
4. `postgres` — Persistent relational database (`postgres:16-alpine`).
5. `redis` — In-memory caching and upcoming queue state (`redis:7-alpine`).

### 3. Which ports are internal
- `postgres:5432` — Private to `backend` network.
- `redis:6379` — Private to `backend` network.
- `api:8787` — Private to `backend` network.
- `web:3000` — Private to `backend` network.

### 4. Which ports must be public
- `caddy:80` (HTTP for ACME challenge & HTTP ➔ HTTPS redirect).
- `caddy:443` (TCP/UDP for HTTPS & HTTP/3).
- `ssh:22` (Host SSH for administrative access).

### 5. How the frontend communicates with the API
The frontend Next.js server proxies client requests via `apps/web/app/api/[...path]/route.ts` directly to `http://api:8787` over the internal Docker network `backend` using `API_URL=http://api:8787`. External browser requests to `/api/*` are routed by Caddy directly to `api:8787`.

### 6. How the GitHub webhook reaches the API
1. GitHub sends a POST request with payload and `x-hub-signature-256` to `https://qualityguard.gfcode.com.br/webhooks/github` or `https://qualityguard.gfcode.com.br/api/webhooks/github`.
2. Caddy routes `/webhooks/*` and `/api/*` to `api:8787`.
3. `apps/api/src/server.ts` receives raw payload, verifies HMAC-SHA256 signature using `GITHUB_WEBHOOK_SECRET` and `crypto.timingSafeEqual`, checks delivery ID in store, returns HTTP 202, and enqueues PR analysis.

### 7. Where PostgreSQL persists data
PostgreSQL data is persisted in the named Docker volume `qualityguard_pg` mapped to `/var/lib/postgresql/data`. Volume data survives container restarts, updates, and host reboots.

### 8. Where temporary workspaces are stored
Workspaces are created under `/tmp/qualityguard/workspaces/job-${UUID}` inside the `api` container. Each workspace is isolated, enforced with a 50MB disk quota, 45s hard timeout, and deallocated in a `finally` block via `rm(workspacePath, { recursive: true, force: true })`.

### 9. How migrations are executed
On container startup, `apps/api/src/server.ts` executes `migrate()` before binding to port 8787. It reads `apps/api/migrations/001_initial.sql` and applies schema definitions (`users`, `organizations`, `projects`, `reviews`, `stripe_events`, `usage_events`, indexes) idempotently using `CREATE TABLE IF NOT EXISTS`.

### 10. How containers restart
All services specify `restart: unless-stopped`. If any process exits unexpectedly or the server reboots, Docker automatically restarts the container. Healthchecks (`pg_isready`, `redis-cli ping`, `GET /ready`, `GET /`) verify service health and sequence dependencies (`api` waits for `postgres` and `redis` to be healthy before starting).

---

## 4. Hardening Requirements Identified Before Image Build

1. **`apps/api/Dockerfile`**: Must install `git` and `ca-certificates` in the Alpine runtime container (`RUN apk add --no-cache git ca-certificates`) to allow `SandboxedRepositoryCloner` to clone repositories.
2. **`apps/web/Dockerfile`**: Must copy all monorepo workspace packages (`packages/*`) in the build phase so `pnpm build` can resolve `@qualityguard/domain`, `@qualityguard/analyzer`, and `@qualityguard/architecture`.
3. **`deploy/Caddyfile`**: Must explicitly match `@api path /api/* /webhooks/* /health /ready` so webhooks and health endpoints are reverse-proxied to `api:8787`.

---

## 5. Audit Conclusion

The production architecture is robust, secure, and adheres to zero-mock principles. Proceeding to **FASE 1 (Production Configuration)** and **FASE 2 (Docker Production Build)**.
