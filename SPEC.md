# SupaLite Specification

Status: living document

## 1. Purpose
SupaLite is a lightweight TypeScript PostgreSQL client that mirrors a subset of Supabase's query builder API. It targets ergonomics and type safety while keeping the implementation minimal and fast.

## 2. Public API Surface

### 2.1 Clients
- `SupaLitePG<T extends DatabaseSchema>`: primary client.
- `SupaliteClient<T extends DatabaseSchema>`: thin wrapper extending `SupaLitePG`.

#### Construction
- Accepts either `connectionString` or discrete connection params.
- Optional `pool` lets callers inject an existing `pg` Pool (SupaLite does not create or close the pool).
- Env vars supported: `DB_CONNECTION`, `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASS`, `DB_PORT`, `DB_SSL`.
- `bigintTransform`: `'bigint' | 'string' | 'number' | 'number-or-string'` controls how BIGINT values are parsed.
- `verbose`: logs SQL, values, and warnings for risky bigint-to-number conversions.

### 2.2 QueryBuilder
Created via `client.from(table[, schema])` and implements a Promise-like interface. Core methods:
- `select(columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean })`
- `insert(data, { onConflict?, ignoreDuplicates? })`
- `update(data)`
- `delete()`
- `upsert(data, { onConflict?, ignoreDuplicates? })`
- Filters: `match`, `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`, `is`, `not`, `contains`, `or`
- Ordering: `order(column, { ascending?, nullsFirst? })`
- Pagination: `limit`, `offset`, `range`
- Result shaping: `single`, `maybeSingle`, `returns<T>()`

Notes:
- QueryBuilder is thenable; `await client.from('table').select(...)` executes the query.
- `returns<T>()` is a type-level cast only and has no runtime effect.

### 2.3 RPC
`client.rpc(procedureName, params?)` returns a `RpcBuilder` supporting:
- Promise-like interface
- `.single()` / `.maybeSingle()`

### 2.4 Utilities
- `testConnection()` to validate connectivity.
- `close()` to shut down the internal pool (no-op when using an external `pool`).

## 3. Result Shapes

### 3.1 QueryResult
```
{ data: Array<T>; error: PostgresError | null; count: number | null; status: number; statusText: string }
```
- `data` is always an array for multi-row queries.
- On INSERT/UPDATE/DELETE without `select()`, `data: []` and `count: rowCount`.

### 3.2 SingleQueryResult
```
{ data: T | null; error: PostgresError | null; count: number | null; status: number; statusText: string }
```
- `single()`:
  - 0 rows => error `PGRST116`, status 404.
  - >1 rows => error `PGRST114`, status 406.
- `maybeSingle()`:
  - 0 rows => `data: null`, `error: null`, status 200.
  - >1 rows => error `PGRST114`, status 406.

## 4. SQL Generation Rules

### 4.1 Column quoting
- Unquoted columns are wrapped in double quotes.
- `*` is preserved; when embedding joins, `*` is rewritten as `"schema"."table".*`.
- Reserved keywords are handled by quoting.

### 4.2 Filters
- `match` expands to multiple `"col" = $n` clauses in object property order.
- `is(col, null)` generates `IS NULL` (no placeholder).
- `is(col, value)` generates `IS $n`.
- `not(col, 'is', null)` generates `IS NOT NULL`; other operators throw.
- `in(col, [])` emits `WHERE FALSE`.
- `in(col, [..., null])` emits `("col" IN (...) OR "col" IS NULL)`; if only NULLs are provided, it emits `IS NULL`.
- `contains` uses `@>`.
- `or()` expects `col.op.value` segments separated by commas.
  - Supported ops: `eq`, `neq`, `like`, `ilike`, `gt`, `gte`, `lt`, `lte`, `is`.
  - `value` is treated as a literal string; `null` maps to SQL NULL; numeric strings are kept as strings.
  - `is.null` uses `IS NULL` without a placeholder.
  - `now()` is inlined as `NOW()` for comparison operators (no placeholder).
  - Quote values to include dots/commas (e.g. `name.eq."last, first"`).

### 4.3 Ordering and pagination
- `order('col')` defaults to `ASC`.
- `nullsFirst` explicitly adds `NULLS FIRST` or `NULLS LAST`.
- `range(from, to)` maps to `LIMIT (to - from + 1) OFFSET from`.

### 4.4 Count / head
- `count: 'exact'` wraps the base query in a subquery and selects `COUNT(*) OVER()` as `exact_count`.
- `count: 'planned' | 'estimated'` uses `EXPLAIN (FORMAT JSON)` row estimates from the base query.
- `head: true` runs `SELECT COUNT(*) FROM schema.table` with the same WHERE clause.
- `exact_count` is removed from returned rows; `count` reports the total.

### 4.5 INSERT / UPDATE / DELETE
- `select()` appends `RETURNING` with the selected columns.
- Without `select()`, no `RETURNING` is added.
- `insert([])` throws `Empty array provided for insert`.
- Multi-row inserts use the first row's keys as column order.
- `upsert`:
  - `onConflict` can be a string or array.
  - String targets are quoted unless already quoted or parenthesized.
  - `ignoreDuplicates: true` emits `ON CONFLICT DO NOTHING` (with `onConflict` target when provided).
- `insert`:
  - `ignoreDuplicates: true` emits `ON CONFLICT DO NOTHING` (with `onConflict` target when provided).

### 4.6 Embedded relations
- `select('*, child(*)')` uses foreign key detection to build subqueries.
- 1:N relations return `json_agg` arrays (default `[]`).
- N:1 relations return `row_to_json` objects (or null).
- `table!inner(...)` enforces row existence via `EXISTS(...)`.
- Related-table filters use `table.column` notation and are applied inside the embed subquery; when `!inner` is used, the same filters are applied to the `EXISTS` clause.
- Nested embeds are supported (e.g. `parent(child(grandchild(...)))`), with each level resolving foreign keys independently.

## 5. Data Conversion Rules
- JSON/JSONB on INSERT/UPDATE:
  - Arrays and plain objects are `JSON.stringify`'d, with BigInt values converted to strings.
  - Dates and primitives are passed through.
- Native arrays (e.g. `text[]`) are passed through as JavaScript arrays.
- BIGINT parsing (default: 'number-or-string'):
  - `'bigint'`: `BigInt` values.
  - `'string'`: string values.
  - `'number'`: `Number` with precision warning if unsafe.
  - `'number-or-string'`: `Number` when safe, otherwise string to preserve precision.

## 6. Transactions
- `begin`, `commit`, `rollback`, and `transaction` are implemented on `SupaLitePG`.
- Metadata lookups (schema/foreign keys) use the transaction client when active.
- Query execution uses the transaction client when active so all statements in a transaction share the same connection.

## 7. RPC Behavior
- Queries are built as `SELECT * FROM "schema"."procedure"(args)`.
- Scalar returns are unwrapped only when the function is scalar-returning (non set-returning).
- `single()` / `maybeSingle()` enforce row count and unwrap scalars when appropriate.
- Empty results return `data: []` for `rpc()` (non-single).

## 8. Caching
- Column type lookups are cached per `schema.table`.
- Foreign key relationships are cached per `schema.table.foreignTable`.
- No invalidation strategy exists; cache assumes static schema during process lifetime.

## 9. Errors
- QueryBuilder errors use `PostgresError` with message only.
- RPC errors include PostgresError with message and code (if provided by pg).
  - Internal PGRST errors (e.g. `PGRST116`, `PGRST114`) set `error.code` by parsing the message prefix.

## 10. Testing
- Jest test suite in `src/__tests__`.
- Some tests require a running PostgreSQL with the right schema and `DB_CONNECTION` env var.
- Raw SQL tests validate exact SQL generation via the private `buildQuery()`.

## 11. Type generation CLI
- `supalite gen types --db-url <postgres_url> [--schema public,analytics] [--out supalite.types.ts]`
- Reads schema metadata from `information_schema` and `pg_catalog`.
- Emits `Json` and a `Database` type with `Tables`, `Views`, `Functions`, `Enums`, and `CompositeTypes`.
- `--format supalite|supabase` (default: supalite).
- `--format supabase` matches Supabase CLI output (including formatting).
- SupaLite format is a superset of Supabase: `Constraints`/`Indexes`, `referencedSchema` in `Relationships`, `bigint` defaults, `Json` bigint, and `SetofOptions` for setof RPCs.
- `BIGINT` maps to `bigint` by default (`--format supabase` defaults to `number`); `--no-bigint` is a shorthand for `--bigint-type number`.
- `json/jsonb` map to `Json` with optional `bigint` (`--json-bigint` default: supalite=true, supabase=false; disable via `--no-json-bigint`).
- `--date-as-date` maps `date`/`timestamp` columns to `Date`.
- `--include-relationships` emits FK metadata in `Relationships`.
- `--include-constraints` emits PK/UNIQUE/CHECK/FK metadata per table.
- `--include-indexes` emits index metadata per table.
- `--include-composite-types` emits `CompositeTypes` definitions.
- `--include-function-signatures` maps `Functions.Args/Returns` from schema metadata.
- `--type-case` controls enum/composite type key casing (`preserve` | `snake` | `camel` | `pascal`).
- `--function-case` controls function key casing (`preserve` | `snake` | `camel` | `pascal`).
- `--dump-functions-sql [path]` writes `CREATE FUNCTION/PROCEDURE` definitions from `pg_get_functiondef`.
- Arrays are mapped to `baseType[]` using the underlying element type.
- Insert types mark nullable/default/identity/generated columns as optional; Update types are always optional.

## 12. Non-goals
- Full Supabase feature parity (auth, storage, realtime).
- SQL injection-safe raw SQL DSL beyond the query builder.
- Advanced query planner hints or server-side caching.
