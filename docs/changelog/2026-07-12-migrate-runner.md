# `supalite migrate` — migration runner (apply + track)

- **Date**: 2026-07-12
- **Author**: Claude
- **Status**: Completed
- **Spec**: [specs/003-migrate](../../specs/003-migrate/spec.md) · GitHub issue #7

## Summary

Adds `supalite migrate up|status|new|mark-applied` (and the programmatic API
`migrateUp` / `migrateStatus` / `migrateMarkApplied` / `migrateNew`), closing the
`db pull → migrate → gen types` toolchain so a Cloud SQL schema can be
version-controlled without an external migration tool.

## Details

- **Format**: dbmate-compatible `-- migrate:up` / `-- migrate:down` sections in
  `<YYYYMMDDHHMMSS>_<name>.sql`; version = the leading numeric timestamp. A
  `db pull --format dbmate` baseline (#8) is a drop-in input.
- **Tracking**: `public.schema_migrations(version, applied_at)` auto-created;
  `--migrations-table` to relocate; inserts write only `version` (dbmate table
  compatible).
- **Payment-DB safety**:
  - Advisory lock `pg_advisory_lock(hashtext('supalite:migrate'))` around the
    whole `up` run (no concurrent double-apply); applied set re-read under lock.
  - Atomic recording: each migration's DDL + its `schema_migrations` row commit
    in one transaction; a failure rolls back, is not recorded, and stops the run
    naming the file.
  - `-- migrate:up transaction:false` escape for `CREATE INDEX CONCURRENTLY` and
    similar (single-statement, version recorded right after success).
- **Adoption**: `mark-applied --all` / `mark-applied <version>` records versions
  without running SQL, for existing databases.
- `--db-url` → `DB_CONNECTION` → `DATABASE_URL`. `migrate new` needs no DB.
- Forward-only in v1 (`migrate down` prints an unsupported message).

## Tests

- Parser units (up/down split, `transaction:false`, missing-up, filename).
- Integration: apply+record+idempotent, dry-run, atomic failure (rollback + not
  recorded + stop), `transaction:false` (CREATE INDEX CONCURRENTLY), mark-applied
  (`--all` / `<version>`), and a `db pull --format dbmate` baseline applied via
  `migrate up` (SC-006, closes #8 SC-004).
- CLI (spawn): help, missing-db-url, `down` unsupported, unknown flag, `new`
  (no DB), `up --dry-run` + `status` end-to-end.
