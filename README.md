# QualityGuard

> AI-powered software quality and architecture governance for teams shipping code with AI.

QualityGuard is being built around a simple engineering question:

**Can this change safely enter the current architecture?**

It combines deterministic software analysis with contextual AI review to evaluate pull requests against architecture, security, testing, maintainability, dependency, performance, and scalability rules.

## Product direction

QualityGuard is not intended to be another generic AI code reviewer. The product focuses on **software quality governance**: understanding the repository as a system, enforcing explicit engineering rules, detecting architecture drift, and producing structured findings that teams can act on.

### Initial workflow

```text
GitHub Pull Request
        |
        v
   QualityGuard
        |
  +-----+------+
  |            |
Static       AI analysis
analysis        |
  |            |
  +-----+------+
        |
        v
 Quality Engine
        |
  +-----+----------------------+
  |        |       |           |
  v        v       v           v
Arch.   Security Testing  Maintainability
  |        |       |           |
  +--------+-------+-----------+
           |
           v
    Structured Findings
           |
           v
     Quality Decision
           |
           v
      PR feedback
```

## MVP

1. Analyze a Git diff.
2. Parse changed files and repository context.
3. Evaluate deterministic quality and architecture rules.
4. Run optional LLM analysis using a strict JSON contract.
5. Validate findings against the domain schema.
6. Produce a quality score and merge recommendation.
7. Publish concise feedback to a GitHub Pull Request.

## Design principles

- Deterministic checks before probabilistic checks.
- Structured findings, never raw model output.
- Repository context over isolated snippets.
- Explainable decisions with file/line evidence.
- Provider-agnostic LLM integration.
- Local-first capability as a strategic product requirement.
- Security and privacy by design.
- Small MVP, fast customer validation, incremental expansion.

## Status

🚧 Early product development.

See [ROADMAP.md](ROADMAP.md), [docs/product/PRODUCT.md](docs/product/PRODUCT.md), and [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md).
