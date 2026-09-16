# QualityGuard — Core User Journeys & Verification Pipeline

This document outlines the core end-to-end user journeys supported by QualityGuard, detailing every step across UI, API, Domain, Service, Persistence, and Automated Tests.

---

## Journey 1: User Registration & Authentication

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant UI as apps/web
    participant API as apps/api
    participant DB as Postgres/MemoryStore

    Dev->>UI: Fills Registration Modal (Email, Password, Org)
    UI->>API: POST /api/auth/register
    API->>API: Hashes password with scryptSync + Generates JWT
    API->>DB: Stores User and Organization records
    API-->>UI: Returns { token, user, organization }
    UI->>UI: Stores JWT in memory/localStorage & sets authenticated session
    UI-->>Dev: Transitions to authenticated Workspace Dashboard
```

- **UI**: `apps/web/app/page.tsx` (`AuthModal`, `register()`, `login()`)
- **API**: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/me`
- **Domain**: `User`, `Organization`
- **Service**: `apps/api/src/auth.ts` (`hashPassword`, `verifyPassword`, `signToken`, `verifyToken`)
- **Persistence**: `store.createUser()`, `store.createOrganization()`
- **Tests**: `apps/api/src/auth.test.ts`, `apps/web/lib/api/api.test.ts`
- **Status**: **VERIFIED (PASS)**

---

## Journey 2: Project Creation & Repository Binding

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant UI as apps/web
    participant API as apps/api
    participant DB as Postgres/MemoryStore

    Dev->>UI: Clicks "Add Project" & Enters (Name, Repo URL, Branch)
    UI->>API: POST /api/projects with Bearer JWT
    API->>API: Validates repo string format & sanitizes branch
    API->>DB: Persists new Project bound to Organization
    API-->>UI: Returns 201 Created { id, name, repository, branch }
    UI->>UI: Updates projects list & selects active project
    UI-->>Dev: Shows active project banner and enables "Analyze repository"
```

- **UI**: `apps/web/app/page.tsx` (`Add Project Modal`, `createProject()`)
- **API**: `POST /api/projects`, `GET /api/projects`
- **Domain**: `Project`
- **Service**: `apps/api/src/server.ts`
- **Persistence**: `store.createProject()`, `store.listProjects()`
- **Tests**: `apps/web/lib/api/api.test.ts`, `apps/api/src/e2e.test.ts`
- **Status**: **VERIFIED (PASS)**

---

## Journey 3: Real Repository Analysis Execution & Quality Gate

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant UI as apps/web
    participant API as apps/api
    participant Git as Git Cloner
    participant Engine as @qualityguard/analyzer
    participant Arch as @qualityguard/architecture
    participant DB as Postgres/MemoryStore

    Dev->>UI: Clicks "Analyze repository"
    UI->>API: POST /api/projects/:id/analyses { branch }
    API->>Git: Clones repository (e.g. akitaonrails/ai-memory branch release/2.2)
    API->>Engine: Collects source files (.ts, .rs, .py, etc.) & executes 6 deterministic rules
    API->>Arch: Parses imports/use statements, builds dependency graph & detects circular cycles
    API->>API: Parses Cargo.toml / package.json for manifest dependencies
    API->>Engine: Computes composite Quality Score (0-100) & evaluates Quality Gate
    API->>DB: Stores complete Review record
    API-->>UI: Returns complete Review payload
    UI->>UI: Re-renders Dashboard (ScoreRing, Findings, Architecture, Dependencies, Gate)
    UI-->>Dev: Displays live inspection results with zero mock data
```

- **UI**: `apps/web/app/page.tsx` (`handleRunAnalysis`, ScoreRing, MetricCards)
- **API**: `POST /api/projects/:id/analyses`
- **Domain**: `ReviewResult`, `Finding`, `Severity`, `ReviewDecision`, `ArchitectureGraph`
- **Service**: `apps/api/src/analysis.ts` (`runRepositoryAnalysis()`)
- **Persistence**: `store.createReview()`, `store.getLatestReviewByProject()`
- **Tests**: `apps/api/src/e2e.test.ts` (tested with real `akitaonrails/ai-memory`), `packages/analyzer/src/analyzer.test.ts`
- **Status**: **VERIFIED (PASS)**

---

## Journey 4: CLI Local Scanning (`qualityguard`)

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant CLI as apps/cli
    participant Engine as @qualityguard/analyzer

    Dev->>CLI: qualityguard check . --json
    CLI->>CLI: Collects local source files (ignoring node_modules, .git)
    CLI->>Engine: Analyzes files against configured policy rules
    CLI->>Engine: Evaluates quality gate against minimum score threshold
    CLI-->>Dev: Prints formatted JSON result & exits with code 0 (Pass) or 1 (Fail)
```

- **CLI**: `apps/cli/src/index.ts`
- **Domain**: `ReviewResult`, `Finding`
- **Service**: `apps/cli/src/index.ts` (`runAnalysis()`, `collectFiles()`)
- **Persistence**: `.qualityguard-baseline.json` (optional baseline)
- **Tests**: `apps/cli/src/cli.test.ts`, `apps/cli/src/git.test.ts`
- **Status**: **VERIFIED (PASS)**
