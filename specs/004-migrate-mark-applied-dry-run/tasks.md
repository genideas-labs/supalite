# Tasks: `migrate mark-applied --dry-run` (004)

Live-Postgres TDD. Commit after every task. Changed files ≥90% coverage.

## T001 — Shared SQL builders + read-only probe (src/migrate.ts)
- [ ] Add internal pure builders `createSchemaSql(t)`, `createTableSql(t)` and
      refactor `ensureMigrationsTable` to call them (no behavior change).
- [ ] Add `markAppliedInsertSql(t)` (parameterized `$1`, `ON CONFLICT (version)
      DO NOTHING`) and refactor `migrateMarkApplied`'s executor INSERT to use it.
- [ ] Add `previewInsertSql(t, version)` rendering the same template with the
      version literal substituted for `$1` (single-quote-escaped).
- [ ] Add `tableExists(client, t)` (`SELECT to_regclass($1)` on the quoted
      qualified name) and `appliedVersionsIfExists(client, t)` (∅ when absent).
- [ ] `npm run build` + `npm test` (green — pure refactor).
- [ ] Commit `refactor(migrate): shared SQL builders + read-only table probe`.

## T002 — mark-applied dry-run (src/migrate.ts) — TDD
- [ ] Write failing integration tests (migrate.test.ts): table-absent preview
      (all would-record, sql has CREATE TABLE + inserts, table NOT created),
      table-present-subset (marked=remaining, alreadyApplied=subset, rows
      unchanged), single-version dry-run.
- [ ] Add `dryRun?: boolean` to options and `MarkAppliedDryRun` +
      `dryRun?` to `MarkAppliedResult`; implement the write-free branch
      (probe → would-record/already → build `sql[]`; return, no writes).
- [ ] Run tests → green. Commit `feat(migrate): mark-applied --dry-run (write-free preview)`.

## T003 — Fidelity test (migrate.test.ts)
- [ ] Test: run dry-run, capture `marked`; run real `mark-applied --all`; assert
      it records exactly the predicted set; re-run dry-run → all alreadyApplied,
      0 would-record. Commit `test(migrate): mark-applied dry-run fidelity`.

## T004 — up dry-run write-free + paths (src/migrate.ts) — TDD
- [ ] Failing test: `up --dry-run` on a fresh schema returns pending +
      `pendingPaths` and does NOT create `schema_migrations` (`to_regclass` NULL
      after).
- [ ] Add `pendingPaths?` to `MigrateUpResult`; restructure `migrateUp` so the
      dry-run branch is read-only (no `ensureMigrationsTable`, no lock) and
      returns paths; non-dry-run path unchanged.
- [ ] Run tests → green. Commit `fix(migrate): up --dry-run is write-free + prints paths (003 SC-005)`.

## T005 — CLI wiring (src/cli.ts) — TDD
- [ ] Failing CLI tests (migrate-cli.test.ts): `mark-applied --all --dry-run`
      prints the `[dry-run]` block + exit 0; arg-parity (`--dry-run`, no
      `--all`/version → exit 1); `up --dry-run` prints a path + write-free note.
- [ ] Render mark-applied dry-run block; update up dry-run output; update
      `printMigrateUsage` (`--dry-run (up, mark-applied)` + example).
- [ ] Run tests → green. Commit `feat(cli): render migrate dry-run previews`.

## T006 — Exports + docs
- [ ] Export `MarkAppliedDryRun` from `src/index.ts`.
- [ ] README.md / README.ko.md: mark-applied `--dry-run` preview section.
- [ ] CHANGELOG.md `[Unreleased]`: mark-applied/up dry-run.
- [ ] Commit `docs: mark-applied --dry-run (README, CHANGELOG, exports)`.

## T007 — Verify
- [ ] `npm run build`, `npm run lint`, `npm test` all green.
- [ ] Coverage of changed files (migrate.ts, cli.ts) ≥90% (jest --coverage).
- [ ] Commit any coverage top-ups.
