# Postmortem: `migrate mark-applied --dry-run` (004)

**Status**: Implemented ✅  **Issue**: [#14](https://github.com/genideas-labs/supalite/issues/14)  **Date**: 2026-07-12

## 산출물

`supalite migrate mark-applied --dry-run` — a **write-free** preview of a
production adoption: it probes the tracking table read-only and prints the exact
versions it would record and the exact SQL it would execute, writing nothing
(not even `schema_migrations`). `up --dry-run` was made write-free too (it
previously created the tracking table) and now prints each pending migration's
file path.

## 파일 구조

| File | Change |
|------|--------|
| `src/migrate.ts` | Shared SQL builders (`createSchemaSql`, `createTableSql`, `markAppliedInsertSqlWith` → executor `$1` / preview literal); read-only `tableExists` (`to_regclass`) + `appliedVersionsIfExists`; `migrateMarkApplied` write-free `dryRun` branch; `migrateUp` write-free dry-run with `pendingPaths`; new `MarkAppliedDryRun` type. |
| `src/cli.ts` | mark-applied `[dry-run]` preview rendering; up dry-run path + write-free note; usage. |
| `src/index.ts` | Export `MarkAppliedDryRun`. |
| `src/__tests__/migrate.test.ts` | +4 integration tests (table-absent, subset+fidelity, single-version, up write-free). |
| `src/__tests__/migrate-cli.test.ts` | +3 CLI tests (preview block, arg-parity, up path/note). |
| `README.md`, `README.ko.md`, `CHANGELOG.md` | dry-run docs + `[Unreleased]`. |

## 테스트 결과

- Full suite: **263 passed / 32 suites** (live Postgres, `--runInBand`).
- Coverage: `migrate.ts` **99.01% stmts / 98.92% lines**; global **93.55%**.
  (`cli.ts` runs in a spawned subprocess, so it isn't instrumented by jest — it
  is covered functionally by the spawn tests, same as 001–003.)
- `lint` clean (pre-existing test `any` warnings only); `build` clean.

## 핵심 설계 결정

1. **Fidelity by shared code path** (clarify Q1): preview SQL is generated from
   the same builder the executor uses. The insert template is parameterized by
   the value expression (`$1` for the executor, a quoted literal for the
   preview), so structure/identifiers/`ON CONFLICT` can never drift — and there
   is no fragile string substitution.
2. **Read-only probe** (`to_regclass`): dry-run determines table existence
   without any DDL; `appliedVersionsIfExists` returns ∅ when the table is
   absent, so nothing is written and the `SELECT` that would error is skipped.
3. **`up --dry-run` write-free** (clarify Q2): dropped `ensureMigrationsTable`
   from the dry-run branch — this **fixed 003 SC-005**, which the previous
   implementation silently violated by creating the tracking table during a
   dry-run.
4. **Argument parity**: `--dry-run` does not relax validation; `--all`/version
   and unknown-version errors fire exactly as in the real path.

## 후속 작업

- Ship in the next release (`[Unreleased]` → version bump + tag; user runs
  `npm publish`).
- Optional future: render a pending migration's full up-SQL in `up --dry-run`
  (currently file path only — deliberate, given 6k-line baselines).
