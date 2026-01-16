# Limitations and Trade-offs

SupaLite focuses on a lightweight, direct PostgreSQL client with a Supabase-style API.
The following items are known trade-offs or non-goals.

- Not a full Supabase replacement: Auth/Storage/Realtime are out of scope.
- CLI/type output is not 1:1 compatible with Supabase CLI; some ecosystem templates may not match.
- Function definition dumps can expose sensitive SQL; keep them local and avoid committing.
- Schema key case conversions (if used) can drift from actual DB identifiers.
- ORM features (relations modeling, nested writes, migrations) are handled by external tools.
