# Research: `supalite db pull` (001)

All Technical Context unknowns resolved. Decision records below; user-facing
decision trade-offs live in [tradeoffs.md](tradeoffs.md).

## R1. DDL rendering source

- **Decision**: Delegate to Postgres server-side deparse functions
  (`pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_functiondef`,
  `pg_get_triggerdef`, `pg_get_viewdef`); hand-assemble only
  `CREATE TABLE` / `CREATE TYPE` / `CREATE SEQUENCE` (no deparse exists).
- **Rationale**: server deparse is battle-tested and version-matched to the
  source DB; avoids reimplementing a DDL printer. Matches the repo's existing
  `dumpFunctionsSql` pattern (src/gen-types.ts:2143).
- **Alternatives**: full client-side rendering (drift risk, large surface);
  pg_dump parsing (external binary, rejected in issue #4).

## R2. Function-body ordering hazard

- **Decision**: Emit `SET check_function_bodies = off;` in the header.
- **Rationale**: SQL-language function bodies are validated at CREATE time by
  default; bodies may reference views/tables emitted later. Same technique
  pg_dump uses. plpgsql bodies are unaffected either way.
- **Alternatives**: topo-sorting functions against tables/views (complex,
  still breaks on mutual references).

## R3. Identity vs serial vs standalone sequences

- **Decision**: three distinct paths —
  (a) identity: rendered inline on the column; backing sequence detected via
  `pg_depend deptype='i'` and **excluded** from the sequences section, with
  non-default options rendered as `(START WITH ... INCREMENT BY ...)`;
  (b) serial-style: sequence emitted **before** tables (so `DEFAULT
  nextval(...)` resolves), `ALTER SEQUENCE ... OWNED BY` restored **after**
  tables via `pg_depend deptype='a'`;
  (c) standalone: emitted with full options, always explicit.
- **Rationale**: requester production data has all three (50 identity of both
  kinds / 9 serial / 59 standalone) — issue #4 confirmation.
- **Alternatives**: `pg_get_serial_sequence()` name-based lookup (string
  parsing of qualified names; the `pg_depend` lateral join is cleaner).

## R4. Constraint idempotency

- **Decision**: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE
  conname = '<name>' AND conrelid = '<schema>.<table>'::regclass) THEN ALTER
  TABLE ... ADD CONSTRAINT ...; END IF; END $$;`
- **Rationale**: `ADD CONSTRAINT` has no `IF NOT EXISTS`; explicit existence
  check is deterministic (no reliance on error classes) and was the
  requester's preferred option (issue #4 resolution comment).
- **Alternatives**: `EXCEPTION WHEN duplicate_object` (error-class reliance);
  documented gap (rejected — breaks "safe to re-apply to prod").

## R5. Index / trigger idempotency mechanics

- **Decision**: indexes — insert `IF NOT EXISTS` textually after
  `CREATE [UNIQUE] INDEX ` (two anchored string replaces on
  `pg_get_indexdef` output); triggers — rewrite `CREATE TRIGGER ` →
  `CREATE OR REPLACE TRIGGER ` (PG14+ replay target, documented in README).
  Constraint-backing indexes excluded via `pg_constraint.conindid`.
- **Rationale**: deparse output is stable and anchored; PG14 floor accepted
  by requester (Cloud SQL targets are 14+).

## R6. View ordering

- **Decision**: Kahn topological sort over view→view edges from
  `pg_depend` joined through `pg_rewrite` (`ev_class` = dependent view),
  restricted to the selected relkind `v`/`m` set; stable name order for
  ties; leftovers (theoretical cycles) appended last.
- **Rationale**: views may reference other views; `CREATE OR REPLACE VIEW`
  does not defer resolution.

## R7. Identifier & literal safety

- **Decision**: fetch identifiers pre-quoted with `quote_ident()` inside
  catalog queries; use `format('%I.%I', ...)` for `::regclass` string
  literals; escape embedded literals by doubling single quotes; enum labels
  escaped the same way.
- **Rationale**: avoids maintaining a client-side reserved-word list;
  server rules are authoritative.

## R8. Timestamp / filename convention

- **Decision**: default out path `supabase/migrations/<UTC
  YYYYMMDDHHMMSS>_baseline.sql` (`new Date().toISOString()` reformatted);
  directory auto-created with `fs.mkdir recursive`.
- **Rationale**: Supabase CLI migration filename convention — issue #4
  explicitly proposes this default; keeps existing Supabase-tooling
  workflows working.

## R9. Test double-apply semantics

- **Decision**: round-trip test compares regenerated output with comment
  lines stripped (header contains a generation timestamp; footer is
  comments-only), then re-applies the baseline onto the built schema and
  asserts no error.
- **Rationale**: timestamp comment must not break equality; everything
  executable is compared byte-exactly.
