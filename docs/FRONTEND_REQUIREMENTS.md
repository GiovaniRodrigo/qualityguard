# QualityGuard — Frontend Architecture & Requirements Specification

This document provides a comprehensive audit and specification of the frontend application (`apps/web`), detailing every visual element, user interaction, UI promise, and state transition against the backend system.

---

## 1. Structure & Routing Architecture

### 1.1 Routes
- `/` (App Root Page `apps/web/app/page.tsx`): Primary single-page application dashboard housing all operational views via reactive tab switching.
- `/api/[...path]` (`apps/web/app/api/[...path]/route.ts`): Unified Next.js API catch-all route handler that dynamically routes requests to the external backend service (`http://127.0.0.1:8787` or `http://api:8787`) with fallback execution for standalone dev mode.

### 1.2 Layout & Styling
- `app/layout.tsx`: Root HTML layout with `Inter` and `JetBrains Mono` font configurations, responsive meta tags, and global CSS imports.
- `app/globals.css`: Tailwind CSS v4 configured with standardized CSS variables for light/dark mode, border radiuses, and semantic design tokens.
- `components/ui/button.tsx`: Polymorphic button component with variants (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`) and sizes (`default`, `sm`, `lg`, `icon`).

---

## 2. Navigation & View Inventory

### 2.1 Primary Navigation (Workspace)
1. **Dashboard** (`active === 'Dashboard'`):
   - **Quality Overview Card**: Displays the dynamic SVG `ScoreRing` (0–100), overall quality gate status badge, file count, and category progress bars (Architecture, Security, Testing, Dependencies).
   - **Quality Intelligence Card**: High-contrast card displaying AI-assisted remediation insights generated from real analysis findings.
   - **Metric Cards (4x)**: Open findings, Architecture score, Test coverage status, and Extracted manifest dependencies count.
   - **Recent Analyses Table**: List of recent review jobs with timestamps, branch tags, quality scores, and gate decisions.
   - **Findings by Severity**: Visual distribution bar (Critical, High, Medium, Low) and quick-action navigation.
   - **Latest Findings Table**: Interactive findings list showing rule IDs, file locations, titles, descriptions, and statuses.

2. **Projetos** (`active === 'Projetos'`):
   - Project list showing name, repository URL, branch, creation date, active selection badge, and delete project action.
   - "Add Project" trigger button.

3. **Análises** (`active === 'Análises'`):
   - Complete historical analysis records with commit SHAs, file counts, finding tallies, and gate verdicts.

4. **Findings** (`active === 'Findings'`):
   - Comprehensive findings explorer with search query filtering, rule tags, file line links, remediation suggestions, and concrete code evidence snippets.

5. **Architecture** (`active === 'Architecture'`):
   - Architecture module coupling metrics: Analyzed modules count, Dependency edges count, and Circular dependency cycle count.
   - Cycle Alert box: Explicit visualization of circular dependency paths (`A ➔ B ➔ C ➔ A`).

6. **Security** (`active === 'Security'`):
   - Dedicated security and credential exposure view listing detected hardcoded secrets, SQL injection risks, and specific code line references.

7. **Dependencies** (`active === 'Dependencies'`):
   - Tabular manifest of extracted package dependencies (Cargo.toml crates and package.json modules) with names, versions, and types (`dependency`, `devDependency`, `buildDependency`).

8. **Quality Gates** (`active === 'Quality Gates'`):
   - Gate evaluation summary (PASSED vs BLOCKED) with explicit policy threshold descriptions (Minimum Score 80) and granular blocking violation reasons.

### 2.2 Secondary Navigation (Manage)
1. **Settings** (`active === 'Settings'`):
   - Workspace profile (Org Name, Org ID, User Email, User Role) and Default Quality Gate Policy configuration cards.
2. **Integrações** (`active === 'Integrações'`):
   - GitHub App status card showing connection state, App ID, and webhook connectivity.
3. **Billing** (`active === 'Billing'`):
   - Subscription plan card showing active tier (`community`, `pro`, `team`, `enterprise`) and Stripe subscription status.

---

## 3. UI Promises vs. Actual Capabilities

| UI Element / Promise | Visual Representation | Actual System Capability | Status & Handling |
|---|---|---|---|
| **Quality Score** | Circular SVG gauge with score (0–100) | `packages/analyzer` deducts points based on open findings severity | **REAL**: Backed by `calculateScore()` |
| **Open Findings** | Count & list of severity cards | Deterministic regex/AST rules inspect actual source files | **REAL**: Backed by `analyze()` & `rules.ts` |
| **Architecture Cycles** | Count & cycle paths list | `packages/architecture` builds module graph & runs cycle detection | **REAL**: Backed by `detectCycles()` |
| **Dependencies Table** | Manifest package list | `apps/api/src/analysis.ts` parses `Cargo.toml` & `package.json` | **REAL**: Backed by manifest extractors |
| **Test Coverage** | Metric Card | Static analysis cannot measure runtime execution coverage | **HONEST STATE**: Displays `"Coverage data unavailable"` (Zero fake percentages) |
| **AI Intelligence** | Summary insight banner | `packages/ai` prompt builder or structured rule remediation summary | **REAL**: Backed by AI provider / rule aggregation |
| **GitHub Status** | Connected / Not Configured badge | `integrations/github` verifies App credentials in environment | **REAL**: Backed by `/api/integrations/github/status` |
| **Billing Plan** | Community / Pro badge | `apps/api/src/billing.ts` syncs Stripe customer and tier | **REAL**: Backed by `/api/billing/subscription` |

---

## 4. State Handling Matrix

Every view in `apps/web` is designed with four distinct states:

1. **Loading State**:
   - `loading === true`: Disables action buttons and presents responsive skeleton loaders or progress spinners (`RefreshCw className="animate-spin"`).
2. **Empty State**:
   - When no projects exist: Displays `Box` icon empty card prompting `"Add your first project"`.
   - When no analysis exists: Displays `"No analysis available yet"` card with direct `"Run your first analysis"` trigger.
   - When no findings exist: Displays `"No findings found matching criteria"`.
3. **Error State**:
   - Global alert banner (`globalError`) with explicit error messages and dismiss action.
   - Inline form error alerts (`authError`, `projectCreateError`).
4. **Real Data State**:
   - Renders 100% real domain models without synthetic placeholders.
