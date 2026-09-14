# Architecture

## Architectural direction

QualityGuard is organized as a layered analysis platform. The core domain must not depend on GitHub, an LLM provider, or a specific UI.

```text
                +-----------------------+
                | Delivery / Adapters   |
                | CLI | GitHub | Web    |
                +-----------+-----------+
                            |
                +-----------v-----------+
                | Application           |
                | Review Orchestration  |
                +-----------+-----------+
                            |
                +-----------v-----------+
                | Domain                |
                | Findings | Rules      |
                | Decisions | Scores    |
                +-----------+-----------+
                            |
             +--------------+--------------+
             |                             |
   +---------v---------+         +---------v---------+
   | Deterministic     |         | AI Adapter        |
   | Analyzer          |         | Provider-neutral  |
   +-------------------+         +-------------------+
```

## Review pipeline

```text
Input
  -> Normalize
  -> Collect repository context
  -> Analyze diff
  -> Run deterministic rules
  -> Optional AI analysis
  -> Parse JSON
  -> Validate schema
  -> Map findings
  -> Deduplicate / correlate
  -> Calculate score
  -> Calculate decision
  -> Render / publish
```

## Key constraint

The LLM is an analyzer, not the source of truth. It must return a strict machine-readable contract and all output must pass schema validation before entering the domain.

## Provider abstraction

The domain should depend on an interface such as:

```text
LLMProvider
  -> analyze(context, prompt)
  -> StructuredLLMResponse
```

Providers may include cloud or local models, but provider-specific code stays outside the domain.

## Security boundary

Repository content is sensitive. The architecture therefore treats source-code access as an explicit boundary. Future hosted deployments must support minimizing transmitted context and a local/self-hosted execution mode.

## Evolution path

MVP:

```text
CLI -> Application -> Domain -> Deterministic Rules
                           \-> AI Adapter
```

Then:

```text
GitHub App -> Application -> Domain
Web UI ----> Application -> Domain
```

Later:

```text
Architecture Graph
       |
       v
Historical Baselines -> Drift Detection -> Governance
```
