# Feature Specification: `supalite migrate` — migration runner (apply + track)

**Feature Branch**: `003-migrate`
**Created**: 2026-07-12
**Status**: Clarifying
**Input**: [GitHub issue #7](https://github.com/genideas-labs/supalite/issues/7) + the migration format converged in [002-db-pull-dbmate-format](../002-db-pull-dbmate-format/spec.md) (#8)

## User Scenarios & Testing

### Primary User Story

As a developer running a service on plain Postgres (e.g. GCP Cloud SQL) with
`supalite`, I have `supalite db pull` (schema → baseline SQL, #4) and
`supalite gen types` (schema → TS types), but nothing that **applies** and
**tracks** migrations. My deploy pipeline has no apply step and prod has no
`schema_migrations` table, so migrations are run by hand and the schema drifts
out of version control (measured driving case `oq-payment`: 46/64 tables,
29/53 functions were prod-only). I run `supalite migrate up --db-url <conn>` in
my pipeline and every pending migration is applied, in order, exactly once,
recorded in a tracking table — closing the `db pull → migrate → gen types`
toolchain without a third-party tool (dbmate/Flyway).

Because this may run against a **payment database**, the runner must be safe
under concurrent deploys and must never leave a half-applied migration recorded
as done.

### Acceptance Scenarios

1. **Given** a directory of migration files and a reachable Postgres, **When**
   the user runs `supalite migrate up --db-url <conn>`, **Then** every file
   whose version is not in `schema_migrations` is applied in ascending
   timestamp order and its version recorded; a second `up` is a no-op.
2. **Given** a migration whose `-- migrate:up` SQL errors midway, **When**
   `up` runs, **Then** that migration's DDL is rolled back, its version is NOT
   recorded, the run stops at that file, and the error names the failing file.
   Migrations applied before it stay committed.
3. **Given** two deploy pipelines run `up` against the same database at the
   same time, **When** both execute, **Then** an advisory lock serializes them
   and no migration is applied twice.
4. **Given** a migration marked `-- migrate:up transaction:false` containing a
   `CREATE INDEX CONCURRENTLY`, **When** `up` runs, **Then** it executes
   outside a transaction (succeeds where a wrapped statement would error) and
   its version is recorded immediately after success.
5. **Given** `supalite migrate status`, **Then** each migration file is listed
   as applied `[x]` or pending `[ ]` with a pending count.
6. **Given** `supalite migrate new add_orders`, **Then** a file
   `<dir>/<YYYYMMDDHHMMSS>_add_orders.sql` is created from a template with
   `-- migrate:up` and `-- migrate:down` markers (no DB connection needed).
7. **Given** an existing database that already has the schema, **When** the
   user runs `supalite migrate mark-applied --all`, **Then** every migration
   file is recorded as applied WITHOUT executing its SQL; a subsequent `up`
   is a no-op.
8. **Given** `supalite migrate mark-applied <version>`, **Then** only that one
   migration is recorded (without executing its SQL).
9. **Given** `supalite migrate down`, **Then** the command exits 1 with a clear
   "not supported in this version (forward-only)" message.
10. **Given** `--dry-run` on `up`, **Then** the pending versions are printed and
    nothing is applied or recorded.

### Edge Cases

- Missing migrations directory → clear error `Migrations directory not found: <abs path>`.
- A filename without a leading numeric timestamp → clear error
  `Invalid migration filename (expected <timestamp>_<name>.sql): <file>`.
- Non-`.sql` files in the directory are ignored.
- A migration file missing the `-- migrate:up` marker → clear error.
- Empty pending set → `up` reports "up to date" and exits 0.
- Missing `--db-url` and no `DB_CONNECTION`/`DATABASE_URL` → usage + exit 1
  (except `new`, which needs no DB).
- Re-applying a `db pull --format dbmate` baseline via `up` is safe (baseline is
  idempotent); `mark-applied` is the cleaner adoption path (avoids
  `CREATE OR REPLACE FUNCTION` rewrites).
- Concurrent `transaction(cb)`-style client use is unaffected (migrate uses its
  own dedicated `Client`).

## Requirements

### Functional Requirements

- **FR-001**: The CLI MUST add `supalite migrate <up|status|new|mark-applied|down>`.
  Existing `gen types` / `db pull` behavior MUST be unchanged.
- **FR-002**: DB URL resolution MUST be `--db-url` → `DB_CONNECTION` →
  `DATABASE_URL`; if none (for DB-requiring subcommands) print usage + exit 1.
  `new` MUST NOT require a DB connection.
- **FR-003**: Migration files MUST be dbmate-compatible: a file has an
  `-- migrate:up` section and an optional `-- migrate:down` section, delimited
  by marker lines (`-- migrate:up` / `-- migrate:down`), with an optional
  `transaction:false` directive on the marker line
  (`-- migrate:up transaction:false`). A file with no `-- migrate:up` marker is
  an error.
- **FR-004**: A migration's **version** MUST be the leading run of digits of
  its filename (dbmate semantics), e.g. `20260712093000` for
  `20260712093000_add_orders.sql`. Files are ordered by version ascending
  (numeric).
- **FR-005**: The runner MUST auto-create a tracking table
  `schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL
  DEFAULT now())`. The table is `public.schema_migrations` by default and
  configurable via `--migrations-table <schema.table | table>`; the schema is
  auto-created (`CREATE SCHEMA IF NOT EXISTS`). Only the `version` column is
  written on insert, so an existing dbmate-style table (version-only) is
  compatible.
- **FR-006**: `migrate up` MUST apply every file whose version is absent from
  the tracking table, in ascending version order, and record each version.
- **FR-007** (safety — advisory lock): the entire `up` run MUST hold a fixed,
  deterministic Postgres advisory lock
  (`pg_advisory_lock(hashtext('supalite:migrate'))`), released in a `finally`,
  so concurrent `up` runs cannot double-apply. Applied versions MUST be re-read
  after acquiring the lock.
- **FR-008** (safety — atomic recording): for a transactional migration, its
  `-- migrate:up` SQL and the `INSERT INTO schema_migrations` MUST run in the
  SAME transaction (`BEGIN … COMMIT`); on any error the transaction MUST be
  rolled back (a rollback failure MUST NOT mask the original error), the
  version MUST NOT be recorded, and the run MUST stop at that file with an error
  naming the file.
- **FR-009** (safety — non-transactional escape): a migration marked
  `-- migrate:up transaction:false` MUST execute its SQL WITHOUT a wrapping
  transaction (for `CREATE INDEX CONCURRENTLY`, `ALTER TYPE ADD VALUE`, etc.);
  its version is recorded immediately after the SQL succeeds (a documented
  non-atomic tradeoff — such files SHOULD contain a single idempotent
  `IF NOT EXISTS` statement).
- **FR-010**: `migrate up --dry-run` MUST print the pending versions and apply
  / record nothing.
- **FR-011**: `migrate status` MUST list each migration file as applied or
  pending with a summary count.
- **FR-012**: `migrate new <name>` MUST create
  `<dir>/<YYYYMMDDHHMMSS>_<name>.sql` (whitespace in name → underscores) from a
  template containing `-- migrate:up` and `-- migrate:down`; it MUST fail
  clearly if the file already exists and MUST NOT require a DB.
- **FR-013**: `migrate mark-applied --all` MUST record every migration file's
  version WITHOUT executing SQL; `migrate mark-applied <version>` MUST record
  exactly one; neither MUST re-record an already-applied version. Missing both
  `--all` and a version → clear error.
- **FR-014**: `migrate down` MUST exit 1 with a clear
  "not supported in this version (forward-only)" message (v1 is forward-only).
- **FR-015**: The default migrations directory MUST be `supabase/migrations`
  (matching `db pull` output), overridable with `--dir <path>`.
- **FR-016**: Unknown options MUST be rejected with a clear message + usage +
  exit 1 (same strictness as `db pull`).
- **FR-017**: A programmatic API MUST be exported from the package root:
  `migrateUp`, `migrateStatus`, `migrateMarkApplied`, `migrateNew`, with typed
  option/result shapes.

### Key Entities

- **Migration file**: `<version>_<name>.sql`, dbmate up/down sections.
- **Version**: leading numeric timestamp of the filename; primary key in the
  tracking table.
- **Tracking table**: `schema_migrations(version, applied_at)`.
- **Runner**: reads files, ensures the table, holds the advisory lock, applies
  pending migrations atomically (or non-transactionally when escaped).

## Success Criteria

- **SC-001** (apply + idempotent): applying a set of migrations records all
  versions and creates their objects; a second `up` applies nothing.
- **SC-002** (atomic failure): a failing migration leaves earlier migrations
  applied, its own objects absent, its version unrecorded, and stops the run.
- **SC-003** (transaction:false): a `CREATE INDEX CONCURRENTLY` migration marked
  `transaction:false` succeeds and is recorded (it would error if wrapped).
- **SC-004** (mark-applied): `mark-applied --all` records versions without
  creating any objects; a following `up` is a no-op.
- **SC-005** (dry-run): `up --dry-run` records nothing and creates nothing.
- **SC-006** (dbmate drop-in): a `db pull --format dbmate` baseline file is
  parsed and applied by `migrate up` without edits.
- **SC-007** (CLI): `up`/`status`/`new`/`mark-applied`/`down` behave per the
  scenarios; `new` needs no DB; unknown flags and invalid input exit 1 with
  clear messages.

## Assumptions

- Tests run against a live Postgres via `DB_CONNECTION` (repo convention;
  default `postgresql://testuser:testpassword@localhost:5432/testdb`), which is
  PostgreSQL 14+ (advisory locks, `CREATE INDEX CONCURRENTLY`).
- The connecting role may create the tracking schema/table and run the
  migrations' DDL.
- No new runtime dependencies (`pg` + `fs`/`path` suffice).
- Migrations do not embed their own transaction control (`BEGIN`/`COMMIT`) in a
  transactional section (documented).

## Out of Scope (v1)

- `migrate down` / rollback (forward-only; clear unsupported message).
- `dump` (schema snapshot), multi-schema orchestration, parallel-safety beyond
  the single advisory lock.
- Multi-statement `transaction:false` files (v1 expects a single statement).

## Dependencies & References

- GitHub issue #7 (proposal + `oq-payment#512` driving case).
- Shares the `-- migrate:up/down` format with `db pull --format dbmate` (#8 /
  002) — that command's output is a drop-in input here.
- Builds on the existing CLI (`src/cli.ts`) and `pg` `Client` usage
  (`src/db-pull.ts` pattern); programmatic exports join `src/index.ts`.
