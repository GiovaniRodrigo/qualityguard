# QualityGuard — Rollback Procedures & Strategy

This document outlines the automated and manual rollback procedures for the QualityGuard production stack.

---

## 1. Automated Rollback in CI/CD

The continuous deployment workflow [`.github/workflows/deploy-production.yml`](file:///.github/workflows/deploy-production.yml) incorporates native, automated rollback:

### How it works:
1. Before applying new changes, the workflow captures the current active commit:
   ```bash
   PREVIOUS_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")
   ```
2. A bash error trap (`trap rollback ERR`) is registered.
3. If any step fails during the deploy (Git checkout, Docker image build, container startup, database readiness check, or smoke test execution):
   - The trap invokes the `rollback()` function.
   - The repository is reset to `PREVIOUS_COMMIT` (`git reset --hard "$PREVIOUS_COMMIT"`).
   - `docker compose` restarts the containers using the previous stable commit image.
   - The workflow exits with code 1, notifying maintainers of deployment failure.

---

## 2. Manual Rollback Procedures

If an incident occurs *after* a deployment has completed (e.g. latent runtime bug, performance regression, or critical issue):

### Step 1: Identify the Target Stable Commit

On the VPS or via GitHub, find the last known stable Git commit hash:

```bash
cd /opt/qualityguard
git log -n 5 --oneline
```

Example output:
```text
c831e5f (HEAD -> main) feat: some recent change
9a12bc4 fix: prior stable release
```

### Step 2: Roll Back Application Code

```bash
cd /opt/qualityguard

# Reset code to the target stable commit
git reset --hard 9a12bc4

# Rebuild and restart the containers
export GIT_COMMIT="9a12bc4"
docker compose --env-file .env.production -f docker-compose.production.yml build
docker compose --env-file .env.production -f docker-compose.production.yml up -d --remove-orphans
```

### Step 3: Run Validation & Smoke Tests

```bash
# Verify container health
docker compose --env-file .env.production -f docker-compose.production.yml ps

# Execute smoke test suite
bash deploy/smoke-test.sh
```

---

## 3. Database Rollback / Schema Reversion

### General Database Policy
- Migrations in QualityGuard must be designed to be **backward-compatible** (expanding before contracting).
- New columns and tables should be nullable or have default values so that older code versions can run alongside newer schemas.

### Rolling Back Data from Backup
If a deployment caused database corruption or data loss:

1. **Stop the API and Web to prevent incoming writes**:
   ```bash
   cd /opt/qualityguard
   docker compose --env-file .env.production -f docker-compose.production.yml stop api web
   ```

2. **Restore PostgreSQL from the most recent pre-deployment backup**:
   ```bash
   # Select the backup file prior to deployment
   BACKUP_FILE="/opt/backups/qualityguard/qualityguard-YYYYMMDDTHHMMSSZ.sql.gz"

   # Restore database
   gunzip -c "$BACKUP_FILE" | docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres psql -U qualityguard -d qualityguard
   ```

3. **Restart the full stack**:
   ```bash
   docker compose --env-file .env.production -f docker-compose.production.yml up -d
   ```

4. **Verify database readiness**:
   ```bash
   curl -f http://127.0.0.1:8787/ready
   ```
