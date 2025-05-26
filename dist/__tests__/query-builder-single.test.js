"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_client_1 = require("../postgres-client");
// import { Database } from '../types/database'; // Using a self-contained TestDatabase for this test
const pg_1 = require("pg");
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)(); // Load .env variables
const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';
describe('QueryBuilder single() and maybeSingle() methods', () => {
    let client;
    let pool;
    beforeAll(async () => {
        pool = new pg_1.Pool({ connectionString });
        // await pool.connect(); // Pool connects automatically on first query
        // It's assumed tables 'users' and 'test_table_for_multi_row' exist.
        // If not, they need to be created manually by a user with sufficient privileges.
        // Adding CREATE TABLE IF NOT EXISTS to ensure tables are present for the test run.
        // This requires the testuser to have CREATE TABLE privileges.
        await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(20),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id SERIAL PRIMARY KEY,
        user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        bio TEXT
      );
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT
      );
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        post_id INT REFERENCES posts(id) ON DELETE CASCADE,
        user_id INT REFERENCES users(id) ON DELETE SET NULL, -- Or CASCADE if user deletion should delete their comments
        comment TEXT NOT NULL
      );
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS test_table_for_multi_row (
        id SERIAL PRIMARY KEY,
        group_key VARCHAR(50) NOT NULL,
        value VARCHAR(100)
      );
    `);
    });
    beforeEach(async () => {
        client = new postgres_client_1.SupaLitePG({ connectionString });
        // Clean up existing data and insert fresh data for each test
        try {
            // Delete from referencing tables first if foreign key constraints exist
            // Order: comments (references posts), posts (references users), profiles (references users), then users.
            await pool.query('DELETE FROM comments;'); // Assuming 'comments' table references 'posts'
            await pool.query('DELETE FROM posts;'); // Assuming 'posts' table references 'users'
            await pool.query('DELETE FROM profiles;'); // Assuming 'profiles' table references 'users'
            await pool.query('DELETE FROM users;');
            await pool.query('DELETE FROM test_table_for_multi_row;');
            await pool.query(`
        INSERT INTO users (id, name, email, status) VALUES
        (1, 'User One', 'user1@example.com', 'active'),
        (2, 'User Two', 'user2@example.com', 'active'),
        (3, 'User Three', 'user3@example.com', 'inactive')
        ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name, email = EXCLUDED.email, status = EXCLUDED.status; 
        -- Using ON CONFLICT in case IDs are not reset by DELETE if table has SERIAL/IDENTITY sequences not reset
        -- Alternatively, reset sequence: SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(max(id),0) + 1, false) FROM users;
      `);
            // Resetting sequence might not be needed due to ON CONFLICT specifying IDs,
            // and could cause permission issues if user doesn't have rights on sequences.
            // await pool.query(`SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users), true);`);
            await pool.query(`
        INSERT INTO test_table_for_multi_row (id, group_key, value) VALUES
        (1, 'groupA', 'Value 1'),
        (2, 'groupA', 'Value 2'),
        (3, 'groupB', 'Value 3')
        ON CONFLICT (id) DO UPDATE SET
        group_key = EXCLUDED.group_key, value = EXCLUDED.value;
      `);
            // await pool.query(`SELECT setval(pg_get_serial_sequence('test_table_for_multi_row', 'id'), (SELECT MAX(id) FROM test_table_for_multi_row), true);`);
        }
        catch (err) {
            console.error('Error during beforeEach data setup:', err);
            throw err; // Propagate error to fail the test setup
        }
    });
    afterEach(async () => {
        if (client) {
            await client.close();
        }
    });
    afterAll(async () => {
        // Clean up data after all tests if necessary, though beforeEach should handle it for next runs.
        // await pool.query('DELETE FROM users;');
        // await pool.query('DELETE FROM test_table_for_multi_row;');
        await pool.end();
        // client.close() moved to afterEach
    });
    // Tests for single()
    describe('single()', () => {
        test('should return a single row when one exists', async () => {
            const { data, error, status } = await client
                .from('users')
                .select('*')
                .eq('id', 1)
                .single();
            expect(error).toBeNull();
            expect(data).not.toBeNull();
            expect(data?.id).toBe(1);
            expect(data?.name).toBe('User One');
            expect(status).toBe(200);
        });
        test('should return an error when no rows are found', async () => {
            const { data, error, status, statusText } = await client
                .from('users')
                .select('*')
                .eq('id', 999) // Non-existent ID
                .single();
            expect(data).toBeNull();
            expect(error).not.toBeNull();
            expect(error?.message).toContain('PGRST116'); // Or "No rows found"
            expect(error?.message).toContain('No rows found');
            expect(status).toBe(404);
            expect(statusText).toContain('Not Found');
        });
        test('should return an error when multiple rows are found', async () => {
            const { data, error, status, statusText } = await client
                .from('test_table_for_multi_row')
                .select('*')
                .eq('group_key', 'groupA') // This will match multiple rows
                .single();
            expect(data).toBeNull();
            expect(error).not.toBeNull();
            expect(error?.message).toContain('PGRST114'); // Or "Multiple rows returned"
            expect(error?.message).toContain('Multiple rows returned');
            expect(status).toBe(406);
            expect(statusText).toContain('Not Acceptable');
        });
    });
    // Tests for maybeSingle()
    describe('maybeSingle()', () => {
        test('should return a single row when one exists', async () => {
            const { data, error, status } = await client
                .from('users')
                .select('*')
                .eq('id', 2)
                .maybeSingle();
            expect(error).toBeNull();
            expect(data).not.toBeNull();
            expect(data?.id).toBe(2);
            expect(data?.name).toBe('User Two');
            expect(status).toBe(200);
        });
        test('should return null data and null error when no rows are found', async () => {
            const { data, error, status, statusText } = await client
                .from('users')
                .select('*')
                .eq('id', 888) // Non-existent ID
                .maybeSingle();
            expect(data).toBeNull();
            expect(error).toBeNull();
            expect(status).toBe(200);
            expect(statusText).toBe('OK');
        });
        test('should return an error when multiple rows are found', async () => {
            const { data, error, status, statusText } = await client
                .from('test_table_for_multi_row')
                .select('*')
                .eq('group_key', 'groupA') // This will match multiple rows
                .maybeSingle();
            expect(data).toBeNull();
            expect(error).not.toBeNull();
            expect(error?.message).toContain('PGRST114');
            expect(error?.message).toContain('Multiple rows returned');
            expect(status).toBe(406);
            expect(statusText).toContain('Not Acceptable');
        });
    });
});
