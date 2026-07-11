# CLI Contract: `supalite db pull`

The externally visible contract of the feature. Changes here are breaking
changes for users.

## Invocation

```
supalite db pull \
  --db-url <postgres_url>        # falls back to DB_CONNECTION env var
  [--schema <a,b>]               # comma-separated, repeatable; default: public
  [--out <path>]                 # default: supabase/migrations/<YYYYMMDDHHMMSS>_baseline.sql (UTC)
                                 # '-' or 'stdout' → write SQL to stdout, create no file
  [--mode baseline]              # only 'baseline'; any other value → exit 1
  [--include-extension-objects]  # include objects owned by extensions (default: excluded)
  [--no-if-not-exists]           # plain DDL instead of idempotent DDL (default: idempotent)
  [--help | -h]
```

`supalite gen types` invocation and output are unchanged.

## Exit codes

| Code | Condition |
|------|-----------|
| 0 | Baseline written to file or stdout (also `--help`) |
| 1 | Missing `--db-url`/`DB_CONNECTION`; unsupported `--mode`; connection or introspection error (message on stderr) |

Error message for unsupported mode (exact):
`Only --mode baseline is supported in this version (diff is planned).`

## Programmatic API

```ts
import { generateBaselineSql, DbPullOptions } from 'supalite';
// DbPullOptions: { dbUrl: string; schemas?: string[];
//                  includeExtensionObjects?: boolean; ifNotExists?: boolean }
// Returns the complete SQL text; throws on connection/query errors.
```

## Output file contract

- Encoding UTF-8, LF-only line endings, single trailing newline.
- Section order (non-empty sections only, each starting with a
  `-- <section>` banner comment):
  1. header comment + `SET check_function_bodies = off;`
  2. `-- schemas` — `CREATE SCHEMA IF NOT EXISTS` (non-public selected schemas + extension target schemas; IF NOT EXISTS kept in all modes)
  3. `-- extensions` — `CREATE EXTENSION IF NOT EXISTS ... WITH SCHEMA ...` in creation (oid) order; versions not pinned (IF NOT EXISTS kept in all modes)
  4. `-- sequences` — standalone + serial-backing sequences, options always explicit; identity-internal sequences never appear
  5. `-- types` — enums, then composites topologically ordered; idempotent mode wraps each in `DO $$ ... EXCEPTION WHEN duplicate_object`
  6. `-- tables` — `CREATE [UNLOGGED] TABLE [IF NOT EXISTS]`; identity/generated columns inline; CHECKs not inlined; partition leaves excluded; defaults calling user functions deferred to §9
  7. `-- sequence ownership` — `ALTER SEQUENCE ... OWNED BY ...`
  8. `-- functions` — `pg_get_functiondef` output + `;` (functions and procedures)
  9. `-- deferred column defaults` — `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT` for function-dependent defaults
  10. `-- constraints` — PK/UNIQUE/CHECK/EXCLUDE via `ALTER TABLE ... ADD CONSTRAINT`; idempotent mode wraps in `DO $$` pg_constraint guard
  11. `-- foreign keys` — all FKs, after every table; same guard
  12. `-- views` — topologically ordered; views `CREATE OR REPLACE` with options (`security_barrier`, `check_option`); matviews `IF NOT EXISTS`, `WITH NO DATA` when unpopulated
  13. `-- triggers` — after views (`INSTEAD OF` support); plain: `CREATE OR REPLACE TRIGGER` (replay requires PG14+); constraint triggers via `DO $$` existence guard
  14. `-- indexes` — non-constraint indexes on tables and matviews; idempotent mode inserts `IF NOT EXISTS`
  15. footer comments — partition hierarchies, aggregate/window functions,
      domain types, non-reproduced table/view variants, and FK references
      to schemas outside the selection (which must pre-exist on an
      otherwise-empty target); omitted when none

## Behavior guarantees

- **Idempotent by default**: applying the file to a database that already
  contains the schema produces zero errors — constraints included.
- **Extension-owned objects excluded by default** across every section
  (`pg_depend deptype='e'`).
- Empty selection: truly header-only file (schema/extension statements
  suppressed too) + warning on stderr.
- Applying to an empty database succeeds provided footer-listed external
  schemas pre-exist.
- Unsupported objects are never silently dropped — always footer-listed.
