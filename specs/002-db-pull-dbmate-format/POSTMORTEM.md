# Postmortem: `db pull --format dbmate` (002)

**Feature**: `supalite db pull --format <plain|dbmate>` — emit the baseline
wrapped in `-- migrate:up` / `-- migrate:down` markers.
**Issue**: #8 · **Branch**: `002-db-pull-dbmate-format` · **Date**: 2026-07-12
**Status**: Implemented, gate green, awaiting merge.

## 산출물 (Deliverables)

- `db pull --format dbmate` CLI flag (default `plain`, backward compatible).
- `formatBaseline(baseline, format)` pure helper in `src/db-pull.ts`.
- `DbPullOptions.format?: 'plain' | 'dbmate'` (programmatic API).
- Docs: README.md / README.ko.md db pull section + changelog.

## 파일 구조 (Files changed)

| File | Change |
|------|--------|
| `src/db-pull.ts` | `+ format` option, `+ formatBaseline()`, wrap both return sites (+15/-2) |
| `src/cli.ts` | `--format` parse+validate, pass-through, usage (+16) |
| `src/__tests__/db-pull.test.ts` | `formatBaseline` unit tests + SC-003 body-equality |
| `src/__tests__/db-pull-cli.test.ts` | 4 CLI cases (dbmate/plain/invalid/help) |
| `README.md`, `README.ko.md` | `--format dbmate` documentation |
| `docs/changelog/2026-07-12-db-pull-dbmate-format.md` | changelog |

## 테스트 결과 (Test results)

- Full suite: **200 passed / 200** (29 suites).
- Coverage: `db-pull.ts` **92.34% stmts** (≥90% repo bar; up from 92.1%).
  `formatBaseline` both branches unit-covered; plain path proven unchanged by
  the unmodified 22 db-pull + 10 db-pull-cli tests.
- Lint: **0 errors** (182 pre-existing `no-explicit-any` warnings, none new).
- Build: `tsc` clean.

## Auto-review 결과

- Pre-implementation (spec/plan/tasks): consistency check clean; one
  cross-feature note — SC-004's full parser round-trip is validated when #7
  (003) lands; 002 validates the format structurally.
- Post-implementation (code): **0 CRITICAL/HIGH/MEDIUM**. 1 LOW (zero-object +
  dbmate not directly integration-tested) accepted — `formatBaseline`'s dbmate
  branch is unit-covered and the early-return call site is line-covered by the
  existing empty-selection test; no real gap.

## 핵심 설계 결정 (Key decisions)

- **Pure `formatBaseline` helper** → fast deterministic unit coverage,
  independent of the DB-backed generator; exported from `db-pull.ts` for tests
  but not re-exported from `index.ts` (public API stays `generateBaselineSql` +
  `DbPullOptions`).
- **`plain` = identity function** → the default path is provably byte-for-byte
  unchanged (backward compatibility is a theorem, not a test artifact).
- **Wrap at both return sites** (zero-object + normal), reading
  `options.format ?? 'plain'`.
- **Strict invalid-format rejection** (`Unknown format for db pull: <v>`,
  exit 1) — consistent with db pull's unknown-option handling; catches typos.
- **No `transaction:false`** — db pull emits only transaction-safe DDL; README
  records the future caveat.

## 후속 작업 (Follow-ups)

- **#7 / 003-migrate**: the emitted markers are exactly what `supalite migrate`
  will parse; add a round-trip test there feeding `--format dbmate` output
  through `parseMigrationSql` (closes SC-004 end-to-end).
- Optional future: `--down-drops` to generate reverse DDL for the down section
  (v1 down is a no-op comment).
