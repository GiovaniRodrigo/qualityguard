import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { IStore, AnalysisJob, Project, Review } from './store.js';
import { runRepositoryAnalysis } from './analysis.js';

export type AnalysisRunner = (
  project: Project,
  branch: string,
  onProgress?: (step: 'cloning' | 'analyzing', progress: number) => void,
  store?: IStore,
) => Promise<Review>;

export const defaultRunner: AnalysisRunner = async (project, branch, onProgress, store) => {
  onProgress?.('cloning', 20);
  const rules = store ? await store.listArchitectureRules(project.id) : [];
  const output = await runRepositoryAnalysis(project.repository, branch, undefined, rules);
  onProgress?.('analyzing', 70);

  const review: Review = {
    id: randomUUID(),
    projectId: project.id,
    organizationId: project.organizationId,
    projectName: project.name,
    repository: project.repository,
    branch,
    commitSha: output.commitSha,
    score: output.score,
    decision: output.decision,
    findings: output.findings,
    analyzedFiles: output.analyzedFiles,
    architecture: output.architecture,
    dependencies: output.dependencies,
    gate: output.gate,
    categoryScores: output.categoryScores,
    aiInsight: output.aiInsight,
    status: 'COMPLETED',
    createdAt: new Date().toISOString(),
  };

  return review;
};

export interface AnalysisQueueOptions {
  concurrency?: number;
  runner?: AnalysisRunner;
}

export interface EnqueueJobInput {
  id: string;
  projectId: string;
  organizationId: string;
  branch: string;
}

export class AnalysisQueue extends EventEmitter {
  private readonly concurrency: number;
  private readonly runner: AnalysisRunner;
  private activeCount = 0;
  private queue: EnqueueJobInput[] = [];

  constructor(private readonly store: IStore, options: AnalysisQueueOptions = {}) {
    super();
    this.concurrency = options.concurrency ?? 2;
    this.runner = options.runner ?? defaultRunner;
  }

  async enqueue(input: EnqueueJobInput): Promise<AnalysisJob> {
    const job: AnalysisJob = {
      id: input.id,
      projectId: input.projectId,
      organizationId: input.organizationId,
      branch: input.branch,
      status: 'queued',
      progress: 0,
      startedAt: new Date().toISOString(),
      error: null,
      result: null,
    };

    await this.store.createAnalysisJob(job);
    this.queue.push(input);
    this.emit('job:enqueued', job);

    setImmediate(() => {
      this.processNext();
    });

    return job;
  }

  async getJob(id: string): Promise<AnalysisJob | undefined> {
    return this.store.getAnalysisJob(id);
  }

  async waitForJob(id: string, timeoutMs = 60000): Promise<AnalysisJob> {
    const existing = await this.getJob(id);
    if (existing && (existing.status === 'completed' || existing.status === 'failed')) {
      return existing;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for analysis job ${id}`));
      }, timeoutMs);

      const handler = (job: AnalysisJob) => {
        if (job.id === id) {
          cleanup();
          resolve(job);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.off('job:completed', handler);
        this.off('job:failed', handler);
      };

      this.on('job:completed', handler);
      this.on('job:failed', handler);
    });
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const nextJobInput = this.queue.shift();
    if (!nextJobInput) return;

    this.activeCount++;
    this.executeJob(nextJobInput).finally(() => {
      this.activeCount--;
      this.processNext();
    });
  }

  private async executeJob(input: EnqueueJobInput): Promise<void> {
    const project = await this.store.getProject(input.projectId);
    if (!project) {
      const failed = await this.store.updateAnalysisJob(input.id, {
        status: 'failed',
        error: `Project ${input.projectId} not found`,
        completedAt: new Date().toISOString(),
      });
      if (failed) this.emit('job:failed', failed);
      return;
    }

    try {
      await this.store.updateAnalysisJob(input.id, {
        status: 'cloning',
        progress: 20,
      });
      this.emit('job:cloning', { id: input.id, progress: 20 });

      const review = await this.runner(
        project,
        input.branch,
        async (step, progress) => {
          await this.store.updateAnalysisJob(input.id, {
            status: step,
            progress,
          });
          this.emit(`job:${step}`, { id: input.id, progress });
        },
        this.store,
      );

      await this.store.createReview(review);

      const completedJob = await this.store.updateAnalysisJob(input.id, {
        status: 'completed',
        progress: 100,
        result: review,
        completedAt: new Date().toISOString(),
      });

      if (completedJob) {
        this.emit('job:completed', completedJob);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failedJob = await this.store.updateAnalysisJob(input.id, {
        status: 'failed',
        error: errorMessage,
        completedAt: new Date().toISOString(),
      });

      if (failedJob) {
        this.emit('job:failed', failedJob);
      }
    }
  }
}

let globalQueue: AnalysisQueue | null = null;

export function getAnalysisQueue(store: IStore): AnalysisQueue {
  if (!globalQueue) {
    globalQueue = new AnalysisQueue(store);
  }
  return globalQueue;
}
