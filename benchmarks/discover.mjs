/** List public tables by row count and check which are readable via REST. */
import { createRequire } from 'node:module';
import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({ path: new URL('./.env', import.meta.url) });
const require = createRequire(import.meta.url);

const { SUPABASE_URL, SUPABASE_KEY, DB_CONNECTION, BENCH_DB_SSL = 'true' } = process.env;
const ssl = BENCH_DB_SSL === 'true' ? { rejectUnauthorized: false } : false;
const pool = new pg.Pool({ connectionString: DB_CONNECTION, ssl, max: 2 });

const { rows } = await pool.query(
  `SELECT relname, n_live_tup
     FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY n_live_tup DESC
    LIMIT 15`
);

console.log('Top public tables (by est. rows):');
for (const t of rows) {
  let rest = '?';
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${t.relname}?select=*&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    rest = res.status === 200 ? 'REST ok' : `REST ${res.status}`;
  } catch (e) {
    rest = 'REST err';
  }
  console.log(`  ${String(t.n_live_tup).padStart(9)}  ${t.relname.padEnd(32)} ${rest}`);
}
await pool.end();
