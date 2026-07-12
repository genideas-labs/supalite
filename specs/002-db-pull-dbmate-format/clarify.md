# Clarifications: `db pull --format dbmate` (002)

Session 2026-07-12 — 3 questions, all resolved to the recommended option.

## Q1 — Exact `--format dbmate` marker layout

**Decision (A):**
```
-- migrate:up
<existing baseline body, unchanged>

-- migrate:down
-- baseline: irreversible (no-op)
```
`-- migrate:up` is the first line (prepended above the baseline's own
`-- supalite db pull baseline …` header comment); the baseline body follows
unchanged; exactly one blank line precedes `-- migrate:down`; the down body is
`-- baseline: irreversible (no-op)`; the file ends with a single trailing
newline. (No blank line is inserted between `-- migrate:up` and the body.)

**Rejected (B):** extra blank line after `-- migrate:up` — diverges from the
issue example for no benefit.

## Q2 — Invalid `--format` value

**Decision (A):** print `Unknown format for db pull: <value>` + usage and exit
1 — same strictness as db pull's existing unknown-option rejection; catches
typos immediately.

**Rejected (B):** silent fallback to `plain` — a typo would silently produce
the wrong (unmarked) output.

## Q3 — Programmatic API shape

**Decision (A):** add optional `format?: 'plain' | 'dbmate'` (default `plain`)
to `DbPullOptions`; `generateBaselineSql` honors it. Single entry point,
consistent with the other db pull flags, backward compatible for existing
callers.

**Rejected (B):** a separate exported `wrapDbmate()` function — two API
surfaces; the CLI would have to compose them.
