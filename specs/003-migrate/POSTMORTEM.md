# Postmortem: `supalite migrate` (003)

**Feature**: `supalite migrate <up|status|new|mark-applied|down>` — migration
runner (apply + track) with payment-DB safety features.
**Issue**: #7 · **Branch**: `003-migrate` · **Date**: 2026-07-12
**Status**: Implemented, gate green, awaiting merge.

## 산출물 (Deliverables)

- CLI `supalite migrate up|status|new|mark-applied` (+ `down` unsupported message).
- Programmatic API `migrateUp` / `migrateStatus` / `migrateMarkApplied` / `migrateNew`.
- `src/migrate.ts`: dbmate parser + `pg`-backed runner.
- Closes the `db pull → migrate → gen types` toolchain (with #8's `--format dbmate`).

## 파일 구조 (Files)

| File | Change |
|------|--------|
| `src/migrate.ts` | new module (parser, runner, 4 commands) — +~300 lines |
| `src/cli.ts` | `migrate` dispatch + `parseMigrateArgs`/`printMigrateUsage`/`runMigrate` |
| `src/index.ts` | export the API + types |
| `src/__tests__/migrate.test.ts` | parser units + integration (incl. SC-006 dbmate round-trip) + error contracts |
| `src/__tests__/migrate-cli.test.ts` | CLI spawn tests |
| `README.md`, `README.ko.md` | `supalite migrate` section |
| `docs/changelog/2026-07-12-migrate-runner.md` | changelog |

## 테스트 결과 (Test results)

- Full suite (serial): **237 passed / 237** (31 suites).
- Coverage: `src/migrate.ts` **98.85% stmts** (≥90% bar); global 92.21%.
- Lint 0 errors; `tsc` clean.
- Note: one CLI test flaked once under heavy *parallel* load (many ts-node
  subprocesses + DB contention); passes deterministically in isolation and with
  `--runInBand`. Not a code defect.

## Auto-review 결과

- Pre-implementation (spec/plan/tasks): consistency clean; added SC-006
  (dbmate baseline → `migrate up`) so #8's deferred SC-004 round-trip is closed.
- Post-implementation (code): **0 CRITICAL/HIGH/MEDIUM**. LOW findings
  (untested defensive error branches) fixed by adding error-contract tests
  (`parseTableRef`, empty-name, unknown/repeat `mark-applied`), lifting
  `migrate.ts` 95.42% → 98.85%. Remaining uncovered: a non-ENOENT `readdir`
  rethrow and one guard branch (would need fs mocking; accepted).

## 핵심 설계 결정 (Key decisions)

- **Single `src/migrate.ts`** with pure, unit-testable helpers + a dedicated
  `pg.Client` runner (mirrors `db-pull.ts`).
- **Advisory lock** `pg_advisory_lock(hashtext('supalite:migrate'))` for the
  whole `up`, released in `finally` (and by `client.end()` as a backstop);
  applied set re-read under the lock.
- **Atomic recording**: `BEGIN; <up>; INSERT(version); COMMIT;` — rollback on
  failure (rollback errors never mask the original), version not recorded, run
  stops naming the file.
- **`transaction:false`** single-statement escape for `CREATE INDEX CONCURRENTLY`.
- **Version = leading numeric prefix** (dbmate); ordered by `BigInt`.
- **Forward-only v1**: `down` prints an unsupported message.
- **dbmate-table compatible**: insert writes only `version`.

## 후속 작업 (Follow-ups)

- `migrate down` / `--down-drops` (reverse DDL) — deferred.
- Multi-statement `transaction:false` files — v1 expects a single statement.
- `db pull --mode diff` (separate) would let `migrate` consume incremental diffs.
