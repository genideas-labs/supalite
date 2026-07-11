# Implementation Plan: `supalite db pull` — Baseline Schema Dump

**Branch**: `001-db-pull` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)
**Design source**: [docs/superpowers/specs/2026-07-12-db-pull-design.md](../../docs/superpowers/specs/2026-07-12-db-pull-design.md) (approved)

## Technical Context

- **Language/runtime**: TypeScript (strict), Node.js >= 16.17 (repo engine floor)
- **Dependencies**: existing `pg` ^8.11 only — no new runtime dependencies
- **Testing**: jest + ts-jest against a live Postgres (`DB_CONNECTION`, default
  `postgresql://testuser:testpassword@localhost:5432/testdb`), same harness as
  `src/__tests__/gen-types.test.ts` with seed/cleanup SQL in `scripts/`
- **Build/lint**: `npm run build` (tsc), `npm run lint` (eslint over `src/**/*.ts`)
- **Constitution**: repo has no `.specify/memory/constitution.md` — no gates;
  follow existing repo patterns (hand-rolled CLI parser, pure generator
  functions, live-PG tests)
- **Unknowns**: none — all decisions resolved in [clarify.md](clarify.md) /
  [research.md](research.md)

## Architecture

### Module layout

| File | Responsibility |
|------|----------------|
| `src/db-pull.ts` (new) | `generateBaselineSql(options): Promise<string>` — connect, introspect, return the complete SQL string. Pure output; no file I/O. |
| `src/index.ts` (modified) | Re-export `generateBaselineSql` / `DbPullOptions` from the package root. |
| `src/cli.ts` (modified) | Subcommand dispatch (`gen types` \| `db pull`), `db pull` arg parsing, default `--out` path with UTC timestamp, directory creation, stdout mode, usage text. `gen types` behavior unchanged. |
| `src/__tests__/db-pull.test.ts` (new) | Structural + round-trip + idempotency + plain-mode + extension-filter tests. |
| `scripts/seed-db-pull.sql`, `scripts/cleanup-db-pull.sql` (new) | Fixture schema `db_pull_schema` exercising every supported object kind; cleanup drops it. |
| `README.md`, `README.ko.md`, `CHANGELOG.md` (modified) | Usage, defaults, idempotency guarantee, v1 limitations; roadmap line replaced; changelog entry. |

`src/gen-types.ts` is **not modified** (its byte-exact supabase output must not
be risked; actual reuse potential is low — type mapping vs DDL detail).

### Public API

```ts
export type DbPullOptions = {
  dbUrl: string;
  schemas?: string[];               // default ['public']
  includeExtensionObjects?: boolean; // default false
  ifNotExists?: boolean;            // default true
};
export const generateBaselineSql: (options: DbPullOptions) => Promise<string>;
```

Both are re-exported from the package root via `src/index.ts` (FR-020).

### Data flow

1. CLI parses args → builds `DbPullOptions` → calls `generateBaselineSql`.
2. The generator opens one `pg` `Client`, runs one catalog query per section
   (plus one per table for columns, matching the `gen-types.ts` pattern), and
   renders sections in dependency order (spec FR-003).
3. DDL rendering is delegated to server-side deparse functions wherever they
   exist: `pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_functiondef`,
   `pg_get_triggerdef`, `pg_get_viewdef`, with `format_type` / `pg_get_expr` /
   `quote_ident` for column-level detail. Hand-assembled DDL is limited to
   `CREATE TABLE`, `CREATE TYPE` (enum/composite), `CREATE SEQUENCE`.
4. CLI writes the string to the resolved `--out` target (or stdout).

### Section renderers (inside `src/db-pull.ts`)

Each renderer is `(ctx: Ctx) => Promise<string[]>` where `Ctx` carries the
client, schema list, `filterExtensions`, and `ifNotExists`. Non-empty sections
start with a `-- <section>` banner line (used by ordering tests). Order:

| # | Renderer | Key catalog source | Idempotency mechanism |
|---|----------|--------------------|-----------------------|
| 1 | header | — | `SET check_function_bodies = off;` (pg_dump technique) |
| 2 | schemas | `pg_namespace` (selected minus `public`, PLUS extension target namespaces) | `IF NOT EXISTS` — always, even in plain mode |
| 3 | extensions | `pg_extension` (skip `plpgsql`), Kahn topo-sort over extension→extension `pg_depend` edges, oid tie-break; versions not pinned | `IF NOT EXISTS` — always, even in plain mode |
| 4 | sequences | `pg_sequence` minus identity-internal (`pg_depend` `deptype='i'`); options always rendered | `IF NOT EXISTS` |
| 5 | types | enums `pg_enum`; domains `typtype='d'` (base type, default, NOT NULL, `pg_get_constraintdef` CHECKs); composites `relkind='c'`; ONE unified Kahn topo-sort with edges through attribute/base types, resolving arrays via `pg_type.typelem` | `DO $$ ... EXCEPTION WHEN duplicate_object` (safe dollar tag) |
| 6 | functions — type stage | `pg_proc prokind IN ('f','p')` whose signature types (prorettype + proargtypes, arrays resolved) reference NO relation row types + `pg_get_functiondef` + `;` | server emits `CREATE OR REPLACE` |
| 7 | tables | `pg_attribute` + `pg_attrdef` + identity-seq lateral join; `relkind='r' AND NOT relispartition`; Kahn topo-sort over column-row-type edges (table-uses-table); `relpersistence='u'` → UNLOGGED; non-default `attcollation` → `COLLATE`; CHECKs NOT inlined; defaults whose `adbin` depends on a user function are stripped and deferred to §10 | `IF NOT EXISTS` |
| 8 | sequence ownership | `pg_depend` `deptype='a'` → `ALTER SEQUENCE ... OWNED BY` | naturally idempotent |
| 9 | functions — table stage | remaining functions whose signatures reference table/composite-of-table row types (but no view row types) | server emits `CREATE OR REPLACE` |
| 10 | deferred column defaults | defaults stripped in §7 → `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT <pg_get_expr>` | naturally idempotent (SET DEFAULT overwrites) |
| 11 | constraints (PK/UNIQUE/CHECK/EXCLUDE) | `pg_constraint` + `pg_get_constraintdef` (CHECKs may call user functions → after §9) | `DO` guard on `conname` + `conrelid::regclass` (safe dollar tag) |
| 12 | foreign keys | same, `contype='f'`, after ALL tables; FKs whose `confrelid` is an excluded relation (partition parent, extension-owned, outside-selection-and-absent) → footer instead of executable DDL | same `DO` guard |
| 13 | views | `relkind IN ('v','m')` + `pg_get_viewdef(oid, true)`, Kahn topo-sort over `pg_rewrite`/`pg_depend` view→view edges; view `reloptions` rendered (`security_barrier`, `check_option`); matview `WITH NO DATA` when `NOT relispopulated`; views depending on excluded aggregates → footer, not emitted | `CREATE OR REPLACE VIEW` / matview `IF NOT EXISTS` |
| 14 | functions — view stage | remaining functions whose signatures reference view row types | server emits `CREATE OR REPLACE` |
| 15 | triggers | `pg_trigger NOT tgisinternal` + `pg_get_triggerdef`; after views for `INSTEAD OF` triggers | plain triggers → `CREATE OR REPLACE TRIGGER` (PG14+); constraint triggers (`tgconstraint <> 0`) → `DO` existence guard (OR REPLACE unsupported for them) |
| 16 | indexes | `pg_index` + `pg_get_indexdef` on relations `relkind IN ('r','m') AND NOT relispartition`, excluding constraint-backing (`pg_constraint.conindid`, incl. EXCLUDE); after views so matview indexes resolve | textual `IF NOT EXISTS` insertion (`CREATE [UNIQUE] INDEX`) |
| 17 | footer | partition hierarchies (`relkind='p'` parents + `relispartition` leaves), aggregates/window (`prokind IN ('a','w')`), dependents of excluded objects (views on aggregates, FKs to excluded relations, generated columns calling table/view-stage functions), non-reproduced table/view variants (typed/inherited tables, non-default AM/tablespace/storage/replica identity), external FK refs | comment block |

Function staging query: classify each function once by scanning
`prorettype` + `COALESCE(proallargtypes, proargtypes::oid[])` (so
OUT/INOUT/`RETURNS TABLE` columns count too), resolving arrays through
`typelem` and composites through their attribute closure: no relation row
types → §6; table row types only → §9; any view row type → §14. Bodies are
never inspected (`check_function_bodies = off` covers them).

Exclusion closure (FR-016 mechanism): build the excluded-object oid set
(partition parents + `relispartition` leaves, aggregates/window functions,
extension-owned objects when filtering), fetch the relevant `pg_depend`
edges once, and propagate to a fixpoint. Renderers consult the closure and
divert any dependent statement (view, FK, constraint, deferred default,
relation-referencing composite/domain, function whose *signature*
references an excluded relation) to the footer. v1 multi-stage limitation:
defaults/CHECKs calling view-stage functions and views calling view-stage
functions are also footer-diverted rather than re-ordered. Domain
defaults/CHECKs calling user functions are deferred via
`ALTER DOMAIN ... SET DEFAULT` (§10) / guarded `ADD CONSTRAINT` (§11).
Table topo edges also resolve `typelem` so a `customers[]` column orders
after `customers`.

Cross-cutting:

- **Extension filter**: every object query anti-joins
  `pg_depend (classid = <catalog>, objid = <oid>, deptype = 'e')` unless
  `includeExtensionObjects` — applied uniformly (functions, types, tables,
  sequences, indexes, views, triggers) AND to parent relations in the
  constraints / sequence-ownership / triggers queries so subordinate
  objects of extension-owned relations don't leak.
- **Identifier safety**: identifiers come back pre-quoted via `quote_ident()`
  in the catalog queries; string literals embedded in guards escaped by
  doubling single quotes; `format('%I.%I', ...)` for `::regclass` literals.
- **Dollar-quote safety**: every generated `DO` block picks a tag not
  present in its wrapped content (`$supalite$`, `$supalite1$`, ... first
  absent one) — fixed `$$` collides with legitimate `$$` in DDL text.
- **LF normalization**: `\r\n`/`\r` → `\n` on the final output; single
  trailing newline.
- **Empty selection**: when every object section is empty, the schemas and
  extensions sections are suppressed too → truly header-only SQL +
  `console.warn` to stderr (FR-018).

### CLI contract

See [contracts/cli-contract.md](contracts/cli-contract.md) — flags, defaults,
exit codes, output layout. `run()` in `src/cli.ts` becomes a dispatcher; the
existing `gen types` body moves verbatim into `runGenTypes()`.

## Risk mitigation

| Risk | Mitigation |
|------|------------|
| Hand-assembled `CREATE TABLE` drifts from server semantics | Round-trip test: generate → drop schema → apply → regenerate → byte-compare (comments excluded) |
| Idempotency gaps (constraints, types) | Second-apply test on the already-built schema must produce zero errors |
| Extension filter misses a catalog | pg_trgm conditional test asserts absence by default / presence with the flag |
| Deparse output differences across PG versions | Assertions target stable substrings, not full statements; round-trip equality is self-relative |
| Breaking `gen types` | Its code path is untouched; existing `gen-types.test.ts` still runs in CI (`npm test`) |

## Testing strategy

Fixture `db_pull_schema` (seeded once per test run) contains: enum (one label
with an embedded quote), composite type, composite-on-composite, identity
`ALWAYS` + identity `BY DEFAULT (START WITH 500 INCREMENT BY 2)`, legacy
serial column, standalone sequence with non-default options, generated
column, plain column defaults, a column default calling a user-defined
IMMUTABLE function (deferred-default path), a CHECK and an expression index
calling that same function, PK/FK/UNIQUE/CHECK/EXCLUDE, standalone unique
index, plain index, hostile-identifier table (`"CamelTable"` with a reserved
word column), UNLOGGED table, SQL function, IMMUTABLE function, plpgsql
procedure, plpgsql trigger function + trigger, deferrable constraint
trigger, view, view-on-view, `security_barrier` view, materialized view with
a unique index, unpopulated matview (`WITH NO DATA`), RLS policy (asserted
absent), domain + domain-typed column, table-row-type column (table topo),
array-of-composite attribute, non-default `COLLATE "C"` column, a CHECK
containing a literal `$$` string, an identifier with an embedded double
quote, a function body seeded with CRLF (`E'...\r\n...'`), stage-B function
(`RETURNS SETOF customers`), stage-C function (`RETURNS SETOF paid_orders`),
plus footer exercisers: partitioned table + leaf partition and an aggregate
(+ a view on the aggregate, asserted omitted+footer-listed), and an
external-schema FK (`db_pull_ext`, whose referenced table intentionally
remains as the documented pre-existing prerequisite during round-trip).
Tests:

1. **Structure** — every expected DDL substring present; `-- <section>` banner
   positions strictly ordered; FKs after the last `CREATE TABLE`; no
   identity-internal sequence; no index DDL for constraint-backing indexes
   (standalone/matview `CREATE UNIQUE INDEX IF NOT EXISTS` IS expected);
   no `\r`.
2. **Round-trip** (SC-001) and **idempotent re-apply** (SC-002).
3. **Plain mode** (FR-007) — no guards / plain trigger / `IF NOT EXISTS` only
   on schema+extension lines.
4. **Extension filter** (SC-003) — conditional on `pg_trgm` availability,
   restores prior extension state.
5. **CLI (automated)** — jest child-process tests invoking
   `npx ts-node src/cli.ts db pull ...` with isolated env/temp dirs:
   `--help` exit 0, missing db-url exit 1, `DB_CONNECTION` fallback,
   `--mode diff` exact error + exit 1, stdout mode header, default UTC
   filename + directory creation, comma-separated `--schema`. Manual smoke
   steps remain in [quickstart.md](quickstart.md).

## Progress tracking

- [x] Phase 0: research.md (all unknowns resolved)
- [x] Phase 1: contracts/cli-contract.md, quickstart.md, data model folded
      into spec Key Entities (no separate persistence model — this feature
      reads catalogs and emits text)
- [x] Phase 2: tasks.md (`/speckit.tasks`), revised by strict review round 1
- Agent context file: repo has no `CLAUDE.md` with SPECKIT markers — skipped
  (AGENTS.md intentionally untouched; no speckit-managed section exists)
