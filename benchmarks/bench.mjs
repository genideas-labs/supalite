/**
 * Query-latency benchmark: supabase-js (REST) vs supalite / Drizzle / Prisma
 * (all direct Postgres). Same database, same query, interleaved for fairness.
 *
 * The point: supabase-js pays the REST/PostgREST tax; the direct drivers don't.
 * supalite sits in the same fast tier as Drizzle/Prisma while keeping the
 * Supabase query-builder API.
 *
 * Config from benchmarks/.env (see .env.example). Run: node benchmarks/bench.mjs
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import dotenv from 'dotenv';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: new URL('./.env', import.meta.url) });
const require = createRequire(import.meta.url);
const { SupaLitePG } = require('../dist/index.js');

const {
  SUPABASE_URL, SUPABASE_KEY, DB_CONNECTION,
  BENCH_TABLE = 'supalite_bench',
  BENCH_SELECT = 'id,name,email,status,created_at',
  BENCH_LIMIT = '20',
  BENCH_ITERATIONS = '300',
  BENCH_WARMUP = '30',
  BENCH_DB_SSL = 'true',
} = process.env;

for (const [k, v] of [['SUPABASE_URL', SUPABASE_URL], ['SUPABASE_KEY', SUPABASE_KEY], ['DB_CONNECTION', DB_CONNECTION]]) {
  if (!v) { console.error(`Missing env ${k} (see benchmarks/.env.example)`); process.exit(1); }
}

const table = BENCH_TABLE;
const cols = BENCH_SELECT.split(',').map((s) => s.trim());
const limit = parseInt(BENCH_LIMIT, 10);
const iterations = parseInt(BENCH_ITERATIONS, 10);
const warmup = parseInt(BENCH_WARMUP, 10);
const ssl = BENCH_DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

const clients = [];
const closers = [];

// --- supabase-js (REST / PostgREST) ---
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
clients.push({ name: 'supabase-js', kind: 'REST', run: async () => {
  const { data, error } = await supabase.from(table).select(BENCH_SELECT).limit(limit);
  if (error) throw new Error(error.message);
  return data.length;
}});

// --- supalite (direct) ---
const slPool = new pg.Pool({ connectionString: DB_CONNECTION, ssl, max: 5 });
closers.push(() => slPool.end());
const supalite = new SupaLitePG({ pool: slPool });
clients.push({ name: 'supalite', kind: 'direct', run: async () => {
  const { data, error } = await supalite.from(table).select(BENCH_SELECT).limit(limit);
  if (error) throw new Error(error.message || error);
  return data.length;
}});

// --- drizzle (direct), optional ---
try {
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { pgTable, serial, text, timestamp, bigint } = await import('drizzle-orm/pg-core');
  const t = pgTable(table, {
    id: serial('id').primaryKey(),
    name: text('name'),
    email: text('email'),
    status: text('status'),
    big: bigint('big', { mode: 'number' }),
    created_at: timestamp('created_at', { withTimezone: true }),
  });
  const drPool = new pg.Pool({ connectionString: DB_CONNECTION, ssl, max: 5 });
  closers.push(() => drPool.end());
  const ddb = drizzle(drPool);
  const sel = Object.fromEntries(cols.map((c) => [c, t[c]]));
  clients.push({ name: 'drizzle', kind: 'direct', run: async () => {
    const rows = await ddb.select(sel).from(t).limit(limit);
    return rows.length;
  }});
} catch (e) { console.log('drizzle skipped:', e.message); }

// --- prisma (direct), optional ---
try {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_CONNECTION }) });
  closers.push(() => prisma.$disconnect());
  const sel = Object.fromEntries(cols.map((c) => [c, true]));
  clients.push({ name: 'prisma', kind: 'direct', run: async () => {
    const rows = await prisma[table].findMany({ select: sel, take: limit });
    return rows.length;
  }});
} catch (e) { console.log('prisma skipped:', e.message); }

function stats(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return { n: s.length, min: s[0], p50: at(50), p90: at(90), p95: at(95), p99: at(99), max: s[s.length - 1], mean: s.reduce((a, b) => a + b, 0) / s.length };
}
const r2 = (x) => Math.round(x * 100) / 100;

async function main() {
  console.log(`\nBenchmark: ${table} — select('${BENCH_SELECT}').limit(${limit})`);
  console.log(`Clients: ${clients.map((c) => c.name).join(', ')}`);
  console.log(`Warmup ${warmup}, iterations ${iterations}, interleaved.\n`);

  // parity
  for (const c of clients) console.log(`  ${c.name.padEnd(12)} rows: ${await c.run()}`);

  for (let i = 0; i < warmup; i++) for (const c of clients) await c.run();

  const lat = Object.fromEntries(clients.map((c) => [c.name, []]));
  for (let i = 0; i < iterations; i++) {
    const k = i % clients.length;            // rotate start so no client is always first
    const order = clients.slice(k).concat(clients.slice(0, k));
    for (const c of order) {
      const t0 = performance.now();
      await c.run();
      lat[c.name].push(performance.now() - t0);
    }
    if ((i + 1) % 50 === 0) process.stdout.write(`  ...${i + 1}/${iterations}\r`);
  }

  const st = Object.fromEntries(clients.map((c) => [c.name, stats(lat[c.name])]));
  const slowest = st['supabase-js'];
  const head = ['client', 'kind', 'p50', 'p95', 'mean', 'vs supabase-js'];
  const rows = [head];
  for (const c of clients) {
    const s = st[c.name];
    rows.push([c.name, c.kind, `${r2(s.p50)} ms`, `${r2(s.p95)} ms`, `${r2(s.mean)} ms`, `${r2(slowest.p50 / s.p50)}x`]);
  }
  const w = head.map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  console.log('\n');
  rows.forEach((r, i) => {
    console.log('  ' + r.map((c, j) => String(c).padEnd(w[j])).join('  |  '));
    if (i === 0) console.log('  ' + w.map((x) => '-'.repeat(x)).join('--+--'));
  });

  writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify({
    config: { table, select: BENCH_SELECT, limit, iterations, warmup, supabaseUrl: SUPABASE_URL.replace(/\/\/[^/]+/, '//***') },
    stats: st,
  }, null, 2));
  console.log('\nWrote benchmarks/results.json\n');

  for (const close of closers) await close();
}

main().catch((e) => { console.error('\nBenchmark failed:', e.message); process.exit(1); });
