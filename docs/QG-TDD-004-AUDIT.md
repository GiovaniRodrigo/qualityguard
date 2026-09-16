# QualityGuard — QG-TDD-004 Multi-Language Manifest Extractors Audit

**Task:** QG-TDD-004 — Multi-Language Manifest Extractors (Python, Go, Java, Rust)  
**Auditor:** QualityGuard Principal Software Engineer  
**Date:** September 2026  
**Status:** Audit Complete — Ready for RED Test Phase  

---

## 1. Executive Context & Scope

QualityGuard's core static analysis engine currently extracts software dependency manifests during repository scans to populate project inventory, detect vulnerable packages, and evaluate architectural dependencies.

Historically, dependency extraction was implemented as a localized helper function inside `apps/api/src/analysis.ts` supporting only `package.json` (Node.js/npm) and basic `Cargo.toml` (Rust).

This milestone (`QG-TDD-004`) extends manifest extraction into a first-class, modular component within `@qualityguard/analyzer` and `@qualityguard/domain`, introducing robust parsers for:
1. **Python**: `requirements.txt` (PEP 508 / pip) and `pyproject.toml` (PEP 621 / Poetry / Flit)
2. **Go**: `go.mod` (Go Modules format with single/block `require`, `// indirect`, `replace`, `exclude`)
3. **Java**: `pom.xml` (Maven Project Object Model with `groupId:artifactId`, `${property}` version interpolation, scopes)
4. **Rust**: `Cargo.toml` (Cargo crates with inline tables, workspace inheritance, features, and `optional`)
5. **Node.js**: `package.json` (npm / pnpm / yarn dependencies, devDependencies, peerDependencies)

---

## 2. Normalized Domain Model Contract

The normalized domain contract in `@qualityguard/domain` is unified without creating parallel language-specific types:

```typescript
export type DependencyType =
  | 'dependency'
  | 'devDependency'
  | 'buildDependency'
  | 'optionalDependency'
  | 'peerDependency'
  | 'testDependency';

export interface DependencyItem {
  /** Normalized package or module identifier (e.g. 'fastapi', 'github.com/gin-gonic/gin', 'org.springframework:spring-core', 'tokio') */
  name: string;
  /** Declared version constraint string (e.g. '^1.0.0', '>=0.115.0', 'v1.10.0', '3.3.0') */
  version?: string | undefined;
  /** Standard ecosystem identifier ('npm' | 'python' | 'go' | 'maven' | 'cargo') */
  ecosystem: string;
  /** Relative manifest file path (e.g. 'requirements.txt', 'pyproject.toml', 'go.mod', 'pom.xml', 'Cargo.toml', 'package.json') */
  manifest: string;
  /** Standardized dependency classification */
  type?: DependencyType | string | undefined;
  /** Flag indicating optional or feature-gated dependency */
  optional?: boolean | undefined;
  /** Flag indicating transitive / indirect dependency recorded in manifest (e.g. go.mod '// indirect') */
  indirect?: boolean | undefined;
  /** Format-specific metadata (e.g. extras, features, markers, maven scope, go module name) */
  metadata?: Record<string, unknown> | undefined;
}
```

---

## 3. Format Specifications & Parsing Rules

### 1. Python (`requirements.txt` & `pyproject.toml`)
- **`requirements.txt`**:
  - Operators: `==`, `>=`, `<=`, `~=`, `!=`, `>`, `<`, unpinned (`*`).
  - Extras: `uvicorn[standard]>=0.30` ➔ `name: "uvicorn"`, `version: ">=0.30"`, `metadata.extras: ["standard"]`.
  - Environment Markers: `requests[socks]>=2.31; python_version >= "3.10"` ➔ `metadata.markers: "python_version >= \"3.10\""`.
  - Comments (`# ...`) and whitespace stripped; options (`-i`, `-r`, `--index-url`) skipped safely.
  - Ecosystem: `'python'`, Manifest: `'requirements.txt'`.
- **`pyproject.toml`**:
  - `[project.dependencies]`, `[project.optional-dependencies]`, `[tool.poetry.dependencies]`, `[tool.poetry.group.*.dependencies]`.
  - Standard PEP 508 strings and inline table specs.
  - Ecosystem: `'python'`, Manifest: `'pyproject.toml'`.

### 2. Go (`go.mod`)
- Module declaration: `module github.com/user/project` extracted into root metadata.
- Go compiler version: `go 1.23`.
- Require blocks:
  - Single line: `require github.com/gin-gonic/gin v1.10.0`.
  - Multi-line block: `require (\n github.com/stretchr/testify v1.9.0\n golang.org/x/crypto v0.26.0 // indirect\n)`.
- Metadata: `indirect: true` when `// indirect` comment is present.
- Ecosystem: `'go'`, Manifest: `'go.mod'`.

### 3. Java (`pom.xml`)
- Structure: `<project><dependencies><dependency><groupId>...</groupId><artifactId>...</artifactId><version>...</version><scope>...</scope><optional>...</optional></dependency></dependencies></project>`.
- Normalized Package Name: `${groupId}:${artifactId}` (e.g. `org.springframework.boot:spring-boot-starter-web`).
- Property Interpolation: Version references like `${spring.boot.version}` resolved from `<properties>` block.
- Scope Mapping:
  - `test` ➔ `devDependency` / `testDependency`
  - `provided` ➔ `buildDependency`
  - `compile` / `runtime` / default ➔ `dependency`
- Ecosystem: `'maven'`, Manifest: `'pom.xml'`.

### 4. Rust (`Cargo.toml`)
- Sections: `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, `[workspace.dependencies]`, `[dependencies.*]`.
- Simple String: `tokio = "1.38"` ➔ `version: "1.38"`.
- Inline Table: `serde = { version = "1.0", features = ["derive"], optional = true }` ➔ `version: "1.0"`, `optional: true`, `metadata.features: ["derive"]`.
- Table Block: `[dependencies.reqwest]\n version = "0.12"`.
- Ecosystem: `'cargo'`, Manifest: `'Cargo.toml'`.

### 5. Node.js (`package.json`)
- Sections: `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`.
- Ecosystem: `'npm'`, Manifest: `'package.json'`.

---

## 4. Extension Points & Architecture Blueprint

```
packages/analyzer/src/manifests/
  ├── index.ts               # Public facade: extractAllDependencies(files: SourceFile[])
  ├── npm.ts                 # package.json extractor
  ├── python.ts              # requirements.txt & pyproject.toml extractor
  ├── go.ts                  # go.mod extractor
  ├── maven.ts               # pom.xml extractor
  └── cargo.ts               # Cargo.toml extractor
```

Integration Points:
1. `@qualityguard/domain`: Export `DependencyItem` and `DependencyType`.
2. `@qualityguard/analyzer`: Export `extractAllDependencies` from root package.
3. `apps/api/src/analysis.ts`: Call `extractAllDependencies(files)` in the repository analysis pipeline.
4. `apps/web/app/api/[...path]/route.ts`: Call `extractAllDependencies(files)` for in-app fallback.
5. `apps/web/app/page.tsx`: Update Dependencies view table to display `Ecosystem` and `Manifest` columns.

---

## 5. Scope Boundaries (Zero Mock Policy)

- **Static Manifest Extraction Only:** The extractors parse declared dependencies directly from manifest source files.
- **No Dynamic Remote Resolvers:** We do NOT perform live network resolution against PyPI, Maven Central, npmjs, or crates.io during static extraction (network is sandboxed).
- **Graceful Fault Tolerance:** Malformed or incomplete manifests log warnings and return partial valid dependencies without aborting the overall repository AST review.

---

## 6. Regression Risks & Mitigation

| Potential Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| Breaking existing `DependencyItem` consumers in `apps/web` or `apps/api` | High | Retain `name`, `version`, `type` as mandatory/compatible fields; add `ecosystem` and `manifest` with sensible defaults. |
| Nested / Workspace Monorepos with multiple manifests | Medium | Track relative `manifest` path per item (e.g. `apps/api/package.json` vs `packages/core/Cargo.toml`). Deduplicate by `ecosystem:name@version:manifest`. |
| Complex TOML / XML edge cases | Medium | Use robust, tested regex parsers tailored for manifest grammars. |
| Test suite regressions | High | Strict RED ➔ GREEN ➔ REFACTOR TDD verification ensuring 100% test pass rate. |
