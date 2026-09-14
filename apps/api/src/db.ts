import pg from 'pg';
import type { Organization, Project, User } from './store.js';

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
  if (!pool) throw new Error('DATABASE_URL is required');
  await pool.query(
    'insert into usage_events(id,organization_id,event_type,quantity,metadata) values(gen_random_uuid(),$1,$2,$3,$4)',
    [organizationId, eventType, quantity, metadata],
  );
}

export async function recordStripeEvent(eventId: string, eventType: string): Promise<boolean> {
  if (!pool) throw new Error('DATABASE_URL is required');
  const result = await pool.query(
    'insert into stripe_events(id,event_type) values($1,$2) on conflict (id) do nothing returning id',
    [eventId, eventType],
  );
  return result.rowCount === 1;
}

export class PostgresStore {
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

  async listProjects(organizationId: string): Promise<Project[]> {
    if (!pool) throw new Error('DATABASE_URL is required');
    const result = await pool.query<Project>(
      'select id,organization_id as "organizationId",name,repository,created_at as "createdAt" from projects where organization_id=$1 order by created_at desc',
      [organizationId],
    );
    return result.rows;
  }
}
