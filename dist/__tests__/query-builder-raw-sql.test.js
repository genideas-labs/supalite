"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const postgres_client_1 = require("../postgres-client");
const query_builder_1 = require("../query-builder");
jest.mock('pg', () => {
    const mPool = {
        query: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
    };
    const mTypes = {
        setTypeParser: jest.fn(),
    };
    return { Pool: jest.fn(() => mPool), types: mTypes };
});
const normalizeSql = (sql) => sql.replace(/\s+/g, ' ').trim();
const stringifyJsonWithBigint = (value) => JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val));
describe('QueryBuilder raw SQL assertions', () => {
    let client;
    let pool;
    const setColumnTypes = (types) => {
        client.getColumnPgType = jest.fn(async (_schema, _table, column) => (types[column] || 'text'));
    };
    beforeEach(() => {
        pool = new pg_1.Pool();
        client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    it('should quote selected columns', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .select('id, name');
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([]);
        expect(normalizeSql(query)).toBe('SELECT "id", "name" FROM "public"."users"');
    });
    it('should build match() conditions in order', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .select('*')
            .match({ status: 'active', role: 'admin' });
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['active', 'admin']);
        expect(normalizeSql(query)).toBe('SELECT * FROM "public"."users" WHERE "status" = $1 AND "role" = $2');
    });
    it('should build chained filter operators with correct placeholders', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .select('*')
            .eq('id', 1)
            .neq('status', 'inactive')
            .gt('age', 18)
            .gte('score', 80)
            .lt('rank', 100)
            .lte('rank', 10)
            .like('email', '%@example.com')
            .ilike('nickname', '%foo%')
            .is('deleted_at', '2025-01-01');
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([1, 'inactive', 18, 80, 100, 10, '%@example.com', '%foo%', '2025-01-01']);
        expect(normalizeSql(query)).toBe('SELECT * FROM "public"."users" WHERE "id" = $1 AND "status" != $2 AND "age" > $3 AND "score" >= $4 AND "rank" < $5 AND "rank" <= $6 AND "email" LIKE $7 AND "nickname" ILIKE $8 AND "deleted_at" IS $9');
    });
    it('should render IS NULL without a placeholder', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'profiles', 'public')
            .select('*')
            .eq('user_id', 1)
            .is('avatar_url', null);
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([1]);
        expect(normalizeSql(query)).toBe('SELECT * FROM "public"."profiles" WHERE "user_id" = $1 AND "avatar_url" IS NULL');
    });
    it('should render IS NOT NULL for not(is, null)', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .select('*')
            .eq('status', 'active')
            .not('deleted_at', 'is', null);
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['active']);
        expect(normalizeSql(query)).toBe('SELECT * FROM "public"."users" WHERE "status" = $1 AND "deleted_at" IS NOT NULL');
    });
    it('should build or() with eq operators', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .select('*')
            .or('status.eq.active,role.eq.admin');
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['active', 'admin']);
        expect(normalizeSql(query)).toBe('SELECT * FROM "public"."users" WHERE ("status" = $1 OR "role" = $2)');
    });
    it('should build or() with IS NULL and value operators', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'credits', 'public')
            .select('*')
            .eq('wallet_id', 123)
            .gt('amount', 0)
            .or('valid_until.is.null,valid_until.gt.now()');
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([123, 0]);
        expect(normalizeSql(query)).toBe('SELECT * FROM "public"."credits" WHERE "wallet_id" = $1 AND "amount" > $2 AND ("valid_until" IS NULL OR "valid_until" > NOW())');
    });
    it('should build or() with ilike and neq operators', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .select('*')
            .or('email.ilike.%@example%,status.neq.inactive');
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['%@example%', 'inactive']);
        expect(normalizeSql(query)).toBe('SELECT * FROM "public"."users" WHERE ("email" ILIKE $1 OR "status" != $2)');
    });
    it('should parse or() values with dots and commas when quoted', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .select('*')
            .or('email.eq."first.last@example.com",name.eq."last, first"');
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['first.last@example.com', 'last, first']);
        expect(normalizeSql(query)).toBe('SELECT * FROM "public"."users" WHERE ("email" = $1 OR "name" = $2)');
    });
    it('should emit WHERE FALSE for in([])', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .select('*')
            .in('id', []);
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([]);
        expect(normalizeSql(query)).toBe('SELECT * FROM "public"."users" WHERE FALSE');
    });
    it('should order placeholders correctly for IN + contains + order + limit/offset', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'posts', 'public')
            .select('*')
            .in('user_id', [1, null, 3])
            .contains('tags', ['travel'])
            .order('created_at', { ascending: false })
            .limit(10)
            .offset(20);
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([1, 3, ['travel']]);
        expect(normalizeSql(query)).toBe('SELECT * FROM "public"."posts" WHERE ("user_id" IN ($1,$2) OR "user_id" IS NULL) AND "tags" @> $3 ORDER BY "created_at" DESC LIMIT 10 OFFSET 20');
    });
    it('should render ORDER BY ASC when no options are provided', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'posts', 'public')
            .select('*')
            .order('created_at');
        const { query } = await qb.buildQuery();
        expect(normalizeSql(query)).toBe('SELECT * FROM "public"."posts" ORDER BY "created_at" ASC');
    });
    it('should render NULLS LAST when nullsFirst is false', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'shop_gen_images', 'public')
            .select('*')
            .order('pass_no', { ascending: true, nullsFirst: false });
        const { query } = await qb.buildQuery();
        expect(normalizeSql(query)).toBe('SELECT * FROM "public"."shop_gen_images" ORDER BY "pass_no" ASC NULLS LAST');
    });
    it('should render NULLS FIRST with chained order clauses', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'shop_gen_images', 'public')
            .select('*')
            .eq('request_hash', 'abc')
            .order('is_final', { ascending: true })
            .order('pass_no', { ascending: true, nullsFirst: true })
            .order('created_at', { ascending: true });
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['abc']);
        expect(normalizeSql(query)).toBe('SELECT * FROM "public"."shop_gen_images" WHERE "request_hash" = $1 ORDER BY "is_final" ASC, "pass_no" ASC NULLS FIRST, "created_at" ASC');
    });
    it('should translate range() into LIMIT and OFFSET', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'comments', 'public')
            .select('*')
            .range(2, 5);
        const { query } = await qb.buildQuery();
        expect(normalizeSql(query)).toBe('SELECT * FROM "public"."comments" LIMIT 4 OFFSET 2');
    });
    it('should build count exact subquery', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .select('*', { count: 'exact' });
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([]);
        expect(normalizeSql(query)).toBe('SELECT *, COUNT(*) OVER() as exact_count FROM (SELECT * FROM "public"."users") subquery');
    });
    it('should apply order/limit/offset after exact count subquery', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'orders', 'public')
            .select('*', { count: 'exact' })
            .eq('menu_id', 123)
            .eq('table_name', 'test_table')
            .is('order_closed_time', null)
            .order('created_at', { ascending: false })
            .limit(5)
            .offset(10);
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([123, 'test_table']);
        expect(normalizeSql(query)).toBe('SELECT *, COUNT(*) OVER() as exact_count FROM (SELECT * FROM "public"."orders" WHERE "menu_id" = $1 AND "table_name" = $2 AND "order_closed_time" IS NULL) subquery ORDER BY "created_at" DESC LIMIT 5 OFFSET 10');
    });
    it('should build head count query with where clause', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['active']);
        expect(normalizeSql(query)).toBe('SELECT COUNT(*) FROM "public"."users" WHERE "status" = $1');
    });
    it('should build INSERT without RETURNING when select() is not called', async () => {
        setColumnTypes({});
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .insert({ name: 'Alice', status: 'active' });
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['Alice', 'active']);
        expect(normalizeSql(query)).toBe('INSERT INTO "public"."users" ("name","status") VALUES ($1,$2)');
    });
    it('should omit undefined fields on insert', async () => {
        setColumnTypes({});
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .insert({ name: 'Alice', status: undefined, age: 30 });
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['Alice', 30]);
        expect(normalizeSql(query)).toBe('INSERT INTO "public"."users" ("name","age") VALUES ($1,$2)');
    });
    it('should build INSERT with RETURNING when select() is called', async () => {
        setColumnTypes({});
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .insert({ name: 'Alice', status: 'active' })
            .select('id, name');
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['Alice', 'active']);
        expect(normalizeSql(query)).toBe('INSERT INTO "public"."users" ("name","status") VALUES ($1,$2) RETURNING "id", "name"');
    });
    it('should build INSERT for multiple rows', async () => {
        setColumnTypes({});
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .insert([
            { name: 'Alice', status: 'active' },
            { name: 'Bob', status: 'inactive' },
        ]);
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['Alice', 'active', 'Bob', 'inactive']);
        expect(normalizeSql(query)).toBe('INSERT INTO "public"."users" ("name","status") VALUES ($1,$2),($3,$4)');
    });
    it('should emit DEFAULT for undefined fields on multi-row insert', async () => {
        setColumnTypes({});
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .insert([
            { name: 'Alice', status: 'active' },
            { name: 'Bob', status: undefined, age: 20 },
        ]);
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['Alice', 'active', 'Bob', 20]);
        expect(normalizeSql(query)).toBe('INSERT INTO "public"."users" ("name","status","age") VALUES ($1,$2,DEFAULT),($3,DEFAULT,$4)');
    });
    it('should build INSERT with ignoreDuplicates as DO NOTHING', async () => {
        setColumnTypes({});
        const qb = new query_builder_1.QueryBuilder(pool, client, 'menu_section_items', 'public')
            .insert([
            { section_id: 1, menu_item_id: 2 },
            { section_id: 1, menu_item_id: 3 },
        ], { onConflict: ['section_id', 'menu_item_id'], ignoreDuplicates: true })
            .select('*');
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([1, 2, 1, 3]);
        expect(normalizeSql(query)).toBe('INSERT INTO "public"."menu_section_items" ("section_id","menu_item_id") VALUES ($1,$2),($3,$4) ON CONFLICT ("section_id", "menu_item_id") DO NOTHING RETURNING *');
    });
    it('should build UPSERT with comma-separated conflict target', async () => {
        setColumnTypes({});
        const qb = new query_builder_1.QueryBuilder(pool, client, 'menu_item_opts_schema', 'public')
            .upsert({ set_id: 1, name: 'Soup' }, { onConflict: 'set_id, name' })
            .select();
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([1, 'Soup']);
        expect(normalizeSql(query)).toBe('INSERT INTO "public"."menu_item_opts_schema" ("set_id","name") VALUES ($1,$2) ON CONFLICT ("set_id", "name") DO UPDATE SET "set_id" = EXCLUDED."set_id", "name" = EXCLUDED."name" RETURNING *');
    });
    it('should omit undefined fields on upsert', async () => {
        setColumnTypes({});
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .upsert({ id: 1, status: undefined, name: 'Alice' }, { onConflict: 'id' })
            .select();
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([1, 'Alice']);
        expect(normalizeSql(query)).toBe('INSERT INTO "public"."users" ("id","name") VALUES ($1,$2) ON CONFLICT ("id") DO UPDATE SET "id" = EXCLUDED."id", "name" = EXCLUDED."name" RETURNING *');
    });
    it('should quote reserved columns in onConflict targets', async () => {
        setColumnTypes({});
        const qb = new query_builder_1.QueryBuilder(pool, client, 'reserved_keyword_test_table', 'public')
            .upsert({ order: 500, desc: 'Upserted' }, { onConflict: 'order' })
            .select();
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([500, 'Upserted']);
        expect(normalizeSql(query)).toBe('INSERT INTO "public"."reserved_keyword_test_table" ("order","desc") VALUES ($1,$2) ON CONFLICT ("order") DO UPDATE SET "order" = EXCLUDED."order", "desc" = EXCLUDED."desc" RETURNING *');
    });
    it('should build UPSERT with array conflict target', async () => {
        setColumnTypes({});
        const qb = new query_builder_1.QueryBuilder(pool, client, 'ext_menu_item_section_change', 'public')
            .upsert({ ext_menu_id: 10, ext_menu_item_id: 20 }, { onConflict: ['ext_menu_id', 'ext_menu_item_id'] });
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([10, 20]);
        expect(normalizeSql(query)).toBe('INSERT INTO "public"."ext_menu_item_section_change" ("ext_menu_id","ext_menu_item_id") VALUES ($1,$2) ON CONFLICT ("ext_menu_id", "ext_menu_item_id") DO UPDATE SET "ext_menu_id" = EXCLUDED."ext_menu_id", "ext_menu_item_id" = EXCLUDED."ext_menu_item_id"');
    });
    it('should build UPSERT with ignoreDuplicates as DO NOTHING', async () => {
        setColumnTypes({});
        const qb = new query_builder_1.QueryBuilder(pool, client, 'ai_prompt_snapshots', 'public')
            .upsert({ prompt_hash: 'hash_1', content: 'hello' }, { onConflict: 'prompt_hash', ignoreDuplicates: true });
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['hash_1', 'hello']);
        expect(normalizeSql(query)).toBe('INSERT INTO "public"."ai_prompt_snapshots" ("prompt_hash","content") VALUES ($1,$2) ON CONFLICT ("prompt_hash") DO NOTHING');
    });
    it('should keep native arrays without JSON stringifying', async () => {
        setColumnTypes({ tags: 'text[]', scores: 'int4[]' });
        const qb = new query_builder_1.QueryBuilder(pool, client, 'native_array_test_table', 'public')
            .insert({ tags: ['alpha', 'beta'], scores: [10, 20] })
            .select('tags, scores');
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([['alpha', 'beta'], [10, 20]]);
        expect(normalizeSql(query)).toBe('INSERT INTO "public"."native_array_test_table" ("tags","scores") VALUES ($1,$2) RETURNING "tags", "scores"');
    });
    it('should stringify jsonb and bigint on insert', async () => {
        client.getColumnPgType = jest.fn(async (_schema, _table, column) => {
            if (column === 'bigint_value')
                return 'bigint';
            if (column === 'metadata')
                return 'jsonb';
            return 'text';
        });
        const metadata = { ok: true, id: 987n };
        const qb = new query_builder_1.QueryBuilder(pool, client, 'sample', 'public')
            .insert({ bigint_value: 123n, metadata, name: 'hi' })
            .select();
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['123', stringifyJsonWithBigint(metadata), 'hi']);
        expect(normalizeSql(query)).toBe('INSERT INTO "public"."sample" ("bigint_value","metadata","name") VALUES ($1,$2,$3) RETURNING *');
    });
    it('should stringify jsonb and bigint on update', async () => {
        client.getColumnPgType = jest.fn(async (_schema, _table, column) => {
            if (column === 'bigint_value')
                return 'bigint';
            if (column === 'metadata')
                return 'jsonb';
            return 'text';
        });
        const metadata = ['a', 456n];
        const qb = new query_builder_1.QueryBuilder(pool, client, 'sample', 'public')
            .update({ bigint_value: 456n, metadata, name: 'hi' })
            .eq('id', 1)
            .select();
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['456', stringifyJsonWithBigint(metadata), 'hi', 1]);
        expect(normalizeSql(query)).toBe('UPDATE "public"."sample" SET "bigint_value" = $1, "metadata" = $2, "name" = $3 WHERE "id" = $4 RETURNING *');
    });
    it('should build UPDATE without RETURNING when select() is not called', async () => {
        setColumnTypes({});
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .update({ status: 'active' })
            .eq('id', 1);
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['active', 1]);
        expect(normalizeSql(query)).toBe('UPDATE "public"."users" SET "status" = $1 WHERE "id" = $2');
    });
    it('should omit undefined fields on update', async () => {
        setColumnTypes({});
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .update({ status: undefined, name: 'Alice' })
            .eq('id', 1);
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['Alice', 1]);
        expect(normalizeSql(query)).toBe('UPDATE "public"."users" SET "name" = $1 WHERE "id" = $2');
    });
    it('should build UPDATE with IS NULL where clause', async () => {
        setColumnTypes({});
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .update({ status: 'active' })
            .eq('id', 1)
            .is('deleted_at', null)
            .select();
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual(['active', 1]);
        expect(normalizeSql(query)).toBe('UPDATE "public"."users" SET "status" = $1 WHERE "id" = $2 AND "deleted_at" IS NULL RETURNING *');
    });
    it('should build DELETE without RETURNING when select() is not called', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'users', 'public')
            .delete()
            .eq('id', 1);
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([1]);
        expect(normalizeSql(query)).toBe('DELETE FROM "public"."users" WHERE "id" = $1');
    });
    it('should build DELETE with RETURNING when select() is called', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'posts', 'public')
            .delete()
            .eq('user_id', 1)
            .select('id');
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([1]);
        expect(normalizeSql(query)).toBe('DELETE FROM "public"."posts" WHERE "user_id" = $1 RETURNING "id"');
    });
    it('should quote reserved keywords in select/where/order', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'reserved_keyword_test_table', 'public')
            .select('id, order, desc, user')
            .eq('order', 100)
            .order('order', { ascending: false });
        const { query, values } = await qb.buildQuery();
        expect(values).toEqual([100]);
        expect(normalizeSql(query)).toBe('SELECT "id", "order", "desc", "user" FROM "public"."reserved_keyword_test_table" WHERE "order" = $1 ORDER BY "order" DESC');
    });
    it('should build array-embed join subquery for 1:N relations', async () => {
        client.getForeignKey = jest.fn(async (_schema, table, foreignTable) => {
            if (table === 'authors' && foreignTable === 'books') {
                return { column: 'id', foreignColumn: 'author_id', isArray: true };
            }
            return null;
        });
        const qb = new query_builder_1.QueryBuilder(pool, client, 'authors', 'public')
            .select('*, books(title)');
        const { query } = await qb.buildQuery();
        const expected = `
      SELECT "public"."authors".*,
        (
          SELECT COALESCE(json_agg(j), '[]'::json)
          FROM (
            SELECT "title"
            FROM "public"."books"
            WHERE "author_id" = "public"."authors"."id"
          ) as j
        ) as "books"
      FROM "public"."authors"
    `;
        expect(normalizeSql(query)).toBe(normalizeSql(expected));
    });
    it('should build object-embed join subquery for N:1 relations', async () => {
        client.getForeignKey = jest.fn(async (_schema, table, foreignTable) => {
            if (table === 'books' && foreignTable === 'authors') {
                return { column: 'author_id', foreignColumn: 'id', isArray: false };
            }
            return null;
        });
        const qb = new query_builder_1.QueryBuilder(pool, client, 'books', 'public')
            .select('title, authors(name)');
        const { query } = await qb.buildQuery();
        const expected = `
      SELECT "title",
        (
          SELECT row_to_json(j)
          FROM (
            SELECT "name"
            FROM "public"."authors"
            WHERE "id" = "public"."books"."author_id"
            LIMIT 1
          ) as j
        ) as "authors"
      FROM "public"."books"
    `;
        expect(normalizeSql(query)).toBe(normalizeSql(expected));
    });
    it('should support inner embed with related table filters', async () => {
        client.getForeignKey = jest.fn(async (_schema, table, foreignTable) => {
            if (table === 'cur_menu_item' && foreignTable === 'ext_menu_item') {
                return { column: 'ext_menu_item_id', foreignColumn: 'id', isArray: false };
            }
            return null;
        });
        const qb = new query_builder_1.QueryBuilder(pool, client, 'cur_menu_item', 'public')
            .select('id, name, menu_item_id, ext_menu_item!inner(id, deleted_at)')
            .eq('cur_menu_id', 10)
            .is('deleted_at', null)
            .is('ext_menu_item.deleted_at', null);
        const { query, values } = await qb.buildQuery();
        const expected = `
      SELECT "id", "name", "menu_item_id",
        (
          SELECT row_to_json(j)
          FROM (
            SELECT "id", "deleted_at"
            FROM "public"."ext_menu_item"
            WHERE "id" = "public"."cur_menu_item"."ext_menu_item_id" AND "deleted_at" IS NULL
            LIMIT 1
          ) as j
        ) as "ext_menu_item"
      FROM "public"."cur_menu_item"
      WHERE "cur_menu_id" = $1 AND "deleted_at" IS NULL
        AND EXISTS (SELECT 1
          FROM "public"."ext_menu_item"
          WHERE "id" = "public"."cur_menu_item"."ext_menu_item_id" AND "deleted_at" IS NULL)
    `;
        expect(values).toEqual([10]);
        expect(normalizeSql(query)).toBe(normalizeSql(expected));
    });
    it('should build nested embed queries with inner relations', async () => {
        client.getForeignKey = jest.fn(async (_schema, table, foreignTable) => {
            if (table === 'menu_item_opts_set' && foreignTable === 'menu_item_opts_set_schema') {
                return { column: 'schema_id', foreignColumn: 'id', isArray: false };
            }
            if (table === 'menu_item_opts_set' && foreignTable === 'menu_item_opts') {
                return { column: 'id', foreignColumn: 'set_id', isArray: true };
            }
            if (table === 'menu_item_opts' && foreignTable === 'menu_item_opts_schema') {
                return { column: 'schema_id', foreignColumn: 'id', isArray: false };
            }
            return null;
        });
        const qb = new query_builder_1.QueryBuilder(pool, client, 'menu_item_opts_set', 'public')
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
        const { query, values } = await qb.buildQuery();
        const expected = `
      SELECT "id", "created_at", "menu_item_id", "schema_id",
        (
          SELECT row_to_json(j)
          FROM (
            SELECT "id", "name", "desc", "type", "mandatory", "multiple_choices", "max_choice_count", "min_choice_count", "name_i18n", "desc_i18n", "translated"
            FROM "public"."menu_item_opts_set_schema"
            WHERE "id" = "public"."menu_item_opts_set"."schema_id"
            LIMIT 1
          ) as j
        ) as "menu_item_opts_set_schema",
        (
          SELECT COALESCE(json_agg(j), '[]'::json)
          FROM (
            SELECT "id", "created_at",
              (
                SELECT row_to_json(j)
                FROM (
                  SELECT "name", "add_price", "price", "order", "type", "name_i18n", "translated"
                  FROM "public"."menu_item_opts_schema"
                  WHERE "id" = "public"."menu_item_opts"."schema_id"
                  LIMIT 1
                ) as j
              ) as "menu_item_opts_schema",
              "soldout", "hidden", "modified_at"
            FROM "public"."menu_item_opts"
            WHERE "set_id" = "public"."menu_item_opts_set"."id"
          ) as j
        ) as "menu_item_opts"
      FROM "public"."menu_item_opts_set"
      WHERE "menu_item_id" = $1
        AND EXISTS (SELECT 1 FROM "public"."menu_item_opts_set_schema" WHERE "id" = "public"."menu_item_opts_set"."schema_id")
    `;
        expect(values).toEqual([10]);
        expect(normalizeSql(query)).toBe(normalizeSql(expected));
    });
});
