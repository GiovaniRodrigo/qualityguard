#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/qualityguard}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/qualityguard}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/qualityguard-$TIMESTAMP.sql.gz"

docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres \
  pg_dump --clean --if-exists -U "${POSTGRES_USER:-qualityguard}" -d "${POSTGRES_DB:-qualityguard}" \
  | gzip > "$FILE"

find "$BACKUP_DIR" -type f -name 'qualityguard-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

test -s "$FILE"
echo "Backup created: $FILE"
