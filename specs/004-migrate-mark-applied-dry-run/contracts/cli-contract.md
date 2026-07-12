# CLI Contract: `migrate mark-applied --dry-run` (004)

## Synopsis

```
supalite migrate mark-applied (--all | <version>) --dry-run [--db-url <conn>] [--dir <path>] [--migrations-table <ref>]
supalite migrate up --dry-run [--db-url <conn>] ...
```

`--dry-run` now applies to **`up`** and **`mark-applied`** (previously `up` only).

## `mark-applied --dry-run` behavior

- Writes **nothing** to the database (no `CREATE SCHEMA`, no `CREATE TABLE`, no
  `INSERT`). Probes table existence read-only via `to_regclass`. Exit 0.
- Prints:
  ```
  [dry-run] would ensure table: public.schema_migrations (create if absent)
  [dry-run] would record N version(s):
    - <version>
  [dry-run] already recorded (skip):        # omitted when none
    - <version>
  [dry-run] SQL:
    CREATE SCHEMA IF NOT EXISTS "public";
    CREATE TABLE IF NOT EXISTS "public"."schema_migrations" (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO "public"."schema_migrations" (version) VALUES ('<version>') ON CONFLICT (version) DO NOTHING;
  [dry-run] no migration DDL is executed by mark-applied.
  ```
  - Header suffix is `(create if absent)` when the table is absent, or
    `(already exists)` when present.
  - The `SQL:` block is generated from the same builders the real command uses
    (fidelity: preview == execution).
- Argument rules are unchanged: `--dry-run` with neither `--all` nor a
  `<version>` → `mark-applied requires a <version> argument or --all.` exit 1.
  Unknown `<version>` → `No migration with version <v> found …` exit 1.

## `up --dry-run` behavior (updated)

- Write-free (no longer creates the tracking table). Prints each pending
  migration's version **and file path**:
  ```
  Pending migrations (dry run):
    20260712000000  supabase/migrations/20260712000000_baseline.sql
  (table not created; nothing applied)
  ```
- Empty pending set → `No pending migrations.` + the write-free note; exit 0.

## Programmatic API

```ts
const preview = await migrateMarkApplied({ dbUrl, all: true, dryRun: true });
// preview.marked          -> versions that WOULD be recorded
// preview.alreadyApplied  -> versions already recorded (skipped)
// preview.dryRun          -> { table, tableExists, sql: string[] }  (undefined when not a dry-run)

const up = await migrateUp({ dbUrl, dryRun: true });
// up.pending, up.pendingPaths (same order); nothing written
```
