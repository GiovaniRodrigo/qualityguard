# QualityGuard — QG-PROD-002: Production Smoke Test Execution Log

**Execution Date**: September 15, 2026  
**Environment**: Production Container Stack (`qualityguard-caddy-1`, `qualityguard-web-1`, `qualityguard-api-1`, `qualityguard-postgres-1`, `qualityguard-redis-1`)  
**Host & Domain**: `2.25.92.154` / `qualityguard.gfcode.com.br`  

---

## 1. Public & Network Smoke Test Suite

| Test ID | Test Description | Target / Command | Expected Result | Actual Result | Status |
|---|---|---|---|---|:---:|
| **SMOKE-01** | DNS A-Record Lookup | `dig qualityguard.gfcode.com.br` | `2.25.92.154` | `2.25.92.154` | **PASS** |
| **SMOKE-02** | External WAN HTTPS Probe | `curl -Iv https://2.25.92.154` | Connection open | Timed out (Firewall blocked) | **BLOCKED** |
| **SMOKE-03** | Host HTTP Port 80 Redirect | `curl -i -H "Host: qualityguard.gfcode.com.br" http://127.0.0.1/health` | `HTTP/1.1 308 Permanent Redirect` | `HTTP/1.1 308 Permanent Redirect` (`Location: https://...`) | **PASS** |
| **SMOKE-04** | Private Port Boundary Check | `ss -lntp` / Docker port bindings | Only ports 80/443 bound to 0.0.0.0 | Ports 5432, 6379, 8787, 3000 strictly internal | **PASS** |

---

## 2. Container Health & Readiness Suite

| Test ID | Test Description | Target / Command | Expected Result | Actual Result | Status |
|---|---|---|---|---|:---:|
| **SMOKE-05** | API `/health` Endpoint | `GET /health` | `200 OK` with database probe | `{"ok":true,"service":"qualityguard-api","version":"0.3.0","database":true}` | **PASS** |
| **SMOKE-06** | API `/ready` Endpoint | `GET /ready` | `200 OK` readiness status | `{"ready":true,"database":true}` | **PASS** |
| **SMOKE-07** | Web SSR HTML Render | `GET http://127.0.0.1:3000` | HTTP 200 with HTML doc | Full SSR HTML rendered with title and styles | **PASS** |
| **SMOKE-08** | PostgreSQL Migrations | `pg_advisory_lock` in startup | Migrations applied cleanly | Migrations `001_initial.sql` & `002_coverage.sql` applied | **PASS** |
| **SMOKE-09** | Redis TCP Health | `PING` inside Redis container | `PONG` | `PONG` | **PASS** |

---

## 3. End-to-End User Flow & Business Logic Suite

### Step 1: User Registration & Token Issuance
- **Request**: `POST /auth/register` with `{ email: "prod-audit-...@qualityguard.io", password: "Password123!" }`
- **Response**: `HTTP 201 Created`
- **Output Token**: Valid HMAC-SHA256 JWT received.
- **Verification**: `GET /me` with `Bearer <token>` returned user profile and organization ID.

### Step 2: Project Creation
- **Request**: `POST /projects` with `{ name: "ai-memory", repository: "https://github.com/akitaonrails/ai-memory.git", branch: "release/2.2" }`
- **Response**: `HTTP 201 Created`
- **Output Project ID**: `82ce2f19-466f-47d5-9dea-495aa0a582c0`

### Step 3: Real Repository Analysis Execution
- **Request**: `POST /projects/82ce2f19-466f-47d5-9dea-495aa0a582c0/analyses` with `{ branch: "release/2.2" }`
- **Response**: `HTTP 202 Accepted`, Analysis ID `57eb9326-f8c2-4d53-bdc7-c527a87ea038`
- **Polling Progression**:
  - Polling Attempt 1: `status: cloning`, `progress: 20`
  - Polling Attempt 2: `status: cloning`, `progress: 20`
  - Polling Attempt 3: `status: cloning`, `progress: 20`
  - Polling Attempt 4: `status: completed`, `progress: 100`
- **Metrics Collected**:
  - **Commit SHA**: `00fb4d95a1a113e7136225fc2925486c7a46dd63`
  - **Total Findings Detected**: `155`
  - **Sample Finding Detected**:
    ```json
    {
      "severity": "critical",
      "category": "security",
      "status": "open",
      "decision": "block",
      "title": "Potential hardcoded secret",
      "description": "A credential-like value appears to be embedded directly in source code.",
      "ruleId": "security.hardcoded-secret",
      "file": "companions/ai-memory-importer/src/main.rs",
      "line": 1657,
      "source": "deterministic"
    }
    ```

### Step 4: Real LCOV Coverage Ingestion
- **Request**: `POST /projects/82ce2f19-466f-47d5-9dea-495aa0a582c0/coverage` with raw LCOV format payload.
- **Response**: `HTTP 201 Created`, `{ lines: { total: 120, covered: 101, percentage: 84.17 } }`
- **Persistence**: Persisted in PostgreSQL table `coverage_reports` and queryable via `GET /projects/:id/coverage`.

### Step 5: Streaming AI Remediation with Secret Scrubbing
- **Request**: `POST /findings/security.hardcoded-secret-companions_ai-memory-importer_src_main_rs-1657/remediate`
- **Response**: `HTTP 200 OK`, `Content-Type: text/event-stream; charset=utf-8`
- **SSE Events Streamed**:
  ```
  event: start
  data: {"findingId":"...","provider":"offline","wasLimited":false,"redacted":true,"limitReasons":[]}

  event: chunk
  data: {"text":"### Problem Explanation\n\nThe static security analyzer detected potential credential..."}

  event: done
  data: {"durationMs":2,"completed":true}
  ```
- **Redaction Verification**: Secret values replaced with `[REDACTED_SECRET]` during streaming.

---

## 4. Security & Isolation Smoke Test Suite

| Test ID | Test Description | Command / Endpoint | Expected Behavior | Actual Behavior | Status |
|---|---|---|---|---|:---:|
| **SEC-01** | Unauthenticated Access | `GET /projects` without Bearer token | `401 Unauthorized` | `401 Unauthorized` | **PASS** |
| **SEC-02** | Cross-Tenant Project Isolation | Tenant B attempts `GET /projects/:tenantAProjectId` | `404 Not Found` | `404 Not Found` | **PASS** |
| **SEC-03** | Forged GitHub Webhook HMAC | `POST /webhooks/github` with bad `x-hub-signature-256` | `401 Unauthorized` | `401 Unauthorized` | **PASS** |
| **SEC-04** | Invalid Stripe Webhook Signature | `POST /webhooks/stripe` with bad signature header | `400 Bad Request` | `400 Bad Request` | **PASS** |
| **SEC-05** | SQL Injection in Search Filters | Malicious strings in query parameters | Prepared statements reject / escape | No SQL syntax error; 0 leaks | **PASS** |

---

## 5. Persistence & Recovery Smoke Test Suite

| Test ID | Test Description | Action | Verification | Status |
|---|---|---|---|:---:|
| **REC-01** | PostgreSQL Container Restart | `docker restart qualityguard-postgres-1` | Data persists; API re-establishes pool connections | **PASS** |
| **REC-02** | Redis Container Restart | `docker restart qualityguard-redis-1` | AOF log loaded; data intact | **PASS** |
| **REC-03** | Database Backup & Restore | `pg_dump` ➔ `pg_restore` on `qualityguard_restore_test` | All tables, indices, and rows restored identically | **PASS** |

---

## 6. Smoke Test Summary

- **Total Checks Executed**: 19
- **Passed**: 18
- **Blocked**: 1 (External WAN HTTPS Ingress due to VPS hosting firewall)
- **Local Application Stack Status**: **100% OPERATIONAL & VERIFIED**
