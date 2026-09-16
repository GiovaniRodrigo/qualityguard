# QualityGuard — QG-OPS-001 Operations & Incident Runbook

**Task:** QG-OPS-001 — Production Deployment & Live GitHub Validation  
**Audience:** SREs, DevOps Engineers, On-Call Engineers  
**Target Environment:** `qualityguard.gfcode.com.br`  
**Status:** Active Production Runbook  

---

## 1. Incident Severity Matrix & SLA Response

| Severity | Definition | Target Response (MTTD) | Target Resolution (MTTR) | Examples |
| :--- | :--- | :--- | :--- | :--- |
| **SEV-0 (Critical)** | Total platform outage, API down, database inaccessible | `< 5 minutes` | `< 30 minutes` | Caddy down, PostgreSQL crash, 5xx on all routes |
| **SEV-1 (High)** | Core workflow blocked, queue stalled, webhooks failing | `< 15 minutes` | `< 1 hour` | Webhook HMAC failure, analysis jobs stuck in `cloning` |
| **SEV-2 (Medium)** | Degraded performance, high queue latency, partial failures | `< 30 minutes` | `< 4 hours` | Slow git clone times, high memory usage |
| **SEV-3 (Low)** | Minor UI cosmetic glitch, non-blocking background error | `< 2 hours` | `< 24 hours` | Chart tooltip styling issue |

---

## 2. Quick Diagnostic Commands

Run all commands from `/opt/qualityguard` on the host server:

### Check Overall Stack Health
```bash
# 1. Check container lifecycle status
docker compose -f docker-compose.production.yml ps

# 2. View live aggregate container resource metrics
docker stats --no-stream

# 3. Test API liveness & database connection
curl -i http://localhost:8787/health

# 4. Test API readiness for queue jobs
curl -i http://localhost:8787/ready

# 5. Run full automated smoke test
./deploy/smoke-test.sh
```

### Inspect Container Logs
```bash
# Stream all logs
docker compose -f docker-compose.production.yml logs -f --tail=100

# Stream Fastify API logs specifically
docker compose -f docker-compose.production.yml logs -f api

# Stream Caddy reverse proxy access & error logs
docker compose -f docker-compose.production.yml logs -f caddy
```

---

## 3. Incident Playbooks by Failure Mode

### Playbook 1: API Down / Returning 502 Bad Gateway
**Symptoms:** Caddy responds with `502 Bad Gateway` or `504 Gateway Timeout`.

**Step 1: Check if API container is running:**
```bash
docker compose -f docker-compose.production.yml ps api
```

**Step 2: Inspect API logs for fatal crashes (e.g. unhandled rejection or migration error):**
```bash
docker compose -f docker-compose.production.yml logs api --tail=100
```

**Step 3: Restart API service cleanly:**
```bash
docker compose -f docker-compose.production.yml restart api
```

**Step 4: Verify health:**
```bash
curl -i http://localhost:8787/health
```

---

### Playbook 2: PostgreSQL Database Unresponsive or Connection Refused
**Symptoms:** API logs report `ECONNREFUSED 5432` or query timeouts.

**Step 1: Verify PostgreSQL container health:**
```bash
docker compose -f docker-compose.production.yml exec postgres pg_isready -U qualityguard -d qualityguard
```

**Step 2: Check PostgreSQL error logs:**
```bash
docker compose -f docker-compose.production.yml logs postgres --tail=100
```

**Step 3: If out of memory or locked, restart PostgreSQL safely:**
```bash
docker compose -f docker-compose.production.yml restart postgres
docker compose -f docker-compose.production.yml restart api
```

---

### Playbook 3: Analysis Job Stuck in `cloning` or `analyzing`
**Symptoms:** Analysis UI shows progress spinner indefinitely; job status does not transition to `completed` or `failed` after > 60 seconds.

**Root Causes:**
1. Upstream Git repository host hang (e.g. GitHub git network timeout).
2. Large repository exceeded timeout.
3. Node process uncaught exception during AST parse.

**Remediation Steps:**
1. **Locate stuck job ID in logs:**
   ```bash
   docker compose -f docker-compose.production.yml logs api | grep "job-" | tail -n 20
   ```
2. **Verify workspace timeout enforcement:**
   The `SandboxedRepositoryCloner` enforces a 45s hard process timeout. If a process exceeds this, it is automatically terminated with `SIGKILL`.
3. **Emergency cleanup of orphan temporary workspaces:**
   ```bash
   docker compose -f docker-compose.production.yml exec api rm -rf /tmp/qualityguard/workspaces/job-*
   ```
4. **Restart API queue worker if needed:**
   ```bash
   docker compose -f docker-compose.production.yml restart api
   ```

---

### Playbook 4: GitHub Webhook 401 Unauthorized
**Symptoms:** GitHub App Webhook deliveries tab shows `401 Unauthorized` responses.

**Root Causes:**
1. `GITHUB_WEBHOOK_SECRET` in `.env.production` does not match the secret in the GitHub App settings.
2. Ingress proxy altered raw request body bytes before signature check.

**Remediation Steps:**
1. Inspect `.env.production` on the host:
   ```bash
   grep GITHUB_WEBHOOK_SECRET /opt/qualityguard/.env.production
   ```
2. Compare with GitHub App > Settings > General > Webhook secret.
3. Update `.env.production` if mismatched and restart API:
   ```bash
   docker compose -f docker-compose.production.yml up -d --no-deps api
   ```
4. Redeliver the webhook payload from GitHub App settings.

---

### Playbook 5: Disk Space Full / Emergency Disk Purge
**Symptoms:** Docker warns `no space left on device` or database writes fail.

**Diagnostic:**
```bash
df -h
docker system df
```

**Remediation Steps:**
```bash
# 1. Clean up unused Docker build cache and orphan containers
docker system prune -af --volumes=false

# 2. Prune old database backups older than 7 days
find /opt/backups/qualityguard -type f -name "*.sql.gz" -mtime +7 -delete

# 3. Clean up container log files
truncate -s 0 /var/lib/docker/containers/*/*-json.log 2>/dev/null || true
```

---

## 4. Disaster Recovery & Database Restoration

### Restore from Nightly PostgreSQL Backup
```bash
# 1. List available backups
ls -lth /opt/backups/qualityguard/

# 2. Select backup file (e.g. qualityguard-20260915T031500Z.sql.gz)
BACKUP_FILE="/opt/backups/qualityguard/qualityguard-20260915T031500Z.sql.gz"

# 3. Stop dependent API and Web containers
docker compose -f docker-compose.production.yml stop api web

# 4. Restore database schema and data
gunzip -c "$BACKUP_FILE" | \
  docker compose -f docker-compose.production.yml exec -T postgres \
  psql -U qualityguard -d qualityguard

# 5. Restart API and Web
docker compose -f docker-compose.production.yml start api web

# 6. Verify smoke test
./deploy/smoke-test.sh
```

---

## 5. Rollback Procedure

If a newly deployed release introduces regressions:

```bash
cd /opt/qualityguard

# 1. Identify previous stable commit hash
git log -n 5 --oneline

# 2. Checkout previous stable commit
git checkout <PREVIOUS_COMMIT_SHA>

# 3. Rebuild and restart containers
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build --no-deps api web

# 4. Verify system health
./deploy/smoke-test.sh
```
