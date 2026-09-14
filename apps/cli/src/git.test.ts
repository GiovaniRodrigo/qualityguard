import { describe, expect, it } from 'vitest';
import { gitDiff, gitDiffCached } from './git.js';

describe('cli git helper functions', () => {
  it('exports git diff helper functions', () => {
    expect(typeof gitDiff).toBe('function');
    expect(typeof gitDiffCached).toBe('function');
  });
});
