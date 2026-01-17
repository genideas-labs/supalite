# SupaLite
If Supabase feels slow due to serverless latency, SupaLite can be a faster alternative for database queries.
[한국어 README](README.ko.md)

[![npm version](https://img.shields.io/npm/v/supalite.svg)](https://www.npmjs.com/package/supalite)
[![npm downloads](https://img.shields.io/npm/dm/supalite.svg)](https://www.npmjs.com/package/supalite)
[![license](https://img.shields.io/npm/l/supalite.svg)](LICENSE)
[![types](https://img.shields.io/npm/types/supalite.svg)](https://www.npmjs.com/package/supalite)
[![node](https://img.shields.io/node/v/supalite.svg)](https://www.npmjs.com/package/supalite)
[![ci](https://img.shields.io/github/actions/workflow/status/genideas-labs/supalite/ci.yml?branch=main)](https://github.com/genideas-labs/supalite/actions/workflows/ci.yml)

A lightweight PostgreSQL client focused on the Supabase query builder. It keeps the familiar API but trims the surface area so you get a smaller footprint and less overhead in production.

In one line: **SupaLite is a slim Supabase client for query builder + RPC + transactions.** If you need full Supabase features (auth/storage/realtime), use `supabase-js`.

Used in production by [oqoq.ai](https://oqoq.ai).

Compatibility at a glance:
- ✅ Select/filters/order/pagination
- ✅ PostgREST-style embeds (`related_table(*)`, `!inner`)
- ✅ Insert/update/delete/upsert (including `ignoreDuplicates`)
- ✅ RPC (including `single`/`maybeSingle`)
- ❌ Auth/Storage/Realtime

Cloud migration note (GCP/AWS):
If you are moving off Supabase, SupaLite replaces only the **DB query layer**. You still need alternatives for Auth/Storage/Realtime. Typical choices are:
- Auth: managed identity (AWS Cognito / Google Identity Platform) or self-hosted (GoTrue/Keycloak)
- Storage: object storage (S3 / GCS)
- Realtime: managed pub/sub, WebSocket services, or PostgreSQL LISTEN/NOTIFY + your own gateway

## Key Features

- Type safety: written in TypeScript with full type support
- Powerful query builder: Supabase-style chainable API
- Multi-schema support: work across multiple schemas
- CRUD operations: clear and concise database operations
- RPC support: call stored procedures
- Performance: connection pooling and efficient SQL generation
- Transactions: safe DB transactions (not supported by Supabase)
- UPSERT support: control insert/update behavior
- Advanced filtering: OR conditions, ILIKE, and more
- Array support: multi-row inserts and array fields (JSON/JSONB included)
- Views, Functions, Enums: full Supabase-style typing
- BigInt handling: configurable transforms for JSON-safe values

## Project Scope

SupaLite targets a focused subset of the Supabase client: query builder, RPC, and transactions. It does not aim for full Supabase feature parity (auth/storage/realtime). The supported query patterns are documented below; if a pattern is missing, please open an issue so we can prioritize it.

## Migrations and schema management

SupaLite is intentionally ORM-light. For schema management and migrations, use dedicated tools:
- Migrations/schema sync: [pg-schema-sync](https://github.com/genideas-labs/pg-schema-sync)
- Alternatives: Atlas, dbmate, Sqitch, Goose, Flyway
- Type generation: `supabase gen types typescript --db-url <postgres_url>` (works with just a DB URL)

ORM features (relations, nested writes, etc.) are best handled by Prisma/Drizzle/Kysely in a separate service when needed. Keeping SupaLite light is part of the value.

About `supabase db pull`: it is a schema/migration sync step, not an ORM feature. Rather than implementing it inside SupaLite, we recommend documenting the workflow and optionally providing a lightweight CLI wrapper that combines `pg-schema-sync` + type generation.

SupaLite now includes `supalite gen types`, which defaults to the SupaLite format (a superset of Supabase CLI output). Use `--format supabase` for byte-for-byte Supabase CLI output.

## SupaLite vs Prisma / Drizzle

SupaLite is a lightweight SQL-first client with a Supabase-style query builder. Prisma and Drizzle are ORMs with schema-first workflows and migrations.

When SupaLite fits best:
- You want a thin query layer with minimal abstraction.
- You are migrating from Supabase and want similar query ergonomics.
- You handle migrations and schema management separately.

When Prisma or Drizzle fits best:
- You want schema-first modeling and built-in migrations.
- You want richer ORM features (relations, nested writes, generated client APIs).
- You want stronger compile-time guarantees tied to a schema file.

Trade-offs:
- SupaLite is simpler and closer to SQL, but does not provide ORM-level modeling or migration tooling.
- Prisma/Drizzle add features and structure, with some abstraction overhead.
- SupaLite includes built-in BIGINT transform options for JSON-safe output.
- Prisma/Drizzle still require manual decisions for BIGINT (JSON serialization vs precision), while SupaLite centralizes it with `bigintTransform`.

## Example comparison (SupaLite vs Prisma vs Drizzle)

SupaLite keeps Supabase-style naming so the query reads close to SQL. Below is the same query in each tool:

Task: fetch active users, ordered by `created_at` desc, page 2 (10 per page).

SupaLite:
```typescript
const page = 2;
const pageSize = 10;
const { data } = await client
  .from('users')
  .select('id, name, email, created_at')
  .eq('status', 'active')
  .order('created_at', { ascending: false })
  .limit(pageSize)
  .offset((page - 1) * pageSize);
```

Prisma:
```typescript
const page = 2;
const pageSize = 10;
const data = await prisma.user.findMany({
  select: { id: true, name: true, email: true, created_at: true },
  where: { status: 'active' },
  orderBy: { created_at: 'desc' },
  take: pageSize,
  skip: (page - 1) * pageSize,
});
```

Drizzle:
```typescript
const page = 2;
const pageSize = 10;
const data = await db
  .select({ id: users.id, name: users.name, email: users.email, created_at: users.createdAt })
  .from(users)
  .where(eq(users.status, 'active'))
  .orderBy(desc(users.createdAt))
  .limit(pageSize)
  .offset((page - 1) * pageSize);
```

## Roadmap (near-term)

- CI matrix for Node/pg versions with integration tests
- Benchmarks and performance guidance
- Auth/Storage/Realtime migration guidance (Cognito/GIP, S3/GCS, Realtime options)
- `supalite gen types` (SupaLite-first generator with Supabase-compatible output)
- Contribution guide and issue templates

## Performance notes (serverless Supabase vs cloud Postgres)

General differences you can expect when moving off serverless Supabase to a managed Postgres on GCP/AWS:
- Network hops: Supabase often adds extra hops (edge/API/REST layer) vs direct Postgres access, especially within the same VPC.
- Cold starts and pooling: serverless tiers can cold-start or aggressively pool; dedicated poolers (pgBouncer/RDS Proxy) reduce tail latency.
- Network path: public Internet vs private VPC/peering changes jitter and p95/p99 latency.
- Overhead: HTTP/PostgREST layers add serialization cost; direct SQL clients minimize that overhead.

Benchmarks and numbers: **TBD (source needed)**. If you have public benchmarks, please open a PR with sources.
Sources needed:
- Links to public benchmarks/blogs/docs comparing serverless Postgres vs managed Postgres latency and pooling.

## Benchmark methodology (draft)

- Workloads: simple `select`, filtered `select + order`, `insert`, `rpc`.
- Measure p50/p95/p99 with warm and cold runs.
- Keep region and instance size identical; record DB version and pool settings.
- Separate client latency vs query time when possible.
- Publish scripts and raw results.

## Why SupaLite

- Direct PostgreSQL connection (no PostgREST hop) for lower latency and fewer moving parts
- Supabase-style, SQL-like method names for easy migration
- Native `bigint` support with configurable transforms
- Transactions and multi-step flows that Supabase client does not support
- Type generator that can include relationships/constraints/indexes and function signatures

See `docs/limitations.md` for known trade-offs.

## Installation

```bash
npm install supalite
```

### CLI

```bash
npm install -g supalite
```

```bash
supalite gen types --help
```

You can also use `npx supalite ...` without a global install.

## Type System

### Database schema definition

```typescript
// Database types generated by SupaLite CLI
// Example: npx supalite gen types --db-url "postgresql://user:pass@localhost:5432/db" --out database.types.ts
import { Database } from './types/database';

// Typed client
const client = new SupaLitePG<Database>({
  user: 'testuser',
  password: 'testpassword',
  host: 'localhost',
  database: 'testdb',
  port: 5432,
  ssl: false,
  // bigintTransform: 'string', // receive BIGINT as string (default: 'bigint')
  // verbose: true // verbose logging
});

// Or use environment variables
const client = new SupaLitePG<Database>();

// Database interface example (same shape as Supabase CLI output)
interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: number;
          name: string;
          email: string;
          status: string;
          last_login: string | null;
          created_at: string;
        };
        Insert: {
          name: string;
          email: string;
          status?: string;
          last_login?: string | null;
        };
        Update: {
          name?: string;
          email?: string;
          status?: string;
          last_login?: string | null;
        };
        Relationships: unknown[];
      };
      // Other tables...
    };
    Views: {
      // View definitions...
    };
    Functions: {
      // Function definitions...
    };
    Enums: {
      // Enum definitions...
    };
  };
  // Other schemas...
}
```

### Generate types with supalite gen types

```bash
npx supalite gen types --db-url "postgresql://user:pass@localhost:5432/db" --schema public,analytics --out database.types.ts --date-as-date
```

- `--out -` prints to stdout
- Default output is SupaLite format (superset of Supabase CLI). Use `--format supabase` for byte-for-byte Supabase CLI output.
- SupaLite format also includes `Constraints`/`Indexes`, `referencedSchema` in `Relationships`, `bigint` + `Json` bigint support, and `SetofOptions` for setof RPCs.
- BIGINT type mapping is controlled by `--bigint-type bigint|number|string` (default: supabase=number, supalite=bigint)
- `--no-bigint` is a shortcut for `--bigint-type number`
- `--json-bigint` includes `bigint` in the `Json` union (default: supabase=false, supalite=true)
- `--no-json-bigint` disables bigint in the `Json` union
- `--date-as-date` maps `date`/`timestamp` columns to `Date`
- `--include-relationships` emits foreign-key metadata into `Relationships` (default: true)
- `--include-constraints` emits primary/unique/check/foreign key metadata (default: supabase=false, supalite=true)
- `--include-indexes` emits index metadata (name, uniqueness, definition) (default: supabase=false, supalite=true)
- `--include-composite-types` emits `CompositeTypes` definitions (default: true)
- `--include-function-signatures` maps `Functions.Args/Returns` from schema metadata (default: true)
- `Functions` always lists detected function names; signatures are included by default
- `--type-case` controls enum/composite type key casing (`preserve` | `snake` | `camel` | `pascal`)
- `--function-case` controls function key casing (`preserve` | `snake` | `camel` | `pascal`)
- `--dump-functions-sql [path]` writes `CREATE FUNCTION/PROCEDURE` definitions (from `pg_get_functiondef`) to a local file
- Use `--schema public` to exclude test/dev schemas from generated types
- Uses `DB_CONNECTION` if `--db-url` is omitted

Roadmap
- TODO (AI): generate transactional TypeScript wrappers for RPC/functions from schema metadata

## Usage Examples

### Database connection

```typescript
import { SupaLitePG } from 'supalite';
import { Database } from './types/database';

const client = new SupaLitePG<Database>({
  user: 'testuser',
  password: 'testpassword',
  host: 'localhost',
  database: 'testdb',
  port: 5432,
  ssl: false,
  // bigintTransform: 'string',
  // verbose: true
});
```

```typescript
import { SupaliteClient } from 'supalite';
import { Database } from './types/database';

// SupaliteClient is a thin wrapper around SupaLitePG.
const client = new SupaliteClient<Database>({
  connectionString: process.env.DB_CONNECTION || 'postgresql://user:pass@localhost:5432/db',
});
```

### Basic CRUD

```typescript
// Read
const { data, error } = await client
  .from('users')
  .select('*')
  .eq('id', 1)
  .single();

// Insert single
const { data, error } = await client
  .from('users')
  .insert({
    name: 'Hong',
    email: 'hong@example.com'
  });

// Insert multiple
const { data, error } = await client
  .from('users')
  .insert([
    { name: 'Hong', email: 'hong@example.com' },
    { name: 'Kim', email: 'kim@example.com' }
  ]);

// Select specific columns
const { data } = await client
  .from('profiles')
  .select('user_id, bio, interests')
  .limit(2);

// Multi-column ordering
const { data } = await client
  .from('users')
  .select('name, status, last_login')
  .order('status', { ascending: true })
  .order('last_login', { ascending: false });

// Pagination
const page1 = await client
  .from('posts')
  .select('*')
  .limit(2)
  .offset(0);

// Range query
const { data } = await client
  .from('comments')
  .select('*')
  .range(1, 3);

// Conditional UPDATE
const { data } = await client
  .from('posts')
  .update({
    views: 10,
    updated_at: new Date().toISOString()
  })
  .eq('user_id', userId)
  .select();

// UPSERT
const { data } = await client
  .from('profiles')
  .upsert({
    user_id: userId,
    bio: 'New profile.',
    interests: ['coding', 'music'],
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' })
  .select()
  .single();
```

### Advanced features

```typescript
// Transactions (not supported by Supabase)
await client.transaction(async (tx) => {
  const { data: user } = await tx
    .from('users')
    .insert({ name: 'Hong' })
    .select()
    .single();

  await tx
    .from('profiles')
    .insert({ user_id: user.id });
});

// OR filtering
const { data, error } = await client
  .from('users')
  .or('status.eq.active,role.eq.admin');

// Case-insensitive search
const { data, error } = await client
  .from('users')
  .ilike('email', '%@example.com');

// Relationship embed (PostgREST-style)
// 1:N returns arrays (default: [])
const { data: authors } = await client
  .from('authors')
  .select('*, books(*)');

// N:1 returns objects (or null)
const { data: books } = await client
  .from('books')
  .select('*, authors(*)');

// Exact count
const { data, count, error } = await client
  .from('users')
  .select('*', { count: 'exact' });

// Array inserts
const { data, error } = await client
  .from('posts')
  .insert([
    {
      title: 'First post',
      tags: ['programming', 'tips'],
      content: '...'
    },
    {
      title: 'Second post',
      tags: ['travel'],
      content: '...'
    }
  ]);

// JSONB array/object insert
// JSON/JSONB columns are stringified automatically (schema-based)
const myJsonArray = ['tag1', 2025, { active: true }];
const myJsonObject = { active: true, score: 10 };
const { data: jsonData, error: jsonError } = await client
  .from('your_jsonb_table')
  .insert({
    metadata_array: myJsonArray,
    metadata_obj: myJsonObject
  })
  .select('metadata_array, metadata_obj')
  .single();

// Native arrays (TEXT[], INTEGER[])
// JS arrays are passed through to pg driver.
const { data: nativeArrayData, error: nativeArrayError } = await client
  .from('your_native_array_table')
  .insert({
    tags_column: ['tech', 'event'],
    scores_column: [100, 95, 88]
  })
  .select('tags_column, scores_column')
  .single();

// Other schema
const { data, error } = await client
  .from('users', 'other_schema')
  .select('*');
```

## Supported Query Patterns (Test-Based Examples)

The examples below are based on `src/__tests__`/`examples/tests` and the actual implementation.

### Filters

```typescript
// match: multiple columns at once
const { data: matched } = await client
  .from('test_table')
  .select('*')
  .match({ name: 'test1', value: 10 });

// Comparison/pattern/array/NULL filters
await client.from('users').select('*').eq('id', 1);
await client.from('users').select('*').neq('status', 'inactive');
await client.from('users').select('*').gt('age', 18);
await client.from('users').select('*').gte('score', 80);
await client.from('users').select('*').lt('rank', 100);
await client.from('users').select('*').lte('rank', 10);
await client.from('users').select('*').like('email', '%@example.com');
await client.from('users').select('*').ilike('email', '%@example.com');
await client.from('users').select('*').in('id', [1, 2, 3]);
await client.from('users').select('*').in('id', []); // no results (WHERE FALSE)
await client.from('posts').select('*').in('user_id', [1, null, 3]); // NULLs are matched via OR IS NULL
await client.from('posts').select('*').in('user_id', [1, 2]).in('views', [50, 100, 150]);
await client.from('posts').select('*').contains('tags', ['travel']);
await client.from('profiles').select('*').is('avatar_url', null);

// NOT (currently only IS NULL is supported)
await client.from('users').select('*').not('email', 'is', null);

// OR conditions: 'column.operator.value'
// now() is inlined as NOW() in the WHERE clause.
// Quote values to include dots/commas: name.eq."last, first"
const { data: credits } = await client
  .from('credits')
  .select('*')
  .eq('wallet_id', 123)
  .gt('amount', 0)
  .or('valid_until.is.null,valid_until.gt.now()');
```

### Sorting/Pagination

```typescript
await client.from('posts').select('*').order('created_at'); // ASC by default
await client.from('posts').select('*').order('created_at', { ascending: false });

await client
  .from('shop_gen_images')
  .select('*')
  .order('is_final', { ascending: true })
  .order('pass_no', { ascending: true, nullsFirst: true })
  .order('created_at', { ascending: true });

await client.from('posts').select('*').limit(10).offset(20);
await client.from('comments').select('*').range(1, 3);

const page = 2;
const pageSize = 10;
await client
  .from('posts')
  .select('*')
  .limit(pageSize)
  .offset((page - 1) * pageSize);
```

### Real-World Patterns (Production-Inspired)

```typescript
// Multi-order + NULLS FIRST
const { data: genImages } = await client
  .from('shop_gen_images')
  .select('*')
  .eq('request_hash', requestHash)
  .order('is_final', { ascending: true })
  .order('pass_no', { ascending: true, nullsFirst: true })
  .order('created_at', { ascending: true });

// INNER embed + related table filter
const { data: orderableItems } = await client
  .from('cur_menu_item')
  .select('id, name, menu_item_id, ext_menu_item!inner(id, deleted_at)')
  .eq('cur_menu_id', Number(cur_menu_id))
  .is('deleted_at', null)
  .is('ext_menu_item.deleted_at', null);

// Nested embed (option sets)
const { data: optionSets } = await client
  .from('menu_item_opts_set')
  .select(`
    id,
    created_at,
    menu_item_id,
    schema_id,
    menu_item_opts_set_schema!inner (
      id,
      name,
      desc,
      type,
      mandatory,
      multiple_choices,
      max_choice_count,
      min_choice_count,
      name_i18n,
      desc_i18n,
      translated
    ),
    menu_item_opts (
      id,
      created_at,
      menu_item_opts_schema (
        name,
        add_price,
        price,
        order,
        type,
        name_i18n,
        translated
      ),
      soldout,
      hidden,
      modified_at
    )
  `)
  .eq('menu_item_id', Number(menu_item_id));

// Bulk insert + ignore duplicates (ON CONFLICT DO NOTHING)
const { data: inserted } = await client
  .from('menu_section_items')
  .insert(deduplicatedRowList, {
    onConflict: ['section_id', 'menu_item_id'],
    ignoreDuplicates: true,
  })
  .select('*');
```

### Count / Head

```typescript
const { data, count } = await client
  .from('count_test_users')
  .select('*', { count: 'exact' });

const { data: headOnly, count: total } = await client
  .from('count_test_users')
  .select('*', { count: 'exact', head: true });

const { data: limited, count: totalLimited } = await client
  .from('count_test_users')
  .select('*', { count: 'exact' })
  .limit(3);

const { data: ranged, count: totalRanged } = await client
  .from('count_test_users')
  .select('*', { count: 'exact' })
  .range(2, 5);
```

When using `count: 'exact'`, result rows do not include the `exact_count` column. `count` always returns the total row count even when `limit`/`range` is used. `count: 'planned' | 'estimated'` uses `EXPLAIN (FORMAT JSON)` row estimates and may differ from the exact total. `head: true` returns `data: []` (or just the estimate for planned/estimated counts).

### single / maybeSingle

```typescript
const { data: user } = await client
  .from('users')
  .select('*')
  .eq('id', 1)
  .single();

const { data: maybeUser } = await client
  .from('users')
  .select('*')
  .eq('id', 999)
  .maybeSingle();

const { data: multiRow, error: multiRowError } = await client
  .from('test_table_for_multi_row')
  .select('*')
  .eq('group_key', 'groupA')
  .single();
```

`single()` throws when 0 rows (PGRST116) or 2+ rows (PGRST114) are returned. `maybeSingle()` returns `data: null` + `error: null` on 0 rows, and returns PGRST114 on 2+ rows. Internal PGRST errors set `error.code` to `PGRST116`/`PGRST114`.

### Relationship Embed (PostgREST-style)

```typescript
// 1:N returns arrays, N:1 returns objects
const { data: authors } = await client
  .from('authors')
  .select('*, books(*)');

const { data: books } = await client
  .from('books')
  .select('*, authors(*)')
  .order('id');

const { data: authorNames } = await client
  .from('authors')
  .select('name, books(title)');

const { data: bookAuthors } = await client
  .from('books')
  .select('title, authors(name)')
  .order('id');

// INNER JOIN + related table filter (table.column)
const { data: orderableItems } = await client
  .from('cur_menu_item')
  .select('id, name, menu_item_id, ext_menu_item!inner(id, deleted_at)')
  .eq('cur_menu_id', 10)
  .is('deleted_at', null)
  .is('ext_menu_item.deleted_at', null);

// Nested embed
const { data: optionSets } = await client
  .from('menu_item_opts_set')
  .select(`
    id,
    created_at,
    menu_item_id,
    schema_id,
    menu_item_opts_set_schema!inner (
      id,
      name,
      desc,
      type,
      mandatory,
      multiple_choices,
      max_choice_count,
      min_choice_count,
      name_i18n,
      desc_i18n,
      translated
    ),
    menu_item_opts (
      id,
      created_at,
      menu_item_opts_schema (
        name,
        add_price,
        price,
        order,
        type,
        name_i18n,
        translated
      ),
      soldout,
      hidden,
      modified_at
    )
  `)
  .eq('menu_item_id', 10);
```

### Writes (INSERT/UPDATE/DELETE/UPSERT)

```typescript
// INSERT (single/multiple)
await client.from('users').insert({ name: 'User', email: 'user@example.com' });
await client.from('users').insert([
  { name: 'User A', email: 'a@example.com' },
  { name: 'User B', email: 'b@example.com' }
]).select();

// INSERT with ignoreDuplicates (ON CONFLICT DO NOTHING)
await client
  .from('menu_section_items')
  .insert(
    [
      { section_id: 1, menu_item_id: 2 },
      { section_id: 1, menu_item_id: 3 },
    ],
    { onConflict: ['section_id', 'menu_item_id'], ignoreDuplicates: true }
  )
  .select('*');

// UPDATE + IS NULL
await client
  .from('order_menu_items')
  .update({ order_closed_time: new Date().toISOString(), last_act_member_owner_id: 123 })
  .eq('table_name', 'test_table')
  .eq('menu_id', 456)
  .is('order_closed_time', null)
  .select();

// DELETE
await client.from('posts').delete().eq('user_id', 1).select();

// DELETE + IN
await client
  .from('users')
  .delete()
  .in('email', ['a@example.com', 'b@example.com']);

// UPSERT (onConflict: string/array)
await client
  .from('profiles')
  .upsert({ user_id: 1, bio: 'hello' }, { onConflict: 'user_id' })
  .select();

await client
  .from('menu_item_opts_schema')
  .upsert({ set_id: 1, name: 'Soup' }, { onConflict: 'set_id, name' })
  .select();

await client
  .from('ext_menu_item_section_change')
  .upsert({ ext_menu_id: 10, ext_menu_item_id: 20 }, { onConflict: ['ext_menu_id', 'ext_menu_item_id'] });

// UPSERT (ignoreDuplicates: true -> ON CONFLICT DO NOTHING)
await client
  .from('ai_prompt_snapshots')
  .upsert(
    { prompt_hash: 'hash_1', content: 'hello' },
    { onConflict: 'prompt_hash', ignoreDuplicates: true }
  );
```

Empty array `insert([])` throws `Empty array provided for insert`.

### Data Types (JSONB/Arrays/BigInt)

```typescript
// JSONB (auto stringify for arrays/objects)
await client
  .from('jsonb_test_table')
  .insert({ jsonb_data: ['string', 123, { nested: true }], another_json_field: { key: 'value' } })
  .select('jsonb_data, another_json_field')
  .single();

await client
  .from('jsonb_test_table')
  .insert({ jsonb_data: [] })
  .select('jsonb_data')
  .single();

// Native arrays (TEXT[], INTEGER[])
await client
  .from('native_array_test_table')
  .insert({ tags: ['alpha', 'beta'], scores: [10, 20] })
  .select('tags, scores')
  .single();

await client
  .from('native_array_test_table')
  .insert({ tags: [], scores: [] })
  .select('tags, scores')
  .single();

await client
  .from('native_array_test_table')
  .update({ tags: ['updated_tag'] })
  .eq('id', 1)
  .select('tags')
  .single();

await client
  .from('native_array_test_table')
  .select('id')
  .contains('tags', ['initial_tag1'])
  .single();

await client
  .from('native_array_test_table')
  .insert({ tags: null, scores: null })
  .select('tags, scores')
  .single();

// BigInt
await client
  .from('bigint_test_table')
  .insert({ bigint_value: 8000000000000000000n })
  .select()
  .single();

await client
  .from('bigint_test_table')
  .update({ bigint_value: 7000000000000000000n })
  .eq('id', 2)
  .select()
  .single();

await client
  .from('bigint_test_table')
  .insert({ bigint_value: null })
  .select()
  .single();

await client
  .from('bigint_test_table')
  .select('id, bigint_value')
  .eq('bigint_value', 1234567890123456789n)
  .single();
```

### Reserved Keyword Columns

```typescript
const { data: reserved } = await client
  .from('reserved_keyword_test_table')
  .select('id, order, desc, user, limit, group')
  .eq('order', 100)
  .order('order', { ascending: false });

const { data: insertedReserved } = await client
  .from('reserved_keyword_test_table')
  .insert({ order: 300, desc: 'Description D', user: 'user_d', limit: 30, group: 'group_y' })
  .select()
  .single();

const { data: updatedReserved } = await client
  .from('reserved_keyword_test_table')
  .update({ desc: 'Updated Description A', limit: 15 })
  .eq('order', 100)
  .select()
  .single();

const { data: upsertReserved } = await client
  .from('reserved_keyword_test_table')
  .upsert({ order: 500, desc: 'Upserted', user: 'user_e', limit: 51, group: 'group_z' }, { onConflict: 'order' })
  .select()
  .single();
```

### Views

```typescript
const { data: userPosts } = await client
  .from('user_posts_view')
  .select('*');

const { data: activeUsers } = await client
  .from('active_users_view')
  .select('*')
  .gte('post_count', 2);

const { data: singlePost } = await client
  .from('user_posts_view')
  .select('*')
  .eq('post_id', 1)
  .single();
```

Views are read-only; Insert/Update are disallowed at the type level.

### RPC

```typescript
const { data: rows } = await client.rpc('get_users');

const { data: singleUser } = await client
  .rpc('get_user')
  .single();

const { data: maybeUser } = await client
  .rpc('get_user')
  .maybeSingle();

const { data: count } = await client.rpc('get_count'); // scalar return

const { data: countSingle } = await client
  .rpc('get_count')
  .single();

const { data: tableExists } = await client
  .rpc('check_table_exists', { table_name: 'code_routes' });

const { data: noneRpc, error: noneRpcError } = await client
  .rpc('get_user')
  .single();

const { data: manyRpc, error: manyRpcError } = await client
  .rpc('get_user')
  .maybeSingle();
```

RPC notes:
- `rpc()` returns arrays for set-returning functions (even if there's a single column).
- Scalar unwrapping happens only for scalar-returning functions.
- Empty results return `[]` (not `null`).

### Transactions

```typescript
await client.transaction(async (tx) => {
  const { data: user } = await tx
    .from('users')
    .insert({ name: 'Hong', email: 'hong@example.com' })
    .select()
    .single();

  if (!user?.id) {
    throw new Error('Failed to create user');
  }

  await tx
    .from('profiles')
    .insert({ user_id: user.id, bio: 'Transaction profile' });
});
```

### Connection check

```typescript
const isConnected = await client.testConnection();
await client.close();
```

## API Reference

### Query methods

- `select(columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated', head?: boolean })`: choose columns
  - `options.count`: `'exact'` returns total row count unaffected by `limit`; `'planned' | 'estimated'` returns EXPLAIN-based estimates
  - `options.head`: `true` returns only `count` without data (estimated when using planned/estimated)
  - PostgREST-style embed: `select('*, related_table(*)')` or `select('col, related_table(col1, col2)')`
- `insert(data: T['Tables'][K]['Insert'] | T['Tables'][K]['Insert'][], options?: { onConflict?: string | string[]; ignoreDuplicates?: boolean })`: insert, `ignoreDuplicates: true` emits `ON CONFLICT DO NOTHING`
- `update(data: T['Tables'][K]['Update'])`: update rows
- `delete()`: delete rows
- `upsert(data: T['Tables'][K]['Insert'], options?: { onConflict?: string | string[]; ignoreDuplicates?: boolean })`: insert/update, `ignoreDuplicates: true` emits `ON CONFLICT DO NOTHING`

### Filter methods

- `match(conditions)`: multiple `eq` at once (e.g., `match({ status: 'active', role: 'admin' })`)
- `eq(column, value)`: equals
- `neq(column, value)`: not equals
- `gt(column, value)`: greater than
- `gte(column, value)`: greater or equal
- `lt(column, value)`: less than
- `lte(column, value)`: less or equal
- `like(column, pattern)`: LIKE
- `ilike(column, pattern)`: case-insensitive LIKE
- `in(column, values)`: IN
- `is(column, value)`: IS
- `not(column, operator, value)`: currently only `not('column', 'is', null)` is supported
- `contains(column, value)`: array/JSON contains
- `or(conditions)`: OR condition string (ops: eq/neq/like/ilike/gt/gte/lt/lte/is, `now()` is inlined as `NOW()`); quote values to include dots/commas (e.g. `name.eq."last, first"`)

### Other methods

- `order(column, { ascending?: boolean, nullsFirst?: boolean })`
- `limit(count: number)`
- `offset(count: number)`
- `range(from: number, to: number)`
- `single()`
- `maybeSingle()`
- `returns<T>()`

### Transaction methods

- `transaction<T>(callback: (client: SupaLitePG) => Promise<T>)`
- `begin()`
- `commit()`
- `rollback()`

### Client methods

- `testConnection()`
- `close()`

## Environment variables

```env
DB_USER=your_db_user
DB_HOST=your_db_host
DB_NAME=your_db_name
DB_PASS=your_db_password
DB_PORT=5432
DB_SSL=true
# SUPALITE_VERBOSE=true
```

### SupaLitePG constructor options

- `connectionString?: string`: connection string (e.g. `postgresql://user:password@host:port/database`)
- `user?: string`: DB user (env: `DB_USER`)
- `host?: string`: DB host (env: `DB_HOST`)
- `database?: string`: DB name (env: `DB_NAME`)
- `password?: string`: DB password (env: `DB_PASS`)
- `port?: number`: DB port (default: 5432, env: `DB_PORT`)
- `ssl?: boolean`: SSL (default: `false`, env: `DB_SSL`)
- `schema?: string`: default schema (default: `public`)
- `verbose?: boolean`: verbose logging (default: `false`, env: `SUPALITE_VERBOSE`)
- `bigintTransform?: 'bigint' | 'string' | 'number'`:
  - `'bigint'` (default): uses native `BigInt`
  - `'string'`: returns string values (safe for JSON)
  - `'number'`: returns `Number` (may lose precision, warns if unsafe)

### Json type and BigInt
The internal `Json` type includes `bigint` to allow explicit BigInt usage in TypeScript. However, standard `JSON.stringify()` cannot handle native `BigInt` and will throw. Use a custom replacer or pre-convert values, or set `bigintTransform` to `'string'` or `'number'` for JSON-safe results.

## Response format

```typescript
interface QueryResult<T> {
  data: Array<T>;
  error: Error | null;
  count: number | null;
  status: number;
  statusText: string;
}

interface SingleQueryResult<T> {
  data: T | null;
  error: Error | null;
  count: number | null;
  status: number;
  statusText: string;
}
```

- `QueryResult.data` is always an array (empty on no results or error).
- `SingleQueryResult.data` is `null` on no results or error.

## Development setup

### Install PostgreSQL
See [examples/README.md](examples/README.md) for local setup.

### Project setup

```bash
# clone
git clone https://github.com/your-username/supalite.git

# install
npm install

# dev
npm run dev

# test
npm test

# build
npm run build
```

## Contributing

Issues and PRs are welcome. For larger changes, please open an issue first to align on scope. Tests expect a local Postgres (or `DB_CONNECTION`), and we run `npm run build`, `npm test`, and `npm run lint` before publishing.

## License

Released under the MIT License. See [LICENSE](LICENSE).

## Copyright

Copyright 2025 Genideas Inc. and Wondong Shin (wodshin@gmail.com)
