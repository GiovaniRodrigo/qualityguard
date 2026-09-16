import pg from 'pg';
import { MemoryStore, type AnalysisJob, type ArchitectureRule, type CoverageReport, type CoverageSummary, type IStore, type Organization, type Project, type Review, type User } from './store.js';

const { Pool } = pg;
export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX ?? 10), idleTimeoutMillis: 30_000 })
  : null;

export async function healthDatabase(): Promise<boolean> {
  if (!pool) return false;
  try {
    const result = await pool.query<{ ok: number }>('select 1 as ok');
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}

export async function recordUsage(
  organizationId: string,
  eventType: string,
  quantity: number,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      'insert into usage_events(id,organization_id,event_type,quantity,metadata) values(gen_random_uuid(),$1,$2,$3,$4)',
      [organizationId, eventType, quantity, metadata],
    );
  } catch (error) {
    console.warn('recordUsage warning:', error);
  }
}

export async function recordStripeEvent(eventId: string, eventType: string): Promise<boolean> {
  if (!pool) return true;
  try {
    const result = await pool.query(
      'insert into stripe_events(id,event_type) values($1,$2) on conflict (id) do nothing returning id',
      [eventId, eventType],
    );
    return result.rowCount === 1;
  } catch (error) {
    console.warn('recordStripeEvent warning:', error);
    return true;
  }
}

export class PostgresStore implements IStore {
  async findUserByEmail(email: string): Promise<User | undefined> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<User>(
      'select id,email,password_hash as "passwordHash",created_at as "createdAt" from users where email=$1',
      [email],
    );
    return result.rows[0];
  }

  async getUser(id: string): Promise<User | undefined> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<User>(
      'select id,email,password_hash as "passwordHash",created_at as "createdAt" from users where id=$1',
      [id],
    );
    return result.rows[0];
  }

  async createUser(user: User): Promise<void> {
    if (!pool) throw new Error('DATABASE_URL is required');
    await pool.query(
      'insert into users(id,email,password_hash,created_at) values($1,$2,$3,$4)',
      [user.id, user.email, user.passwordHash, user.createdAt],
    );
  }

  async createOrganization(org: Organization): Promise<void> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(
        'insert into organizations(id,name,owner_id,plan,stripe_customer_id) values($1,$2,$3,$4,$5)',
        [org.id, org.name, org.ownerId, org.plan, org.stripeCustomerId ?? null],
      );
      await client.query(
        'insert into organization_members(organization_id,user_id,role) values($1,$2,$3)',
        [org.id, org.ownerId, 'owner'],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async findOrganizationByOwner(ownerId: string): Promise<Organization | undefined> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<Organization>(
      `select id,name,owner_id as "ownerId",plan,stripe_customer_id as "stripeCustomerId",
       stripe_subscription_id as "stripeSubscriptionId",subscription_status as "subscriptionStatus"
       from organizations where owner_id=$1 limit 1`,
      [ownerId],
    );
    return result.rows[0];
  }

  async findOrganizationByStripeCustomer(customerId: string): Promise<Organization | undefined> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<Organization>(
      `select id,name,owner_id as "ownerId",plan,stripe_customer_id as "stripeCustomerId",
       stripe_subscription_id as "stripeSubscriptionId",subscription_status as "subscriptionStatus"
       from organizations where stripe_customer_id=$1`,
      [customerId],
    );
    return result.rows[0];
  }

  async updateSubscription(
    organizationId: string,
    values: { plan?: Organization['plan']; subscriptionId?: string; status?: string },
  ): Promise<void> {
    if (!pool) throw new Error('DATABASE_URL is required');
    await pool.query(
      `update organizations set
        plan=coalesce($2,plan),
        stripe_subscription_id=coalesce($3,stripe_subscription_id),
        subscription_status=coalesce($4,subscription_status)
       where id=$1`,
      [organizationId, values.plan ?? null, values.subscriptionId ?? null, values.status ?? null],
    );
  }

  async createProject(project: Project): Promise<void> {
    if (!pool) throw new Error('DATABASE_URL is required');
    await pool.query(
      'insert into projects(id,organization_id,name,repository,created_at) values($1,$2,$3,$4,$5)',
      [project.id, project.organizationId, project.name, project.repository, project.createdAt],
    );
  }

  async getProject(id: string): Promise<Project | undefined> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<Project>(
      'select id,organization_id as "organizationId",name,repository,created_at as "createdAt" from projects where id=$1',
      [id],
    );
    return result.rows[0];
  }

  async listProjects(organizationId: string): Promise<Project[]> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<Project>(
      'select id,organization_id as "organizationId",name,repository,created_at as "createdAt" from projects where organization_id=$1 order by created_at desc',
      [organizationId],
    );
    return result.rows;
  }

  async deleteProject(id: string): Promise<void> {
    if (!pool) throw new Error('DATABASE_URL is required');
    await pool.query('delete from projects where id=$1', [id]);
  }

  async createReview(review: Review): Promise<void> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const reviewData = {
      ...review,
    };
    await pool.query(
      'insert into reviews(id,project_id,commit_sha,score,decision,findings,created_at) values($1,$2,$3,$4,$5,$6,$7)',
      [review.id, review.projectId, review.commitSha ?? null, review.score, review.decision, JSON.stringify(reviewData), review.createdAt],
    );
  }

  async getReview(id: string): Promise<Review | undefined> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<{ id: string; project_id: string; commit_sha: string; score: number; decision: string; findings: string; created_at: string }>(
      'select id,project_id,commit_sha,score,decision,findings,created_at from reviews where id=$1',
      [id],
    );
    if (!result.rows[0]) return undefined;
    const row = result.rows[0];
    const data = typeof row.findings === 'string' ? JSON.parse(row.findings) : row.findings;
    return { ...data, id: row.id, projectId: row.project_id, score: row.score, decision: row.decision, createdAt: row.created_at };
  }

  async listReviews(projectId: string): Promise<Review[]> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<{ id: string; project_id: string; commit_sha: string; score: number; decision: string; findings: string; created_at: string }>(
      'select id,project_id,commit_sha,score,decision,findings,created_at from reviews where project_id=$1 order by created_at desc',
      [projectId],
    );
    return result.rows.map((row) => {
      const data = typeof row.findings === 'string' ? JSON.parse(row.findings) : row.findings;
      return { ...data, id: row.id, projectId: row.project_id, score: row.score, decision: row.decision, createdAt: row.created_at };
    });
  }

  async listRecentReviews(organizationId: string, limit = 20): Promise<Review[]> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<{ id: string; project_id: string; commit_sha: string; score: number; decision: string; findings: string; created_at: string }>(
      `select r.id,r.project_id,r.commit_sha,r.score,r.decision,r.findings,r.created_at
       from reviews r
       inner join projects p on p.id=r.project_id
       where p.organization_id=$1
       order by r.created_at desc
       limit $2`,
      [organizationId, limit],
    );
    return result.rows.map((row) => {
      const data = typeof row.findings === 'string' ? JSON.parse(row.findings) : row.findings;
      return { ...data, id: row.id, projectId: row.project_id, score: row.score, decision: row.decision, createdAt: row.created_at };
    });
  }

  async getLatestReview(projectId: string): Promise<Review | undefined> {
    const list = await this.listReviews(projectId);
    return list[0];
  }

  readonly jobs = new Map<string, AnalysisJob>();
  readonly deliveries = new Set<string>();

  async recordWebhookDelivery(deliveryId: string): Promise<boolean> {
    if (this.deliveries.has(deliveryId)) return false;
    this.deliveries.add(deliveryId);
    return true;
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
    if (!pool) throw new Error('DATABASE_URL is required');
    await pool.query(
      `insert into architecture_rules(id, project_id, organization_id, name, description, enabled, severity, type, config, created_at, updated_at)
       values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        rule.id,
        rule.projectId,
        rule.organizationId ?? '00000000-0000-0000-0000-000000000000',
        rule.name,
        rule.description ?? null,
        rule.enabled,
        rule.severity,
        rule.type,
        JSON.stringify(rule.config ?? {}),
        rule.createdAt,
        rule.updatedAt,
      ],
    );
  }

  async getArchitectureRule(id: string): Promise<ArchitectureRule | undefined> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<{
      id: string;
      project_id: string;
      organization_id: string;
      name: string;
      description: string | null;
      enabled: boolean;
      severity: string;
      type: string;
      config: string | Record<string, unknown>;
      created_at: string;
      updated_at: string;
    }>(
      `select id, project_id, organization_id, name, description, enabled, severity, type, config, created_at, updated_at
       from architecture_rules where id=$1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
    return {
      id: row.id,
      projectId: row.project_id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description ?? undefined,
      enabled: row.enabled,
      severity: row.severity as any,
      type: row.type as any,
      config,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async listArchitectureRules(projectId: string): Promise<ArchitectureRule[]> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<{
      id: string;
      project_id: string;
      organization_id: string;
      name: string;
      description: string | null;
      enabled: boolean;
      severity: string;
      type: string;
      config: string | Record<string, unknown>;
      created_at: string;
      updated_at: string;
    }>(
      `select id, project_id, organization_id, name, description, enabled, severity, type, config, created_at, updated_at
       from architecture_rules where project_id=$1 order by created_at desc`,
      [projectId],
    );
    return result.rows.map((row) => {
      const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
      return {
        id: row.id,
        projectId: row.project_id,
        organizationId: row.organization_id,
        name: row.name,
        description: row.description ?? undefined,
        enabled: row.enabled,
        severity: row.severity as any,
        type: row.type as any,
        config,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  async updateArchitectureRule(id: string, update: Partial<ArchitectureRule>): Promise<ArchitectureRule | undefined> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const existing = await this.getArchitectureRule(id);
    if (!existing) return undefined;

    const updated: ArchitectureRule = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString(),
    };

    await pool.query(
      `update architecture_rules set
        name=$2,
        description=$3,
        enabled=$4,
        severity=$5,
        type=$6,
        config=$7,
        updated_at=$8
       where id=$1`,
      [
        id,
        updated.name,
        updated.description ?? null,
        updated.enabled,
        updated.severity,
        updated.type,
        JSON.stringify(updated.config ?? {}),
        updated.updatedAt,
      ],
    );

    return updated;
  }

  async deleteArchitectureRule(id: string): Promise<void> {
    if (!pool) throw new Error('DATABASE_URL is required');
    await pool.query('delete from architecture_rules where id=$1', [id]);
  }

  async createCoverageReport(report: CoverageReport): Promise<void> {
    if (!pool) throw new Error('DATABASE_URL is required');
    await pool.query(
      `insert into coverage_reports(id, project_id, review_id, organization_id, format, summary, files_count, file_coverage, created_at)
       values($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        report.id,
        report.projectId,
        report.reviewId,
        report.organizationId,
        report.format,
        JSON.stringify(report.summary),
        report.filesCount,
        report.fileCoverage ? JSON.stringify(report.fileCoverage) : null,
        report.createdAt,
      ],
    );
    await this.updateReviewCoverage(report.reviewId, report.summary);
  }

  async getCoverageReport(id: string): Promise<CoverageReport | undefined> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<{
      id: string;
      project_id: string;
      review_id: string;
      organization_id: string;
      format: string;
      summary: string | object;
      files_count: number;
      file_coverage: string | object | null;
      created_at: string;
    }>(
      `select id, project_id, review_id, organization_id, format, summary, files_count, file_coverage, created_at
       from coverage_reports where id=$1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const summary = typeof row.summary === 'string' ? JSON.parse(row.summary) : row.summary;
    const fileCoverage = row.file_coverage
      ? typeof row.file_coverage === 'string'
        ? JSON.parse(row.file_coverage)
        : row.file_coverage
      : undefined;

    return {
      id: row.id,
      projectId: row.project_id,
      reviewId: row.review_id,
      organizationId: row.organization_id,
      format: row.format as any,
      summary,
      filesCount: row.files_count,
      fileCoverage,
      createdAt: row.created_at,
    };
  }

  async getCoverageReportByReview(reviewId: string): Promise<CoverageReport | undefined> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<{
      id: string;
      project_id: string;
      review_id: string;
      organization_id: string;
      format: string;
      summary: string | object;
      files_count: number;
      file_coverage: string | object | null;
      created_at: string;
    }>(
      `select id, project_id, review_id, organization_id, format, summary, files_count, file_coverage, created_at
       from coverage_reports where review_id=$1`,
      [reviewId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const summary = typeof row.summary === 'string' ? JSON.parse(row.summary) : row.summary;
    const fileCoverage = row.file_coverage
      ? typeof row.file_coverage === 'string'
        ? JSON.parse(row.file_coverage)
        : row.file_coverage
      : undefined;

    return {
      id: row.id,
      projectId: row.project_id,
      reviewId: row.review_id,
      organizationId: row.organization_id,
      format: row.format as any,
      summary,
      filesCount: row.files_count,
      fileCoverage,
      createdAt: row.created_at,
    };
  }

  async getLatestCoverageReport(projectId: string): Promise<CoverageReport | undefined> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<{
      id: string;
      project_id: string;
      review_id: string;
      organization_id: string;
      format: string;
      summary: string | object;
      files_count: number;
      file_coverage: string | object | null;
      created_at: string;
    }>(
      `select id, project_id, review_id, organization_id, format, summary, files_count, file_coverage, created_at
       from coverage_reports where project_id=$1 order by created_at desc limit 1`,
      [projectId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const summary = typeof row.summary === 'string' ? JSON.parse(row.summary) : row.summary;
    const fileCoverage = row.file_coverage
      ? typeof row.file_coverage === 'string'
        ? JSON.parse(row.file_coverage)
        : row.file_coverage
      : undefined;

    return {
      id: row.id,
      projectId: row.project_id,
      reviewId: row.review_id,
      organizationId: row.organization_id,
      format: row.format as any,
      summary,
      filesCount: row.files_count,
      fileCoverage,
      createdAt: row.created_at,
    };
  }

  async updateReviewCoverage(reviewId: string, summary: CoverageSummary): Promise<void> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<{ findings: string | object }>(
      'select findings from reviews where id=$1',
      [reviewId],
    );
    if (result.rows[0]) {
      const data = typeof result.rows[0].findings === 'string'
        ? JSON.parse(result.rows[0].findings)
        : result.rows[0].findings;

      data.coverage = summary;
      if (!data.categoryScores) {
        data.categoryScores = { architecture: 100, security: 100, testing: null, dependencies: 100 };
      }
      data.categoryScores.testing = summary.lines.percentage;

      await pool.query(
        'update reviews set findings=$2 where id=$1',
        [reviewId, JSON.stringify(data)],
      );
    }
  }

  async findFindingById(
    organizationId: string,
    findingId: string,
  ): Promise<{ finding: any; review: Review; project: Project } | undefined> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const res = await pool.query<{
      review_id: string;
      findings: string | object;
      commit_sha: string;
      score: number;
      decision: string;
      review_created_at: string;
      project_id: string;
      organization_id: string;
      project_name: string;
      repository: string;
      project_created_at: string;
    }>(
      `SELECT r.id AS review_id, r.findings, r.commit_sha, r.score, r.decision, r.created_at AS review_created_at,
              p.id AS project_id, p.organization_id, p.name AS project_name, p.repository, p.created_at AS project_created_at
       FROM reviews r
       JOIN projects p ON r.project_id = p.id
       WHERE p.organization_id = $1
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [organizationId],
    );

    for (const row of res.rows) {
      const data = typeof row.findings === 'string' ? JSON.parse(row.findings) : row.findings;
      const review: Review = {
        ...data,
        id: row.review_id,
        projectId: row.project_id,
        score: row.score,
        decision: row.decision as any,
        createdAt: row.review_created_at,
      };
      const finding = review.findings?.find((f) => f.id === findingId);
      if (finding) {
        const project: Project = {
          id: row.project_id,
          organizationId: row.organization_id,
          name: row.project_name,
          repository: row.repository,
          createdAt: row.project_created_at,
        };
        return { finding, review, project };
      }
    }
    return undefined;
  }
}


// Fallback singleton store: will use Postgres if available and healthy, otherwise MemoryStore
let activeStore: IStore | null = null;
export function getStore(): IStore {
  if (!activeStore) {
    if (pool) {
      activeStore = new PostgresStore();
    } else {
      activeStore = new MemoryStore();
    }
  }
  return activeStore;
}
