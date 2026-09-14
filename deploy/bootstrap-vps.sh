#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/qualityguard}"
DEPLOY_USER="${DEPLOY_USER:-qualityguard}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/qualityguard}"

echo "=== 1. System packages update & installation ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git ufw fail2ban openssl jq cron unattended-upgrades

echo "=== 2. Creating deploy user '$DEPLOY_USER' ==="
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "QualityGuard Deploy User" "$DEPLOY_USER"
fi

DEPLOY_HOME=$(eval echo "~$DEPLOY_USER")
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_HOME/.ssh"
touch "$DEPLOY_HOME/.ssh/authorized_keys"
chmod 600 "$DEPLOY_HOME/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_HOME/.ssh/authorized_keys"

echo "=== 3. Docker installation & user setup ==="
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
usermod -aG docker "$DEPLOY_USER"

echo "=== 4. Directory structures and permissions ==="
mkdir -p "$APP_DIR"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

mkdir -p "$BACKUP_DIR"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$BACKUP_DIR"

echo "=== 5. Setting up daily backup cron (03:15 UTC) ==="
cat <<CRON > /etc/cron.d/qualityguard-backup
# Daily PostgreSQL backup for QualityGuard at 03:15 UTC
15 3 * * * $DEPLOY_USER /bin/bash $APP_DIR/deploy/backup-postgres.sh >> /var/log/qualityguard-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/qualityguard-backup
systemctl enable --now cron 2>/dev/null || systemctl enable --now crond 2>/dev/null || true

echo "=== 6. UFW Firewall Configuration ==="
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "=== 7. System services ==="
systemctl enable --now fail2ban
systemctl enable --now unattended-upgrades || true

echo "VPS bootstrap complete. Deploy the repository into $APP_DIR and keep .env.production outside Git."
