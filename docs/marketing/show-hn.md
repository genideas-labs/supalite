# Show HN draft

Post when ready at https://news.ycombinator.com/submit. Keep the title factual
(HN dislikes hype). Submit a URL post pointing at the homepage; put the text
below as the first comment.

---

**Title (≤80 chars):**

`Show HN: SupaLite – Supabase-style Postgres client, direct (no REST), bigint-safe`

**URL:** https://genideas-labs.github.io/supalite/

**First comment:**

Hi HN. SupaLite is a small TypeScript Postgres client that keeps the Supabase
query-builder API (`.from().select().eq()`) but connects directly to Postgres
instead of going through the REST/PostgREST layer.

Why we built it: we run [oqoq.ai](https://oqoq.ai) and moved our DB layer off
Supabase's hosted REST to a direct Postgres connection. We wanted to keep the
query ergonomics our code already used, so we wrote a thin client that mirrors
the Supabase builder and adds the two things we kept missing:

1. **Transactions.** `client.transaction(async (tx) => { ... })` —
   concurrency-safe, each call on its own pooled connection. supabase-js has no
   transaction support.
2. **JSON-safe 64-bit integers.** Postgres BIGINT can exceed JS's safe integer
   limit (2^53-1). supabase-js returns a JSON number and silently loses
   precision; Prisma/Drizzle return a BigInt that throws on `JSON.stringify`.
   SupaLite's `bigintTransform` defaults to returning a number when it's safe
   and a string when it isn't — precise and serializable with no config.

On latency, a same-machine benchmark (identical query, 300 interleaved
iterations) put p50 at ~0.24 ms vs ~1.0 ms for supabase-js (REST) — about 4x
lower, and in the same tier as Drizzle/Prisma since they're all direct drivers.
That run isolates the API-layer overhead with no network; real cloud
deployments add network hops on top. The benchmark + bigint scripts are in the
repo if you want to reproduce: https://github.com/genideas-labs/supalite/tree/main/benchmarks

Scope is deliberately narrow: query builder + RPC + transactions. No auth,
storage, or realtime — keep supabase-js for those. MIT licensed.

`npm install supalite`. Repo: https://github.com/genideas-labs/supalite

Happy to answer questions and hear what's missing.
