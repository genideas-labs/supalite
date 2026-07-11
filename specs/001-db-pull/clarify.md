# Clarifications: `supalite db pull` (001)

All questions were resolved during design review (2026-07-12) with the
feature requester (oq-payment team) — interactively in session and on
[issue #4](https://github.com/genideas-labs/supalite/issues/4). Recorded
here instead of re-asking (one-shot run requested). Trade-off analysis for
each decision lives in [tradeoffs.md](tradeoffs.md).

## Q1. Are grants / RLS policies part of v1 baseline output?

**Answer: No — excluded from v1**, to be offered later behind
`--include-grants` / `--include-policies` options.
Rationale: after moving to Cloud SQL there is no PostgREST so RLS
dependence is low, and role names differ per environment making grant
dumps non-portable.
Confirmed: [issue comment](https://github.com/genideas-labs/supalite/issues/4#issuecomment-4947495334), requester 👍.

## Q2. Flag defaults: opt-in (as drafted in the issue) or opt-out?

**Answer: Opt-out — both behaviors default ON.**
- Extension-object exclusion ON by default; `--include-extension-objects`
  to disable.
- Idempotent DDL ON by default; `--no-if-not-exists` for plain DDL.
Rationale: requester's production data shows 34/87 functions are
extension-owned (filter is effectively always needed), and "safe to
accidentally re-apply to prod" was a stated issue requirement.
Confirmed: [issue comment](https://github.com/genideas-labs/supalite/issues/4#issuecomment-4947560393) + requester [confirmation](https://github.com/genideas-labs/supalite/issues/4#issuecomment-4947586939).

## Q3. Implementation strategy: native module, shared introspection layer, or pg-schema-sync wrapper?

**Answer: Self-contained native module (`src/db-pull.ts`) that delegates
DDL rendering to server-side deparse functions** (`pg_get_constraintdef`,
`pg_get_indexdef`, `pg_get_functiondef`, `pg_get_triggerdef`,
`pg_get_viewdef`); `src/gen-types.ts` is not modified. The README
roadmap's older "pg-schema-sync wrapper" idea is superseded by issue #4.

## Q4. Constraint idempotency (no `IF NOT EXISTS` exists for `ADD CONSTRAINT`)

**Answer: Full idempotency — every `ALTER TABLE ... ADD CONSTRAINT` is
wrapped in a `DO $$` guard** checking `pg_constraint` by `conname` +
`conrelid`. Constraints are inside the idempotency guarantee, not an
exception. (Requester explicitly preferred the guard over documenting a
gap.)
Confirmed: [resolution comment](https://github.com/genideas-labs/supalite/issues/4#issuecomment-4947605966).

## Q5. Sequence/identity coverage (requester production data: 50 identity of both kinds, 9 serial, 59 standalone sequences)

**Answer: All three paths are mandatory v1 coverage.** Identity rendered
inline (implicit sequences never dumped), serial-backing sequences created
before tables with `OWNED BY` restored after tables, standalone sequences
dumped with options.

## Q6. FK placement

**Answer: All FKs emitted after every table** (separate section) —
inline FKs break on circular references. Confirmed by requester.

## Q7. v1 mode scope

**Answer: `--mode baseline` only; `diff` reserved** with a clear error
(issue text itself marks diff as "추후"/later).

## Q8. Schema creation

**Answer: `CREATE SCHEMA IF NOT EXISTS` for non-public selected schemas is
included** (kept in plain mode too) so the baseline stands up on an empty
database — discovered during design self-review, spec amended.
