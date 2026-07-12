# CLI Contract: `supalite migrate` (003)

## Synopsis

```
supalite migrate <up|status|new|mark-applied|down> [options]

Options:
  --db-url <conn>            Postgres URL (env: DB_CONNECTION, DATABASE_URL)
  --dir <path>               Migrations dir (default: supabase/migrations)
  --migrations-table <ref>   Tracking table (default: public.schema_migrations)
  --dry-run                  (up) print pending, apply nothing
  --all                      (mark-applied) mark every migration file
```

## Subcommands

| Command | DB? | Behavior |
|---------|-----|----------|
| `up` | yes | Apply pending migrations in ascending version order; advisory-locked; atomic per migration. `--dry-run` prints pending only. |
| `status` | yes | List each migration `[x]`/`[ ]` + pending count. |
| `new <name>` | **no** | Create `<dir>/<YYYYMMDDHHMMSS>_<name>.sql` from a template. |
| `mark-applied --all` / `mark-applied <version>` | yes | Record versions WITHOUT running SQL (adopt an existing DB). |
| `down` | — | Prints "not supported in this version (forward-only)." + exit 1. |

## Exit codes / messages

- Missing DB URL (for DB subcommands): `Missing --db-url (or DB_CONNECTION / DATABASE_URL env var).` + usage, exit 1.
- Unknown option: `Unknown option for migrate: <opt>` + usage, exit 1.
- `down`: `migrate down is not supported in this version (forward-only). See issue #7.` exit 1.
- `up` failure: throws `Migration <file> failed: <pg message>`, exit 1, run stops.

## Migration file format (dbmate-compatible)

```sql
-- migrate:up
CREATE TABLE ... ;

-- migrate:down
DROP TABLE ... ;
```

`-- migrate:up transaction:false` runs the section outside a transaction (single statement).

## Tracking table

`schema_migrations(version text primary key, applied_at timestamptz default now())`, auto-created; `--migrations-table schema.table` to relocate. Insert writes only `version` (dbmate-table compatible).

## Programmatic API

```ts
import { migrateUp, migrateStatus, migrateMarkApplied, migrateNew } from 'supalite';
await migrateUp({ dbUrl, dir: 'supabase/migrations' });
```
