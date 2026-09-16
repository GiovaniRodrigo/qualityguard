# Contributing to QualityGuard

Thanks for your interest in improving QualityGuard! This document explains how to
set up the project, the conventions we follow, and how to get a change merged.

QualityGuard is an [AGPL-3.0](./LICENSE) project. By contributing you agree that
your contributions are licensed under the same terms.

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Ways to contribute](#ways-to-contribute)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Repository layout](#repository-layout)
- [Development workflow](#development-workflow)
- [Testing](#testing)
- [Coding standards](#coding-standards)
- [Commit conventions](#commit-conventions)
- [Branches and pull requests](#branches-and-pull-requests)
- [Reporting bugs and requesting features](#reporting-bugs-and-requesting-features)
- [Security issues](#security-issues)

## Code of conduct

This project and everyone participating in it is governed by our
[Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to
uphold it. Please report unacceptable behavior as described there.

## Ways to contribute

- **Report bugs** and **request features** via
  [GitHub Issues](https://github.com/GiovaniRodrigo/qualityguard/issues).
- **Improve documentation** — even fixing a typo is a welcome first contribution.
- **Write analyzer rules** — the deterministic rule engine in
  `packages/analyzer` is the easiest place to add high-value behavior.
- **Add integrations** or improve the API, CLI, or web app.

If you are looking for a first task, browse issues labelled `good first issue`.

## Requirements

- **Node.js >= 22** (see `.nvmrc` / `engines` in `package.json`)
- **pnpm 10** (`corepack enable` will provide the pinned version)
- **Docker** and **Docker Compose** (optional, for running the full stack)

## Getting started

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/qualityguard.git
cd qualityguard

# 2. Enable the pinned package manager
corepack enable

# 3. Install dependencies
pnpm install

# 4. Build all workspace packages
pnpm build

# 5. Run the full test suite
pnpm test
```

To copy the example environment file for local development:

```bash
cp .env.example .env
```

Nothing in `.env.example` is a secret — all values are safe local defaults. Never
put real credentials in a committed file.

## Repository layout

QualityGuard is a pnpm workspace monorepo:

| Path                     | Description                                             |
| ------------------------ | ------------------------------------------------------- |
| `packages/domain`        | Shared domain types and the structured finding contract |
| `packages/analyzer`      | Deterministic rule engine, scoring, and quality gate    |
| `packages/architecture`  | AST extraction, dependency graph, architecture rules    |
| `packages/ai`            | Provider abstraction for optional AI review             |
| `apps/api`               | Backend HTTP API (Node.js, PostgreSQL)                  |
| `apps/web`               | Next.js web application                                 |
| `apps/cli`               | Command-line interface                                  |
| `integrations/github`    | GitHub webhook and PR integration                       |

See [`docs/architecture/ARCHITECTURE.md`](./docs/architecture/ARCHITECTURE.md)
for the full architecture and the open-source / cloud boundary.

## Development workflow

We practice **test-driven development**. The typical loop is:

1. **Red** — write a failing test that captures the desired behavior.
2. **Green** — write the minimum code needed to make it pass.
3. **Refactor** — clean up while keeping the suite green.
4. **Run the full suite** — `pnpm test` before you push.

Run a single package's tests while iterating:

```bash
pnpm --filter @qualityguard/analyzer test
```

Before opening a pull request, make sure all quality gates pass locally:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Testing

- Tests use [Vitest](https://vitest.dev/) and live next to the code they cover
  (`*.test.ts`).
- New behavior must come with tests. Bug fixes must come with a regression test.
- Do not disable, skip, or weaken tests to make CI pass. If a test is wrong, fix
  the test in the same change and explain why in the PR.

## Coding standards

- **TypeScript**, strict mode. `pnpm typecheck` must pass.
- Prefer small, pure, well-named functions. Match the style of the surrounding
  code.
- Do not introduce mock/placeholder data into production code paths. If a feature
  is not implemented, leave it out rather than faking it.
- Keep dependencies minimal and permissively licensed (AGPL-compatible).

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <description>

feat(analyzer): add SQL injection heuristic rule
fix(api): return 401 instead of 500 on expired token
docs(readme): document the CLI quick start
test(github): cover webhook signature mismatch
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `perf`.

## Branches and pull requests

1. Create a topic branch from `main`: `git checkout -b feat/my-change`.
2. Make focused commits following the conventions above.
3. Ensure `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass.
4. Push and open a pull request against `main`.
5. Fill out the pull request template and link any related issue.
6. A maintainer will review. Address feedback by pushing additional commits.

Keep pull requests focused — one logical change per PR is much easier to review
than a large mixed change.

## Reporting bugs and requesting features

Use the [issue templates](https://github.com/GiovaniRodrigo/qualityguard/issues/new/choose).
A good bug report includes reproduction steps, expected vs. actual behavior, and
your environment (OS, Node version).

## Security issues

**Do not open a public issue for security vulnerabilities.** Follow the process in
[SECURITY.md](./SECURITY.md) for responsible disclosure.
