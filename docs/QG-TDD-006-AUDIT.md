# QualityGuard — QG-TDD-006 Pre-Implementation Audit
**Milestone:** Streaming AI Remediation Engine  
**Date:** 2026-09-15  
**Author:** Principal AI/Software Engineer  

---

## Audit Findings & Architectural Assessment

### 1. Existing AI Providers
In `packages/ai/src/index.ts`, four provider factories currently exist:
- **OpenAI**: `openAI()` calling `https://api.openai.com/v1/chat/completions` (model: `OPENAI_MODEL ?? 'gpt-5-mini'`).
- **Anthropic**: `anthropic()` calling `https://api.anthropic.com/v1/messages` (model: `ANTHROPIC_MODEL ?? 'claude-sonnet-4-5'`).
- **Gemini**: `gemini()` calling `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` (model: `GEMINI_MODEL ?? 'gemini-2.5-flash'`).
- **Ollama**: `ollama()` calling `${OLLAMA_BASE_URL ?? 'http://localhost:11434'}/v1/chat/completions` (model: `OLLAMA_MODEL ?? 'llama3.1'`).

### 2. Existing AI Provider Interface
Currently defined in `packages/ai/src/index.ts`:
```typescript
export interface AIRequest {
  system: string;
  prompt: string;
}

export interface AIProvider {
  readonly name: string;
  complete(request: AIRequest): Promise<string>;
}
```

### 3. Streaming Status
Currently, no streaming completion methods exist. The interface is strictly unary (`Promise<string>`).
We must extend `AIProvider` to support:
```typescript
export interface AIStreamRequest extends AIRequest {
  signal?: AbortSignal;
  temperature?: number;
}

export interface AIProvider {
  readonly name: string;
  complete(request: AIRequest): Promise<string>;
  streamCompletion?(request: AIStreamRequest): AsyncIterable<string>;
}
```
And provide Server-Sent Events (SSE) streaming compatibility via `AsyncIterable<string>` over OpenAI SSE, Anthropic SSE, Ollama streaming, or deterministic offline streams.

### 4. API Keys & Configuration
Configured strictly through environment variables:
- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`
- `GEMINI_API_KEY`, `GEMINI_MODEL`
- `OLLAMA_BASE_URL`, `OLLAMA_MODEL`
- `AI_PROVIDER` (`'openai' | 'gemini' | 'anthropic' | 'ollama' | 'offline'`)

### 5. Finding Identification
Findings are identified by unique string IDs (e.g. `sec-jwt-42`, `ARCH-CYCLE-...`, `custom/forbidden_dependency-...`, `rule-sql-injection-user.ts-12`).
Findings are encapsulated inside `Review.findings` (`ReviewResult`).

### 6. Finding `projectId` Association
A `Finding` is a domain value object contained inside a `Review`. The parent `Review` holds:
- `projectId: string`
- `organizationId: string`
- `repository: string`
- `branch: string`
- `commitSha?: string`
- `architecture?: ArchitectureGraph`
- `dependencies?: DependencyItem[]`

### 7. Multi-Tenant Isolation Guarantee
To prevent cross-tenant enumeration or unauthorized data access:
1. `POST /api/findings/:id/remediate` enforces Bearer JWT authentication.
2. The user's active `organizationId` is resolved.
3. The store looks up the finding across reviews belonging **only** to that `organizationId`.
4. If the finding does not exist in any review owned by the caller's organization, the API returns **`404 Not Found`** with `{ error: 'finding not found' }`, completely hiding the existence of findings in other tenants.

### 8. Persisted Code & Repository Context
Each finding stores:
- `file: string`
- `line?: number`, `startLine?: number`, `endLine?: number`
- `title: string`
- `description: string`
- `suggestion: string`
- `evidence?: string[]`
- `ruleId?: string`
- `architecture` context from `review.architecture`
- `dependencies` context from `review.dependencies`

### 9. Context Limits & Safeguards
To prevent excessive token usage, memory pressure, or DoS:
- `MAX_CONTEXT_FILES = 5`
- `MAX_FILE_BYTES = 16 * 1024` (16 KB)
- `MAX_TOTAL_CONTEXT_BYTES = 64 * 1024` (64 KB)
- `MAX_FINDING_CONTEXT_BYTES = 8 * 1024` (8 KB)
- `redactSecrets()` sanitizes tokens, private keys, passwords, database URIs before context assembly.

### 10. Offline Provider Handling
When no API key is provided, or in test/air-gapped environments:
- The system uses `OfflineAIProvider` which generates structured, deterministic remediation instructions and code suggestions based on the finding's deterministic rule metadata and evidence, streaming in standard SSE format with zero runtime crashes.

---

## Decision Log & Implementation Roadmap

1. **FASE 1 — AI Provider Abstraction**: Extend `AIProvider` in `@qualityguard/ai` with `streamCompletion()` supporting OpenAI/Gemini/Anthropic/Ollama/Offline.
2. **FASE 2 & 3 — Remediation Domain & Context Builder**: Implement `buildRemediationContext()` with strict secret redaction and prompt injection sandboxing.
3. **FASE 4 & 5 — Limits & Prompt Builder**: Enforce size boundaries, priority hierarchy, and structured system instructions.
4. **FASE 6, 7 & 8 — SSE Server Endpoint**: Add `POST /findings/:id/remediate` in API server with `text/event-stream`, `event: start`, `event: chunk`, `event: complete`, `event: error`, and `req.on('close')` abort handling.
5. **FASE 9 & 10 — Rate Limiting & Error Resilience**: Add per-organization/user rate limiting (HTTP 429) and structured failure events.
6. **FASE 11, 12, 13, 14 & 15 — Frontend Remediation Panel**: Add `[Ask AI for Fix]` drawer in Findings Command Center with streaming markdown, stop button, and sanitized rendering.
7. **FASE 16 & 17 — No Auto-Apply & Patch Format**: Clean code diff suggestion without automatic file/git mutations.
