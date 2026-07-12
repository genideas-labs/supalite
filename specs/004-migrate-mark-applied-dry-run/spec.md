# Feature Specification: `migrate mark-applied --dry-run` — write-free prod-adoption preview

**Feature Branch**: `004-migrate-mark-applied-dry-run`
**Created**: 2026-07-12
**Status**: Implemented
**Input**: [GitHub issue #14](https://github.com/genideas-labs/supalite/issues/14) — extends `supalite migrate` ([003-migrate](../003-migrate/spec.md), #7)

## User Scenarios & Testing

### Primary User Story

As a developer **adopting an existing production database** with `supalite
migrate`, `mark-applied` is my adoption path: it records migration versions
without running their DDL. But `mark-applied` is the **first production write**
of the rollout, and the operator (reasonably) worries "is this about to run a
6,000-line baseline against prod?". Empirically it only writes the
`schema_migrations` table + one row per version — but I want the **tool itself**
to prove that before I run it. I run
`supalite migrate mark-applied --all --dry-run --db-url <conn>` and it prints
the exact versions it would record and the exact SQL it would execute, **writes
nothing** (not even the tracking table), and exits 0. Now I can approve the real
run with confidence instead of trust.

### Acceptance Scenarios

1. **Given** a migrations directory and a reachable Postgres where
   `schema_migrations` already exists, **When** the user runs
   `migrate mark-applied --all --dry-run`, **Then** nothing is written to the
   DB, and the output lists (a) the tracking table it would ensure, (b) the
   versions it would record, (c) the exact SQL statements, (d) a note that no
   migration DDL is executed; exit 0. A subsequent `status`/`SELECT` shows the
   DB is unchanged.
2. **Given** `schema_migrations` does **not** exist, **When**
   `mark-applied --all --dry-run` runs, **Then** the table is **not** created;
   the output reports it "would ensure table … (create if absent)", lists every
   target as would-record, and includes the `CREATE TABLE`/`CREATE SCHEMA`
   statements in the SQL preview; exit 0.
3. **Given** some versions are already recorded, **When**
   `mark-applied --all --dry-run` runs, **Then** those versions are shown as
   "already recorded (skip)" and are absent from the would-record list and from
   the `INSERT` statements; only not-yet-recorded versions appear.
4. **Given** `mark-applied <version> --dry-run`, **Then** only that one version
   is previewed (or reported already-recorded); nothing is written.
5. **Given** `mark-applied --dry-run` with neither `--all` nor a `<version>`,
   **Then** the same clear error as the non-dry-run case is printed and exit 1
   (dry-run does not suppress argument validation).
6. **Given** the real (non-dry-run) `mark-applied` for the same targets,
   **Then** the statements it executes are **exactly** those the dry-run
   printed (preview fidelity — no drift).
7. **Given** `migrate up --dry-run`, **Then** each pending migration is printed
   with its version **and file path**, and — like mark-applied dry-run — the
   tracking table is **not** created (write-free), satisfying SC-005 of 003.

### Edge Cases

- Empty would-record set (all targets already recorded) → dry-run prints
  "would record 0 version(s)" + the already-recorded list; no `INSERT` lines;
  exit 0.
- Table-existence probe MUST be read-only (`to_regclass`) — it MUST NOT create
  the table as a side effect.
- Missing `--db-url` / `DB_CONNECTION` / `DATABASE_URL` → usage + exit 1 (same
  as non-dry-run; dry-run still needs a DB to probe table state).
- Unknown migration version with `mark-applied <version> --dry-run` → same
  `No migration with version <v> found` error + exit 1 as non-dry-run.
- A migrations directory that is missing/invalid → same errors as non-dry-run.

## Requirements

### Functional Requirements

- **FR-001**: `supalite migrate mark-applied` MUST accept `--dry-run`, valid
  with both `--all` and a single `<version>`. Non-dry-run behavior MUST be
  unchanged.
- **FR-002** (write-free): In dry-run, `mark-applied` MUST NOT execute any
  write — no `CREATE SCHEMA`, no `CREATE TABLE`, no `INSERT`. It MUST determine
  whether the tracking table exists using a **read-only** probe (`to_regclass`)
  and MUST NOT create it. Exit 0.
- **FR-003** (fidelity): The SQL the dry-run prints MUST be the **exact**
  statements the real `mark-applied` would execute for those targets, generated
  from the **same code path** so preview and execution cannot drift. This
  includes the `CREATE SCHEMA IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS`
  ensure statements and one `INSERT … ON CONFLICT (version) DO NOTHING` per
  would-record version (with the real double-quoted identifiers).
- **FR-004** (already-recorded): Versions already present in the tracking table
  MUST be reported as "already recorded (skip)" and MUST NOT appear in the
  would-record list or produce an `INSERT` in the preview (mirroring the real
  loop, which skips them).
- **FR-005** (table absent): If the tracking table does not exist, the dry-run
  MUST treat every target as would-record, MUST include the ensure statements
  in the preview, and MUST report the table as one it "would ensure … (create
  if absent)".
- **FR-006** (argument parity): `--dry-run` MUST NOT relax argument validation:
  neither-`--all`-nor-`<version>` and unknown-version errors behave exactly as
  in the non-dry-run path (exit 1).
- **FR-007** (output shape): The CLI dry-run output MUST follow the issue's
  shape:
  ```
  [dry-run] would ensure table: public.schema_migrations (create if absent)
  [dry-run] would record N version(s):
    - <version>
  [dry-run] already recorded (skip):
    - <version>
  [dry-run] SQL:
    <statement>;
    ...
  [dry-run] no migration DDL is executed by mark-applied.
  ```
  (The "already recorded" block is omitted when empty; "would ensure" vs an
  "(exists)" note reflects the probe result.)
- **FR-008** (up symmetry): `migrate up --dry-run` MUST print each pending
  migration's version **and file path**, and MUST be **write-free** — it MUST
  NOT create the tracking table (fixes 003 SC-005, which the current
  implementation violates by calling `ensureMigrationsTable`). Non-dry-run `up`
  is unchanged.
- **FR-009** (programmatic API): `migrateMarkApplied` MUST accept
  `dryRun?: boolean`; its result MUST expose the dry-run preview (would-record
  versions, already-recorded versions, whether the table exists, and the exact
  SQL statements) so callers can render or assert on it. `migrateUp`'s dry-run
  result MUST expose pending file paths. Both remain write-free in dry-run.

### Key Entities

- **Dry-run preview**: for `mark-applied` — `{ tableExists, wouldRecord[],
  alreadyRecorded[], sql[] }`; for `up` — pending versions + file paths.
- **SQL builders**: pure functions producing the ensure/insert statement
  strings, shared by both execution and preview (fidelity guarantee).
- **Read-only table probe**: `to_regclass(<qualified table>)` → exists?.

## Success Criteria

- **SC-001** (write-free mark-applied): after `mark-applied --all --dry-run`
  against a DB with no `schema_migrations`, the table still does not exist and
  no rows were written; exit 0.
- **SC-002** (fidelity): the statement list printed by dry-run equals, verbatim,
  the statements executed by the real `mark-applied` for the same targets.
- **SC-003** (already-recorded): with a subset pre-recorded, dry-run lists only
  the remaining versions as would-record and the pre-recorded ones as skipped;
  no `INSERT` is previewed for the skipped ones.
- **SC-004** (single version): `mark-applied <version> --dry-run` previews
  exactly that version and writes nothing.
- **SC-005** (arg parity): dry-run with neither `--all` nor `<version>` exits 1
  with the standard error.
- **SC-006** (up symmetry + write-free): `up --dry-run` prints versions with
  paths and does not create the tracking table.
- **SC-007** (coverage/regression): `npm test`, `npm run lint`, `npm run build`
  pass; changed files stay ≥90% coverage.

## Assumptions

- Tests run against a live Postgres via `DB_CONNECTION` (repo convention),
  PostgreSQL 14+ (`to_regclass` available since 9.4).
- The connecting role may read `to_regclass` and `SELECT` the tracking table
  when it exists (it needs no write privileges for a dry-run).
- No new runtime dependencies.

## Out of Scope (v1)

- `--dry-run` for `status` (already read-only) or `new` (no DB).
- Rendering the full up-migration SQL body in `up --dry-run` (file path only —
  the issue explicitly allows "SQL **or** each migration path"; a 6,000-line
  baseline makes full SQL impractical).
- Any change to non-dry-run apply/record semantics.

## Dependencies & References

- GitHub issue #14 (proposal + `oq-payment#512` rollout driving case).
- Extends `supalite migrate` (#7 / [003-migrate](../003-migrate/spec.md)); reuses
  its `ensureMigrationsTable`/`appliedVersions`/`applyMigration` code paths.
