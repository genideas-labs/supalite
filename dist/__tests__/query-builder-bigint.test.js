"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_client_1 = require("../postgres-client");
const pg_1 = require("pg");
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)(); // Load .env variables
const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';
describe('QueryBuilder with BigInt Column', () => {
    let client;
    let pool;
    beforeAll(async () => {
        pool = new pg_1.Pool({ connectionString });
        await pool.query(`DROP TABLE IF EXISTS bigint_test_table;`);
        await pool.query(`
      CREATE TABLE bigint_test_table (
        id SERIAL PRIMARY KEY,
        bigint_value BIGINT,
        description TEXT
      );
    `);
    });
    beforeEach(async () => {
        client = new postgres_client_1.SupaLitePG({
            connectionString,
            bigintTransform: 'bigint'
        });
        await pool.query('DELETE FROM bigint_test_table;');
        // Insert initial data using BigInt literals, ensuring they are passed as strings and are within PostgreSQL bigint range
        await pool.query(`
      INSERT INTO bigint_test_table (id, bigint_value, description) VALUES
      (1, '1234567890123456789', 'First BigInt'),
      (2, '9007199254740992', 'Second BigInt (MAX_SAFE_INTEGER + 1)'), 
      (3, null, 'Null BigInt');
    `);
    });
    afterEach(async () => {
        if (client) {
            await client.close();
        }
    });
    afterAll(async () => {
        await pool.query(`DROP TABLE IF EXISTS bigint_test_table;`);
        await pool.end();
    });
    test('should SELECT BigInt data correctly', async () => {
        const { data, error } = await client
            .from('bigint_test_table')
            .select('id, bigint_value, description')
            .eq('id', 1)
            .single();
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.id).toBe(1);
        expect(data?.bigint_value).toBe(1234567890123456789n); // Expect BigInt
        expect(data?.description).toBe('First BigInt');
    });
    test('should INSERT BigInt data correctly', async () => {
        const newId = 4;
        const newBigIntValue = 8000000000000000000n; // Within range
        const newDescription = 'Inserted BigInt';
        const insertValues = {
            id: newId,
            bigint_value: newBigIntValue,
            description: newDescription
        };
        const { data, error } = await client
            .from('bigint_test_table')
            .insert(insertValues)
            .select()
            .single();
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.id).toBe(newId);
        expect(data?.bigint_value).toBe(newBigIntValue);
        expect(data?.description).toBe(newDescription);
    });
    test('should UPDATE BigInt data correctly', async () => {
        const idToUpdate = 2;
        const updatedBigIntValue = 7000000000000000000n; // Within range
        const updatedDescription = 'Updated Second BigInt';
        const updateValues = {
            bigint_value: updatedBigIntValue,
            description: updatedDescription
        };
        const { data, error } = await client
            .from('bigint_test_table')
            .update(updateValues)
            .eq('id', idToUpdate)
            .select()
            .single();
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.id).toBe(idToUpdate);
        expect(data?.bigint_value).toBe(updatedBigIntValue);
        expect(data?.description).toBe(updatedDescription);
    });
    test('should filter using BigInt data in WHERE clause', async () => {
        const { data, error } = await client
            .from('bigint_test_table')
            .select('id, description')
            .eq('bigint_value', 1234567890123456789n) // Filter by BigInt
            .single();
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.id).toBe(1);
        expect(data?.description).toBe('First BigInt');
    });
    test('should handle NULL BigInt values correctly on INSERT and SELECT', async () => {
        const newId = 5;
        const { error: insertError } = await client
            .from('bigint_test_table')
            .insert({ id: newId, bigint_value: null, description: 'Explicit Null BigInt' })
            .select()
            .single();
        expect(insertError).toBeNull();
        const { data, error: selectError } = await client
            .from('bigint_test_table')
            .select('id, bigint_value')
            .eq('id', newId)
            .single();
        expect(selectError).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.id).toBe(newId);
        expect(data?.bigint_value).toBeNull();
    });
});
