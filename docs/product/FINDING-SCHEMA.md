# Finding Contract

QualityGuard must never render or persist raw LLM output as a finding.

## Canonical shape

```json
{
  "id": "ARCH-001",
  "severity": "high",
  "category": "architecture",
  "status": "open",
  "decision": "block",
  "file": "src/application/CreateUser.ts",
  "line": 42,
  "title": "Application layer depends on infrastructure implementation",
  "description": "The application service imports a concrete infrastructure adapter.",
  "suggestion": "Depend on the repository interface and inject the infrastructure implementation at the composition root.",
  "confidence": 0.96,
  "source": "deterministic",
  "ruleId": "architecture.no-infrastructure-import"
}
```

## Validation rules

- `confidence` is between 0 and 1.
- `line` is positive when present.
- `file` must identify a repository path.
- `title`, `description`, and `suggestion` are required.
- `decision=block` requires `severity` of `critical` or `high`.
- AI-generated findings must be schema-validated before mapping into the domain.
- Findings shown in UI or PR comments must be rendered from the typed domain object, never from raw JSON.
