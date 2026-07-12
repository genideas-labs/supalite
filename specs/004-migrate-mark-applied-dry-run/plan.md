# Implementation Plan: `migrate mark-applied --dry-run` (004)

**Input**: [spec.md](spec.md), [clarify.md](clarify.md), [contracts/cli-contract.md](contracts/cli-contract.md)
**Approach**: live-Postgres TDD (repo convention — tests hit `DB_CONNECTION`). Commit after every task. Keep changed files ≥90% coverage.

## Summary

Add `--dry-run` to `migrate mark-applied`: probe the tracking table read-only
(`to_regclass`), compute would-record vs already-recorded, and print the exact
statements the real command would run — **writing nothing**. The preview SQL is
built from the **same helpers** the executor uses, so it cannot drift. Also make
`migrate up --dry-run` write-free (drop `ensureMigrationsTable` in favor of the
same read-only probe) and print each pending migration's file path — closing the
003 SC-005 gap. No new dependencies; additive result-shape fields.

## Design Decisions

- **Shared SQL builders** (pure, internal to `src/migrate.ts`):
  `createSchemaSql(t)`, `createTableSql(t)` are used by BOTH
  `ensureMigrationsTable` (executor) and the dry-run preview → byte-identical
  DDL. The mark-applied INSERT template is a single shared string; the preview
  renders it with the version literal substituted for `$1` (only the bound
  value differs; structure/identifiers/`ON CONFLICT` clause are identical).
- **Read-only table probe** `tableExists(client, t)` via
  `SELECT to_regclass($1)` with the double-quoted qualified name — returns NULL
  when absent, no DDL, no side effect.
- **`appliedVersionsIfExists(client, t)`**: returns `∅` when the table is
  absent (skips the `SELECT` that would error), else delegates to
  `appliedVersions`. Used by both dry-runs.
- **mark-applied dry-run** always includes the two ensure statements in the
  preview (they always run in reality, `IF NOT EXISTS`), plus one INSERT per
  would-record version. Already-recorded versions get no INSERT (the real loop
  skips them). Header reports `(create if absent)` vs `(already exists)` from
  the probe.
- **up dry-run**: no `ensureMigrationsTable`, no lock; read-only
  `appliedVersionsIfExists` → pending versions + `pendingPaths`. Non-dry-run
  `up` restructured so the (previously redundant) pre-lock applied read is gone;
  behavior identical (it already re-reads applied under the lock).
- **Argument validation unchanged**: `--dry-run` is orthogonal; the existing
  `parseMigrateArgs` already sets `dryRun` for any subcommand, so no parser
  change. The `mark-applied` arg checks (`--all`/`<version>`) run before any DB
  work, exactly as today.

## File Structure

- **Modify** `src/migrate.ts`:
  - Add internal `createSchemaSql`, `createTableSql`, `markAppliedInsertSql`
    (parameterized, shared with executor), `previewInsertSql` (literal), and
    `tableExists`, `appliedVersionsIfExists`.
  - Refactor `ensureMigrationsTable` to use `createSchemaSql`/`createTableSql`.
  - Extend `MarkAppliedResult` with `dryRun?: MarkAppliedDryRun`
    (`{ table, tableExists, sql }`); add `dryRun?: boolean` to the
    `migrateMarkApplied` options; add the write-free dry-run branch.
  - Extend `MigrateUpResult` with `pendingPaths?: string[]`; make `migrateUp`
    dry-run write-free with paths.
- **Modify** `src/cli.ts`: mark-applied dry-run rendering; up dry-run path
  output + write-free note; `printMigrateUsage` (`--dry-run` scope + example).
- **Modify** `src/index.ts`: export `MarkAppliedDryRun` type.
- **Modify** `README.md`, `README.ko.md`: mark-applied `--dry-run` section.
- **Modify** `CHANGELOG.md`: `[Unreleased]` entry.
- **Test** `src/__tests__/migrate.test.ts` (dry-run integration),
  `src/__tests__/migrate-cli.test.ts` (CLI spawn).

## Interfaces

```ts
export type MarkAppliedDryRun = {
  table: string;          // human ref, e.g. "public.schema_migrations"
  tableExists: boolean;   // to_regclass probe result
  sql: string[];          // exact statements the real command would run
};
export type MarkAppliedResult = {
  marked: string[];       // recorded; in dry-run: would-record versions
  alreadyApplied: string[];
  dryRun?: MarkAppliedDryRun;
};
export type MigrateUpResult = {
  applied: string[];
  pending: string[];
  pendingPaths?: string[]; // dry-run only: file path per pending version (same order)
};

export const migrateMarkApplied: (
  opts: MigrateOptions & { version?: string; all?: boolean; dryRun?: boolean }
) => Promise<MarkAppliedResult>;
export const migrateUp: (
  opts: MigrateOptions & { dryRun?: boolean }
) => Promise<MigrateUpResult>;
```

## Test Strategy

- **Integration (DB, unique per-test schema)**:
  1. mark-applied `--all --dry-run`, table **absent** → result.marked = all
     versions, `dryRun.tableExists === false`, `dryRun.sql` includes
     `CREATE TABLE …` and one INSERT per version; **`to_regclass` still NULL
     afterwards** (nothing created), row count query would fail = table absent.
  2. mark-applied `--all --dry-run`, table **present with a subset recorded** →
     `marked` = remaining, `alreadyApplied` = recorded subset, no INSERT for
     skipped versions; table row count **unchanged** after.
  3. **Fidelity**: after (2)'s dry-run, run the **real** `mark-applied --all`;
     assert it records exactly the `marked` set the dry-run predicted, and a
     re-run dry-run now reports them all as `alreadyApplied` with 0 would-record.
  4. `mark-applied <version> --dry-run` previews exactly one version; writes
     nothing.
  5. `up --dry-run` on a fresh schema → pending versions + `pendingPaths` set,
     and `schema_migrations` is **not created** (`to_regclass` NULL after).
- **CLI (spawn ts-node)**: `mark-applied --all --dry-run` prints the
  `[dry-run]` block (`would ensure`, `would record`, `SQL:`,
  `no migration DDL is executed`) and exits 0; arg-parity (`--dry-run` with
  neither `--all` nor version → exit 1); `up --dry-run` prints a path and the
  write-free note.
- **Regression**: `npm test`, `npm run lint`, `npm run build`; changed files
  ≥90%.

## Risk / Rollout

- Additive & backward-compatible: new optional flag + optional result fields;
  non-dry-run apply/record paths untouched.
- The one behavior change is `up --dry-run` no longer creating the tracking
  table — this **fixes** a 003 SC-005 violation and is covered by test (5).
