#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/qualityguard}"
DEPLOY_USER="${DEPLOY_USER:-qualityguard}"

apt-get update
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades

if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER" 2>/dev/null || true

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  usermod -aG docker "$DEPLOY_USER"
fi

mkdir -p "$APP_DIR"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl enable --now fail2ban
systemctl enable --now unattended-upgrades || true

echo "VPS bootstrap complete. Deploy the repository into $APP_DIR and keep .env.production outside Git."
