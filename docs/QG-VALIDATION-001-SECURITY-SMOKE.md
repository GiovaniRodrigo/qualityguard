# QG-VALIDATION-001 — Security & Isolation Smoke Test Report

**Date:** 2026-09-15  
**Role:** QA / Security & Release Engineer  
**Status:** ALL SECURITY CHECKS PASSED (100%)  
**Environment:** Local Docker Production Stack (PostgreSQL 16, Redis 7, Node.js API)  

---

## 1. Security Scope & Objectives

The purpose of this audit was to execute active penetration probes and boundary tests against the QualityGuard production stack to verify:
1. Multi-tenant data segregation (zero cross-tenant data leaks).
2. Protection against Command Injection, Shell Metacharacters, and Path Traversal in repository URLs and branch arguments.
3. Git Sandbox defenses against unauthorized protocols (`file://`, `ftp://`, submodules).
4. Secret redaction before passing source code context into AI prompt engines or streaming SSE responses.
5. AI Rate Limiting and denial-of-service protections.

---

## 2. Security Test Matrix & Verification Results

| Security Check / Test Case | Probe Payload / Action | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Cross-Tenant Project Isolation** | Tenant B requests `GET /projects/:id` of Tenant A | `404 Not Found` | `404 Not Found` (0 bytes leaked) | **PASS** |
| **Cross-Tenant Analysis Isolation** | Tenant B requests `GET /analyses/:id` of Tenant A | `404 Not Found` | `404 Not Found` | **PASS** |
| **Cross-Tenant Rule Isolation** | Tenant B requests `GET /projects/:id/architecture-rules/:ruleId` | `404 Not Found` | `404 Not Found` | **PASS** |
| **Cross-Tenant AI Remediation** | Tenant B requests `POST /findings/:id/remediate` with Tenant A's finding ID | `404 Not Found` | `404 Not Found` | **PASS** |
| **Unauthenticated API Access** | Request `/me`, `/projects`, `/analyses` without Bearer token | `401 Unauthorized` | `401 Unauthorized` | **PASS** |
| **Invalid Credentials Defense** | Login with invalid bcrypt hash mismatch | `401 Unauthorized` | `401 Unauthorized` | **PASS** |
| **Git Protocol Hijack (`file://`)**| Enqueue clone of `file:///etc/passwd` | Async worker fails job safely with validation error | `status: failed`, error: `Disallowed repository URL protocol (only HTTPS supported)` | **PASS** |
| **Branch Command Injection** | Enqueue clone with branch `release/2.2; rm -rf /` | Async worker rejects shell metacharacters | `status: failed`, error: `Branch name contains disallowed metacharacters` | **PASS** |
| **Branch Path Traversal** | Enqueue clone with branch `../../etc/passwd` | Async worker rejects traversal sequences | `status: failed`, error: `Branch name cannot contain path traversal sequences (..)` | **PASS** |
| **Repository Size Quota** | Clone size exceeding 50 MB threshold | Sandboxed cloner aborts and cleans workspace | `RepositorySizeLimitError` triggered; disk cleaned | **PASS** |
| **Clone Execution Hard Timeout** | Clone hanging beyond 45,000ms | SIGKILL issued; temporary directory deleted | `RepositoryCloneTimeoutError` triggered | **PASS** |
| **Sensitive Secret Redaction** | Code context with PATs, AWS keys, JWTs passed to AI | Regex redaction replaces tokens with `[REDACTED_SECRET]` | `redacted: true`, all tokens masked | **PASS** |
| **AI Rate Limiting** | Rapid bursts exceeding organization limit | Returns HTTP 429 + `Retry-After: 60` | `429 Too Many Requests` returned | **PASS** |

---

## 3. Sandboxed Cloner Deep-Dive Evidence

The `SandboxedRepositoryCloner` enforces the following defense-in-depth parameters during git execution:

```typescript
const gitArgs = [
  '-c', 'protocol.file.allow=never',
  '-c', 'submodule.recurse=false',
  'clone',
  '--depth', '1',
  '--no-tags',
  '--recurse-submodules=no',
  '--branch', validBranch,
  '--', validUrl, workspacePath
];
```

### Observed Execution Log from Live Security Probe:
```
[Security Probe] Enqueuing file:// repository: "file:///etc/passwd"
-> API accepted into queue (202 Accepted)
-> Worker picked up job
-> SandboxedRepositoryCloner.validateRepositoryUrl rejected protocol: "file:"
-> Job updated in PostgreSQL to status="failed", error="Disallowed repository URL protocol (only HTTPS supported)"
-> Temporary directory cleaned up: 0 residual artifacts in /tmp/qualityguard

[Security Probe] Enqueuing branch with command injection: "release/2.2; rm -rf /"
-> API accepted into queue (202 Accepted)
-> Worker picked up job
-> SandboxedRepositoryCloner.validateBranch rejected metacharacter: ";"
-> Job updated in PostgreSQL to status="failed", error="Branch name contains disallowed metacharacters"
-> No subshell spawned, zero execution risk
```

---

## 4. AI Context Sanitization & Secret Redaction

Before AI remediation streaming begins, `buildRemediationPrompt` executes automated pattern matching against known credential syntaxes:
- GitHub Personal Access Tokens (`ghp_`, `gho_`, `github_pat_`)
- OpenAI API Keys (`sk-[a-zA-Z0-9]{20,}`)
- AWS Access Key IDs (`AKIA[0-9A-Z]{16}`)
- Generic Private Keys (`-----BEGIN RSA PRIVATE KEY-----`)
- Bearer tokens and JWTs

Any match is replaced with `[REDACTED_SECRET]` before transmission to the AI provider, preventing accidental credential exfiltration via prompt leakage.
