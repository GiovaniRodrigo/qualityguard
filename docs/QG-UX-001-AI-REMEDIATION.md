# QualityGuard — QG-UX-001 AI Remediation Architecture & Future Integration

**Task:** QG-UX-001 — Findings Command Center  
**Document:** Future AI Remediation Integration Specification  
**Status:** Documented / Deferred (Zero-Mock Runtime Policy)  

---

## 1. Zero-Mock Policy & Current API Status

In accordance with QualityGuard product rules:
- **Rule:** No fake AI responses, simulated streaming text, or mocked remediation endpoints are permitted in runtime code.
- **Current Capability:** Static AI insights may be generated during asynchronous background analysis via `@qualityguard/ai` prompt generation when `DEEPSEEK_API_KEY` or `OPENAI_API_KEY` is configured in the worker environment and stored in `Review.aiInsight`.
- **API Gap (`NOT_AVAILABLE_FROM_CURRENT_API`):** There is currently no interactive real-time endpoint for on-demand conversational finding explanation or automated patch generation (e.g. `POST /findings/:id/explain` or `POST /findings/:id/remediate`).

---

## 2. Planned Architecture for Interactive AI Remediation

When the interactive AI Remediation API is scheduled for implementation in a future milestone, it will follow this contract:

```
[ Frontend: Finding Detail Drawer ]
                │
                │ POST /api/findings/:id/explain (or /api/projects/:id/findings/:findingId/remediate)
                ▼
[ Fastify API Worker Pool ]
  - Loads Finding AST Context & Source File Hunk from workspace/cache
  - Builds Context-Rich Prompt (@qualityguard/ai)
  - Invokes AI Provider (DeepSeek / OpenAI / Anthropic)
  - Streams SSE (Server-Sent Events) or returns structured JSON:
    {
      "explanation": "Markdown description of why this pattern is dangerous...",
      "codeDiff": "--- a/src/api/users.ts\n+++ b/src/api/users.ts\n...",
      "confidence": 0.94,
      "securityConsiderations": [...]
    }
```

---

## 3. UI Treatment in Findings Command Center

In the current Findings Command Center:
- Findings with existing `suggestion` or `evidence` fields display the deterministic guidance extracted by the rule engine.
- If a project `Review` contains `aiInsight`, it is displayed in the Quality Summary banner.
- No dummy, non-functional "Explain with AI" buttons are displayed until the corresponding backend streaming endpoint is active and verified.
