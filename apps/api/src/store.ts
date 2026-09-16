import type { Finding, DependencyItem, ArchitectureRule, CoverageReport, CoverageSummary, CoverageFormat } from '@qualityguard/domain';

export type { DependencyItem, ArchitectureRule, CoverageReport, CoverageSummary, CoverageFormat };

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  plan: 'community' | 'pro' | 'team' | 'enterprise';
  stripeCustomerId?: string | undefined;
  stripeSubscriptionId?: string | undefined;
  subscriptionStatus?: string | undefined;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  repository: string;
  branch?: string | undefined;
  createdAt: string;
}

export interface Review {
  id: string;
  projectId: string;
  organizationId: string;
  projectName?: string | undefined;
  repository?: string | undefined;
  branch?: string | undefined;
  commitSha?: string | undefined;
  score: number;
  decision: string;
  findings: Finding[];
  analyzedFiles: number;
  architecture?: {
    nodes: string[];
    edges: Array<{ from: string; to: string; kind: 'import' | 'require' }>;
    cycles: string[][];
    drift: Array<{ type: string; from: string; to: string; message: string }>;
  } | undefined;
  dependencies?: DependencyItem[] | undefined;
  coverage?: CoverageSummary | undefined;
  gate?: {
    passed: boolean;
    reasons: string[];
    decision: string;
  } | undefined;
  categoryScores?: {
    architecture: number;
    security: number;
    testing: number | null;
    dependencies: number;
  } | undefined;
  aiInsight?: string | undefined;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  errorMessage?: string | undefined;
  createdAt: string;
}

export type JobStatus = 'queued' | 'cloning' | 'analyzing' | 'completed' | 'failed';

export interface AnalysisJob {
  id: string;
  projectId: string;
  organizationId: string;
  branch: string;
  status: JobStatus;
  progress: number;
  startedAt: string;
  completedAt?: string | null | undefined;
  error?: string | null | undefined;
  result?: Review | null | undefined;
}

export interface IStore {
  findUserByEmail(email: string): Promise<User | undefined>;
  getUser(id: string): Promise<User | undefined>;
  createUser(user: User): Promise<void>;
  createOrganization(org: Organization): Promise<void>;
  findOrganizationByOwner(ownerId: string): Promise<Organization | undefined>;
  findOrganizationByStripeCustomer(customerId: string): Promise<Organization | undefined>;
  updateSubscription(
    organizationId: string,
    values: { plan?: Organization['plan']; subscriptionId?: string; status?: string },
  ): Promise<void>;
  createProject(project: Project): Promise<void>;
  getProject(id: string): Promise<Project | undefined>;
  listProjects(organizationId: string): Promise<Project[]>;
  deleteProject(id: string): Promise<void>;
  createReview(review: Review): Promise<void>;
  getReview(id: string): Promise<Review | undefined>;
  listReviews(projectId: string): Promise<Review[]>;
  listRecentReviews(organizationId: string, limit?: number): Promise<Review[]>;
  getLatestReview(projectId: string): Promise<Review | undefined>;
  createAnalysisJob(job: AnalysisJob): Promise<void>;
  updateAnalysisJob(id: string, update: Partial<AnalysisJob>): Promise<AnalysisJob | undefined>;
  getAnalysisJob(id: string): Promise<AnalysisJob | undefined>;
  recordWebhookDelivery(deliveryId: string): Promise<boolean>;
  createArchitectureRule(rule: ArchitectureRule): Promise<void>;
  getArchitectureRule(id: string): Promise<ArchitectureRule | undefined>;
  listArchitectureRules(projectId: string): Promise<ArchitectureRule[]>;
  updateArchitectureRule(id: string, update: Partial<ArchitectureRule>): Promise<ArchitectureRule | undefined>;
  deleteArchitectureRule(id: string): Promise<void>;
  findFindingById(
    organizationId: string,
    findingId: string,
  ): Promise<{ finding: Finding; review: Review; project: Project } | undefined>;
  createCoverageReport(report: CoverageReport): Promise<void>;
  getCoverageReport(id: string): Promise<CoverageReport | undefined>;
  getCoverageReportByReview(reviewId: string): Promise<CoverageReport | undefined>;
  getLatestCoverageReport(projectId: string): Promise<CoverageReport | undefined>;
  updateReviewCoverage(reviewId: string, summary: CoverageSummary): Promise<void>;
}


export class MemoryStore implements IStore {
  readonly users = new Map<string, User>();
  readonly organizations = new Map<string, Organization>();
  readonly projects = new Map<string, Project>();
  readonly reviews = new Map<string, Review>();
  readonly jobs = new Map<string, AnalysisJob>();
  readonly rules = new Map<string, ArchitectureRule>();
  readonly deliveries = new Set<string>();

  async recordWebhookDelivery(deliveryId: string): Promise<boolean> {
    if (this.deliveries.has(deliveryId)) return false;
    this.deliveries.add(deliveryId);
    return true;
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    return [...this.users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async createUser(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  async createOrganization(org: Organization): Promise<void> {
    this.organizations.set(org.id, org);
  }

  async findOrganizationByOwner(ownerId: string): Promise<Organization | undefined> {
    return [...this.organizations.values()].find((o) => o.ownerId === ownerId);
  }

  async findOrganizationByStripeCustomer(customerId: string): Promise<Organization | undefined> {
    return [...this.organizations.values()].find((o) => o.stripeCustomerId === customerId);
  }

  async updateSubscription(
    organizationId: string,
    values: { plan?: Organization['plan']; subscriptionId?: string; status?: string },
  ): Promise<void> {
    const org = this.organizations.get(organizationId);
    if (!org) return;
    if (values.plan) org.plan = values.plan;
    if (values.subscriptionId) org.stripeSubscriptionId = values.subscriptionId;
    if (values.status) org.subscriptionStatus = values.status;
  }

  async createProject(project: Project): Promise<void> {
    this.projects.set(project.id, project);
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async listProjects(organizationId: string): Promise<Project[]> {
    return [...this.projects.values()]
      .filter((p) => p.organizationId === organizationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteProject(id: string): Promise<void> {
    this.projects.delete(id);
    for (const [reviewId, review] of this.reviews.entries()) {
      if (review.projectId === id) {
        this.reviews.delete(reviewId);
      }
    }
    for (const [ruleId, rule] of this.rules.entries()) {
      if (rule.projectId === id) {
        this.rules.delete(ruleId);
      }
    }
  }

  async createReview(review: Review): Promise<void> {
    this.reviews.set(review.id, review);
  }

  async getReview(id: string): Promise<Review | undefined> {
    return this.reviews.get(id);
  }

  async listReviews(projectId: string): Promise<Review[]> {
    return [...this.reviews.values()]
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listRecentReviews(organizationId: string, limit = 20): Promise<Review[]> {
    return [...this.reviews.values()]
      .filter((r) => r.organizationId === organizationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async getLatestReview(projectId: string): Promise<Review | undefined> {
    const list = await this.listReviews(projectId);
    return list[0];
  }

  async createAnalysisJob(job: AnalysisJob): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async updateAnalysisJob(id: string, update: Partial<AnalysisJob>): Promise<AnalysisJob | undefined> {
    const existing = this.jobs.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...update };
    this.jobs.set(id, updated);
    return updated;
  }

  async getAnalysisJob(id: string): Promise<AnalysisJob | undefined> {
    return this.jobs.get(id);
  }

  async createArchitectureRule(rule: ArchitectureRule): Promise<void> {
    this.rules.set(rule.id, rule);
  }

  async getArchitectureRule(id: string): Promise<ArchitectureRule | undefined> {
    return this.rules.get(id);
  }

  async listArchitectureRules(projectId: string): Promise<ArchitectureRule[]> {
    return [...this.rules.values()]
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateArchitectureRule(id: string, update: Partial<ArchitectureRule>): Promise<ArchitectureRule | undefined> {
    const existing = this.rules.get(id);
    if (!existing) return undefined;
    const updated: ArchitectureRule = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    this.rules.set(id, updated);
    return updated;
  }

  async deleteArchitectureRule(id: string): Promise<void> {
    this.rules.delete(id);
  }

  readonly coverageReports = new Map<string, CoverageReport>();

  async createCoverageReport(report: CoverageReport): Promise<void> {
    this.coverageReports.set(report.id, report);
    await this.updateReviewCoverage(report.reviewId, report.summary);
  }

  async getCoverageReport(id: string): Promise<CoverageReport | undefined> {
    return this.coverageReports.get(id);
  }

  async getCoverageReportByReview(reviewId: string): Promise<CoverageReport | undefined> {
    return [...this.coverageReports.values()].find((c) => c.reviewId === reviewId);
  }

  async getLatestCoverageReport(projectId: string): Promise<CoverageReport | undefined> {
    const list = [...this.coverageReports.values()]
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list[0];
  }

  async updateReviewCoverage(reviewId: string, summary: CoverageSummary): Promise<void> {
    const review = this.reviews.get(reviewId);
    if (review) {
      review.coverage = summary;
      if (!review.categoryScores) {
        review.categoryScores = { architecture: 100, security: 100, testing: null, dependencies: 100 };
      }
      review.categoryScores.testing = summary.lines.percentage;
    }
  }

  async findFindingById(
    organizationId: string,
    findingId: string,
  ): Promise<{ finding: Finding; review: Review; project: Project } | undefined> {
    for (const review of this.reviews.values()) {
      if (review.organizationId === organizationId) {
        const finding = review.findings.find((f) => f.id === findingId);
        if (finding) {
          const project = this.projects.get(review.projectId);
          if (project) {
            return { finding, review, project };
          }
        }
      }
    }
    return undefined;
  }
}


