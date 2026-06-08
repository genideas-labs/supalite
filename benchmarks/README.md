# Benchmarks

Two things, measured against the *same* database with the *same* query:

1. **Latency** — supabase-js (REST) vs **supalite / Drizzle / Prisma** (all direct
   Postgres). supabase-js pays the REST/PostgREST tax; the direct drivers don't.
2. **64-bit integer correctness** — what each client returns for a `BIGINT` value
   above JS `Number.MAX_SAFE_INTEGER` (2^53-1).

## Setup

```bash
# comparison clients (not supalite dependencies)
npm install --no-save @supabase/supabase-js drizzle-orm @prisma/client prisma @prisma/adapter-pg pg

# build supalite
npm run build

# configure (gitignored)
cp benchmarks/.env.example benchmarks/.env
#   fill in SUPABASE_URL, SUPABASE_KEY, DB_CONNECTION

# generate the Prisma client for the bench table
DATABASE_URL="$(grep '^DB_CONNECTION=' benchmarks/.env | sed 's/^DB_CONNECTION=//')" \
  ./node_modules/.bin/prisma generate --schema benchmarks/prisma/schema.prisma
```

> Works against any Postgres + a PostgREST endpoint. A **local Supabase stack**
> (`supabase start`) is the easiest: it gives you both. Note that a local run
> isolates the API-layer overhead with no network — real cloud deployments add
> network hops and cold starts on top, so the gap only widens.

## Run

```bash
node benchmarks/seed.mjs          # create + seed supalite_bench (SEED_ROWS, default 5000)
node benchmarks/bench.mjs         # latency: 4 clients, p50/p95/mean -> results.json
node benchmarks/bigint-demo.mjs   # 64-bit correctness table
node benchmarks/seed.mjs --drop   # clean up
```

`discover.mjs` lists public tables by row count and checks REST readability, if
you want to benchmark an existing table instead of the seeded one.

## Methodology

- Same machine, same network, same database, same query.
- Requests are interleaved with a rotating start order so no client is
  systematically first.
- Warmup iterations are discarded; pools are hot before timing.
- A row-parity check confirms every client returns the same rows.

## Honesty notes

Latency numbers are **indicative**, not universal — they depend on region,
network path, pooler mode, and table. The direct-driver advantage is largest for
small, frequent queries (where the API layer dominates) and shrinks for heavy
queries (where DB work dominates). Re-run in your own environment before quoting.

The BIGINT result, by contrast, is **deterministic**: it's a property of how each
client maps `int8`, not of the environment.
