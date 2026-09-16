# QualityGuard — QG-UX-001 Frontend & Contracts Audit Report

**Task:** QG-UX-001 — Findings Command Center  
**Auditor:** QualityGuard Principal Product Engineer  
**Date:** September 2026  
**Status:** Audit Complete — Ready for Implementation  

---

## 1. Executive Context & Scope

The current QualityGuard frontend (`apps/web`) provides a rich dashboard with multiple views (Overview, Architecture, Security, Findings, Dependencies, Integrity, CI/CD, Billing, Settings). However, the **Findings** view is currently rendered as a basic, flat list lacking the operational depth, triage ergonomics, visual hierarchy, and actionable intelligence expected of a professional software quality and architecture governance command center.

This audit establishes the baseline contracts, data models, API endpoints, UX deficiencies, and data boundaries to guide the construction of the **QualityGuard Findings Command Center**.

---

## 2. Current Page, Components & Architecture

### Current Page
- **Primary View:** [`apps/web/app/page.tsx`](file:///home/isabelle/teste_qualityguard/qualityguard/apps/web/app/page.tsx)
  - Navigation Tab: `Findings` (`active === 'Findings'`)
  - Supplementary Section: `Overview` Findings summary table (top 6 visible findings)

### UI Components Used
- [`apps/web/components/ui/button.tsx`](file:///home/isabelle/teste_qualityguard/qualityguard/apps/web/components/ui/button.tsx) (shadcn/ui button primitive)
- `lucide-react` icons: `AlertTriangle`, `AlertCircle`, `CheckCircle2`, `ShieldCheck`, `Search`, `Zap`, `Sparkles`, `Layers3`, `Box`, `Network`, `GitBranch`, `ExternalLink`, etc.
- Tailwind CSS with CSS Variables / Design System tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, `bg-muted`, `border-border`, etc.)

---

## 3. Existing API Endpoints & Data Ingress Contracts

All data consumed by the frontend flows through strictly typed, real API endpoints defined in [`apps/web/lib/api/`](file:///home/isabelle/teste_qualityguard/qualityguard/apps/web/lib/api/):

| Endpoint | Method | TypeScript Function | Return Type | Data Source |
| :--- | :--- | :--- | :--- | :--- |
| `/me` | `GET` | `getMe()` | `MeResponse` (`{ user, organization, projects }`) | Real Postgres / Auth Session |
| `/projects` | `GET` | `listProjects()` | `Project[]` (with `latestAnalysis`) | Real Postgres `projects` & `reviews` |
| `/projects` | `POST` | `createProject(data)` | `Project` | Real Postgres `projects` |
| `/projects/:id` | `GET` | `getProject(id)` | `Project` | Real Postgres `projects` |
| `/projects/:id` | `DELETE`| `deleteProject(id)` | `void` (204) | Real Postgres `projects` cascade |
| `/projects/:id/analyses` | `POST` | `triggerAnalysis(id, branch)` | `AnalysisJob` (202 Accepted) | Real `AnalysisQueue` & `SandboxedCloner` |
| `/analyses/:id` | `GET` | `getAnalysisJob(id)` | `AnalysisJob` | Real in-memory / DB Queue Worker |
| `/projects/:id/analyses/latest` | `GET` | `getLatestAnalysis(id)` | `Review` | Real Postgres `reviews` |
| `/projects/:id/analyses` | `GET` | `listAnalyses(id)` | `Review[]` | Real Postgres `reviews` |
| `/projects/:id/architecture` | `GET` | `getArchitecture(id)` | `ArchitectureGraph` | Real AST analyzer graph builder |
| `/projects/:id/dependencies` | `GET` | `getDependencies(id)` | `DependencyItem[]` | Real manifest extractor |
| `/projects/:id/security` | `GET` | `getSecurity(id)` | `Finding[]` | Real AST security rule engine |
| `/integrations/github/status`| `GET` | `getGitHubStatus()` | `GitHubStatus` | Real GitHub App config status |
| `/billing/subscription` | `GET` | `getBillingSubscription()`| `BillingSubscription` | Real Stripe customer/plan record |

---

## 4. TypeScript Domain Models & Representation

### 1. `Severity`
```typescript
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
```

### 2. `FindingCategory`
```typescript
export type FindingCategory =
  | 'architecture'
  | 'security'
  | 'performance'
  | 'clean_code'
  | 'testing'
  | 'dependency'
  | 'scalability'
  | 'maintainability';
```

### 3. `Finding`
```typescript
export interface Finding {
  id: string;
  severity: Severity;
  category: FindingCategory;
  status: 'open' | 'accepted' | 'resolved' | 'false_positive';
  decision: 'approve' | 'review_required' | 'block';
  file: string;
  line?: number;
  startLine?: number;
  endLine?: number;
  title: string;
  description: string;
  suggestion: string;
  confidence: number;
  source: 'deterministic' | 'ai' | 'correlated';
  ruleId?: string;
  body?: string;
  rationale?: string;
  impact?: string;
  evidence?: string[];
}
```

### 4. `Review` & `QualityGateResult`
```typescript
export interface Review {
  id: string;
  projectId: string;
  organizationId: string;
  projectName?: string;
  repository?: string;
  branch?: string;
  commitSha?: string;
  score: number;
  decision: string;
  findings: Finding[];
  analyzedFiles: number;
  architecture?: ArchitectureGraph;
  dependencies?: DependencyItem[];
  gate?: {
    passed: boolean;
    reasons: string[];
    decision: string;
  };
  categoryScores?: {
    architecture: number;
    security: number;
    testing: number | null;
    dependencies: number;
  };
  aiInsight?: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  errorMessage?: string;
  createdAt: string;
}
```

---

## 5. Data Availability Matrix

### Available from Real APIs
- `score` (0–100 calculated from weighted findings)
- `gate.passed` (boolean) & `gate.reasons` (array of blocking finding reasons or score thresholds)
- `findings` array with:
  - `id`, `severity`, `category`, `status`, `decision`
  - `file`, `line`, `startLine`, `endLine`
  - `title`, `description`, `suggestion`
  - `confidence`, `source`, `ruleId`
  - `body`, `rationale`, `impact`, `evidence`
- Repository context: `repository` (e.g. `https://github.com/akitaonrails/ai-memory.git`), `branch`, `commitSha`
- Analysis job lifecycle: `queued` ➔ `cloning` ➔ `analyzing` ➔ `completed` / `failed`

### `NOT_AVAILABLE_FROM_CURRENT_API`
The following properties do **NOT** exist in the current backend and will **NOT** be mocked or faked in runtime:
1. **Interactive Live AI Chat/Remediation Endpoint:** No streaming/interactive AI remediation endpoint currently exists at runtime. (Documented in `docs/QG-UX-001-AI-REMEDIATION.md` for future cycle).
2. **CVSS / CWE Codes:** Rule definitions do not output CVSS vector strings or numerical CWE IDs.
3. **Arbitrary "Fix Difficulty" / "Remediation Effort Minutes":** No synthetic difficulty scoring exists.
4. **Full Remote File Syntax Viewer:** Only `evidence` lines extracted during AST parsing are returned.

---

## 6. Current UX Deficiencies & Gap Analysis

1. **Flat, Unranked Presentation:** Findings are rendered as an unranked list without highlighting the top 5 urgent blockers.
2. **Missing Quality Summary & Quality Gate Block:** Quality score and Quality Gate status (Passed vs Failed with blocking reasons) are separated from the findings triage view.
3. **Rudimentary Search Only:** Filter bar only supports raw text matching; missing dedicated filters for Severity (`Critical`, `High`, `Medium`, `Low`), Category, Rule ID, and File.
4. **No Grouping Mechanisms:** Users cannot group findings by Severity, Category, Rule ID, or File.
5. **No Detail Drawer / Inspection Panel:** Findings cannot be opened into a focused inspection modal/drawer showing full evidence, source, rationale, and metadata.
6. **No Deterministic GitHub Deep-linking:** Missing `Open in GitHub` action that constructs direct URLs (`https://github.com/{owner}/{repo}/blob/{commit}/{file}#L{line}`) when commit SHA, repository, file, and line are present.
7. **Generic Empty & Error States:** Does not differentiate between "No analysis run yet", "Analysis currently running (cloning/analyzing)", "No findings in codebase", and "No findings matching active filters".
8. **Inconsistent Filter Counters:** The view does not show `X findings filtered from Y total`.

---

## 7. Audit Conclusion & Implementation Blueprint

All required data structures are already provided by `@qualityguard/domain`, `@qualityguard/analyzer`, and Fastify/Postgres APIs. The **Findings Command Center** can be implemented cleanly, 100% powered by real backend data with zero runtime mocks.
