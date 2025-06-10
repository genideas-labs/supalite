## 2025-06-10: Added JSONB Array Tests

- Modified `src/__tests__/query-builder-single.test.ts` to include test cases for inserting and selecting array data within a `jsonb` field.
- Added a new table `jsonb_test_table` to the test database schema for this purpose.
- Ensured that the test setup (`beforeAll` and `beforeEach`) correctly creates and seeds this table, including handling empty arrays.
- Corrected the `insert` call in the test to use `JSON.stringify()` for the array data to prevent `invalid input syntax for type json` error.
