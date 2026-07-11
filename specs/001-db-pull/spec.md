# Feature Specification: `supalite db pull` — Baseline Schema Dump

**Feature Branch**: `001-db-pull`
**Created**: 2026-07-12
**Status**: Ready for implementation
**Input**: [GitHub issue #4](https://github.com/genideas-labs/supalite/issues/4) + approved design doc [docs/superpowers/specs/2026-07-12-db-pull-design.md](../../docs/superpowers/specs/2026-07-12-db-pull-design.md)

## User Scenarios & Testing

### Primary User Story

As a developer who migrated a service off the Supabase platform to a plain
Postgres (e.g. GCP Cloud SQL) while keeping the supalite driver, most of my
production schema lives outside version control and `supabase db pull` no
longer works (it requires a linked Supabase project). I run
`supalite db pull --db-url <conn>` and get a single baseline migration SQL
file that (a) recreates my schema on an empty database in dependency order,
and (b) is safe to re-apply to the very database it was pulled from.

Measured driving case (requester's production DB): 46/64 tables, 29/53 user
functions, 2 enum types, 1 trigger, and 2 extensions missing from
migrations; 34 of 87 functions are extension-owned and must not be dumped
individually.

### Acceptance Scenarios

1. **Given** a reachable Postgres with objects in the `public` schema,
   **When** the user runs `supalite db pull --db-url <conn>`,
   **Then** a file `supabase/migrations/<UTC YYYYMMDDHHMMSS>_baseline.sql`
   is created (directory auto-created) containing DDL for all supported
   object kinds in dependency order.
2. **Given** the generated baseline file and an empty database (where all
   footer-listed externally-referenced objects — schemas AND their
   referenced tables — already exist),
   **When** the file is applied,
   **Then** every dumped object is created without error (schemas,
   extensions, sequences, types, tables, functions, constraints, indexes,
   triggers, views) — including column defaults, CHECK constraints, and
   index expressions that call user-defined functions.
3. **Given** the generated baseline file and the original source database,
   **When** the file is re-applied,
   **Then** it completes without any error — including constraints
   (idempotency has no exceptions).
4. **Given** a database with extensions that own objects (e.g. `pg_trgm`),
   **When** the user runs the command with default flags,
   **Then** extension-owned objects are NOT dumped individually; a
   `CREATE EXTENSION IF NOT EXISTS` statement is emitted instead. With
   `--include-extension-objects`, they are dumped.
5. **Given** the user passes `--mode diff`,
   **Then** the command exits with code 1 and the message
   `Only --mode baseline is supported in this version (diff is planned).`
6. **Given** the user passes `--out -` (or `stdout`),
   **Then** the SQL is written to stdout and no file is created.
7. **Given** the user passes `--no-if-not-exists`,
   **Then** the output contains plain DDL: no `DO $$` guards, plain
   `CREATE TRIGGER`, and no `IF NOT EXISTS` except on `CREATE SCHEMA` /
   `CREATE EXTENSION` (always kept).
8. **Given** a schema that mixes identity columns (both `ALWAYS` and
   `BY DEFAULT`), legacy serial columns (`DEFAULT nextval(...)`), and
   standalone sequences,
   **Then** all three paths round-trip correctly: identity rendered inline
   (implicit sequences not dumped), serial sequences created before tables
   with ownership restored after tables, standalone sequences dumped with
   their options.

### Edge Cases

- Selected schema contains no objects → a valid header-only file is still
  produced and a warning is printed to stderr.
- An FK references a table in a schema outside the `--schema` selection →
  the FK is emitted as-is and the footer comment lists the external
  reference.
- Two tables reference each other via FK (circular) → baseline still
  applies cleanly because all FKs are emitted after all tables.
- Source function bodies contain CRLF line endings → output file is
  LF-only.
- Unsupported objects exist in the schema (partitioned tables and their
  leaf partitions, aggregate/window functions, typed/inherited-variant
  specifics beyond FR-009) → reproduced where specified, otherwise
  skipped and listed in a footer comment — together with their transitive
  dependents — never silently dropped.
- A view has an `INSTEAD OF` trigger → the trigger is emitted after the
  view and applies cleanly.
- Identifiers/labels contain mixed case, reserved words, embedded single
  OR double quotes → output is correctly quoted/escaped and round-trips.
- Wrapped DDL contains a literal `$$` (e.g. in a CHECK expression string)
  → `DO` guards pick a dollar-quote tag not present in the content.
- A function body stored with CRLF line endings → output is LF-only and
  still round-trips.
- Missing `--db-url` and no `DB_CONNECTION` env var → usage printed,
  exit code 1.

## Requirements

### Functional Requirements

- **FR-001**: The CLI MUST accept a new subcommand `supalite db pull` with
  flags `--db-url <conn>`, `--schema <a,b>` (default `public`),
  `--out <path>` (default `supabase/migrations/<UTC YYYYMMDDHHMMSS>_baseline.sql`,
  `-`/`stdout` for stdout), `--mode <baseline>` (default `baseline`),
  `--include-extension-objects`, `--no-if-not-exists`, `--help`. Existing
  `supalite gen types` behavior MUST be unchanged.
- **FR-002**: `--db-url` MUST fall back to the `DB_CONNECTION` environment
  variable; if neither is present, print usage and exit 1 (same convention
  as `gen types`).
- **FR-003**: Output MUST be a single SQL file with sections in this
  dependency order: header → schemas → extensions → sequences → types →
  functions (type-level signatures) → tables → sequence ownership →
  functions (table-row-type signatures) → deferred column defaults →
  constraints (PK/UNIQUE/CHECK/EXCLUDE) → foreign keys → views →
  functions (view-row-type signatures) → triggers → indexes → footer.
  Rationale: functions are staged by what their *signatures* reference
  (`check_function_bodies = off` defers only bodies, never signature or
  expression resolution) — type-only signatures precede tables so
  generated columns and defaults can call them; `RETURNS SETOF <table>`
  functions follow tables; `RETURNS SETOF <view>` functions follow views.
  Column defaults that call user-defined functions are stripped from
  `CREATE TABLE` and emitted as `ALTER TABLE ... ALTER COLUMN ... SET
  DEFAULT` after the table-stage functions; triggers come after views
  (`INSTEAD OF` triggers); indexes come after views (materialized-view
  indexes).
- **FR-004**: The header MUST include a generated-by comment (tool,
  timestamp, schema list) and `SET check_function_bodies = off;`.
- **FR-005**: All foreign-key constraints MUST be emitted after every
  `CREATE TABLE` statement (never inline).
- **FR-006**: By default (idempotent mode), re-applying the output to a
  database that already contains the schema MUST produce zero errors:
  `IF NOT EXISTS` on schemas/extensions/sequences/tables/indexes,
  `CREATE OR REPLACE` on functions/triggers/views, exception-guarded
  `CREATE TYPE`/`CREATE DOMAIN`, and every `ALTER TABLE ... ADD CONSTRAINT`
  wrapped in a `DO` guard that checks `pg_constraint` by constraint name
  and table. All generated `DO` guards use a content-safe dollar tag
  (`$supalite$`, falling back to `$supalite1$`, ... when the wrapped text
  contains the tag).
- **FR-007**: `--no-if-not-exists` MUST emit plain DDL instead (no guards),
  except `CREATE SCHEMA` / `CREATE EXTENSION` which always keep
  `IF NOT EXISTS`.
- **FR-008**: By default, objects owned by extensions (`pg_depend`
  `deptype = 'e'`) MUST be excluded from every section;
  `--include-extension-objects` disables the filter. Extensions themselves
  are emitted as `CREATE EXTENSION IF NOT EXISTS` (all non-`plpgsql`
  extensions).
- **FR-009**: Table coverage MUST include: column types, defaults,
  NOT NULL, identity columns (`GENERATED {ALWAYS|BY DEFAULT} AS IDENTITY`,
  with non-default sequence options rendered), generated columns
  (`GENERATED ALWAYS AS (...) STORED`, including expressions calling
  type-stage user functions), non-default column `COLLATE` clauses, and
  `UNLOGGED` persistence. Tables MUST be topologically ordered when a
  column uses another table's row type. Partition leaf tables
  (`relispartition`) MUST be excluded from table output (they are
  footer-listed with their parent). Defaults that call user-defined
  functions MUST be emitted as deferred
  `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT` statements after the
  table-stage functions section. Non-default table variants that are NOT
  reproduced
  (typed tables, inheritance, non-default access method/tablespace/storage
  parameters/replica identity) MUST be footer-listed.
- **FR-010**: Sequence coverage MUST include standalone sequences and
  serial-backing sequences (created before tables, ownership restored via
  `ALTER SEQUENCE ... OWNED BY` after tables); identity-internal sequences
  (`pg_depend` `deptype = 'i'`) MUST NOT be dumped.
- **FR-011**: Type coverage MUST include enum, domain (base type, default,
  NOT NULL, CHECK constraints), and composite types, emitted in a unified
  topological order (composite-on-composite, domain-over-enum,
  array-of-composite attributes resolved through their element type).
  Domain defaults/CHECKs that call user functions are emitted as deferred
  `ALTER DOMAIN ... SET DEFAULT` / guarded `ALTER DOMAIN ... ADD
  CONSTRAINT` after the required function stage.
- **FR-012**: Constraint coverage MUST include PK, UNIQUE, CHECK, EXCLUDE,
  and FK (table-level, from the system catalogs — CHECK constraints are not
  inlined in `CREATE TABLE`).
- **FR-013**: Index coverage MUST include all indexes on tables AND
  materialized views except those backing constraints (PK/UNIQUE/EXCLUDE);
  the index section is emitted after views so materialized-view indexes
  resolve.
- **FR-014**: Function coverage MUST include plain functions and
  procedures; triggers MUST include non-internal triggers (constraint
  triggers are emitted via an existence guard, since `CREATE OR REPLACE`
  does not support them); views MUST include plain views (topologically
  sorted so referenced views come first) with their options preserved
  (e.g. `security_barrier`, `check_option`) and materialized views
  (emitted `WITH NO DATA` when unpopulated at the source). Extensions MUST
  be emitted in `pg_depend` topological order (oid as tie-breaker) so
  dependent extensions follow their prerequisites; extension target
  schemas are included in the schemas section; extension versions are not
  pinned (v1).
- **FR-015**: Output MUST be LF-normalized (no CR characters) and end with
  a single trailing newline.
- **FR-016**: Unsupported objects found in the selected schemas MUST be
  listed in a footer comment and never silently dropped: partitioned
  table hierarchies (parents and their leaf partitions),
  aggregate/window functions, non-reproduced table/view variants
  (FR-009/FR-014), and FKs referencing schemas outside the selection
  (the referenced objects must pre-exist on an otherwise-empty target).
  Supported DDL that *depends on* an excluded object MUST NOT be emitted
  as failing statements: the generator computes a transitive dependency
  closure rooted at every excluded object (partition parents/leaves,
  aggregates, extension-owned objects when filtering) and diverts all
  affected supported DDL — views, FKs, constraints, deferred defaults,
  composites/domains referencing relation row types, and functions whose
  signatures reference excluded relations — to the footer instead.
  Generated columns calling table/view-stage user functions are
  footer-flagged (the expression cannot be deferred), as are
  defaults/CHECKs calling view-stage functions and views calling
  view-stage functions (multi-stage view↔function interleavings are a
  documented v1 limitation).
- **FR-017**: `--mode` values other than `baseline` MUST exit 1 with
  `Only --mode baseline is supported in this version (diff is planned).`
- **FR-018**: A selection that yields zero objects MUST still produce a
  valid header-only file (no schema/extension statements either) and print
  a warning to stderr.
- **FR-019**: Grants and RLS policies MUST NOT be emitted in v1 (deferred
  to future `--include-grants` / `--include-policies` options).
- **FR-020**: `generateBaselineSql` and `DbPullOptions` MUST be exported
  from the package root (`supalite`), alongside the existing exports.
- **FR-021**: Generated DDL MUST be correct for hostile identifiers and
  literals (mixed case, reserved words, embedded quotes in names and enum
  labels) — identifiers server-quoted, literals escaped — verified by
  round-trip.

### Key Entities

- **Baseline file**: the single SQL artifact; sections as in FR-003.
- **Supported object kinds**: schema, extension, sequence, enum type,
  composite type, table (+identity/generated columns), constraint
  (PK/UNIQUE/CHECK/EXCLUDE/FK), index, function, procedure, trigger, view,
  materialized view.
- **Supported object kinds (additional)**: domain types (with defaults and
  CHECK constraints).
- **Unsupported (v1, footer-listed with their dependents)**: partitioned
  table hierarchies, aggregate/window functions, grants, RLS policies.

## Success Criteria

- **SC-001** (round-trip): For a fixture schema exercising every supported
  object kind, generating a baseline, dropping the schema, applying the
  baseline, and regenerating yields identical content (comment lines
  excluded).
- **SC-002** (idempotency): Applying the same baseline a second time on
  the already-built schema completes with zero errors.
- **SC-003** (extension filter): With `pg_trgm` installed, no `gtrgm_*`
  object appears in default output; with `--include-extension-objects`
  they appear.
- **SC-004** (driving case coverage): Every object *category* measured in
  the requester's production schema (identity columns of both kinds,
  legacy serial columns, standalone sequences, FK and CHECK constraints,
  extension-owned functions) is represented in the fixture schema by at
  least one instance and passes SC-001/SC-002 — representative category
  coverage, not the production cardinalities (50/9/59/15/27).
- **SC-005** (CLI parity): `--db-url` / `--schema` / `--out` /
  `DB_CONNECTION` fallback behave identically to `supalite gen types`.

## Assumptions

- Databases that will replay the baseline run PostgreSQL 14+ (required for
  `CREATE OR REPLACE TRIGGER`); documented in README.
- Tests run against a live Postgres reachable via `DB_CONNECTION`
  (existing repo convention; default
  `postgresql://testuser:testpassword@localhost:5432/testdb`).
- The v1 unsupported list is acceptable: the driving production schema was
  measured to contain zero partitioned tables, zero user aggregate/window
  functions, and zero domain types (issue #4 confirmation).
- No new runtime dependencies (the existing `pg` package suffices).

## Out of Scope (v1)

- `--mode diff` (flag reserved; clear error).
- Grants and RLS policies (future options).
- Partitioned tables and aggregate/window functions (footer-listed,
  including their dependents per FR-016).
- Function-body dependency analysis beyond signature staging (bodies are
  deferred wholesale via `check_function_bodies = off`).

## Dependencies & References

- GitHub issue #4 (proposal + requester confirmations:
  [scope](https://github.com/genideas-labs/supalite/issues/4#issuecomment-4947495334),
  [decisions](https://github.com/genideas-labs/supalite/issues/4#issuecomment-4947560393),
  [requester data validation](https://github.com/genideas-labs/supalite/issues/4#issuecomment-4947586939),
  [constraint idempotency resolution](https://github.com/genideas-labs/supalite/issues/4#issuecomment-4947605966))
- Approved design doc: `docs/superpowers/specs/2026-07-12-db-pull-design.md`
