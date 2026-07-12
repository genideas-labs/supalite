# Clarifications: `supalite migrate` (003)

Session 2026-07-12 — decisions confirmed to the recommended option.

| # | Question | Decision |
|---|----------|----------|
| 1 | `down` in v1? | **Not implemented** — `migrate down` prints a clear "not supported in this version (forward-only)" message and exits 1. Rollback on a payment DB is dangerous and rare; issue #7 lists `down` as optional. |
| 2 | `transaction:false` execution | Execute the section's SQL **without a wrapping transaction**, as a **single statement**; record the version immediately after success (non-atomic — documented tradeoff). Such files SHOULD be a single idempotent `IF NOT EXISTS` statement. |
| 3 | Version identifier | The **leading numeric timestamp** of the filename (dbmate semantics), e.g. `20260712093000`. Enables adopting an existing dbmate-managed database. |
| 4 | Advisory lock key | Fixed & deterministic: `pg_advisory_lock(hashtext('supalite:migrate'))` (no magic-number literal). |
| 5 | DB URL resolution | `--db-url` → `DB_CONNECTION` → `DATABASE_URL`. |
| 6 | Tracking table | `public.schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`, auto-created (schema too); overridable via `--migrations-table <schema.table\|table>`. Insert writes only `version`, so a version-only dbmate table is compatible. |
| 7 | Programmatic API + `new` | Export `migrateUp` / `migrateStatus` / `migrateMarkApplied` / `migrateNew`. `migrate new` creates a file and needs **no DB connection**. |

v1 subcommands: `up` / `status` / `new` / `mark-applied` (+ `down` unsupported message). Safety features: advisory lock, atomic version recording, `transaction:false` escape.
