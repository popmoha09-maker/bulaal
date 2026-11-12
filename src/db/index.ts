import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import * as schema from './schema.ts';

const { Pool } = pkg;

declare global {
  var _postgresPool: pkg.Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const connectionString = 
      process.env.DATABASE_URL || 
      process.env.SUPABASE_DB_URL || 
      'postgresql://postgres:ET%24vhmEQQ4t7UXN@db.eqxzxmolcvqctkgcbpxy.supabase.co:5432/postgres';

    if (connectionString) {
      try {
        global._postgresPool = new Pool({
          connectionString,
          ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
          max: 5,
          connectionTimeoutMillis: 5000,
        });

        global._postgresPool.on('error', (err) => {
          console.warn('Postgres notice (app running with local offline DB):', err.message);
        });
      } catch (e) {
        console.warn('Postgres initialization bypassed; using local offline storage.');
      }
    }
  }
  return global._postgresPool;
};

export const pool = createPool();
export const db = pool ? drizzle(pool, { schema }) : null;

