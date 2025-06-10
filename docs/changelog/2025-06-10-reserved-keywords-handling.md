## 2025-06-10: Improved Handling of Reserved Keywords as Column Names

- **New Test Suite**: Created `src/__tests__/query-builder-reserved.test.ts` to specifically test scenarios where table column names are SQL reserved keywords (e.g., "order", "desc", "user", "limit", "group").
    - Includes tests for SELECT, INSERT, UPDATE, ORDER BY, and UPSERT operations on these columns.
- **`QueryBuilder` Modifications (`src/query-builder.ts`)**:
    - **`select()` method**: Enhanced to automatically quote individual column names if a comma-separated string of unquoted names is provided (e.g., `select('order, desc')` will now correctly generate `SELECT "order", "desc"`). This does not affect `select('*')` or already quoted identifiers.
    - **`upsert()` method**: The `onConflict` option, when provided as a simple unquoted column name, will now be automatically quoted (e.g., `onConflict: 'order'` becomes `ON CONFLICT ("order")`). Complex constraint names or multi-column conflict targets provided by the user are not modified.
- **Previous JSONB Update Integration**: The work on reserved keywords was done on top of previous changes for automatic JSON stringification. The changelog entry `docs/changelog/2025-06-10-jsonb-array-test.md` covers those details. This entry focuses on reserved keyword handling.
