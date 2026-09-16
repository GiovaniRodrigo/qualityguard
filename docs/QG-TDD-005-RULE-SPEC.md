# QualityGuard Architecture Governance Engine — Rule Specification

This document provides the formal rule specification, AST evaluation contracts, pattern syntax, and mathematical definitions for the **Custom Architecture Governance Rule Engine** (`QG-TDD-005`).

---

## 1. Architectural Philosophy & Guarantees

1. **100% Deterministic**: Every rule is executed directly over the static `ArchitectureGraph` constructed by AST and manifest parsers. Zero probabilistic AI inference is involved in rule evaluation.
2. **Safe Pattern Matching**: Glob matching uses standard sanitized path globbing (`*`, `**`, `?`) converted to anchored regular expressions. No `eval()`, `Function()`, or arbitrary code execution is permitted.
3. **Multi-Tenant Isolation**: Rules are strictly scoped to a single `projectId` and `organizationId`. Tenancy verification is enforced at the database and API authorization layers.
4. **Zero Mocks / Real Runtime Persistence**: Rules are stored in PostgreSQL (`architecture_rules` table) and loaded per project during branch analysis and GitHub PR check runs.
5. **Quality Gate Integration**: Generated findings directly reduce project/architecture scores and trigger Quality Gate blocking (`decision: 'block'` or `decision: 'review_required'`).

---

## 2. Supported Rule Types & Schemas

### 2.1 `forbidden_dependency`
Prevents any module matching the `from` pattern from importing modules matching the `to` pattern(s).

- **Rule Type**: `'forbidden_dependency'`
- **Configuration Schema**:
  ```typescript
  interface ForbiddenDependencyConfig {
    from: string; // e.g. "packages/ui/**" or "src/presentation/**"
    to: string | string[]; // e.g. "packages/database/**" or ["packages/db/**", "src/infra/**"]
  }
  ```
- **Evaluation Logic**:
  For each directed edge `(u, v)` in `ArchitectureGraph.edges`:
  If `matchPattern(u, config.from)` AND `matchPattern(v, target)` for any target in `config.to`:
  ➔ Flag finding with `ruleId: 'custom/forbidden_dependency'`.

---

### 2.2 `allowed_dependency`
Enforces a whitelist model: modules matching `from` are strictly constrained to import *only* modules matching one of the whitelisted patterns in `only`.

- **Rule Type**: `'allowed_dependency'`
- **Configuration Schema**:
  ```typescript
  interface AllowedDependencyConfig {
    from: string; // e.g. "apps/web/**"
    only: string[]; // e.g. ["packages/domain/**", "packages/shared/**"]
  }
  ```
- **Evaluation Logic**:
  For each directed edge `(u, v)` in `ArchitectureGraph.edges`:
  If `matchPattern(u, config.from)` AND `!config.only.some(pattern => matchPattern(v, pattern))`:
  ➔ Flag finding with `ruleId: 'custom/allowed_dependency'`.

---

### 2.3 `forbidden_path_dependency`
Prevents cross-layer or cross-directory file path imports between arbitrary glob expressions.

- **Rule Type**: `'forbidden_path_dependency'`
- **Configuration Schema**:
  ```typescript
  interface ForbiddenPathDependencyConfig {
    fromPattern: string; // e.g. "src/presentation/**"
    toPattern: string;   // e.g. "src/infrastructure/**"
  }
  ```
- **Evaluation Logic**:
  For each directed edge `(u, v)` in `ArchitectureGraph.edges`:
  If `matchPattern(u, config.fromPattern)` AND `matchPattern(v, config.toPattern)`:
  ➔ Flag finding with `ruleId: 'custom/forbidden_path_dependency'`.

---

### 2.4 `no_cycles`
Detects and rejects circular dependency cycles in the module graph, with project-level configurable severity.

- **Rule Type**: `'no_cycles'`
- **Configuration Schema**:
  ```typescript
  interface NoCyclesConfig {} // Empty object or optional depth constraints
  ```
- **Evaluation Logic**:
  Evaluates `ArchitectureGraph.cycles` using Johnson's / Tarjan's cycle algorithm with canonical vertex deduplication:
  For each unique cycle `[v1, v2, ..., vk, v1]`:
  ➔ Flag finding on `v1` with `ruleId: 'custom/no_cycles'`.

---

### 2.5 `required_layer`
Enforces a strict hierarchical layering architecture (e.g. Onion, Clean Architecture, or Hexagonal Architecture).

- **Rule Type**: `'required_layer'`
- **Configuration Schema**:
  ```typescript
  interface RequiredLayerConfig {
    layers: string[]; // e.g. ["domain", "application", "infrastructure", "presentation"] (Top -> Bottom)
    strictAdjacentOnly?: boolean; // If true, layer i can only call layer i+1, not i+2 or higher
  }
  ```
- **Evaluation Logic**:
  Given ordered layers $L_0, L_1, \dots, L_{n-1}$:
  For each directed edge `(u, v)`:
  Find index $i = \text{layerIndex}(u)$ and $j = \text{layerIndex}(v)$.
  - **Upward Dependency Violation**: If $j < i$ (lower layer depends on upper layer) ➔ Violation!
  - **Non-adjacent Violation**: If `strictAdjacentOnly === true` and $j > i + 1$ (skipping intermediate layers) ➔ Violation!

---

## 3. Pattern Matching Grammar & Safety

Pattern matching converts globs to safe RegExp strings:
- `**` matches any characters across directories (`.*`).
- `*` matches any characters within a single path segment (`[^/]*`).
- `?` matches a single character (`[^/]`).
- Escapes special RegExp characters (`.`, `+`, `^`, `$`, `(`, `)`, `[`, `]`, `{`, `}`, `|`, `\`).

Zero ReDoS vulnerabilities: Patterns are anchored (`^...$`) and evaluated linearly over finite graph edges.
