# Changelog: 2025-05-26

## Feature: `maybeSingle()` Method and `single()` Refactor

**File:** `src/query-builder.ts`

### Summary
-   The existing `single()` method has been renamed to `maybeSingle()`. This method returns `data: null` and `error: null` if no row is found.
-   A new `single()` method has been implemented. This method returns `data: null` and an error object (specifically `PostgresError('PGRST116: No rows found')` with status `404`) if no row is found.
-   Both methods will return an error (`PostgresError('PGRST114: Multiple rows returned')` with status `406`) if multiple rows are returned by the query.

### Detailed Changes
1.  **Added `singleMode` Property**:
    *   A new private property `singleMode: 'strict' | 'maybe' | null` was added to the `QueryBuilder` class to manage the behavior of single-row fetching.

2.  **`maybeSingle()` Method (Formerly `single()`)**:
    *   The original `single()` method was renamed to `maybeSingle()`.
    *   It now sets `this.singleMode = 'maybe';`.
    *   In the `execute()` method, when `singleMode` is `'maybe'`:
        *   If 0 rows are found: returns `{ data: null, error: null, count: 0, status: 200, statusText: 'OK' }`.
        *   If 1 row is found: returns `{ data: row, error: null, count: 1, status: 200, statusText: 'OK' }`.
        *   If >1 rows are found: returns `{ data: null, error: new PostgresError('PGRST114: Multiple rows returned'), count: rowCount, status: 406, statusText: 'Not Acceptable. Expected a single row but found multiple.' }`.

3.  **New `single()` Method**:
    *   A new method named `single()` was introduced.
    *   It sets `this.singleMode = 'strict';`.
    *   In the `execute()` method, when `singleMode` is `'strict'`:
        *   If 0 rows are found: returns `{ data: null, error: new PostgresError('PGRST116: No rows found'), count: 0, status: 404, statusText: 'Not Found. Expected a single row but found no rows.' }`.
        *   If 1 row is found: returns `{ data: row, error: null, count: 1, status: 200, statusText: 'OK' }`.
        *   If >1 rows are found: returns `{ data: null, error: new PostgresError('PGRST114: Multiple rows returned'), count: rowCount, status: 406, statusText: 'Not Acceptable. Expected a single row but found multiple.' }`.

4.  **ESLint Fixes in `src/query-builder.ts`**:
    *   Removed unused type imports `QueryOptions` and `FilterOptions`.
    *   Scoped lexical declarations within `switch` `case` blocks in `buildQuery()` using `{}`.
5.  **Unit Tests Added (`src/__tests__/query-builder-single.test.ts`)**:
    *   Comprehensive Jest tests were added for both `single()` and `maybeSingle()`.
    *   The test file was initially created in `examples/tests/` and then moved to `src/__tests__/` to align with Jest's `roots` configuration, ensuring test discovery. Import paths within the test file were updated accordingly.
    *   Tests cover scenarios for finding one row, zero rows, and multiple rows.
    *   Appropriate assertions for `data`, `error`, `status`, and `statusText` are included.
    *   Test database setup (`users` and `test_table_for_multi_row` tables) and teardown are handled in `beforeAll`/`afterAll`.
    *   Type definitions for the test database schema (`TestDatabase`) were created and refined to ensure compatibility and correctness.

### Impact
-   Developers now have two distinct methods for fetching a single row:
    -   `maybeSingle()`: Use when a row might or might not exist, and its absence is not an error condition.
    -   `single()`: Use when a row is expected to exist, and its absence should be treated as an error.
-   This change provides more explicit control over how "not found" scenarios are handled for single-row queries.
