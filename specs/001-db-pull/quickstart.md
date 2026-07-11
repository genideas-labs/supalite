# Quickstart Validation: `supalite db pull` (001)

Runnable scenarios proving the feature end-to-end. Contract details:
[contracts/cli-contract.md](contracts/cli-contract.md).

## Prerequisites

- Live Postgres reachable via `DB_CONNECTION` (repo default:
  `postgresql://testuser:testpassword@localhost:5432/testdb`; `.env` is
  loaded by tests via dotenv)
- `npm install` done (or repo's usual bootstrap)

## 1. Automated suite (structure, round-trip, idempotency, plain mode, extension filter)

```bash
npm test -- db-pull
```

Expected: all tests pass. The suite seeds `db_pull_schema` from
`scripts/seed-db-pull.sql`, and the round-trip test drops the schema,
re-applies the generated baseline, regenerates, compares, then re-applies
once more (idempotency).

Full regression (gen types untouched):

```bash
npm test && npm run lint && npm run build
```

## 2. CLI smoke — stdout mode

```bash
node dist/cli.js db pull --db-url "$DB_CONNECTION" --schema public --out -
```

Expected: SQL on stdout beginning with the `-- supalite db pull baseline`
header and `SET check_function_bodies = off;`. Exit code 0.

## 3. CLI smoke — default file path + directory creation

```bash
cd "$(mktemp -d)" && node <repo>/dist/cli.js db pull --db-url "$DB_CONNECTION"
ls supabase/migrations/
```

Expected: `Wrote baseline schema to .../supabase/migrations/<UTC ts>_baseline.sql`;
the directory was created; filename matches `[0-9]{14}_baseline.sql`.

## 4. Mode guard

```bash
node dist/cli.js db pull --db-url "$DB_CONNECTION" --mode diff; echo "exit=$?"
```

Expected: stderr `Only --mode baseline is supported in this version (diff is planned).`, `exit=1`.

## 5. Re-apply safety on a live database (the headline guarantee)

```bash
node dist/cli.js db pull --db-url "$DB_CONNECTION" --schema public --out /tmp/baseline.sql
psql "$DB_CONNECTION" -v ON_ERROR_STOP=1 -f /tmp/baseline.sql
```

Expected: exits 0 — re-applying a baseline to its own source database is a
no-op (constraints included).

## 6. Help

```bash
node dist/cli.js db pull --help
```

Expected: usage text listing all flags and the opt-out defaults; exit 0.
