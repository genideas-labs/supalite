# AGENTS

Guidance for automated agents working in this repository.

## Repo map (high level)
- `src/postgres-client.ts`: core client, connection config, transactions, RPC, schema/foreign-key caches.
- `src/query-builder.ts`: query builder, SQL generation, query execution.
- `src/types.ts`: public types, schema typing helpers, result shapes.
- `src/errors.ts`: `PostgresError` wrapper.
- `src/client.ts`: `SupaliteClient` wrapper over `SupaLitePG`.
- `src/__tests__`: Jest tests (some use a real Postgres DB).

## Runtime behavior to keep in mind
- QueryBuilder builds SQL and runs it via `pool.query`. Transaction state is tracked on `SupaLitePG`, but QueryBuilder does not currently switch to the transaction client; only schema metadata queries use the transaction client.
- JSON/JSONB values are stringified on INSERT/UPDATE when the value is an array/object; native arrays (e.g. `text[]`) are passed through as arrays.
- BigInt handling is configured via `bigintTransform` using pg type parsers.
- `count: 'exact'` uses a window function and strips `exact_count` from result rows.
- `head: true` returns `COUNT(*)` only and `data: []`.
- `single()` / `maybeSingle()` enforce row count and return Supabase-like errors.
- `or()` expects `col.op.value` segments and only supports a fixed set of operators.

## Development workflow
- Build: `npm run build`
- Test: `npm test` (integration tests need `DB_CONNECTION` or other DB env vars)
- Lint: `npm run lint`

## Change checklist
- If you add/modify query behavior:
  - Update `src/query-builder.ts` and relevant types in `src/types.ts`.
  - Add/adjust Jest tests in `src/__tests__` (raw SQL tests are preferred for SQL shape).
  - Update `README.md` and `SPEC.md` to reflect the new behavior.
- If you add/modify RPC behavior:
  - Update `src/postgres-client.ts` and `src/__tests__/rpc.test.ts`.
- If you touch JSON/BigInt behavior:
  - Update conversion rules and document in `SPEC.md`.

## Safe defaults
- Prefer explicit, deterministic SQL generation (avoid relying on implicit column order).
- Keep new docs and examples ASCII unless the file already uses Unicode.
