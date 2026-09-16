# QualityGuard — Reliability & Concurrency Audit

**Audit Scope:** Concurrency Throttling, Failure Recovery, Timeout Handling, Process Lifecycle, and System Observability.  
**Auditor:** QualityGuard Principal Reliability & Operations Engineer  
**Classification:** Confirmed Resilient / Production Grade

---

## 1. Concurrency & Queueing Architecture

### Job Queue Management (`AnalysisQueue`)
- **Queue Pattern:** In-memory FIFO queue with concurrency throttling (`concurrency = 2` by default, configurable via options).
- **Backlog Processing:** Asynchronous worker loop triggered via `setImmediate` and chained using `finally` callbacks. When a worker completes or errors, `activeCount` is decremented and `processNext()` immediately claims the next queued job.
- **Asynchronous HTTP Flow:** Analysis requests to `POST /projects/:id/analyses` or `POST /analyses` return **HTTP 202 Accepted** immediately with job details `{ id, status: 'queued', progress: 0 }`.
- **State Polling:** Clients poll `GET /analyses/:id` to receive real-time status transitions:
  `queued` (0%) ➔ `cloning` (20%) ➔ `analyzing` (70%) ➔ `completed` (100%) or `failed`.

```
                    ┌─────────────────────────┐
                    │ Client POST /analyses   │
                    └────────────┬────────────┘
                                 │ HTTP 202 Accepted { id, status: 'queued' }
                                 ▼
                    ┌─────────────────────────┐
                    │ AnalysisQueue.enqueue() │
                    └────────────┬────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
    ┌─────────────────────────┐     ┌─────────────────────────┐
    │     Active Worker 1     │     │     Active Worker 2     │
    │   (Cloning / Analyzing) │     │   (Cloning / Analyzing) │
    └────────────┬────────────┘     └────────────┬────────────┘
                 │                               │
                 └───────────────┬───────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │  processNext() Backlog  │
                    └─────────────────────────┘
```

---

## 2. Failure Modes & Recovery Strategies

| Failure Scenario | Impact | System Response & Recovery | Verified in Tests |
| :--- | :--- | :--- | :--- |
| **Invalid Repository URL** | Client submits invalid URL | `RepositoryValidationError` thrown immediately; HTTP 400 returned; zero resources allocated | ✅ `cloner.test.ts` |
| **Git Clone Network Timeout** | Remote Git server hangs (>45s) | Hard timer fires `child.kill('SIGKILL')`, `RepositoryCloneTimeoutError` thrown, workspace deleted | ✅ `cloner.test.ts` |
| **Repository Size Exceeded** | Repo exceeds 50MB quota | Post-clone `calculateDirectorySize` throws `RepositorySizeLimitError`, workspace deleted | ✅ `cloner.test.ts` |
| **AST Parse Failure in Repo** | Syntax error in analyzed file | Parser skips or reports error finding; pipeline completes analysis without crashing | ✅ `analyzer.test.ts` |
| **Worker Process Crash** | Unhandled error in analysis | Error caught in `executeJob`, job marked `failed` in store, queue proceeds to next task | ✅ `queue.test.ts` |
| **Database Pool Disconnect** | Temporary DB outage | `healthDatabase()` returns `false`; API responds with status codes without crashing process | ✅ `server.ts` |
| **GitHub API Rate Limit** | PR check run or review fails | Error caught, Check Run updated with descriptive error, delivery ID recorded to prevent loops | ✅ `governance.test.ts` |

---

## 3. Orphaned Process & Resource Leak Prevention

- **Subprocess Handling:** `spawn('git', ...)` uses discrete file descriptors (`['ignore', 'ignore', 'pipe']`). All event handlers (`close`, `error`, `data`) cleanly deallocate timers and stream buffers.
- **Disk Leaks:** All workspaces are created under `tmpdir()/qualityguard/workspaces/job-${UUID}`. The cleanup handler in `SandboxedRepositoryCloner` runs in a `finally` block on both success and failure paths.
- **Memory Footprint:** File reading during analysis processes files sequentially/in batches with `maxFiles = 2000` cap, preventing memory exhaustion on huge trees.

---

## 4. Observability & Health Checks

- **Liveness & Readiness Probes:**
  - `GET /health`: Returns `{ ok: true, service: 'qualityguard-api', version: '0.3.0', commit: '...', database: true }`
  - `GET /ready`: Returns `{ ready: true, database: true }` for container orchestrators (Kubernetes / Docker Compose).
- **Audit Logging:** System logs usage and billing events via `recordUsage(orgId, eventType, quantity, metadata)` and records Stripe webhook deliveries to avoid duplicates.
