/**
 * 64-bit integer correctness: what does each client return for a BIGINT value
 * above JS Number.MAX_SAFE_INTEGER (2^53-1)?
 *
 * Reads row id=1 of supalite_bench, whose `big` column = 9223372036854775807
 * (max int8). Run benchmarks/seed.mjs first. Run: node benchmarks/bigint-demo.mjs
 */
import { createRequire } from 'node:module';
import dotenv from 'dotenv';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: new URL('./.env', import.meta.url) });
const require = createRequire(import.meta.url);
const { SupaLitePG } = require('../dist/index.js');

const { SUPABASE_URL, SUPABASE_KEY, DB_CONNECTION, BENCH_DB_SSL = 'true' } = process.env;
const ssl = BENCH_DB_SSL === 'true' ? { rejectUnauthorized: false } : false;
const EXPECTED = '9223372036854775807';

function inspect(label, value) {
  const type = typeof value;
  const asString = type === 'bigint' ? value.toString() : String(value);
  const precise = asString === EXPECTED;
  let json;
  try {
    json = JSON.stringify({ big: value });
    json = json.match(/"big":(.+)}/)[1];
  } catch (e) {
    json = `THROWS (${e.message.split(':')[0]})`;
  }
  const jsonSafe = json.includes(EXPECTED);
  return { label, type, value: asString, json, precise, jsonSafe };
}

const results = [];

// supabase-js (REST/PostgREST -> JSON)
{
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.from('supalite_bench').select('big').eq('id', 1).single();
  if (error) throw new Error('supabase-js: ' + error.message);
  results.push(inspect('supabase-js', data.big));
}

// supalite (default bigintTransform: 'number-or-string')
{
  const pool = new pg.Pool({ connectionString: DB_CONNECTION, ssl, max: 1 });
  const sl = new SupaLitePG({ pool });
  const { data } = await sl.from('supalite_bench').select('big').eq('id', 1).single();
  results.push(inspect('supalite', data.big));
  await pool.end();
}

// drizzle — both modes
{
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { pgTable, bigint, integer } = await import('drizzle-orm/pg-core');
  const { eq } = await import('drizzle-orm');
  for (const mode of ['number', 'bigint']) {
    const t = pgTable('supalite_bench', { id: integer('id'), big: bigint('big', { mode }) });
    const pool = new pg.Pool({ connectionString: DB_CONNECTION, ssl, max: 1 });
    const ddb = drizzle(pool);
    const [row] = await ddb.select({ big: t.big }).from(t).where(eq(t.id, 1));
    results.push(inspect(`drizzle (mode:'${mode}')`, row.big));
    await pool.end();
  }
}

// prisma (BigInt)
{
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_CONNECTION }) });
  const row = await prisma.supalite_bench.findUnique({ where: { id: 1 }, select: { big: true } });
  results.push(inspect('prisma', row.big));
  await prisma.$disconnect();
}

console.log(`\nColumn value in Postgres: ${EXPECTED} (max int8)\n`);
const head = ['client', 'JS type', 'value returned', 'JSON.stringify', 'correct?'];
const rows = [head, ...results.map((r) => [
  r.label, r.type, r.value, r.json,
  r.precise && r.jsonSafe ? 'YES' : (r.precise ? 'precise, not JSON' : 'WRONG'),
])];
const w = head.map((_, i) => Math.max(...rows.map((x) => String(x[i]).length)));
rows.forEach((r, i) => {
  console.log('  ' + r.map((c, j) => String(c).padEnd(w[j])).join('  |  '));
  if (i === 0) console.log('  ' + w.map((x) => '-'.repeat(x)).join('--+--'));
});
console.log('');
