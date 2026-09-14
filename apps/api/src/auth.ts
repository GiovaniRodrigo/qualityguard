import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

function secret(): string {
  const value = process.env.QUALITYGUARD_AUTH_SECRET;
  if (!value && process.env.NODE_ENV === 'production') throw new Error('QUALITYGUARD_AUTH_SECRET is required in production');
  return value ?? 'development-only-change-me';
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 32).toString('hex');
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function signToken(subject: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: subject, iat: now, exp: now + 60 * 60 * 24 * 7 })).toString('base64url');
  const data = `${header}.${payload}`;
  const signature = createHmac('sha256', secret()).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifyToken(token: string): string | null {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;
  const data = `${header}.${payload}`;
  const expected = createHmac('sha256', secret()).update(data).digest('base64url');
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub?: string; exp?: number };
    return value.sub && value.exp && value.exp > Date.now() / 1000 ? value.sub : null;
  } catch {
    return null;
  }
}
