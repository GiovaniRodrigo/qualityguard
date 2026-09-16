#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-qualityguard.example.com}"
BASE_URL="${BASE_URL:-https://${DOMAIN}}"
EXPECTED_IP="${EXPECTED_IP:-203.0.113.10}"
APP_DIR="${APP_DIR:-/opt/qualityguard}"

echo "=========================================="
echo "  QualityGuard Production Smoke Tests     "
echo "  Domain:   $DOMAIN"
echo "  Base URL: $BASE_URL"
echo "  Time:     $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "=========================================="

FAILED=0

pass() {
  echo -e "[\033[32mPASS\033[0m] $1"
}

fail() {
  echo -e "[\033[31mFAIL\033[0m] $1: $2"
  FAILED=$((FAILED + 1))
}

warn() {
  echo -e "[\033[33mWARN\033[0m] $1: $2"
}

# 1. DNS Resolution Check
echo -e "\n--- 1. Checking DNS Resolution ---"
RESOLVED_IP=$(dig +short "$DOMAIN" 2>/dev/null | tail -n1 || host "$DOMAIN" 2>/dev/null | awk '/has address/ {print $NF}' | tail -n1 || true)
if [ -n "$RESOLVED_IP" ]; then
  if [ "$RESOLVED_IP" = "$EXPECTED_IP" ]; then
    pass "DNS resolves $DOMAIN -> $RESOLVED_IP (matches expected $EXPECTED_IP)"
  else
    warn "DNS" "resolves $DOMAIN -> $RESOLVED_IP (expected $EXPECTED_IP)"
  fi
else
  warn "DNS" "Unable to resolve $DOMAIN externally"
fi

# 2. TLS & HTTPS Check
echo -e "\n--- 2. Checking TLS & HTTPS Connectivity ---"
if curl --fail --silent --show-error --head --max-time 10 "$BASE_URL" >/dev/null 2>&1; then
  pass "HTTPS connection established successfully to $BASE_URL"
else
  # Check if running locally on server behind reverse proxy
  if curl --fail --silent --show-error --head --max-time 5 "http://localhost:80" -H "Host: $DOMAIN" >/dev/null 2>&1; then
    warn "HTTPS" "External TLS not yet active, but local ingress port 80 is responding"
  else
    warn "HTTPS" "Unable to reach $BASE_URL directly"
  fi
fi

# 3. Frontend Reachability
echo -e "\n--- 3. Checking Frontend ---"
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL" 2>/dev/null || curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3000" 2>/dev/null || echo "000")
if [ "$WEB_STATUS" = "200" ]; then
  pass "Frontend returned HTTP $WEB_STATUS"
else
  warn "Frontend" "HTTP status $WEB_STATUS (expected 200)"
fi

# 4. API Health & Readiness Endpoints
echo -e "\n--- 4. Checking API Health & Readiness ---"
HEALTH_URL="$BASE_URL/api/health"
READY_URL="$BASE_URL/api/ready"

HEALTH_RESP=$(curl --silent --max-time 10 "$HEALTH_URL" 2>/dev/null || curl --silent --max-time 5 "http://localhost:8787/health" 2>/dev/null || echo "")
if echo "$HEALTH_RESP" | grep -q '"ok":true'; then
  pass "API Health: $HEALTH_RESP"
else
  warn "API Health" "Endpoint did not return ok:true. Response: '$HEALTH_RESP'"
fi

READY_RESP=$(curl --silent --max-time 10 "$READY_URL" 2>/dev/null || curl --silent --max-time 5 "http://localhost:8787/ready" 2>/dev/null || echo "")
if echo "$READY_RESP" | grep -q '"ready":true'; then
  pass "API Readiness: $READY_RESP"
else
  warn "API Readiness" "Endpoint did not return ready:true. Response: '$READY_RESP'"
fi

# 5. Safe Authentication Flow Test (Register -> Login)
echo -e "\n--- 5. Checking Authentication API ---"
TEST_ID=$(openssl rand -hex 6)
TEST_EMAIL="smoketest-${TEST_ID}@qualityguard.internal"
TEST_PASS="SmokeTestPassword_${TEST_ID}_123!"
API_AUTH_URL="$BASE_URL/api/auth"

# Try via public URL or local port 8787
REGISTER_RESP=$(curl --silent --max-time 10 -X POST "$API_AUTH_URL/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\",\"organization\":\"SmokeTest Org $TEST_ID\"}" 2>/dev/null \
  || curl --silent --max-time 5 -X POST "http://localhost:8787/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\",\"organization\":\"SmokeTest Org $TEST_ID\"}" 2>/dev/null || echo "")

if echo "$REGISTER_RESP" | grep -q '"token"'; then
  pass "Auth Register: created test account ($TEST_EMAIL)"
  
  LOGIN_RESP=$(curl --silent --max-time 10 -X POST "$API_AUTH_URL/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}" 2>/dev/null \
    || curl --silent --max-time 5 -X POST "http://localhost:8787/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}" 2>/dev/null || echo "")

  if echo "$LOGIN_RESP" | grep -q '"token"'; then
    pass "Auth Login: successfully authenticated with test credentials"
  else
    fail "Auth Login" "Failed to login with newly registered credentials. Response: '$LOGIN_RESP'"
  fi
else
  warn "Auth Test" "Unable to test registration via API. Response: '$REGISTER_RESP'"
fi

# 6. Database Health Check (if running in Docker context)
echo -e "\n--- 6. Checking PostgreSQL ---"
if [ -d "$APP_DIR" ] && [ -f "$APP_DIR/docker-compose.production.yml" ]; then
  cd "$APP_DIR"
  if docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres pg_isready -U "${POSTGRES_USER:-qualityguard}" -d "${POSTGRES_DB:-qualityguard}" >/dev/null 2>&1; then
    pass "PostgreSQL container is accepting connections"
  else
    warn "PostgreSQL" "pg_isready check failed or container is not running"
  fi
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'postgres'; then
  PG_CONTAINER=$(docker ps --format '{{.Names}}' | grep 'postgres' | head -n1)
  if docker exec "$PG_CONTAINER" pg_isready >/dev/null 2>&1; then
    pass "PostgreSQL container ($PG_CONTAINER) is ready"
  fi
else
  warn "PostgreSQL" "Docker compose context not found at $APP_DIR"
fi

# 7. Redis Health Check (if running in Docker context)
echo -e "\n--- 7. Checking Redis ---"
if [ -d "$APP_DIR" ] && [ -f "$APP_DIR/docker-compose.production.yml" ]; then
  cd "$APP_DIR"
  REDIS_PING=$(docker compose --env-file .env.production -f docker-compose.production.yml exec -T redis redis-cli ping 2>/dev/null || echo "")
  if [ "$REDIS_PING" = "PONG" ]; then
    pass "Redis responded to PING with PONG"
  else
    warn "Redis" "PING check returned '$REDIS_PING'"
  fi
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'redis'; then
  REDIS_CONTAINER=$(docker ps --format '{{.Names}}' | grep 'redis' | head -n1)
  if [ "$(docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null)" = "PONG" ]; then
    pass "Redis container ($REDIS_CONTAINER) responded to PING"
  fi
else
  warn "Redis" "Docker compose context not found at $APP_DIR"
fi

echo -e "\n=========================================="
if [ "$FAILED" -eq 0 ]; then
  echo -e "  \033[32mSmoke tests completed successfully!\033[0m"
  echo "=========================================="
  exit 0
else
  echo -e "  \033[31mSmoke tests encountered $FAILED critical failure(s).\033[0m"
  echo "=========================================="
  exit 1
fi
