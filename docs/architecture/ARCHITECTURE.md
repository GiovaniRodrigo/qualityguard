# Architecture

## Architectural direction

QualityGuard is organized as a layered analysis platform. The core domain must not depend on GitHub, an LLM provider, or a specific UI.

```mermaid
flowchart TD
    Delivery["Delivery / Adapters<br/>CLI | GitHub | Web"] --> App["Application<br/>Review Orchestration"]
    App --> Domain["Domain<br/>Findings | Rules<br/>Decisions | Scores"]
    Domain --> Det["Deterministic Analyzer"]
    Domain --> AI["AI Adapter<br/>Provider-neutral"]
```

## Review pipeline

```mermaid
flowchart TD
    A["Input"] --> B["Normalize"]
    B --> C["Collect repository context"]
    C --> D["Analyze diff"]
    D --> E["Run deterministic rules"]
    E --> F["Optional AI analysis"]
    F --> G["Parse JSON"]
    G --> H["Validate schema"]
    H --> I["Map findings"]
    I --> J["Deduplicate / correlate"]
    J --> K["Calculate score"]
    K --> L["Calculate decision"]
    L --> M["Render / publish"]
```

## Key constraint

The LLM is an analyzer, not the source of truth. It must return a strict machine-readable contract and all output must pass schema validation before entering the domain.

## Provider abstraction

The domain should depend on an interface such as:

```mermaid
flowchart LR
    P["LLMProvider"] --> A["analyze(context, prompt)"]
    A --> R["StructuredLLMResponse"]
```

Providers may include cloud or local models, but provider-specific code stays outside the domain.

## Security boundary

Repository content is sensitive. The architecture therefore treats source-code access as an explicit boundary. Future hosted deployments must support minimizing transmitted context and a local/self-hosted execution mode.

## Evolution path

MVP:

```mermaid
flowchart LR
    CLI --> App["Application"]
    App --> Domain
    Domain --> Det["Deterministic Rules"]
    Domain --> AI["AI Adapter"]
```

Then:

```mermaid
flowchart LR
    GH["GitHub App"] --> App["Application"]
    Web["Web UI"] --> App
    App --> Domain
```

Later:

```mermaid
flowchart TD
    AG["Architecture Graph"] --> HB["Historical Baselines"]
    HB --> DD["Drift Detection"]
    DD --> Gov["Governance"]
```
