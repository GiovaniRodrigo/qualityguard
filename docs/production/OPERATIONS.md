# QualityGuard — Operations & Runbook Guide

This guide describes operational routines, health monitoring, log inspection, service maintenance, and troubleshooting for the QualityGuard production stack running on VPS `203.0.113.10` (`qualityguard.example.com`).

---

## 1. Production Architecture Overview

The production deployment runs on a single Ubuntu VPS using Docker Compose:

| Service | Container Name | Technology | Internal Port | External Exposure | Data Persistence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Caddy** | `qualityguard-caddy-1` | Caddy 2 (Alpine) | 80, 443 | Public `80/tcp`, `443/tcp`, `443/udp` | Volumes: `caddy_data`, `caddy_config` |
| **Web** | `qualityguard-web-1` | Next.js 16 (Node 22) | 3000 | Private Docker network | Stateless |
| **API** | `qualityguard-api-1` | Node.js Fastify/HTTP | 8787 | Private Docker network | Stateless (connects to PG) |
| **Postgres**| `qualityguard-postgres-1`| PostgreSQL 16 (Alpine)| 5432 | Private Docker network | Volume: `qualityguard_pg` |
| **Redis** | `qualityguard-redis-1` | Redis 7 (Alpine) | 6379 | Private Docker network | Volume: `qualityguard_redis` |

---

## 2. Common Operational Commands

All commands should be executed inside `/opt/qualityguard` on the VPS as user `qualityguard` (or with `sudo` where appropriate).

### 2.1 Stack Status & Health

```bash
# Check running containers and health status
cd /opt/qualityguard
docker compose --env-file .env.production -f docker-compose.production.yml ps

# Check resource consumption (CPU / RAM / I/O)
docker stats --no-stream
```

### 2.2 Viewing Logs

```bash
# Stream all logs
docker compose --env-file .env.production -f docker-compose.production.yml logs -f

# Stream specific service logs
docker compose --env-file .env.production -f docker-compose.production.yml logs -f api
docker compose --env-file .env.production -f docker-compose.production.yml logs -f web
docker compose --env-file .env.production -f docker-compose.production.yml logs -f caddy
docker compose --env-file .env.production -f docker-compose.production.yml logs -f postgres

# View last 100 log lines with timestamps
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail 100 -t api
```

### 2.3 Starting, Stopping & Restarting Services

```bash
# Restart a single service (e.g. API)
docker compose --env-file .env.production -f docker-compose.production.yml restart api

# Restart web frontend
docker compose --env-file .env.production -f docker-compose.production.yml restart web

# Reload Caddy configuration without downtime
docker compose --env-file .env.production -f docker-compose.production.yml exec caddy caddy reload --config /etc/caddy/Caddyfile

# Gracefully stop the entire stack
docker compose --env-file .env.production -f docker-compose.production.yml down

# Start the stack in background
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

---

## 3. Health Checks & Verification

QualityGuard exposes two key health endpoints on the API:

1. **Liveness Probe**: `GET /api/health`
   - Returns `{ ok: true, version: "...", commit: "..." }`
   - Validates that the Node.js API process is responsive.

2. **Readiness Probe**: `GET /api/ready`
   - Returns `{ ready: true, database: "connected" }` with HTTP 200.
   - Validates that the API has an active, working connection to the PostgreSQL database.
   - Returns HTTP 503 if the database is unreachable or initial migration failed.

### Running Smoke Tests

A comprehensive smoke test script is provided in `deploy/smoke-test.sh`:

```bash
cd /opt/qualityguard
bash deploy/smoke-test.sh
```

Smoke tests validate:
- DNS resolution of `qualityguard.example.com` to `203.0.113.10`
- HTTPS/TLS handshake and response codes
- Next.js Web frontend (HTTP 200)
- API `/api/health` and `/api/ready`
- Auth API registration & login flow
- PostgreSQL connectivity via `pg_isready`
- Redis connectivity via `redis-cli ping`

---

## 4. Database Backups & Maintenance

### 4.1 Scheduled Daily Backups

Backups are executed daily at **03:15 UTC** via cron (`/etc/cron.d/qualityguard-backup`):

```bash
# Manual trigger of PostgreSQL backup
/opt/qualityguard/deploy/backup-postgres.sh
```

- **Backup destination**: `/opt/backups/qualityguard/qualityguard-<timestamp>.sql.gz`
- **Retention**: 14 days (older files are deleted automatically).
- **Log file**: `/var/log/qualityguard-backup.log`

### 4.2 Verifying Backup Integrity

```bash
# List existing backups
ls -lh /opt/backups/qualityguard/

# Check that the gzip archive is valid and uncorrupted
gzip -t /opt/backups/qualityguard/qualityguard-<timestamp>.sql.gz && echo "Backup OK"
```

---

## 5. Secret Rotation Procedure

### Rotating `QUALITYGUARD_AUTH_SECRET`
1. Generate new secret: `openssl rand -base64 48`
2. Update `QUALITYGUARD_AUTH_SECRET` in `/opt/qualityguard/.env.production`
3. Restart API: `docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-deps api`
4. *Note*: Existing user sessions/JWTs will be invalidated and users must log in again.

### Rotating `POSTGRES_PASSWORD`
1. Generate new password: `openssl rand -hex 32`
2. Connect to PostgreSQL and alter password:
   ```bash
   docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres psql -U qualityguard -d qualityguard -c "ALTER USER qualityguard WITH PASSWORD 'NEW_PASSWORD';"
   ```
3. Update `POSTGRES_PASSWORD` in `/opt/qualityguard/.env.production`
4. Restart the stack:
   ```bash
   docker compose --env-file .env.production -f docker-compose.production.yml up -d
   ```

---

## 6. Disk Space & Housekeeping

Run monthly or after major Docker builds:

```bash
# Clean up dangling images and build cache
docker image prune -f
docker builder prune -f --keep-storage 2GB

# Check disk usage
df -h
docker system df
```
