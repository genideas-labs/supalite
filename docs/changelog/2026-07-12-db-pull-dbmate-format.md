# `db pull --format dbmate` — up/down marker output

- **Date**: 2026-07-12
- **Author**: Claude
- **Status**: Completed
- **Spec**: [specs/002-db-pull-dbmate-format](../../specs/002-db-pull-dbmate-format/spec.md) · GitHub issue #8

## Summary

`supalite db pull` gains `--format <plain|dbmate>` (default `plain`). With
`--format dbmate`, the baseline is wrapped in dbmate-compatible markers:

```
-- migrate:up
<existing baseline body, unchanged>

-- migrate:down
-- baseline: irreversible (no-op)
```

The baseline content was already 100% dbmate-compatible; the only manual step
was wrapping these two markers. This option removes it, making the output a
drop-in for **both** dbmate (`dbmate up`) and the upcoming `supalite migrate`
(#7), which read the same `-- migrate:up` / `-- migrate:down` format.

## Details

- Default `--format plain` is byte-for-byte identical to prior output
  (backward compatible; existing tests unchanged).
- Invalid `--format` values exit 1 with `Unknown format for db pull: <value>`.
- Programmatic API: `generateBaselineSql({ ..., format: 'dbmate' })`
  (`DbPullOptions.format`, optional, default `plain`).
- db pull emits only transaction-safe DDL (all `IF NOT EXISTS`), so the
  default transactional `-- migrate:up` is correct and atomic; a future
  non-transactional DDL would require `-- migrate:up transaction:false`.

## Tests

- `formatBaseline` unit tests (plain no-op; dbmate wrap layout + body equality).
- `generateBaselineSql` integration: dbmate body equals plain body (SC-003).
- CLI: dbmate stdout markers, plain/default unchanged, invalid-format exit 1,
  `--help` documents `--format`.
