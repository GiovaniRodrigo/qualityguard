import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectFiles, resolveRoot, runAnalysis } from './index.js';

describe('CLI analysis & file processing', () => {
  it('collects source files from a directory recursively and ignores ignored dirs', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'qg-cli-test-'));
    try {
      await writeFile(join(tempDir, 'index.ts'), 'export const a = 1;');
      await mkdir(join(tempDir, 'src'));
      await writeFile(join(tempDir, 'src', 'utils.ts'), 'export function b() { return 2; }');
      await mkdir(join(tempDir, 'node_modules'));
      await writeFile(join(tempDir, 'node_modules', 'ignored.ts'), 'export const c = 3;');

      const files = await collectFiles(tempDir);
      const paths = files.map((f) => f.path);

      expect(paths).toContain('index.ts');
      expect(paths).toContain(join('src', 'utils.ts'));
      expect(paths).not.toContain(join('node_modules', 'ignored.ts'));
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('resolves root target directory', async () => {
    const root = await resolveRoot('.');
    expect(root).toBeDefined();
    expect(typeof root).toBe('string');
  });

  it('runs analysis on a target directory and produces score and gate', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'qg-cli-run-'));
    try {
      await writeFile(
        join(tempDir, 'index.ts'),
        'export function healthy() { return 42; }'
      );
      const { result, gate } = await runAnalysis(tempDir, []);
      expect(result.analyzedFiles).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(gate).toBeDefined();
      expect(gate.decision).toBeDefined();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
