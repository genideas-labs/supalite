# RPC .single() and .maybeSingle() Support

- **Date**: 2025-11-26
- **Author**: Cline
- **Status**: Completed

## Summary

Implemented `.single()` and `.maybeSingle()` method chaining support for `rpc` calls in `SupaLitePG`. This brings the `rpc` method closer to the Supabase JS client API, allowing users to enforce single-row constraints on RPC results.

## Changes

1.  **Refactored `rpc` Method**:
    - The `rpc` method in `src/postgres-client.ts` now returns an instance of `RpcBuilder` instead of a `Promise` directly.
    - `RpcBuilder` implements the `Promise` interface, ensuring backward compatibility for `await rpc(...)` usage.

2.  **Introduced `RpcBuilder` Class**:
    - Encapsulates RPC parameters and execution logic.
    - Adds `single()` method: Expects exactly one row. Throws `PGRST116` if 0 rows, `PGRST114` if >1 rows.
    - Adds `maybeSingle()` method: Expects at most one row. Returns `null` if 0 rows, throws `PGRST114` if >1 rows.
    - Preserves existing scalar unwrapping logic for single-row, single-column results.

3.  **Unit Tests**:
    - Added `src/__tests__/rpc.test.ts` covering various scenarios for standard calls, `.single()`, and `.maybeSingle()`.

## Impact

- Users can now use `.single()` on `rpc` calls, resolving the `TypeError: ...single is not a function` error.
- Existing code using `await rpc(...)` continues to work without changes.
