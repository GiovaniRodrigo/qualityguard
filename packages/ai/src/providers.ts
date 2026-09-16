import type { AIRequest, AIStreamRequest } from './prompt.js';

export interface AIProvider {
  readonly name: string;
  complete(request: AIRequest): Promise<string>;
  streamCompletion(request: AIStreamRequest): AsyncIterable<string>;
}

export class OfflineAIProvider implements AIProvider {
  public readonly name = 'offline';

  async complete(request: AIRequest): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of this.streamCompletion(request)) {
      chunks.push(chunk);
    }
    return chunks.join('');
  }

  async *streamCompletion(request: AIStreamRequest): AsyncIterable<string> {
    if (request.signal?.aborted) {
      throw new Error('Stream aborted by client');
    }

    // Deterministically parse finding details from prompt to generate tailored remediation
    const prompt = request.prompt;
    const isSecurity = prompt.includes('CATEGORY: SECURITY') || prompt.toLowerCase().includes('secret') || prompt.toLowerCase().includes('vulnerability');
    const isArchitecture = prompt.includes('CATEGORY: ARCHITECTURE') || prompt.toLowerCase().includes('cycle') || prompt.toLowerCase().includes('dependency');

    const sections: string[] = [];

    if (isSecurity) {
      sections.push(
        `### Problem Explanation\n\n`,
        `The static security analyzer detected potential credential or security boundary exposure in the codebase. `,
        `Hardcoding sensitive values (tokens, secrets, unparameterized queries) creates severe vulnerability vectors `,
        `that can lead to unauthorized data access and token leakage in production environments.\n\n`,
        `### Root Cause Analysis\n\n`,
        `1. Configuration or secret values are defined directly within source files rather than loaded from environment variables or secure secret managers.\n`,
        `2. Lack of automated pre-commit secret scanning or secret rotation policy.\n\n`,
        `### Step-by-Step Remediation\n\n`,
        `1. **Extract Sensitive Constants**: Remove any hardcoded keys, passwords, or tokens from source control immediately.\n`,
        `2. **Use Environment Variables**: Load dynamic credentials through validated environment variables (e.g., \`process.env.SECRET_KEY\`).\n`,
        `3. **Invalidate and Rotate**: If the exposed credential was active in any environment, revoke and rotate it immediately.\n\n`,
        `### Example Code Fix\n\n`,
        `\`\`\`typescript\n// Before (Vulnerable):\nconst apiKey = "sk-live-1234567890abcdef";\n\n// After (Secure):\nconst apiKey = process.env.API_KEY;\nif (!apiKey) {\n  throw new Error("Missing required environment variable API_KEY");\n}\n\`\`\`\n\n`,
        `### Prevention Best Practices\n\n`,
        `- Enforce secret scanning in CI/CD pipelines.\n`,
        `- Use .env.example templates without actual secrets.\n`,
        `- Add .env and credentials files to .gitignore.\n`,
      );
    } else if (isArchitecture) {
      sections.push(
        `### Problem Explanation\n\n`,
        `The codebase architecture graph contains prohibited module coupling or circular references. `,
        `Direct cross-layer imports violate architectural boundaries and degrade code maintainability, testability, and build performance.\n\n`,
        `### Root Cause Analysis\n\n`,
        `1. Modules in higher layers directly import lower-level implementation details rather than abstractions or interfaces.\n`,
        `2. Bidirectional imports between co-dependent files form cyclic graphs.\n\n`,
        `### Step-by-Step Remediation\n\n`,
        `1. **Apply Dependency Inversion**: Define interfaces/types in a common domain or contracts module.\n`,
        `2. **Extract Shared Logic**: Move mutual helper functions or shared data models to an independent submodule.\n`,
        `3. **Enforce Boundary Rules**: Ensure presentation layers interact only with application/domain interfaces.\n\n`,
        `### Example Code Fix\n\n`,
        `\`\`\`typescript\n// Before (Direct tight coupling):\nimport { DatabaseClient } from "../infrastructure/db";\n\n// After (Dependency Injection / Inversion):\nimport type { UserRepository } from "../domain/user-repository";\n\nexport class UserService {\n  constructor(private readonly userRepo: UserRepository) {}\n}\n\`\`\`\n\n`,
        `### Prevention Best Practices\n\n`,
        `- Validate architecture rules on every Pull Request check run.\n`,
        `- Maintain clear layer separation (Domain -> Application -> Infrastructure -> Presentation).\n`,
      );
    } else {
      sections.push(
        `### Problem Explanation\n\n`,
        `The static analyzer flagged a quality issue in the specified file. `,
        `Addressing this finding ensures compliance with workspace quality gates and prevents technical debt accumulation.\n\n`,
        `### Root Cause Analysis\n\n`,
        `Code pattern does not conform to defined static analysis rules and linting standards.\n\n`,
        `### Step-by-Step Remediation\n\n`,
        `1. Review the rule suggestion and code evidence provided in the finding details.\n`,
        `2. Apply the recommended refactoring or code cleanup.\n`,
        `3. Verify that all automated unit and integration tests continue to pass.\n\n`,
        `### Prevention Best Practices\n\n`,
        `- Run local quality checks before pushing changes.\n`,
        `- Maintain high automated test coverage across modified modules.\n`,
      );
    }

    for (const section of sections) {
      if (request.signal?.aborted) {
        throw new Error('Stream aborted by client');
      }
      yield section;
      // Brief yield pause to simulate natural streaming cadence
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

export class HttpAIProvider implements AIProvider {
  constructor(
    public readonly name: string,
    private readonly endpoint: string,
    private readonly headers: Record<string, string>,
    private readonly model: string,
  ) {}

  async complete(request: AIRequest): Promise<string> {
    const isAnthropic = this.name === 'anthropic';
    const bodyPayload = isAnthropic
      ? {
          model: this.model,
          system: request.system,
          messages: [{ role: 'user', content: request.prompt }],
          max_tokens: 2048,
          temperature: 0,
        }
      : {
          model: this.model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.prompt },
          ],
          temperature: 0,
        };

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.headers },
      body: JSON.stringify(bodyPayload),
    });

    if (!response.ok) {
      throw new Error(`${this.name} returned ${response.status}: ${await response.text().catch(() => '')}`);
    }

    const data = (await response.json()) as any;
    if (isAnthropic) {
      const content = data.content?.[0]?.text;
      if (!content) throw new Error(`${this.name} returned no content`);
      return content;
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error(`${this.name} returned no content`);
    return content;
  }

  async *streamCompletion(request: AIStreamRequest): AsyncIterable<string> {
    const isAnthropic = this.name === 'anthropic';
    const bodyPayload = isAnthropic
      ? {
          model: this.model,
          system: request.system,
          messages: [{ role: 'user', content: request.prompt }],
          max_tokens: request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0,
          stream: true,
        }
      : {
          model: this.model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.prompt },
          ],
          temperature: request.temperature ?? 0,
          stream: true,
        };

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.headers },
      body: JSON.stringify(bodyPayload),
      signal: request.signal,
    });

    if (!response.ok) {
      throw new Error(`${this.name} streaming returned ${response.status}: ${await response.text().catch(() => '')}`);
    }

    if (!response.body) {
      throw new Error(`${this.name} response body is empty`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf8');
    let buffer = '';

    try {
      while (true) {
        if (request.signal?.aborted) {
          await reader.cancel();
          throw new Error('Stream aborted by client');
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // Skip keep-alive / comments

          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6).trim();
            if (dataStr === '[DONE]') return;

            try {
              const parsed = JSON.parse(dataStr);
              if (isAnthropic) {
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  yield parsed.delta.text;
                }
              } else {
                const text = parsed.choices?.[0]?.delta?.content ?? parsed.message?.content;
                if (text) yield text;
              }
            } catch {
              // Ignore non-JSON lines in stream
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export function openAI(): AIProvider {
  return new HttpAIProvider(
    'openai',
    'https://api.openai.com/v1/chat/completions',
    { Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}` },
    process.env.OPENAI_MODEL ?? 'gpt-5-mini',
  );
}

export function anthropic(): AIProvider {
  return new HttpAIProvider(
    'anthropic',
    'https://api.anthropic.com/v1/messages',
    {
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
  );
}

export function gemini(): AIProvider {
  return new HttpAIProvider(
    'gemini',
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    { Authorization: `Bearer ${process.env.GEMINI_API_KEY ?? ''}` },
    process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  );
}

export function ollama(): AIProvider {
  return new HttpAIProvider(
    'ollama',
    `${process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'}/v1/chat/completions`,
    {},
    process.env.OLLAMA_MODEL ?? 'llama3.1',
  );
}

export function getAIProvider(): AIProvider {
  const providerName = (process.env.AI_PROVIDER ?? '').toLowerCase();

  if (providerName === 'openai' && process.env.OPENAI_API_KEY) {
    return openAI();
  }
  if (providerName === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    return anthropic();
  }
  if (providerName === 'gemini' && process.env.GEMINI_API_KEY) {
    return gemini();
  }
  if (providerName === 'ollama' && process.env.OLLAMA_BASE_URL) {
    return ollama();
  }

  // Auto-detect based on configured API keys
  if (process.env.OPENAI_API_KEY) return openAI();
  if (process.env.ANTHROPIC_API_KEY) return anthropic();
  if (process.env.GEMINI_API_KEY) return gemini();

  // Fallback to deterministic offline provider
  return new OfflineAIProvider();
}
