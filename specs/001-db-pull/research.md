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
  `pg_get_indexdef` output); plain triggers — rewrite `CREATE TRIGGER ` →
  `CREATE OR REPLACE TRIGGER ` (PG14+ replay target, documented in README);
  constraint triggers (`tgconstraint <> 0`) — `OR REPLACE` is not supported
  for them on any PG version, so wrap the original
  `CREATE CONSTRAINT TRIGGER` in a `DO $$` existence guard keyed on
  `tgname` + `tgrelid`. Constraint-backing indexes (PK/UNIQUE/EXCLUDE)
  excluded via `pg_constraint.conindid`.
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

## R9. Section order vs function-referencing expressions (strict-review CRITICAL, refined round 2)

- **Decision**: functions are emitted in up to THREE stages classified by
  their *signature* type dependencies (`prorettype` + `proargtypes`,
  arrays resolved via `typelem`, composites via attribute closure):
  type-stage (§6, before tables — signatures reference no relation row
  types), table-stage (§9), view-stage (§14, `RETURNS SETOF <view>`).
  Everything whose *expressions* may call user functions sits after the
  relevant stage: generated columns can call type-stage functions
  (available before `CREATE TABLE`); function-dependent column defaults
  are stripped and re-emitted as `ALTER TABLE ... ALTER COLUMN ... SET
  DEFAULT` after the table stage; constraints/views/triggers/indexes
  follow their prerequisite stages.
- **Rationale**: `SET check_function_bodies = off` defers only function
  *body* validation — signatures, column defaults, CHECK expressions,
  generated columns, and index predicates resolve at DDL time.
- **Residual v1 limitations** (all detected and footer-flagged, never
  silently broken): a generated column calling a table/view-stage function
  (expression fixed at CREATE TABLE); defaults/CHECKs calling view-stage
  functions; views calling view-stage functions (multi-stage
  view↔function interleaving); composites/domains referencing relation
  row types. Signature scan uses
  `COALESCE(proallargtypes, proargtypes::oid[])` so OUT/`RETURNS TABLE`
  columns are classified correctly.
- **Alternatives**: full `pg_depend` statement-level topological
  interleaving (pg_dump approach) — deferred to v2 with `--mode diff`.

## R10. Partition leaves

- **Decision**: exclude `relispartition = true` relations from tables,
  constraints, triggers, and indexes; footer-list the full hierarchy
  (parent `relkind='p'` + leaves).
- **Rationale**: leaves are `relkind='r'` and would otherwise be dumped as
  ordinary tables, silently losing partition bounds.

## R11. Extension scoping and ordering

- **Decision**: emit all non-`plpgsql` extensions in `pg_depend`
  topological order over extension→extension edges (oid as stable
  tie-break), include each extension's target namespace in the schemas
  section, do not pin versions, and suppress the schemas+extensions
  sections entirely when every object section is empty (FR-018).
- **Rationale**: extensions are database-scoped (issue #4 explicitly wants
  `pg_trgm`/`pg_stat_statements` regardless of schema selection); the
  dependency walk (not the oid proxy — round-2 finding) handles
  prerequisite chains (e.g. `cube` → `earthdistance`) deterministically;
  version pinning breaks replay on servers with different packaged
  versions (pg_dump default behavior matches).

## R12. Table/view variants not reproduced in v1

- **Decision**: reproduce `UNLOGGED` inline; footer-list (never silently
  drop): typed tables (`reloftype`), inheritance children (`pg_inherits`
  non-partition), non-default access method / tablespace / storage
  parameters / replica identity. Views: render `reloptions`
  (`security_barrier`, `check_option`); matviews: `WITH NO DATA` when
  `NOT relispopulated`; matview AM/tablespace footer-listed.
- **Rationale**: bounded v1 with visible, auditable gaps (spec FR-016).

## R13. Domains are supported (round 2)

- **Decision**: `CREATE DOMAIN` is rendered (base type, `DEFAULT`,
  `NOT NULL`, CHECK constraints via `pg_get_constraintdef`) inside the
  unified types topo-sort, removing the failure class where a
  domain-typed column breaks `CREATE TABLE` on an empty target.
  Domain defaults/CHECKs that call user functions are split out: the
  domain shell is created in §5, the function-dependent default via
  `ALTER DOMAIN ... SET DEFAULT` in §10, and function-dependent CHECKs
  via guarded `ALTER DOMAIN ... ADD CONSTRAINT` in §11 (round-3 finding —
  domain expressions resolve at CREATE DOMAIN time).
- **Rationale**: supporting domains is strictly cheaper than
  dependency-closure omission of their dependents.

## R14. Dependents of excluded objects (round 2)

- **Decision**: DDL that would necessarily fail on an empty target is
  never emitted. The generator computes a transitive `pg_depend` closure
  rooted at every excluded object (partition parents/leaves, aggregates,
  extension-owned objects) and footer-diverts all affected supported DDL:
  views, FKs, constraints, deferred defaults, relation-referencing
  composites/domains, and functions whose signatures reference excluded
  relations. External-schema FKs remain emitted (the referenced
  schema+table are a documented pre-existing prerequisite, spec
  Scenario 2).

## R15. Dollar-quote tag collision (round 2)

- **Decision**: generated `DO` blocks pick the first of `$supalite$`,
  `$supalite1$`, ... absent from the wrapped content instead of a fixed
  `$$`, because dollar-quoting terminates at the tag even inside inner
  single-quoted text.

## R16. Package surface

- **Decision**: re-export `generateBaselineSql` / `DbPullOptions` from
  `src/index.ts` so `import { generateBaselineSql } from 'supalite'` works
  as the contract promises (FR-020).

## R17. Test double-apply semantics

- **Decision**: round-trip test compares regenerated output with comment
  lines stripped (header contains a generation timestamp; footer is
  comments-only), then re-applies the baseline onto the built schema and
  asserts no error.
- **Rationale**: timestamp comment must not break equality; everything
  executable is compared byte-exactly.
