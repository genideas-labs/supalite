# Skills

Repository-specific workflows that keep changes stable and consistent.

## 1. QueryBuilder change
Use when adding or modifying query behavior.
- Update `src/query-builder.ts` for SQL generation.
- Update `src/types.ts` if new options or types are needed.
- Add or extend raw SQL assertions in `src/__tests__/query-builder-raw-sql.test.ts`.
- Update README and `SPEC.md` to document the behavior.

## 2. RPC change
Use when altering RPC behavior.
- Update `RpcBuilder` in `src/postgres-client.ts`.
- Add/adjust tests in `src/__tests__/rpc.test.ts`.
- Document behavior in `SPEC.md`.

## 3. Schema / typing change
Use when adding schema-related features or type helpers.
- Update `src/types.ts` and any public exports.
- Ensure `DatabaseSchema` and `TableOrViewName` remain consistent.
- Add type-level tests or usage examples in README if needed.

## 4. Data conversion change
Use when updating JSON/BigInt/array handling.
- Modify conversion logic in `src/query-builder.ts` and/or type parsers in `src/postgres-client.ts`.
- Add tests for JSONB, native arrays, and BigInt paths.
- Update `SPEC.md` and README notes about serialization.

## 5. Transaction change
Use when improving transaction semantics.
- Ensure queries use the transaction client when `isTransaction` is true.
- Add tests that verify isolation across BEGIN/COMMIT/ROLLBACK.
- Document the behavior in `SPEC.md`.
