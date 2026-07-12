# Implementation Plan: `db pull --format dbmate` (002)

**Input**: [spec.md](spec.md), [clarify.md](clarify.md), [contracts/cli-contract.md](contracts/cli-contract.md)
**Approach**: live-Postgres TDD (repo convention — tests hit `DB_CONNECTION`) + a pure unit test for the wrap; commit after every task.

## Summary

Add a `--format <plain|dbmate>` option to `supalite db pull`. `plain` (default)
is byte-for-byte the current output. `dbmate` wraps the existing baseline in
`-- migrate:up` / `-- migrate:down` marker lines, making the file a drop-in for
dbmate and the upcoming `supalite migrate` (#7). The wrap is a pure string
transform applied to the finished baseline; no query logic changes.

## Design Decisions (research)

- **Pure wrap helper.** Factor `formatBaseline(baseline, format)` — a pure
  function with no DB dependency — so the wrap has fast, deterministic unit
  coverage independent of the (DB-backed) `generateBaselineSql`. It is exported
  from `src/db-pull.ts` for testing but NOT re-exported from `src/index.ts`
  (internal helper; public API stays `generateBaselineSql` + `DbPullOptions`).
- **Wrap at both return sites.** `generateBaselineSql` returns from two places
  (zero-object header-only at `db-pull.ts:1722`, and the normal path at
  `db-pull.ts:~1782`). Both already end with `normalizeLf(...)` and a single
  trailing `\n`. Wrap each return value through `formatBaseline(...)`. Because
  `formatBaseline(x, 'plain') === x`, the default path is provably unchanged
  (backward compatibility, SC-001).
- **Exact layout** (clarify Q1-A): input ends with `\n`, so
  `` `-- migrate:up\n${baseline}\n-- migrate:down\n-- baseline: irreversible (no-op)\n` `` yields
  `-- migrate:up`, the unchanged body, exactly one blank line, `-- migrate:down`,
  `-- baseline: irreversible (no-op)`, single trailing newline.
- **Strict validation** (clarify Q2-A): invalid `--format` value → `Unknown
  format for db pull: <value>` + usage + exit 1, mirroring the existing
  unknown-option rejection in `parseDbPullArgs`.
- **No `transaction:false`** (FR-008): db pull emits only transaction-safe DDL,
  so plain `-- migrate:up` (dbmate wraps in a transaction) is correct; document
  the future caveat in README.

## File Structure

- **Modify** `src/db-pull.ts`
  - `DbPullOptions`: add `format?: 'plain' | 'dbmate'`.
  - Add exported pure helper `formatBaseline(baseline: string, format?: 'plain' | 'dbmate'): string`.
  - `generateBaselineSql`: read `options.format ?? 'plain'`; wrap both returns via `formatBaseline`.
- **Modify** `src/cli.ts`
  - `parseDbPullArgs`: add `--format` (validated to `plain|dbmate`), store on result (default `'plain'`).
  - `runDbPull`: pass `format` into `generateBaselineSql`.
  - `printDbPullUsage`: document `--format <plain|dbmate>`.
- **Modify** `README.md`, `README.ko.md`: document `--format dbmate` under the `db pull` section + the transaction-safety note.
- **Create** `docs/changelog/2026-07-12-db-pull-dbmate-format.md`.
- **Test** `src/__tests__/db-pull.test.ts` (add `formatBaseline` unit tests + a plain-vs-dbmate body-equality integration test) and `src/__tests__/db-pull-cli.test.ts` (add `--format` CLI cases).

## Interfaces

```ts
// src/db-pull.ts
export type DbPullOptions = {
  dbUrl: string;
  schemas?: string[];
  includeExtensionObjects?: boolean;
  ifNotExists?: boolean;
  format?: 'plain' | 'dbmate'; // NEW, default 'plain'
};

export const formatBaseline = (baseline: string, format?: 'plain' | 'dbmate'): string;
```

## Test Strategy

- **Unit (no DB)**: `formatBaseline` — plain returns input unchanged; dbmate
  prepends `-- migrate:up`, appends the down section, preserves the body
  exactly, single trailing newline.
- **Integration (DB)**: `generateBaselineSql({format:'dbmate'})` starts with
  `-- migrate:up`, contains `-- migrate:down`, and the region between the
  markers equals `generateBaselineSql({format:'plain'})` for the same DB
  (SC-003).
- **CLI (spawn)**: `db pull --format dbmate --out -` stdout starts with
  `-- migrate:up`; default/`--format plain` stdout still starts with
  `-- supalite db pull baseline`; `--format xml` exits 1 with the exact
  message; `--help` documents `--format`.
- **Regression**: full `npm test`, `npm run lint`, `npm run build`,
  coverage ≥90%.

## Rollout / Risk

- Backward compatible: the option is optional and defaults to current behavior;
  existing tests are unmodified and must stay green (the primary safety net).
- No new dependencies, no query changes → minimal blast radius.
