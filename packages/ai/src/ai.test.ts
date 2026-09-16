import { describe, expect, it, vi } from 'vitest';
import type { Finding, RemediationContext } from '@qualityguard/domain';
import {
  buildReviewPrompt,
  parseAIFindings,
  redactSecrets,
  buildRemediationPrompt,
  OfflineAIProvider,
  HttpAIProvider,
  MAX_CONTEXT_FILES,
  MAX_FILE_BYTES,
} from './index.js';

describe('AI Review Prompt and Parser', () => {
  it('builds review prompt correctly', () => {
    const req = buildReviewPrompt({
      diff: 'diff --git a/src/index.ts b/src/index.ts',
      architecture: 'clean architecture',
      rules: 'no secrets',
    });
    expect(req.system).toContain('software quality auditor');
    expect(req.prompt).toContain('clean architecture');
    expect(req.prompt).toContain('no secrets');
  });

  it('parses valid AI findings JSON array', () => {
    const json = JSON.stringify([
      {
        severity: 'high',
        category: 'security',
        file: 'src/auth.ts',
        line: 12,
        title: 'Weak hashing algorithm',
        description: 'Using MD5 for passwords',
        suggestion: 'Use argon2 or scrypt',
        confidence: 0.99,
        decision: 'block',
      },
    ]);
    const findings = parseAIFindings(json);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.category).toBe('security');
    expect(findings[0]?.source).toBe('ai');
  });
});

describe('Secret Redaction', () => {
  it('redacts API keys, AWS keys, JWTs, and database credentials', () => {
    const sensitive = `
      const apiKey = "sk-1234567890123456789012345";
      const awsKey = "AKIAIOSFODNN7EXAMPLE";
      const dbUri = "postgres://admin:superSecretPassword123@localhost:5432/mydb";
      const token = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignaturePart123";
      const ghToken = "ghp_123456789012345678901234567890123456";
    `;

    const result = redactSecrets(sensitive);
    expect(result.redacted).toBe(true);
    expect(result.secretCount).toBeGreaterThanOrEqual(4);
    expect(result.text).not.toContain('superSecretPassword123');
    expect(result.text).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result.text).not.toContain('ghp_123456789012345678901234567890123456');
    expect(result.text).toContain('[REDACTED_SECRET:');
  });

  it('handles safe input without altering content', () => {
    const safe = 'function calculateTotal(items) { return items.length; }';
    const result = redactSecrets(safe);
    expect(result.redacted).toBe(false);
    expect(result.text).toBe(safe);
  });
});

describe('Remediation Prompt & Context Builder', () => {
  const sampleFinding: Finding = {
    id: 'f-sec-1',
    severity: 'critical',
    category: 'security',
    status: 'open',
    decision: 'block',
    file: 'src/auth/jwt.ts',
    line: 42,
    title: 'Hardcoded JWT Secret',
    description: 'A hardcoded secret string is used to sign authentication tokens.',
    suggestion: 'Load JWT_SECRET from environment variables.',
    confidence: 0.98,
    source: 'deterministic',
    ruleId: 'security/hardcoded-secret',
    evidence: ['const secret = "my-hardcoded-secret-key-123";'],
  };

  it('builds a secure remediation prompt with sandboxed data tags and strict instructions', () => {
    const context: RemediationContext = {
      finding: sampleFinding,
      repository: 'org/repo',
      branch: 'main',
      relevantFiles: [
        {
          path: 'src/auth/jwt.ts',
          content: 'export function sign(payload) { return jwt.sign(payload, "my-hardcoded-secret-key-123"); }',
        },
      ],
      architectureSummary: 'Domain -> Services -> Controllers',
    };

    const result = buildRemediationPrompt(context);
    expect(result.request.system).toContain('QualityGuard Principal AI Remediation Engineer');
    expect(result.request.system).toContain('UNTRUSTED DATA BOUNDARY');
    expect(result.request.system).toContain('DETERMINISTIC ENGINE SOVEREIGNTY');
    expect(result.request.prompt).toContain('<code_context file="src/auth/jwt.ts" untrusted="true">');
    expect(result.request.prompt).toContain('FINDING DETAILS:');
    expect(result.request.prompt).toContain('src/auth/jwt.ts:42');
  });

  it('enforces context limits on file counts and sizes', () => {
    const manyFiles = Array.from({ length: 10 }, (_, i) => ({
      path: `src/file${i}.ts`,
      content: `// Code file content ${i}\n`.repeat(100),
    }));

    const context: RemediationContext = {
      finding: sampleFinding,
      relevantFiles: manyFiles,
    };

    const result = buildRemediationPrompt(context);
    expect(result.wasLimited).toBe(true);
    expect(result.limitReasons.some((r) => r.includes(`capped at ${MAX_CONTEXT_FILES}`))).toBe(true);
  });
});

describe('AI Providers & Streaming', () => {
  it('OfflineAIProvider streams complete markdown response in chunks', async () => {
    const provider = new OfflineAIProvider();
    expect(provider.name).toBe('offline');

    const chunks: string[] = [];
    for await (const chunk of provider.streamCompletion({
      system: 'system prompt',
      prompt: 'CATEGORY: SECURITY\nFinding: Hardcoded Secret in src/auth.ts',
    })) {
      chunks.push(chunk);
    }

    const fullResponse = chunks.join('');
    expect(chunks.length).toBeGreaterThan(1);
    expect(fullResponse).toContain('### Problem Explanation');
    expect(fullResponse).toContain('### Step-by-Step Remediation');
    expect(fullResponse).toContain('### Example Code Fix');
  });

  it('OfflineAIProvider aborts when signal is triggered', async () => {
    const provider = new OfflineAIProvider();
    const controller = new AbortController();
    controller.abort();

    await expect(async () => {
      for await (const _ of provider.streamCompletion({
        system: 'system',
        prompt: 'prompt',
        signal: controller.signal,
      })) {
        // should not reach
      }
    }).rejects.toThrow('Stream aborted by client');
  });

  it('HttpAIProvider parses streaming SSE chunks', async () => {
    const ssePayload = [
      'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"World!"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => {
          let read = false;
          return {
            read: async () => {
              if (!read) {
                read = true;
                return { done: false, value: new TextEncoder().encode(ssePayload) };
              }
              return { done: true, value: undefined };
            },
            releaseLock: () => {},
            cancel: async () => {},
          };
        },
      },
    });

    global.fetch = mockFetch;

    const provider = new HttpAIProvider('openai', 'https://api.openai.com/v1/chat/completions', {}, 'gpt-5-mini');
    const chunks: string[] = [];
    for await (const chunk of provider.streamCompletion({
      system: 'system',
      prompt: 'prompt',
    })) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('Hello World!');
  });
});
