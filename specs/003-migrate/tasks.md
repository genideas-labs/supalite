# Tasks: `supalite migrate` (003)

**Input**: [spec.md](spec.md), [plan.md](plan.md), [contracts/cli-contract.md](contracts/cli-contract.md), [clarify.md](clarify.md)
**Approach**: live-Postgres TDD; commit after every task; new file coverage ≥90%. Run jest via `./node_modules/.bin/jest` (the `rtk` hook breaks `npx jest`).

Legend: `- [ ]` pending · `- [x]` done.

---

## T001 — dbmate parser + filename parsing (pure)
**Files**: `src/migrate.ts`, `src/__tests__/migrate.test.ts`
- [ ] Failing unit tests: `parseMigrationSql` (up/down split; `-- migrate:up transaction:false` → `disableTransaction`; missing-up throws `Missing '-- migrate:up'`), `parseMigrationFilename` (`20260712093000_add_users.sql` → `{version:'20260712093000', name:'add_users'}`; no-numeric-prefix throws `Invalid migration filename`).
- [ ] Implement in `src/migrate.ts`: constants (`DEFAULT_DIR='supabase/migrations'`, `DEFAULT_TABLE='public.schema_migrations'`, `LOCK_SQL`/`UNLOCK_SQL` using `hashtext('supalite:migrate')`), `MigrationSection`/`ParsedMigration`, `parseMigrationSql` (line scan for `/^--\s*migrate:(up|down)\b(.*)$/`, `transaction:false` on marker), `parseMigrationFilename` (`/^(\d+)(?:_(.*))?$/`).
- [ ] Green; commit `feat(migrate): dbmate-compatible parser`.

## T002 — `migrateNew` + `migrationTimestamp` (pure)
**Files**: `src/migrate.ts`, `src/__tests__/migrate.test.ts`
- [ ] Failing tests: `migrationTimestamp(new Date('2026-07-12T09:30:00Z'))==='20260712093000'`; `migrateNew({name:'add orders', dir, timestamp:'20260712093000'})` → file `20260712093000_add_orders.sql` containing `-- migrate:up` and `-- migrate:down`.
- [ ] Implement `migrationTimestamp` (`toISOString().replace(/[-:T]/g,'').slice(0,14)`), `NewMigrationResult`, `migrateNew` (mkdir -p; `writeFile(..., {flag:'wx'})`; name whitespace→`_`; empty name throws).
- [ ] Green; commit `feat(migrate): migrateNew scaffolds a dbmate file`.

## T003 — discovery + tracking table + `migrateStatus`
**Files**: `src/migrate.ts`, `src/__tests__/migrate.test.ts`
- [ ] Add the integration harness to the test (unique per-test schema `mig_test_<pid>_<n>`, `migrationsTable=<schema>.schema_migrations`, temp dir; cleanup = `DROP SCHEMA IF EXISTS "<schema>" CASCADE` + rm dir; `tableExists(schema, table)` via `to_regclass`).
- [ ] Failing: `listMigrationFiles` (sorted asc by `BigInt(version)`, ignores non-`.sql`, missing-dir throws `Migrations directory not found`); `migrateStatus` returns one `{version,name,filename,applied:false}` for a single unapplied file.
- [ ] Implement `MigrationFile`, `listMigrationFiles`, `parseTableRef` (`schema.table`|`table`; else throw), `quoteIdent`/`qualifiedTable`, `ensureMigrationsTable` (CREATE SCHEMA/TABLE IF NOT EXISTS), `appliedVersions` (`SELECT version`), `MigrateOptions`/`MigrationStatusEntry`, `migrateStatus`.
- [ ] Green; commit `feat(migrate): discovery, tracking table, status`.

## T004 — `migrateUp` (order, advisory lock, atomic recording, `--dry-run`)
**Files**: `src/migrate.ts`, `src/__tests__/migrate.test.ts`
- [ ] Failing integration: (a) applies + records + idempotent second run; (b) `--dry-run` returns pending, creates nothing; (c) a mid-migration failure (`SELECT 1/0`) rejects with the failing filename, leaves earlier migration committed, its own table absent, later migration unrun, versions unrecorded.
- [ ] Implement `MigrateUpResult`, `applyMigration` (transactional branch: `BEGIN`/up sql/`INSERT (version)`/`COMMIT`; on error `ROLLBACK` swallow-safe + throw `Migration <file> failed: <msg>`), `migrateUp` (ensure table; dry-run returns pending; else `LOCK_SQL`, re-read applied, loop applying pending in order, `UNLOCK_SQL` in finally; `Client.end()` in finally).
- [ ] **SC-006 (dbmate round-trip, closes #8 SC-004)**: integration test — `generateBaselineSql({dbUrl, schemas:[<unique schema>], format:'dbmate'})`, write it as `<ts>_baseline.sql` in a temp dir, run `migrateUp` against a *different* target schema/db state, assert it parses (single up section) and applies without error and records the version.
- [ ] Green; commit `feat(migrate): up with advisory lock + atomic version recording`.

## T005 — `transaction:false` escape
**Files**: `src/migrate.ts:applyMigration`, `src/__tests__/migrate.test.ts`
- [ ] Failing integration: two migrations — a normal `CREATE TABLE "<schema>".items(...)`, then `-- migrate:up transaction:false` `CREATE INDEX CONCURRENTLY IF NOT EXISTS items_id_idx ON "<schema>".items(id)`. `migrateUp` applies both; assert the index exists (would error `CREATE INDEX CONCURRENTLY cannot run inside a transaction block` if wrapped).
- [ ] Implement the `up.disableTransaction` branch in `applyMigration` (run up sql, then INSERT, no BEGIN/COMMIT).
- [ ] Green; commit `feat(migrate): transaction:false escape for concurrent DDL`.

## T006 — `migrateMarkApplied`
**Files**: `src/migrate.ts`, `src/__tests__/migrate.test.ts`
- [ ] Failing integration: `--all` records a migration's version WITHOUT executing its SQL (target table absent); a following `up` is a no-op. `mark-applied <version>` records exactly one. No `--all`/version → throws `requires a <version> argument or --all`.
- [ ] Implement `MarkAppliedResult`, `migrateMarkApplied` (targets = all files or one by version; `INSERT ... ON CONFLICT (version) DO NOTHING`; skip already-applied).
- [ ] Green; commit `feat(migrate): mark-applied for adopting existing databases`.

## T007 — CLI wiring
**Files**: `src/cli.ts`, `src/__tests__/migrate-cli.test.ts`
- [ ] Failing CLI (spawn ts-node like db-pull-cli): `migrate --help` documents subcommands + `mark-applied`; `migrate up` (no db-url) → `Missing --db-url (or DB_CONNECTION / DATABASE_URL env var).` exit 1; `migrate down` → `not supported` exit 1; unknown option → `Unknown option for migrate: --nope` exit 1; `migrate new add_orders --dir <tmp>` creates `\d{14}_add_orders.sql` (no DB); `migrate up --dry-run` + `migrate status` end-to-end via `DB_CONNECTION` (unique schema, cleanup after).
- [ ] Implement in `src/cli.ts`: import the four fns; `printMigrateUsage`, `parseMigrateArgs` (sub + positional + `--db-url/--dir/--migrations-table/--dry-run/--all`; unknown `--` → error), `resolveMigrateDbUrl` (`explicit || DB_CONNECTION || DATABASE_URL`), `runMigrate` (dispatch new/down/status/up/mark-applied); add `if (args[0]==='migrate') { await runMigrate(args.slice(1)); return; }` and `printMigrateUsage()` in the fallthrough.
- [ ] Green; commit `feat(migrate): CLI subcommand (up/status/new/mark-applied/down)`.

## T008 — exports, docs, regression gate
**Files**: `src/index.ts`, `README.md`, `README.ko.md`, `docs/changelog/2026-07-12-migrate-runner.md`
- [ ] Failing test: `import('../index')` exposes `migrateUp/migrateStatus/migrateMarkApplied/migrateNew` as functions.
- [ ] Implement: export the API + types from `src/index.ts`; add a `supalite migrate` section to README.md + README.ko.md (toolchain `db pull → migrate → gen types`, safety features, dbmate format, forward-only, programmatic API); create the changelog.
- [ ] Gate: `./node_modules/.bin/jest` all pass; `./node_modules/.bin/eslint 'src/**/*.ts'` 0 errors; `./node_modules/.bin/tsc` clean; `migrate.ts` coverage ≥90%. Bump spec Status → Implemented.
- [ ] Commit `feat(migrate): export API + document the runner`.
