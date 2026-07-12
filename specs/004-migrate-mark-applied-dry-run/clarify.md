# Clarifications: `migrate mark-applied --dry-run` (004)

Session 2026-07-12 — decisions confirmed to the recommended option.

| # | Question | Decision |
|---|----------|----------|
| 1 | dry-run SQL preview form | **Exact executed statements, shared code path.** SQL builder helpers produce the statement strings and are used by BOTH the real executor and the dry-run preview, so preview and execution cannot drift (fidelity is the whole point of the feature). Preview includes `CREATE SCHEMA IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS` (with real double-quoted identifiers) and one `INSERT … (version) VALUES ('…') ON CONFLICT (version) DO NOTHING` per would-record version. Slightly more verbose than the issue's illustrative prose, but literally proves "this is all I write." |
| 2 | `up --dry-run` symmetry (issue's optional section) | **Improve together.** `up --dry-run` prints each pending migration's version **and file path**, and becomes **write-free** — it stops calling `ensureMigrationsTable`, using the same read-only `to_regclass` probe instead. This also **fixes 003 SC-005** ("up --dry-run … creates nothing"), which the current implementation violates by creating the tracking table during dry-run. |
| 3 | Table-existence probe | Read-only `to_regclass(<qualified table>)` (returns NULL when absent) — no DDL, no side effect. Same probe used by both `mark-applied` and `up` dry-runs. |
| 4 | Argument validation under `--dry-run` | Unchanged: `--dry-run` does not relax validation. Neither-`--all`-nor-`<version>` and unknown-version still error + exit 1 before any DB work. |
| 5 | up dry-run SQL body | Show **file path only**, not the full up SQL (issue allows "SQL **or** each migration path"; a 6,000-line baseline makes full SQL impractical). |

Result shapes gain optional dry-run fields (additive, non-breaking):
`MarkAppliedResult.dryRun?: { tableExists; sql[] }` with `marked` reused as
would-record; `MigrateUpResult.pendingPaths?: string[]`.
