import { describe, expect, it } from 'vitest';
import { hashPassword, signToken, verifyPassword, verifyToken } from './auth.js';

describe('auth utilities', () => {
  it('hashes and verifies passwords securely', () => {
    const password = 'SuperSecurePassword123!';
    const hash = hashPassword(password);
    expect(hash).toContain(':');
    expect(verifyPassword(password, hash)).toBe(true);
    expect(verifyPassword('WrongPassword123!', hash)).toBe(false);
  });

  it('signs and verifies JWT tokens', () => {
    const userId = 'user-12345';
    const token = signToken(userId);
    expect(token.split('.')).toHaveLength(3);
    const verified = verifyToken(token);
    expect(verified).toBe(userId);
  });

  it('rejects tampered JWT tokens', () => {
    const token = signToken('user-12345');
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.invalidsignature`;
    expect(verifyToken(tampered)).toBeNull();
  });
});
