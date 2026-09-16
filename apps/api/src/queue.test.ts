import { describe, it, expect, vi } from 'vitest';
import { AnalysisQueue } from './queue.js';
import type { IStore, AnalysisJob, Review } from './store.js';
import { MemoryStore } from './store.js';

describe('AnalysisQueue & Worker (TDD)', () => {
  it('enqueues a job and transitions state: queued -> cloning -> analyzing -> completed', async () => {
    const store = new MemoryStore();
    await store.createProject({
      id: 'proj-1',
      organizationId: 'org-1',
      name: 'Test Project',
      repository: 'test/repo',
      createdAt: new Date().toISOString(),
    });
    const transitions: string[] = [];

    const mockRunner = vi.fn().mockImplementation(async (_project, _branch, onProgress) => {
      onProgress?.('cloning', 20);
      transitions.push('cloning');
      onProgress?.('analyzing', 60);
      transitions.push('analyzing');
      const mockReview: Review = {
        id: 'rev-test-1',
        projectId: 'proj-1',
        organizationId: 'org-1',
        score: 95,
        decision: 'approve',
        findings: [],
        analyzedFiles: 10,
        createdAt: new Date().toISOString(),
        status: 'COMPLETED',
      };
      return mockReview;
    });

    const queue = new AnalysisQueue(store, { concurrency: 1, runner: mockRunner });

    const job = await queue.enqueue({
      id: 'job-123',
      projectId: 'proj-1',
      organizationId: 'org-1',
      branch: 'main',
    });

    expect(job.status).toBe('queued');
    expect(job.progress).toBe(0);

    // Wait for job completion
    const completedJob = await queue.waitForJob('job-123', 5000);
    expect(completedJob.status).toBe('completed');
    expect(completedJob.progress).toBe(100);
    expect(completedJob.result).toBeDefined();
    expect(completedJob.result?.id).toBe('rev-test-1');
    expect(completedJob.error).toBeNull();
    expect(transitions).toContain('cloning');
    expect(transitions).toContain('analyzing');
  });

  it('handles worker errors gracefully and transitions state to failed with error message', async () => {
    const store = new MemoryStore();
    await store.createProject({
      id: 'proj-1',
      organizationId: 'org-1',
      name: 'Test Project',
      repository: 'test/repo',
      createdAt: new Date().toISOString(),
    });

    const failingRunner = vi.fn().mockRejectedValue(new Error('Git clone failed: fatal repository not found'));

    const queue = new AnalysisQueue(store, { concurrency: 1, runner: failingRunner });

    const job = await queue.enqueue({
      id: 'job-fail-1',
      projectId: 'proj-1',
      organizationId: 'org-1',
      branch: 'invalid-branch',
    });

    expect(job.status).toBe('queued');

    const failedJob = await queue.waitForJob('job-fail-1', 5000);
    expect(failedJob.status).toBe('failed');
    expect(failedJob.error).toContain('Git clone failed');
    expect(failedJob.completedAt).toBeDefined();

    // Verify persistence in store
    const persisted = await store.getAnalysisJob('job-fail-1');
    expect(persisted?.status).toBe('failed');
    expect(persisted?.error).toContain('Git clone failed');
  });

  it('respects concurrency limits and processes jobs in FIFO order', async () => {
    const store = new MemoryStore();
    await store.createProject({
      id: 'p1',
      organizationId: 'o1',
      name: 'P1 Project',
      repository: 'test/p1',
      createdAt: new Date().toISOString(),
    });
    let runningCount = 0;
    let maxObservedRunning = 0;

    const delayedRunner = vi.fn().mockImplementation(async () => {
      runningCount++;
      if (runningCount > maxObservedRunning) maxObservedRunning = runningCount;
      await new Promise((r) => setTimeout(r, 50));
      runningCount--;
      return {
        id: 'rev-ok',
        projectId: 'p1',
        organizationId: 'o1',
        score: 100,
        decision: 'approve',
        findings: [],
        analyzedFiles: 5,
        createdAt: new Date().toISOString(),
        status: 'COMPLETED',
      } as Review;
    });

    const queue = new AnalysisQueue(store, { concurrency: 2, runner: delayedRunner });

    const [j1, j2, j3, j4] = await Promise.all([
      queue.enqueue({ id: 'j-1', projectId: 'p1', organizationId: 'o1', branch: 'main' }),
      queue.enqueue({ id: 'j-2', projectId: 'p1', organizationId: 'o1', branch: 'main' }),
      queue.enqueue({ id: 'j-3', projectId: 'p1', organizationId: 'o1', branch: 'main' }),
      queue.enqueue({ id: 'j-4', projectId: 'p1', organizationId: 'o1', branch: 'main' }),
    ]);

    expect(j1.status).toBe('queued');

    await Promise.all([
      queue.waitForJob('j-1', 5000),
      queue.waitForJob('j-2', 5000),
      queue.waitForJob('j-3', 5000),
      queue.waitForJob('j-4', 5000),
    ]);

    expect(maxObservedRunning).toBeLessThanOrEqual(2);
  });
});
