## 2025-06-10: Added JSONB Array Tests

- Modified `src/__tests__/query-builder-single.test.ts`:
    - Updated `JsonbTestTable` related types to use the global `Json` type.
    - Added `another_json_field` (JSONB) to `jsonb_test_table` schema and tests.
    - Modified `beforeAll` to `DROP TABLE IF EXISTS jsonb_test_table` before `CREATE TABLE` to ensure schema updates are applied, fixing a "column does not exist" error during tests.
    - Removed explicit `JSON.stringify()` from test cases, relying on internal handling.
    - Added a new test case for inserting/selecting an object into `another_json_field`.
- Modified `src/query-builder.ts` (`buildQuery` method):
    - Implemented automatic `JSON.stringify()` for array or object values (excluding `Date` instances) when preparing data for `INSERT`, `UPSERT`, and `UPDATE` operations. This allows users to pass JavaScript objects/arrays directly for `json`/`jsonb` columns.
    - Corrected a TypeScript error (`Cannot find name 'updateValues'`) in the `UPDATE` case of `buildQuery`.
- Ensured `src/types.ts` contains the `Json` type definition.
