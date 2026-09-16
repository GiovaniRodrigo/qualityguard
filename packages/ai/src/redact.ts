/**
 * Redacts common secret patterns (tokens, keys, passwords, URIs) from code and text
 * before transmitting to external AI providers.
 */

export interface RedactResult {
  text: string;
  redacted: boolean;
  secretCount: number;
}

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp; replace: (match: string, ...groups: string[]) => string }> = [
  // Private Keys (PEM)
  {
    name: 'private_key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: () => '[REDACTED_SECRET:private_key]',
  },
  // AWS Access Key ID
  {
    name: 'aws_key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replace: () => '[REDACTED_SECRET:aws_key]',
  },
  // GitHub Tokens
  {
    name: 'github_token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b|\bgithub_pat_[A-Za-z0-9_]{22}_[A-Za-z0-9_]{59}\b/g,
    replace: () => '[REDACTED_SECRET:github_token]',
  },
  // OpenAI / Anthropic / Generic API keys (sk-...)
  {
    name: 'api_key',
    pattern: /\b(?:sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9_-]{20,})\b/g,
    replace: () => '[REDACTED_SECRET:api_key]',
  },
  // Google API Keys
  {
    name: 'google_api_key',
    pattern: /\bAIza[0-9A-Za-z-_]{35}\b/g,
    replace: () => '[REDACTED_SECRET:google_api_key]',
  },
  // JWT Tokens (3 base64url parts separated by dots)
  {
    name: 'jwt_token',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replace: () => '[REDACTED_SECRET:jwt_token]',
  },
  // Bearer Tokens in headers or code
  {
    name: 'bearer_token',
    pattern: /\bBearer\s+[A-Za-z0-9_\-\.]{20,}\b/g,
    replace: () => 'Bearer [REDACTED_SECRET:bearer_token]',
  },
  // Passwords in Database Connection Strings
  {
    name: 'db_uri_password',
    pattern: /((?:postgres|postgresql|mysql|mongodb|redis|amqp|couchdb):\/\/[^:]+:)([^@\s]+)(@)/g,
    replace: (_match, prefix, _password, suffix) => `${prefix}[REDACTED_SECRET:db_password]${suffix}`,
  },
  // Generic password/secret assignments in config/code
  {
    name: 'assignment_secret',
    pattern: /(["']?(?:password|secret|api_key|apiKey|auth_token|authToken|access_token)["']?\s*[:=]\s*["'])([^"'\s]{8,})(["'])/gi,
    replace: (_match, prefix, _val, suffix) => `${prefix}[REDACTED_SECRET:credential]${suffix}`,
  },
];

export function redactSecrets(input: string): RedactResult {
  if (!input || typeof input !== 'string') {
    return { text: input ?? '', redacted: false, secretCount: 0 };
  }

  let text = input;
  let secretCount = 0;

  for (const { pattern, replace } of SECRET_PATTERNS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      secretCount += matches.length;
      text = text.replace(pattern, replace as any);
    }
  }

  return {
    text,
    redacted: secretCount > 0,
    secretCount,
  };
}
