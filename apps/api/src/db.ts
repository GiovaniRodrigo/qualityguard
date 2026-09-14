import pg from 'pg';
const { Pool } = pg;
export const pool = process.env.DATABASE_URL ? new Pool({connectionString:process.env.DATABASE_URL, max:10}) : null;
export async function healthDatabase(){if(!pool)return false;const result=await pool.query('select 1 as ok');return result.rows[0]?.ok===1;}
export async function recordUsage(organizationId:string,eventType:string,quantity:number,metadata:Record<string,unknown>={}){if(!pool)throw new Error('DATABASE_URL is required');await pool.query('insert into usage_events(id,organization_id,event_type,quantity,metadata) values(gen_random_uuid(),$1,$2,$3,$4)',[organizationId,eventType,quantity,metadata]);}
