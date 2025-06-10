"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_client_1 = require("../postgres-client");
const pg_1 = require("pg");
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)(); // Load .env variables
const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';
describe('QueryBuilder with Reserved Keyword Columns', () => {
    let client;
    let pool;
    beforeAll(async () => {
        pool = new pg_1.Pool({ connectionString });
        await pool.query(`DROP TABLE IF EXISTS reserved_keyword_test_table;`);
        await pool.query(`
      CREATE TABLE reserved_keyword_test_table (
        id SERIAL PRIMARY KEY,
        "order" INTEGER UNIQUE,
        "desc" TEXT,
        "user" TEXT,
        "limit" INTEGER,
        "group" TEXT
      );
    `);
    });
    beforeEach(async () => {
        client = new postgres_client_1.SupaLitePG({ connectionString });
        await pool.query('DELETE FROM reserved_keyword_test_table;');
        await pool.query(`
      INSERT INTO reserved_keyword_test_table (id, "order", "desc", "user", "limit", "group") VALUES
      (1, 100, 'Description A', 'user_a', 10, 'group_x'),
      (2, 200, 'Description B', 'user_b', 20, 'group_y'),
      (3, 50,  'Description C', 'user_c', 5,  'group_x');
    `);
    });
    afterEach(async () => {
        if (client) {
            await client.close();
        }
    });
    afterAll(async () => {
        await pool.query(`DROP TABLE IF EXISTS reserved_keyword_test_table;`);
        await pool.end();
    });
    test('should SELECT data using reserved keyword column names', async () => {
        const { data, error } = await client
            .from('reserved_keyword_test_table')
            .select('id, order, desc, user, limit, group') // Library should handle quoting
            .eq('id', 1)
            .single();
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.id).toBe(1);
        expect(data?.order).toBe(100);
        expect(data?.desc).toBe('Description A');
        expect(data?.user).toBe('user_a');
        expect(data?.limit).toBe(10);
        expect(data?.group).toBe('group_x');
    });
    test('should INSERT data into reserved keyword column names', async () => {
        const insertValues = {
            id: 4,
            order: 300,
            desc: 'Description D',
            user: 'user_d',
            limit: 30,
            group: 'group_y'
        };
        const { data, error } = await client
            .from('reserved_keyword_test_table')
            .insert(insertValues)
            .select()
            .single();
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.id).toBe(4);
        expect(data?.order).toBe(300);
        expect(data?.desc).toBe('Description D');
        expect(data?.user).toBe('user_d');
        expect(data?.limit).toBe(30);
        expect(data?.group).toBe('group_y');
    });
    test('should UPDATE data in reserved keyword column names', async () => {
        const updateValues = {
            desc: 'Updated Description A',
            limit: 15
        };
        const { data, error } = await client
            .from('reserved_keyword_test_table')
            .update(updateValues)
            .eq('order', 100) // Using reserved keyword in WHERE
            .select()
            .single();
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.id).toBe(1);
        expect(data?.desc).toBe('Updated Description A');
        expect(data?.limit).toBe(15);
        expect(data?.user).toBe('user_a'); // Unchanged
    });
    test('should ORDER BY reserved keyword column names', async () => {
        const { data, error } = await client
            .from('reserved_keyword_test_table')
            .select('id, order')
            .order('order', { ascending: false }); // Using 'order' as column name
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.length).toBe(3);
        expect(data?.[0].order).toBe(200);
        expect(data?.[1].order).toBe(100);
        expect(data?.[2].order).toBe(50);
    });
    test('should filter using reserved keyword column names', async () => {
        const { data, error } = await client
            .from('reserved_keyword_test_table')
            .select('id, user')
            .eq('user', 'user_b') // Using 'user' as column name
            .single();
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.id).toBe(2);
        expect(data?.user).toBe('user_b');
    });
    test('should UPSERT data with reserved keyword column names and onConflict target', async () => {
        const upsertData = {
            id: 1, // Existing ID
            order: 101,
            desc: 'Upserted Description A',
            user: 'upserted_user_a',
            limit: 11,
            group: 'upserted_group_x'
        };
        // Test with 'id' as conflict target (not a reserved keyword, but good to test upsert)
        const { data: dataById, error: errorById } = await client
            .from('reserved_keyword_test_table')
            .upsert(upsertData, { onConflict: 'id' })
            .select()
            .single();
        expect(errorById).toBeNull();
        expect(dataById).not.toBeNull();
        expect(dataById?.order).toBe(101);
        expect(dataById?.desc).toBe('Upserted Description A');
        // Test with a reserved keyword as conflict target (e.g. "order", assuming it has a unique constraint for this test)
        // For this to work, "order" column would need a UNIQUE constraint.
        // Let's simulate an insert that would conflict if "order" was unique.
        // Since we don't have a unique constraint on "order" in this setup,
        // we'll test if the query construction for onConflict with reserved keyword is okay.
        // This part of the test might need adjustment based on how QueryBuilder handles onConflict quoting.
        // const upsertDataNew: ReservedKeywordTableInsert = { // This variable is unused
        //   // id: 5, // New ID to avoid conflict on id
        //   order: 500, // New order value
        //   desc: 'New entry for upsert',
        //   user: 'user_e',
        //   limit: 50,
        //   group: 'group_z'
        // };
        // This will perform an INSERT because "order" is not a conflict target with unique constraint here.
        // The main point is to check if `onConflict: 'order'` (if it were a valid unique key) would be quoted.
        // SupaLite's current upsert seems to take a string that is directly used.
        // If `onConflict` target needs quoting, QueryBuilder should handle it or docs should specify user needs to quote.
        // For now, let's assume QueryBuilder should handle it if it's a single column name.
        // First, insert a row that will be the target of an ON CONFLICT update
        await client.from('reserved_keyword_test_table').insert({
            id: 5, // New ID
            order: 500,
            desc: 'Initial entry for upsert conflict test',
            user: 'user_e_initial',
            limit: 50,
            group: 'group_z_initial'
        });
        const upsertConflictData = {
            // id: 5, // We are conflicting on 'order', so id might be different or same if not part of conflict key
            order: 500, // This value exists and should cause conflict
            desc: 'Updated entry via ON CONFLICT on order',
            user: 'user_e_updated',
            limit: 51,
            group: 'group_z_updated'
        };
        const { data: dataByOrder, error: errorByOrder } = await client
            .from('reserved_keyword_test_table')
            .upsert(upsertConflictData, { onConflict: 'order' })
            .select()
            .eq('order', 500) // Select the row we attempted to upsert, using .eq()
            .single();
        expect(errorByOrder).toBeNull();
        expect(dataByOrder).not.toBeNull();
        expect(dataByOrder?.order).toBe(500);
        expect(dataByOrder?.desc).toBe('Updated entry via ON CONFLICT on order');
        expect(dataByOrder?.user).toBe('user_e_updated');
        expect(dataByOrder?.limit).toBe(51);
        // Check id - if the original row with order=500 had id=5, then id should still be 5.
        // If upsertConflictData included an 'id' different from the original conflicting row's id, 
        // the behavior depends on whether 'id' is part of the SET clause or if it's immutable on conflict.
        // PG's ON CONFLICT DO UPDATE will update the existing row that caused the conflict.
        // So, the ID should be that of the pre-existing row with "order" = 500.
        expect(dataByOrder?.id).toBe(5);
    });
});
