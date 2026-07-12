# Trade-off Records: `supalite db pull` (001)

## D1. Grants / RLS in v1

| Option | Pros | Cons |
|--------|------|------|
| **Exclude from v1 (chosen)** | Smaller v1; avoids role-portability trap; Cloud SQL targets rarely need RLS (no PostgREST) | Users with RLS must handle policies manually until follow-up |
| RLS policies only | Covers Supabase-style schemas | Still drags role questions in via policy roles; scope growth |
| Both grants + policies | Most complete | Role names differ per environment → non-portable baselines; largest v1 |

## D2. Flag defaults (extension filter / idempotent DDL)

| Option | Pros | Cons |
|--------|------|------|
| **Both default ON, opt-out (chosen)** | Safe-by-default: wrong dumps (34/87 extension functions) and prod re-apply accidents prevented without flags | Interface direction flips vs. issue draft (documented in --help/README) |
| Opt-in as drafted | Matches issue draft text exactly | Forgetting flags produces a wrong baseline by default |
| Extension filter ON only | Clean pure-DDL default | Baseline unsafe to re-apply to prod by default, violating a stated issue requirement |

## D3. Implementation strategy

| Option | Pros | Cons |
|--------|------|------|
| **Self-contained src/db-pull.ts + server-side deparse (chosen)** | Battle-tested DDL rendering by Postgres itself; zero risk to gen-types.ts (2,169 lines, byte-exact supabase output); same pattern as existing dumpFunctionsSql | Some conceptual overlap with gen-types catalog queries |
| Extract shared introspection layer first | Cleaner long-term architecture | Big refactor risk on byte-exact output; actual reuse is low (type-mapping vs DDL detail differ) |
| pg-schema-sync / pg_dump wrapper | Least code | External binary/version matching; no supalite format awareness; explicitly rejected in issue #4 |

## D4. Constraint idempotency mechanism

| Option | Pros | Cons |
|--------|------|------|
| **DO $$ guard on pg_constraint (chosen)** | Deterministic full idempotency; no reliance on error codes; requester-preferred | Slightly more verbose output |
| EXCEPTION duplicate_object wrapper | Shorter | Swallows by error class; subtransaction per statement |
| Document "constraints are fresh-DB only" | No extra SQL | Breaks the "safe to re-apply to prod" requirement — rejected by requester |

## D5. Trigger idempotency

| Option | Pros | Cons |
|--------|------|------|
| **CREATE OR REPLACE TRIGGER (chosen; plain triggers only)** | Clean single statement | Requires PostgreSQL 14+ on replay target (documented). Constraint triggers don't support OR REPLACE on any version → they use a DO existence guard instead (strict-review refinement, see research R5) |
| DROP TRIGGER IF EXISTS + CREATE | Works on older PG | Not idempotent in effect ordering; briefly drops the trigger on live DB |
| DO $$ existence guard | Version-safe | Verbose; EXECUTE-quoted DDL harder to read |

## D6. Sequence rendering

| Option | Pros | Cons |
|--------|------|------|
| **Always render options explicitly (chosen)** | Deterministic round-trip; non-default options (requester has them) never lost | Slightly longer statements |
| Render only non-default options | Shorter output | Default-detection varies by sequence data type; drift risk |
