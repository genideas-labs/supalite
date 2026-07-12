# Implementation Plan: `supalite migrate` (003)

**Input**: [spec.md](spec.md), [clarify.md](clarify.md), [contracts/cli-contract.md](contracts/cli-contract.md)
**Approach**: live-Postgres TDD (repo convention — tests hit `DB_CONNECTION`) + pure unit tests for the parser. Commit after every task. Keep coverage ≥90% for the new file.

## Summary

A new module `src/migrate.ts` holds a pure dbmate-format parser, a `pg`-backed
runner (one `Client` per invocation, like `db-pull.ts`), and four command
functions. `src/cli.ts` gains a `migrate` subcommand; `src/index.ts` re-exports
the programmatic API. No query-layer changes; no new dependencies.

## Design Decisions

- **Single module `src/migrate.ts`** (consistent with `db-pull.ts` being one
  file). Pure helpers (`parseMigrationSql`, `parseMigrationFilename`,
  `listMigrationFiles`, `parseTableRef`) are unit-testable without a DB; the
  command functions use a dedicated `pg.Client`.
- **Version = leading digit run** of the filename (dbmate). Ordering by
  `BigInt(version)` so differing-width numeric prefixes still sort correctly.
- **Advisory lock** `pg_advisory_lock(hashtext('supalite:migrate'))` held for
  the whole `up` run, released in `finally`; applied versions re-read after
  acquiring it.
- **Atomic recording**: transactional migrations run
  `BEGIN; <up sql>; INSERT INTO <table>(version) VALUES($1); COMMIT;` — a
  failure rolls back (rollback failure never masks the original error), the
  version is not recorded, and the run stops naming the file.
- **`transaction:false`**: run the up SQL as a single statement with no BEGIN,
  then `INSERT` the version (non-atomic; documented).
- **Tracking table**: `ensureMigrationsTable` does `CREATE SCHEMA IF NOT EXISTS`
  + `CREATE TABLE IF NOT EXISTS <qualified> (version text primary key,
  applied_at timestamptz not null default now())`. Identifiers are
  double-quote-escaped. Insert lists only `(version)` for dbmate compatibility.
- **DB URL**: `--db-url` || `DB_CONNECTION` || `DATABASE_URL`.
- **`down`**: parsed by the parser (template has it) but the runner never uses
  it; the CLI prints an unsupported message and exits 1.

## File Structure

- **Create** `src/migrate.ts`:
  - Types: `MigrationSection`, `ParsedMigration`, `MigrationFile`,
    `MigrateOptions`, `MigrationStatusEntry`, `MigrateUpResult`,
    `MarkAppliedResult`, `NewMigrationResult`.
  - Pure: `parseMigrationSql`, `parseMigrationFilename`, `listMigrationFiles`,
    `parseTableRef`, `migrationTimestamp`.
  - DB-backed: `migrateStatus`, `migrateUp`, `migrateMarkApplied`,
    `migrateNew`; internal `ensureMigrationsTable`, `appliedVersions`,
    `applyMigration`, `qualifiedTable`.
- **Modify** `src/cli.ts`: `migrate` dispatch, `parseMigrateArgs`,
  `printMigrateUsage`, `runMigrate`, `resolveMigrateDbUrl`.
- **Modify** `src/index.ts`: export the API + types.
- **Modify** `README.md`, `README.ko.md`: document the `migrate` subcommand.
- **Create** `docs/changelog/2026-07-12-migrate-runner.md`.
- **Test** `src/__tests__/migrate.test.ts` (parser units + integration:
  status/up/atomic-failure/transaction:false/mark-applied),
  `src/__tests__/migrate-cli.test.ts` (CLI spawn, mirroring db-pull-cli).

## Interfaces

```ts
export type MigrationSection = { sql: string; disableTransaction: boolean };
export type ParsedMigration = { up: MigrationSection; down: MigrationSection | null };
export type MigrationFile = { version: string; name: string; filename: string; path: string };
export type MigrateOptions = { dbUrl: string; dir?: string; migrationsTable?: string };
export type MigrationStatusEntry = { version: string; name: string; filename: string; applied: boolean };
export type MigrateUpResult = { applied: string[]; pending: string[] };
export type MarkAppliedResult = { marked: string[]; alreadyApplied: string[] };
export type NewMigrationResult = { path: string; filename: string; version: string };

export const parseMigrationSql: (content: string) => ParsedMigration;
export const parseMigrationFilename: (filename: string) => { version: string; name: string };
export const listMigrationFiles: (dir: string) => Promise<MigrationFile[]>;
export const parseTableRef: (ref: string) => { schema: string; table: string };
export const migrationTimestamp: (date?: Date) => string;
export const migrateStatus: (opts: MigrateOptions) => Promise<MigrationStatusEntry[]>;
export const migrateUp: (opts: MigrateOptions & { dryRun?: boolean }) => Promise<MigrateUpResult>;
export const migrateMarkApplied: (opts: MigrateOptions & { version?: string; all?: boolean }) => Promise<MarkAppliedResult>;
export const migrateNew: (opts: { name: string; dir?: string; timestamp?: string }) => Promise<NewMigrationResult>;
```

## Test Strategy

- **Unit (no DB)**: `parseMigrationSql` (up/down split, `transaction:false`,
  missing-up error), `parseMigrationFilename` (version/name, invalid),
  `listMigrationFiles` (sorted, ignores non-sql, missing-dir error),
  `migrationTimestamp`, `migrateNew` (template + name).
- **Integration (DB)**: use a unique per-test schema for the tracking table AND
  test objects (drop schema CASCADE in cleanup). Cover: apply+record+idempotent,
  dry-run, atomic failure (rollback + not recorded + stop), `transaction:false`
  (`CREATE INDEX CONCURRENTLY` proves it ran outside a tx), mark-applied
  (`--all` and `<version>`, no SQL executed).
- **CLI (spawn ts-node)**: help, missing-db-url, `down` unsupported, unknown
  flag, `new` (no DB), `up --dry-run` + `status` end-to-end.
- **Regression**: `npm test`, `npm run lint`, `npm run build`; new file ≥90%.

## Risk / Rollout

- Additive: a brand-new subcommand + module; existing behavior untouched.
- Payment-DB safety concentrated in `applyMigration` + the advisory lock —
  covered by the atomic-failure and `transaction:false` integration tests.
