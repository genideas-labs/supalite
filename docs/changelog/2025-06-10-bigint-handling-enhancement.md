# Changelog - 2025-06-10: Enhanced BIGINT Handling

## Summary
This update introduces a flexible mechanism for handling `BIGINT` data types retrieved from PostgreSQL, addressing potential `TypeError` issues during JSON serialization and providing users with more control over type conversion.

## Changes

### ✨ New Features
*   **Configurable `BIGINT` Transformation**:
    *   Added a new `bigintTransform` option to the `SupaLitePG` constructor configuration (`SupaliteConfig`).
    *   This option allows users to specify how `BIGINT` (OID 20) database columns should be transformed when read.
    *   Possible values for `bigintTransform`:
        *   `'bigint'` (Default): Converts `BIGINT` values to native JavaScript `BigInt` objects. This maintains precision but can cause issues with direct `JSON.stringify()` if not handled.
        *   `'string'`: Converts `BIGINT` values to JavaScript strings. This is safe for JSON serialization and preserves the original value as text.
        *   `'number'`: Converts `BIGINT` values to JavaScript `Number` objects. This is convenient for smaller numbers but may lead to precision loss for values exceeding `Number.MAX_SAFE_INTEGER` or `Number.MIN_SAFE_INTEGER`. A warning is logged via `console.warn` if `verbose: true` and potential precision loss is detected.
    *   The chosen transformation mode is logged to the console if `verbose: true` during client initialization.

### 🛠 Improvements
*   **Type Definitions**:
    *   The `Json` type in `src/types.ts` now explicitly includes `bigint`. This allows TypeScript to correctly type-check structures that may contain `BigInt` values. Users are reminded (via documentation) that standard `JSON.stringify` will require special handling for `BigInt` objects (e.g., a custom replacer or pre-conversion to string/number).
*   **Client Initialization**:
    *   Refined `Pool` initialization in `src/postgres-client.ts` to more consistently use `PoolConfig` for both connection string and individual parameter setups.
    *   Standardized some internal logging prefixes for verbosity and errors.

### 📄 Documentation
*   Updated `README.md` to include:
    *   Detailed explanation of the new `bigintTransform` constructor option, its possible values, default behavior, and implications (especially the precision loss warning for the `'number'` option).
    *   Clarification in `README.md` regarding the `Json` type including `bigint` and the user's responsibility for `JSON.stringify` handling of `BigInt` objects.
    *   Examples of using `bigintTransform` and `verbose` options in the `SupaLitePG` constructor.
    *   Mention of `SUPALITE_VERBOSE=true` as an environment variable option.

## Impact
-   **Error Resolution**: Users experiencing `TypeError: Do not know how to serialize a BigInt` can now resolve this by setting `bigintTransform: 'string'` or `bigintTransform: 'number'` in the `SupaLitePG` configuration.
-   **Flexibility**: Provides developers with greater control over how large integer types are handled, catering to different use cases (e.g., precise arithmetic vs. simple display/serialization).
-   **Backward Compatibility**: The default behavior (`'bigint'`) remains unchanged, minimizing impact on existing users who might rely on receiving `BigInt` objects, though they should be aware of JSON serialization implications.
