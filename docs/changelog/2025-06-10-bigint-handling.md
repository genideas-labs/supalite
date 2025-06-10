## 2025-06-10: Improved BigInt Handling

- **`QueryBuilder` Modifications (`src/query-builder.ts`)**:
    - Enhanced the `buildQuery()` method to automatically convert JavaScript `BigInt` values to their string representation before passing them as parameters to the database for `INSERT`, `UPSERT`, and `UPDATE` operations. This ensures correct serialization of `BigInt` values.
    - Note: Deserialization (reading `BIGINT` from DB to JS `BigInt`) was already handled by a type parser in `postgres-client.ts`.
- **New Test Suite**: Created `src/__tests__/query-builder-bigint.test.ts` to specifically test operations involving `BIGINT` columns.
    - Includes tests for SELECT, INSERT, UPDATE, and filtering using `BigInt` values.
    - Corrected test setup in `beforeEach` to pass large integer literals as strings in direct `pool.query` calls to avoid "bigint out of range" errors during data seeding.
