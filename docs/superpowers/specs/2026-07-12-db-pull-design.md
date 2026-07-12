# `supalite db pull` — Baseline Schema Dump (v1) Design

> **SUPERSEDED**: this initial design was carried into the speckit pipeline
> and substantially refined through 4 strict review rounds (40 findings).
> The authoritative artifacts are in [`specs/001-db-pull/`](../../../specs/001-db-pull/spec.md)
> — notably the section order, function staging, domain support, and
> exclusion-closure policy differ from what is written below.

- **Date**: 2026-07-12
- **Issue**: [genideas-labs/supalite#4](https://github.com/genideas-labs/supalite/issues/4)
- **Status**: Approved (design sections approved in review; flag defaults and
  constraint idempotency confirmed by the requesting team on the issue —
  see [confirmation](https://github.com/genideas-labs/supalite/issues/4#issuecomment-4947586939))

## Problem

`supalite gen types` introspects a live Postgres and emits TypeScript types,
but there is no counterpart that emits **DDL SQL** from an existing database.
Services that left the Supabase platform for plain Postgres (e.g. GCP Cloud
SQL with `DB_DRIVER=supalite`) can no longer use `supabase db pull`, so most
of their production schema lives outside version control. They need a
supalite-native command that introspects any Postgres via `--db-url` and
produces a dependency-ordered baseline migration file.

Driving use case (measured on the requester's production DB): 46/64 tables,
29/53 user functions, 2 enum types, 1 trigger, and 2 extensions are missing
from migrations; 34 of 87 functions are extension-owned and must NOT be
dumped as individual DDL.

## Goals (v1)

- `supalite db pull` produces a single baseline SQL file that recreates the
  selected schemas on an empty database, in dependency order.
- The file is **idempotent by default**: re-applying it to a database that
  already has the schema (e.g. the production DB it was pulled from) is a
  no-op, with **no exceptions** — including constraints.
- Extension-owned objects are **excluded by default** (`pg_depend`
  `deptype = 'e'`), across every object kind.
- Flag conventions match `gen types` (`--db-url`, `--schema`, `--out`,
  `DB_CONNECTION` fallback, `--out -` for stdout).
- Output is LF-normalized regardless of source formatting.

## Non-goals (v1)

- `--mode diff` (only `baseline` ships; `diff` is reserved and errors clearly).
- Grants and RLS policies — excluded from v1, to be offered later behind
  options such as `--include-grants` / `--include-policies`
  ([decision comment](https://github.com/genideas-labs/supalite/issues/4#issuecomment-4947495334)).
- Partitioned tables, aggregate/window functions, domain types — documented
  limitations. Confirmed absent (count 0) in the driving use case's schema.
- No new runtime dependencies; reuse `pg` like `gen-types.ts`.

## CLI Contract

```
supalite db pull \
  --db-url <postgres_url>        # falls back to DB_CONNECTION env var
  [--schema public]              # comma-separated schemas, default: public
  [--out <path>]                 # default: supabase/migrations/<YYYYMMDDHHMMSS>_baseline.sql
                                 # '-' or 'stdout' writes to stdout
  [--mode baseline]              # v1: only 'baseline'; anything else errors
  [--include-extension-objects]  # default OFF: extension-owned objects are skipped
  [--no-if-not-exists]           # default OFF: idempotent DDL is emitted
```

- Timestamp is **UTC** `YYYYMMDDHHMMSS` (Supabase CLI migration filename
  convention). The output directory is created if missing.
- **Defaults are opt-out** (differs from the opt-in draft in the issue;
  confirmed by the requesting team):
  - Extension-object exclusion is ON; `--include-extension-objects` turns it off.
  - Idempotent DDL is ON; `--no-if-not-exists` emits plain DDL instead.
- Exit codes: `0` success, `1` usage/connection/introspection error (message
  on stderr), matching current CLI behavior.
- `src/cli.ts` `run()` is restructured into a subcommand dispatch
  (`gen types` | `db pull`), keeping the existing hand-rolled parser style.
  Each subcommand gets its own usage text.

## Architecture

New self-contained module **`src/db-pull.ts`**:

```ts
export type DbPullOptions = {
  dbUrl: string;
  schemas?: string[];              // default ['public']
  includeExtensionObjects?: boolean; // default false
  ifNotExists?: boolean;           // default true
};
export const generateBaselineSql = async (options: DbPullOptions): Promise<string>;
```

- Pure function: connects, introspects, returns the SQL string. File writing
  stays in the CLI (same split as `generateTypes`). `src/gen-types.ts` is not
  modified.
- **DDL rendering is delegated to server-side deparse functions wherever they
  exist**: `pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_functiondef`,
  `pg_get_triggerdef`, `pg_get_viewdef`, plus `format_type` and `pg_get_expr`
  for column details. Hand-assembled DDL is limited to `CREATE TABLE`,
  `CREATE TYPE` (enum/composite), and `CREATE SEQUENCE`.
- Extension filter: every object query anti-joins
  `pg_depend d ON d.objid = <obj>.oid AND d.deptype = 'e'` and keeps rows
  with no match, unless `includeExtensionObjects` is set.
- Identifier quoting: server-side `quote_ident`/`::regclass` output where
  possible; a local `quoteIdent` helper (quote unless `^[a-z_][a-z0-9_]*$`
  and not a reserved word) for assembled DDL.

## Output Layout (dependency order)

One SQL file, sections in this order:

1. **Header** — comment block (tool name/version, UTC timestamp, schema list)
   followed by `SET check_function_bodies = off;` so function bodies may
   reference tables/views created later in the file (same technique as
   `pg_dump`).
2. **Schemas** — `CREATE SCHEMA IF NOT EXISTS` for every selected schema
   except `public`. Kept even in plain mode (like extensions) so the baseline
   stands up on an empty database — required for the round-trip test, which
   drops and recreates the schema from the baseline alone.
3. **Extensions** — `CREATE EXTENSION IF NOT EXISTS "name" WITH SCHEMA ...;`
   for all non-`plpgsql` extensions. Extensions keep `IF NOT EXISTS` even in
   plain mode (`--no-if-not-exists`) — the issue specifies this form
   unconditionally, and extensions are database-scoped, not schema-scoped.
4. **Sequences** — all sequences in the target schemas **except**
   identity-internal ones (`pg_depend` `deptype = 'i'`). Emitted before
   tables so `DEFAULT nextval(...)` column defaults resolve. Non-default
   sequence options (START, INCREMENT, MIN/MAXVALUE, CACHE, CYCLE) are
   rendered.
5. **Types** — enums (`CREATE TYPE ... AS ENUM (...)`) and composite types
   (`CREATE TYPE ... AS (...)`). Postgres has no `CREATE TYPE IF NOT EXISTS`,
   so in idempotent mode each is wrapped in
   `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`.
6. **Tables** — assembled from catalogs (`relkind = 'r'`):
   columns with `format_type()`, defaults via `pg_get_expr(adbin, adrelid)`,
   `NOT NULL`, identity columns as `GENERATED {ALWAYS | BY DEFAULT} AS
   IDENTITY`, with `(START WITH ... INCREMENT BY ...)` when the backing
   sequence has non-default options, and generated columns as
   `GENERATED ALWAYS AS (...) STORED`. `CREATE TABLE IF NOT EXISTS`.
   CHECK constraints are NOT inlined (emitted in section 8).
7. **Sequence ownership** — `ALTER SEQUENCE ... OWNED BY table.column` for
   serial-style sequences (`pg_depend` `deptype = 'a'`).
8. **Constraints** — `ALTER TABLE ... ADD CONSTRAINT <name>
   <pg_get_constraintdef(oid)>` in two passes:
   PK / UNIQUE / CHECK / EXCLUDE for all tables first, then **all FKs after
   every table exists** (inline FKs break on circular references).
   Idempotent mode wraps each statement in an explicit guard:
   ```sql
   DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = '<name>' AND conrelid = '<schema>.<table>'::regclass
     ) THEN
       ALTER TABLE ... ADD CONSTRAINT ...;
     END IF;
   END $$;
   ```
   This closes the idempotency gap the requesting team flagged (no
   `IF NOT EXISTS` exists for `ADD CONSTRAINT`): **constraints are inside the
   idempotency guarantee, not an exception to it.**
9. **Indexes** — `pg_get_indexdef(oid)` for indexes not backing a constraint
   (exclude via `pg_constraint.conindid`), with `IF NOT EXISTS` inserted
   after `CREATE [UNIQUE] INDEX` in idempotent mode.
10. **Functions** — `pg_get_functiondef(oid)` for `prokind IN ('f','p')`
   (already emits `CREATE OR REPLACE`), same pattern as the existing
   `dumpFunctionsSql`.
11. **Triggers** — `pg_get_triggerdef(oid)` for non-internal triggers
    (`NOT tgisinternal`), rewritten to `CREATE OR REPLACE TRIGGER` in
    idempotent mode (requires PostgreSQL 14+ on the target; documented).
12. **Views** — `CREATE OR REPLACE VIEW <name> AS <pg_get_viewdef(oid, true)>`,
    topologically sorted by view-to-view dependencies from
    `pg_depend`/`pg_rewrite`. Materialized views use
    `CREATE MATERIALIZED VIEW IF NOT EXISTS`.
13. **Footer** — comment listing skipped/unsupported objects found in the
    schema (partitioned tables, aggregates, domains), so limitations are
    visible in the artifact itself, not silently dropped.

All emitted text is normalized to LF (`\r\n` → `\n`) and the file ends with a
single trailing newline.

Objects that reference schemas outside the `--schema` selection (e.g. an FK
to another schema) are emitted as-is; the footer comment lists such external
references so the user knows the baseline assumes those schemas exist.

### Explicitly required coverage (from the requester's production data)

- **Identity columns (50, both `ALWAYS` and `BY DEFAULT`)** — both attidentity
  values render correctly; implicit identity sequences are NOT dumped.
- **Legacy serial columns (9) + standalone sequences (59)** — explicit
  `CREATE SEQUENCE` before tables, `DEFAULT nextval(...)` preserved on the
  column, `ALTER SEQUENCE ... OWNED BY` after tables. Identity (implicit
  sequence) and serial (explicit sequence) coexist in the same schema and
  both paths must round-trip.
- **FK 15 / CHECK 27 + PK/UNIQUE** — all pass the idempotency guard above.

## Error Handling

- Missing `--db-url`/`DB_CONNECTION` → usage + exit 1 (same as `gen types`).
- `--mode` other than `baseline` → `Only --mode baseline is supported in this
  version (diff is planned).` + exit 1.
- Connection/query errors bubble to the existing top-level catch (message to
  stderr, exit 1); the client is always closed in `finally`.
- Schemas with no objects still produce a valid header-only file, with a
  warning on stderr.

## Testing

`src/__tests__/db-pull.test.ts` + `scripts/seed-db-pull.sql` /
`scripts/cleanup-db-pull.sql`, following the `gen-types.test.ts` live-Postgres
pattern (`DB_CONNECTION`, dedicated schema `db_pull_schema`).

Seed covers: enum + composite type, identity `ALWAYS` and `BY DEFAULT`
columns, a legacy serial column, a standalone sequence, generated column,
column defaults, PK/FK/UNIQUE/CHECK (including a two-table FK), an expression
index, a function, a trigger, and a view depending on another view.

Assertions:

1. **Structure** — each expected DDL statement appears; section order is
   correct (position of extension < type < table < constraint < index <
   function < trigger < view); FK statements appear after every
   `CREATE TABLE`; no identity-internal sequence is dumped; output contains
   no CR characters.
2. **Round-trip** — generate baseline → `DROP SCHEMA ... CASCADE` → apply
   baseline → generate again → outputs are identical.
3. **Idempotency** — apply the baseline a second time on the already-built
   schema: no error (constraints included).
4. **Extension filter** — if `pg_trgm` can be created in the test database,
   assert its functions are absent by default and present with
   `includeExtensionObjects`; skip this case gracefully when the extension is
   unavailable.
5. **Plain mode** — `ifNotExists: false` emits no `DO $$` guards, plain
   `CREATE TRIGGER`, and no `IF NOT EXISTS` except on `CREATE SCHEMA` /
   `CREATE EXTENSION` (always kept).

## Documentation

- README: replace the roadmap line "`supalite db pull` wrapper around
  `pg-schema-sync`" with the shipped native command; extend the "Migrations
  and schema management" section with usage, defaults (opt-out flags), the
  idempotency guarantee, and v1 limitations (incl. PG14+ for trigger
  replays). Mirror in README.ko.md.
- `supalite db pull --help` usage text with defaults, like `gen types`.
- CHANGELOG entry under the next release.

## Work Plan Notes

- Branch: `feat/db-pull` off `main`.
- Version bump/tag happens at release time per repo convention
  (annotated `vX.Y.Z` tags), not in this branch.
