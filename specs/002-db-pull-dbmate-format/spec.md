# Feature Specification: `supalite db pull --format dbmate` — up/down marker output

**Feature Branch**: `002-db-pull-dbmate-format`
**Created**: 2026-07-12
**Status**: Implemented
**Input**: [GitHub issue #8](https://github.com/genideas-labs/supalite/issues/8) (converges with the migration format read by `supalite migrate` #7)

## User Scenarios & Testing

### Primary User Story

As a developer who ran `supalite db pull` to bring a Cloud SQL schema under
version control, I want the baseline emitted as a ready-to-run migration so I
do not have to hand-edit it. Today the baseline is already 100%
dbmate-compatible in *content*, but dbmate (and the upcoming `supalite migrate`
#7) require `-- migrate:up` / `-- migrate:down` marker lines that db pull does
not emit — so every pulled file needs a manual 2-line wrap. I run
`supalite db pull --db-url <conn> --format dbmate` and get a file that
`dbmate up` (and `supalite migrate up`) applies with zero edits.

Measured driving case (`oq-payment`): the 6186-line baseline, wrapped only
with leading `-- migrate:up` and trailing `-- migrate:down`, applied to an
empty Postgres via dbmate 2.34.1 with **0 parse/exec errors** (dollar-quoted
functions, idempotent `DO` guards, `CREATE CONSTRAINT TRIGGER` all fine). The
**only** manual step was the marker wrap — this feature removes it.

### Acceptance Scenarios

1. **Given** a reachable Postgres, **When** the user runs
   `supalite db pull --db-url <conn> --format dbmate`, **Then** the output
   begins with a `-- migrate:up` marker line and ends with a `-- migrate:down`
   section whose body is `-- baseline: irreversible (no-op)`, with the existing
   baseline content unchanged in between.
2. **Given** `--format plain` OR no `--format` flag, **When** db pull runs,
   **Then** the output is byte-for-byte identical to current (v0.10.0)
   behavior — no markers (backward compatible default).
3. **Given** `--format dbmate` output, **When** the region between the
   `-- migrate:up` line and the `-- migrate:down` line is extracted, **Then**
   it equals the `--format plain` output for the same database and flags
   (the wrap adds only markers; it never alters the baseline body).
4. **Given** an invalid `--format` value (e.g. `--format xml`), **When** db
   pull runs, **Then** it prints `Unknown format for db pull: xml` + usage and
   exits 1 (same strictness as unknown options).
5. **Given** `--format dbmate --out -`, **When** db pull runs, **Then** the
   wrapped SQL is written to stdout and no file is created.
6. **Given** `--format dbmate` combined with `--no-if-not-exists`,
   `--include-extension-objects`, or multiple `--schema` values, **Then** the
   markers wrap whatever body those flags produce (the wrap is
   flag-orthogonal).

### Edge Cases

- Zero-object selection (header-only baseline, FR-018 of 001) → still wrapped:
  `-- migrate:up`, the header-only body, then the `-- migrate:down` section.
- Output MUST remain LF-normalized with a single trailing newline, markers
  included (preserves 001 FR-015).
- The baseline body already opens with a `-- supalite db pull baseline …`
  comment; the `-- migrate:up` marker is prepended **above** it.

## Requirements

### Functional Requirements

- **FR-001**: `supalite db pull` MUST accept `--format <plain|dbmate>` with
  default `plain`. Any other value MUST print `Unknown format for db pull:
  <value>` + usage and exit 1. Existing `db pull` flags and `gen types`
  behavior MUST be unchanged.
- **FR-002**: `--format plain` (and the no-flag default) MUST produce output
  byte-for-byte identical to the current baseline (backward compatibility —
  existing db pull tests continue to pass unchanged).
- **FR-003**: `--format dbmate` MUST wrap the baseline as:
  ```
  -- migrate:up
  <existing baseline body, unchanged>

  -- migrate:down
  -- baseline: irreversible (no-op)
  ```
  i.e. the literal line `-- migrate:up` followed by a newline, then the
  unchanged baseline body, then one blank line, the line `-- migrate:down`,
  and the line `-- baseline: irreversible (no-op)`. The file ends with a
  single trailing newline.
- **FR-004**: The wrap MUST be additive only — the bytes between the
  `-- migrate:up` line and the trailing `-- migrate:down` section MUST equal
  the `plain` body for the same inputs (no reformatting, no re-ordering).
- **FR-005**: Output MUST be LF-normalized (no CR) and end with exactly one
  trailing newline, markers included.
- **FR-006**: `printDbPullUsage()` MUST document `--format <plain|dbmate>`
  (default `plain`) and its effect.
- **FR-007**: The programmatic API MUST expose the format: `DbPullOptions`
  gains an optional `format?: 'plain' | 'dbmate'` (default `plain`), and
  `generateBaselineSql` honors it. The option is optional, so existing
  callers are unaffected.
- **FR-008**: v1 MUST NOT emit `-- migrate:up transaction:false`: db pull
  emits only transaction-safe DDL (all `IF NOT EXISTS`, no
  `CREATE INDEX CONCURRENTLY`), so the default transactional `-- migrate:up`
  is correct and atomic. A footer/README note MUST record that if db pull ever
  emits non-transactional DDL, that file must switch to `transaction:false`.

### Key Entities

- **Baseline body**: the existing db pull output (unchanged by this feature).
- **Marker wrap**: the `-- migrate:up` prefix and `-- migrate:down` +
  `-- baseline: irreversible (no-op)` suffix added only under `--format dbmate`.

## Success Criteria

- **SC-001** (backward compat): For any database/flags, `--format plain` and
  the no-flag default produce output identical to v0.10.0; all existing
  `db pull` / `db pull CLI` tests pass without modification.
- **SC-002** (marker presence): `--format dbmate` output's first line is
  `-- migrate:up` and it contains a `-- migrate:down` line followed by
  `-- baseline: irreversible (no-op)`.
- **SC-003** (body equality): Extracting the region strictly between the
  leading `-- migrate:up\n` and the trailing `\n-- migrate:down\n…` yields
  exactly the `--format plain` output for the same inputs.
- **SC-004** (dbmate drop-in): The `--format dbmate` file is accepted by the
  `-- migrate:up`/`-- migrate:down` parser shared with `supalite migrate` #7
  (marker lines detected, single up section, single down section).

## Assumptions

- Tests run against a live Postgres reachable via `DB_CONNECTION` (repo
  convention; default `postgresql://testuser:testpassword@localhost:5432/testdb`).
- db pull's current output is transaction-safe (verified in 001); no
  `transaction:false` handling is needed in v1.
- No new runtime dependencies (pure string wrapping of existing output).
- **SC-004 scope**: 002 validates the emitted format *structurally* (first line
  `-- migrate:up`, exactly one `-- migrate:down` section, correct layout). The
  full parser round-trip against `supalite migrate`'s `parseMigrationSql`
  (#7 / 003) is validated when 003 lands — a documented cross-feature
  dependency, not a 002 blocker.

## Out of Scope (v1)

- `--down-drops` (generating reverse/DROP DDL for the down section) — the down
  section is a no-op comment in v1.
- Emitting `-- migrate:up transaction:false` (not needed; see FR-008).
- Changing the default output filename (already dbmate-compatible:
  `<UTC YYYYMMDDHHMMSS>_baseline.sql`).

## Dependencies & References

- GitHub issue #8 (proposal + `oq-payment` measurement).
- Converges with `specs/003-migrate` (#7): the emitted markers are exactly
  what `supalite migrate` reads, so one option makes the output a drop-in for
  **both** dbmate and `supalite migrate`.
- Builds on `specs/001-db-pull` (`generateBaselineSql`, CLI `runDbPull` /
  `parseDbPullArgs` / `printDbPullUsage`).
