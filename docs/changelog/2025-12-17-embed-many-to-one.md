# PostgREST-style Embed: Many-to-One Support

- **Date**: 2025-12-17
- **Author**: Codex
- **Status**: Completed

## Summary

Fixed PostgREST-style embed syntax in `select()` (e.g. `related_table(*)`) so it works for both relationship directions:

- **1:N** (foreign table references the base table) returns an **array** (defaults to `[]`).
- **N:1** (base table references the foreign table) returns a **single object** (or `null`).

## Changes

1. **Bidirectional FK resolution**
   - `SupaLitePG.getForeignKey()` now checks both directions between `table` and `foreignTable` and returns whether the embed should be an array or object.

2. **Correct JSON shape in SQL generation**
   - `QueryBuilder` uses `json_agg` (with `COALESCE(..., '[]'::json)`) for 1:N embeds.
   - `QueryBuilder` uses `row_to_json` (with `LIMIT 1`) for N:1 embeds.

3. **Unit tests**
   - Added tests to cover N:1 embed behavior and nested column selection.

## Impact

- Queries like `from('menu_item_opts').select('*, menu_item_opts_schema(*)')` now embed `menu_item_opts_schema` without warnings, matching PostgREST expectations.
- Existing 1:N embed behavior remains compatible, with an improved empty-result shape (`[]` instead of `null`).

