# QualityGuard — Disaster Recovery & Restore Runbook

This document details the Disaster Recovery (DR) plan, Recovery Point Objective (RPO), Recovery Time Objective (RTO), and step-by-step procedures to recover QualityGuard in the event of total server loss, disk failure, or data corruption.

---

## 1. Objectives & Targets

| Metric | Target | Description |
| :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | < 24 Hours | Maximum data loss window (daily automated backup schedule at 03:15 UTC). |
| **RTO (Recovery Time Objective)** | < 30 Minutes | Target time to provision a clean host, restore data, and resume traffic. |

---

## 2. Backup Architecture

### Data Protected
1. **PostgreSQL Database**: All relational data (`users`, `organizations`, `projects`, `reviews`, `audit_events`, `usage_events`, `team_policies`, `stripe_events`).
2. **Configuration**: `.env.production` (stored securely in secret manager / password vault).
3. **Application Source & Dockerfiles**: Version controlled in GitHub repository `GiovaniRodrigo/qualityguard`.

### Backup Execution
- Script: `/opt/qualityguard/deploy/backup-postgres.sh`
- Local Location: `/opt/backups/qualityguard/qualityguard-<timestamp>.sql.gz`
- Retention: 14 days rotation on host.
- *Recommended Production Extension*: Sync `/opt/backups/qualityguard` to off-site S3-compatible cloud storage (e.g. AWS S3, Cloudflare R2, or Backblaze B2) using `rclone` or AWS CLI.

---

## 3. Scenario A: Restoring Database on Existing Server

Use this scenario if database data was corrupted, accidentally deleted, or needs point-in-time recovery.

```bash
# 1. Stop write-traffic services
cd /opt/qualityguard
docker compose --env-file .env.production -f docker-compose.production.yml stop api web

# 2. Locate the target backup file
ls -la /opt/backups/qualityguard/
RESTORE_FILE="/opt/backups/qualityguard/qualityguard-YYYYMMDDTHHMMSSZ.sql.gz"

# 3. Restore database with clean option
gunzip -c "$RESTORE_FILE" | docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres psql -U "${POSTGRES_USER:-qualityguard}" -d "${POSTGRES_DB:-qualityguard}"

# 4. Restart services
docker compose --env-file .env.production -f docker-compose.production.yml up -d

# 5. Run smoke tests
bash deploy/smoke-test.sh
```

---

## 4. Scenario B: Full Server Rebuild (Bare Metal / New VPS)

Use this scenario if the VPS `2.25.92.154` is permanently lost or corrupted.

### Step 1: Provision Clean Server
- OS: Ubuntu 22.04 LTS or 24.04 LTS (x86_64).
- Point DNS A-record `qualityguard.gfcode.com.br` to the new VPS public IP address.

### Step 2: Bootstrap Server Environment
From your local machine or using GitHub PAT:

```bash
# Option A: From local machine via SSH
ssh root@<NEW_VPS_IP> 'bash -s' < deploy/bootstrap-vps.sh

# Option B: Direct on server with GitHub PAT
curl -fsSL -H "Authorization: token <GITHUB_PAT>" \
  -H "Accept: application/vnd.github.v3.raw" \
  https://api.github.com/repos/GiovaniRodrigo/qualityguard/contents/deploy/bootstrap-vps.sh | bash
```

This installs Docker, Docker Compose, UFW firewall, fail2ban, cron, creates user `qualityguard`, and prepares `/opt/qualityguard`.

### Step 3: Authorize Deploy SSH Key
```bash
# Add public key of deployer / CI/CD to qualityguard user's authorized_keys
cat <<EOF >> /home/qualityguard/.ssh/authorized_keys
<YOUR_DEPLOY_SSH_PUBLIC_KEY>
EOF
chmod 600 /home/qualityguard/.ssh/authorized_keys
chown qualityguard:qualityguard /home/qualityguard/.ssh/authorized_keys
```

### Step 4: Clone Application Repository
```bash
su - qualityguard
git clone https://github.com/GiovaniRodrigo/qualityguard.git /opt/qualityguard
cd /opt/qualityguard
```

### Step 5: Restore Configuration (.env.production)
Recreate `/opt/qualityguard/.env.production` from your secure password manager / secret store:

```bash
cat <<EOF > /opt/qualityguard/.env.production
POSTGRES_DB=qualityguard
POSTGRES_USER=qualityguard
POSTGRES_PASSWORD=<SECURE_PASSWORD>
QUALITYGUARD_AUTH_SECRET=<AUTH_SECRET>
STRIPE_SECRET_KEY=<STRIPE_SECRET_KEY>
STRIPE_WEBHOOK_SECRET=<STRIPE_WEBHOOK_SECRET>
STRIPE_PRICE_PRO=<STRIPE_PRICE_PRO>
STRIPE_PRICE_TEAM=<STRIPE_PRICE_TEAM>
STRIPE_PRICE_ENTERPRISE=<STRIPE_PRICE_ENTERPRISE>
EOF
chmod 600 /opt/qualityguard/.env.production
```

### Step 6: Start Database & Restore Dump
```bash
# Start PostgreSQL container
docker compose --env-file .env.production -f docker-compose.production.yml up -d postgres redis

# Wait for PostgreSQL to become healthy
docker compose --env-file .env.production -f docker-compose.production.yml ps

# Copy off-site backup dump to host
mkdir -p /opt/backups/qualityguard
# e.g.: scp user@backup-host:/path/to/backup.sql.gz /opt/backups/qualityguard/

# Restore schema and data
gunzip -c /opt/backups/qualityguard/qualityguard-<timestamp>.sql.gz | \
  docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres psql -U qualityguard -d qualityguard
```

### Step 7: Start Full Stack & Verify
```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build

# Run smoke tests
bash deploy/smoke-test.sh
```

Caddy will automatically obtain a valid Let's Encrypt TLS certificate as soon as DNS points to the server and ports 80/443 are reachable.
