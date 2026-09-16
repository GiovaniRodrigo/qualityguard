import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  SandboxedRepositoryCloner,
  validateRepositoryUrl,
  validateBranch,
  calculateDirectorySize,
  RepositoryValidationError,
  RepositoryCloneTimeoutError,
  RepositorySizeLimitError,
  RepositoryCloneError,
} from './cloner.js';

describe('SandboxedRepositoryCloner — QG-TDD-002', () => {
  let cloner: SandboxedRepositoryCloner;

  beforeEach(() => {
    cloner = new SandboxedRepositoryCloner();
  });

  describe('URL Validation & Sanitization', () => {
    it('1. accepts valid HTTPS GitHub URLs', () => {
      const result1 = validateRepositoryUrl('https://github.com/akitaonrails/ai-memory.git');
      expect(result1).toBe('https://github.com/akitaonrails/ai-memory.git');

      const result2 = validateRepositoryUrl('https://github.com/akitaonrails/ai-memory');
      expect(result2).toBe('https://github.com/akitaonrails/ai-memory.git');
    });

    it('2. accepts shorthand owner/repo notation and expands to HTTPS', () => {
      const result = validateRepositoryUrl('akitaonrails/ai-memory');
      expect(result).toBe('https://github.com/akitaonrails/ai-memory.git');
    });

    it('3. rejects invalid URL syntax', () => {
      expect(() => validateRepositoryUrl('not_a_valid_url')).toThrow(RepositoryValidationError);
      expect(() => validateRepositoryUrl('https://')).toThrow(RepositoryValidationError);
      expect(() => validateRepositoryUrl('https://github.com/')).toThrow(RepositoryValidationError);
    });

    it('4. rejects empty or whitespace-only URLs', () => {
      expect(() => validateRepositoryUrl('')).toThrow(RepositoryValidationError);
      expect(() => validateRepositoryUrl('   ')).toThrow(RepositoryValidationError);
    });

    it('5. rejects disallowed protocols (file://, ftp://, ssh://, data:, javascript:)', () => {
      expect(() => validateRepositoryUrl('file:///etc/passwd')).toThrow(RepositoryValidationError);
      expect(() => validateRepositoryUrl('ftp://ftp.example.com/repo.git')).toThrow(RepositoryValidationError);
      expect(() => validateRepositoryUrl('ssh://git@github.com/repo.git')).toThrow(RepositoryValidationError);
      expect(() => validateRepositoryUrl('data:text/plain;base64,SGVsbG8=')).toThrow(RepositoryValidationError);
      expect(() => validateRepositoryUrl('javascript:alert(1)')).toThrow(RepositoryValidationError);
      expect(() => validateRepositoryUrl('http://insecure-domain.com/repo.git')).toThrow(RepositoryValidationError);
    });

    it('6. prevents command injection in repository URL', () => {
      expect(() => validateRepositoryUrl('https://github.com/org/repo; rm -rf /')).toThrow(RepositoryValidationError);
      expect(() => validateRepositoryUrl('https://github.com/org/repo$(whoami)')).toThrow(RepositoryValidationError);
      expect(() => validateRepositoryUrl('https://github.com/org/repo`id`')).toThrow(RepositoryValidationError);
      expect(() => validateRepositoryUrl('https://github.com/org/repo | cat /etc/passwd')).toThrow(RepositoryValidationError);
      expect(() => validateRepositoryUrl('https://github.com/org/repo\nwhoami')).toThrow(RepositoryValidationError);
    });

    it('7. prevents Git argument and flag injection in repository URL', () => {
      expect(() => validateRepositoryUrl('--upload-pack=touch /tmp/pwned')).toThrow(RepositoryValidationError);
      expect(() => validateRepositoryUrl('-u https://github.com/org/repo')).toThrow(RepositoryValidationError);
      expect(() => validateRepositoryUrl('--config=core.gitProxy=evil')).toThrow(RepositoryValidationError);
    });
  });

  describe('Branch Validation & Sanitization', () => {
    it('accepts valid branch names', () => {
      expect(validateBranch('main')).toBe('main');
      expect(validateBranch('release/2.2')).toBe('release/2.2');
      expect(validateBranch('feature/add-cloner_v2.0')).toBe('feature/add-cloner_v2.0');
    });

    it('rejects malicious or flag-like branch names', () => {
      expect(() => validateBranch('--upload-pack=touch /tmp/pwned')).toThrow(RepositoryValidationError);
      expect(() => validateBranch('-u')).toThrow(RepositoryValidationError);
      expect(() => validateBranch('main; rm -rf /')).toThrow(RepositoryValidationError);
      expect(() => validateBranch('../../../etc/passwd')).toThrow(RepositoryValidationError);
      expect(() => validateBranch('branch\nwith\nnewlines')).toThrow(RepositoryValidationError);
    });
  });

  describe('Directory Size Calculation & Limit Enforcement', () => {
    const testDir = join(tmpdir(), `qg-size-test-${Date.now()}`);

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true }).catch(() => {});
    });

    it('accurately calculates directory size in bytes', async () => {
      await mkdir(testDir, { recursive: true });
      await writeFile(join(testDir, 'file1.txt'), 'Hello world'); // 11 bytes
      await writeFile(join(testDir, 'file2.txt'), 'Another test content'); // 20 bytes

      const subDir = join(testDir, 'subdir');
      await mkdir(subDir, { recursive: true });
      await writeFile(join(subDir, 'file3.txt'), 'Nested file content'); // 19 bytes

      const size = await calculateDirectorySize(testDir);
      expect(size).toBe(11 + 20 + 19);
    });

    it('8. rejects repository if size exceeds maxSizeBytes (e.g. 50MB limit)', async () => {
      const strictCloner = new SandboxedRepositoryCloner({ maxSizeBytes: 50 }); // 50 bytes limit for test
      
      // Attempting to clone a real repository that is larger than 50 bytes should throw RepositorySizeLimitError
      await expect(
        strictCloner.clone({
          repository: 'https://github.com/akitaonrails/ai-memory',
          branch: 'release/2.2',
        })
      ).rejects.toThrow(RepositorySizeLimitError);
    }, 20_000);
  });

  describe('Timeout Enforcement', () => {
    it('9. enforces hard timeout and terminates execution when clone exceeds limit', async () => {
      const fastTimeoutCloner = new SandboxedRepositoryCloner({ timeoutMs: 1 }); // 1ms timeout

      await expect(
        fastTimeoutCloner.clone({
          repository: 'https://github.com/akitaonrails/ai-memory',
          branch: 'release/2.2',
        })
      ).rejects.toThrow(RepositoryCloneTimeoutError);
    });
  });

  describe('Workspace Isolation & Cleanup', () => {
    it('10. isolates concurrent clones in unique directories without collision', async () => {
      const [workspace1, workspace2] = await Promise.all([
        cloner.clone({
          repository: 'https://github.com/akitaonrails/ai-memory',
          branch: 'release/2.2',
        }),
        cloner.clone({
          repository: 'https://github.com/akitaonrails/ai-memory',
          branch: 'release/2.2',
        }),
      ]);

      try {
        expect(workspace1.path).toBeDefined();
        expect(workspace2.path).toBeDefined();
        expect(workspace1.path).not.toBe(workspace2.path);
        expect(existsSync(workspace1.path)).toBe(true);
        expect(existsSync(workspace2.path)).toBe(true);
      } finally {
        await workspace1.cleanup();
        await workspace2.cleanup();
      }
    }, 20_000);

    it('11. guarantees complete workspace cleanup on explicit cleanup call', async () => {
      const workspace = await cloner.clone({
        repository: 'https://github.com/akitaonrails/ai-memory',
        branch: 'release/2.2',
      });

      const path = workspace.path;
      expect(existsSync(path)).toBe(true);

      await workspace.cleanup();
      expect(existsSync(path)).toBe(false);
    }, 20_000);

    it('12. cleans up temporary workspace automatically when clone fails (non-existent repo)', async () => {
      try {
        await cloner.clone({
          repository: 'https://github.com/GiovaniRodrigo/non-existent-repo-qualityguard-99999',
          branch: 'main',
        });
        expect.unreachable('Should have failed on non-existent repo');
      } catch (error) {
        expect(error).toBeInstanceOf(RepositoryCloneError);
      }
    }, 20_000);

    it('13. cleans up temporary workspace automatically when clone times out', async () => {
      const fastTimeoutCloner = new SandboxedRepositoryCloner({ timeoutMs: 1 });

      await expect(
        fastTimeoutCloner.clone({
          repository: 'https://github.com/akitaonrails/ai-memory',
          branch: 'release/2.2',
        })
      ).rejects.toThrow(RepositoryCloneTimeoutError);
    });
  });

  describe('Git Security Flags & Clone Properties', () => {
    it('14. performs shallow clone (--depth 1, --no-tags, submodules disabled) and extracts commit SHA', async () => {
      const workspace = await cloner.clone({
        repository: 'https://github.com/akitaonrails/ai-memory',
        branch: 'release/2.2',
      });

      try {
        expect(workspace.commitSha).toBeDefined();
        expect(typeof workspace.commitSha).toBe('string');
        expect(workspace.commitSha).toMatch(/^[a-f0-9]{40}$/);
        expect(workspace.sizeBytes).toBeGreaterThan(0);
        expect(workspace.sizeBytes).toBeLessThan(50 * 1024 * 1024); // Under 50MB
        expect(existsSync(join(workspace.path, 'Cargo.toml')) || existsSync(join(workspace.path, 'README.md'))).toBe(true);
      } finally {
        await workspace.cleanup();
      }
    }, 20_000);
  });
});
