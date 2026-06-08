/**
 * Create + seed a `supalite_bench` table for the benchmark, or drop it.
 *
 *   node benchmarks/seed.mjs           # create + seed (SEED_ROWS, default 5000)
 *   node benchmarks/seed.mjs --drop    # remove it
 *
 * Reads DB_CONNECTION / BENCH_DB_SSL from benchmarks/.env.
 */
import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({ path: new URL('./.env', import.meta.url) });

const { DB_CONNECTION, BENCH_DB_SSL = 'true', SEED_ROWS = '5000' } = process.env;
const ssl = BENCH_DB_SSL === 'true' ? { rejectUnauthorized: false } : false;
const pool = new pg.Pool({ connectionString: DB_CONNECTION, ssl, max: 2 });
const drop = process.argv.includes('--drop');

if (drop) {
  await pool.query('DROP TABLE IF EXISTS public.supalite_bench');
  console.log('Dropped supalite_bench.');
} else {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.supalite_bench (
      id          serial PRIMARY KEY,
      name        text NOT NULL,
      email       text NOT NULL,
      status      text NOT NULL,
      big         bigint NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now()
    )`);
  await pool.query('TRUNCATE public.supalite_bench RESTART IDENTITY');
  // `big` holds genuine 64-bit values above JS Number.MAX_SAFE_INTEGER (2^53-1).
  // Row id=1 gets 9223372036854775807 (max int8) for the precision demo.
  await pool.query(
    `INSERT INTO public.supalite_bench (name, email, status, big, created_at)
     SELECT 'user_' || g,
            'user' || g || '@example.com',
            (ARRAY['active','inactive','pending'])[1 + (g % 3)],
            9223372036854775807 - (g - 1)::bigint,
            now() - (g || ' minutes')::interval
       FROM generate_series(1, $1) g`,
    [parseInt(SEED_ROWS, 10)]
  );
  // raw-SQL tables aren't auto-granted to Supabase API roles; grant read access
  await pool.query('GRANT SELECT ON public.supalite_bench TO anon, authenticated, service_role');
  // ask PostgREST (Supabase REST) to pick up the new table immediately
  await pool.query(`NOTIFY pgrst, 'reload schema'`);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM public.supalite_bench');
  console.log(`Seeded supalite_bench with ${rows[0].n} rows; asked PostgREST to reload.`);
}
await pool.end();
