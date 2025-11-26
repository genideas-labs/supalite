"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_client_1 = require("../postgres-client");
const errors_1 = require("../errors");
const pg_1 = require("pg");
// Mock pg
jest.mock('pg', () => {
    const mQuery = jest.fn();
    const mPool = {
        query: mQuery,
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue({
            release: jest.fn(),
            query: mQuery
        }),
        end: jest.fn()
    };
    return {
        Pool: jest.fn(() => mPool),
        types: {
            setTypeParser: jest.fn()
        }
    };
});
describe('SupaLitePG rpc', () => {
    let client;
    let mockQuery;
    beforeEach(() => {
        // Pool 생성자가 mockPool을 반환하므로, 새 Pool을 만들어서 mockQuery에 접근
        const pool = new pg_1.Pool();
        mockQuery = pool.query;
        mockQuery.mockReset();
        client = new postgres_client_1.SupaLitePG();
    });
    test('rpc() should return multiple rows by default', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 1 }, { id: 2 }],
            rowCount: 2
        });
        const result = await client.rpc('get_users');
        expect(result.data).toHaveLength(2);
        expect(result.error).toBeNull();
        expect(result.count).toBe(2);
    });
    test('rpc().single() should return single object if 1 row returned (multi-column)', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 1, name: 'user' }],
            rowCount: 1
        });
        const result = await client.rpc('get_user').single();
        expect(result.data).toEqual({ id: 1, name: 'user' });
        expect(result.error).toBeNull();
    });
    test('rpc().single() should error if 0 rows returned', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [],
            rowCount: 0
        });
        const result = await client.rpc('get_user').single();
        expect(result.data).toBeNull();
        expect(result.error).toBeInstanceOf(errors_1.PostgresError);
        expect(result.error?.message).toContain('PGRST116'); // No rows found
    });
    test('rpc().single() should error if multiple rows returned', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 1 }, { id: 2 }],
            rowCount: 2
        });
        const result = await client.rpc('get_user').single();
        expect(result.data).toBeNull();
        expect(result.error).toBeInstanceOf(errors_1.PostgresError);
        expect(result.error?.message).toContain('PGRST114'); // Multiple rows returned
    });
    test('rpc().maybeSingle() should return single object if 1 row returned (multi-column)', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 1, name: 'user' }],
            rowCount: 1
        });
        const result = await client.rpc('get_user').maybeSingle();
        expect(result.data).toEqual({ id: 1, name: 'user' });
        expect(result.error).toBeNull();
    });
    test('rpc().maybeSingle() should return null data if 0 rows returned', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [],
            rowCount: 0
        });
        const result = await client.rpc('get_user').maybeSingle();
        expect(result.data).toBeNull();
        expect(result.error).toBeNull();
    });
    test('rpc().maybeSingle() should error if multiple rows returned', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 1 }, { id: 2 }],
            rowCount: 2
        });
        const result = await client.rpc('get_user').maybeSingle();
        expect(result.data).toBeNull();
        expect(result.error).toBeInstanceOf(errors_1.PostgresError);
        expect(result.error?.message).toContain('PGRST114');
    });
    test('rpc() should unwrap scalar return values', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ get_count: 42 }], // scalar return is 1 row, 1 column
            rowCount: 1
        });
        const result = await client.rpc('get_count');
        expect(result.data).toBe(42);
        expect(result.error).toBeNull();
    });
    test('rpc().single() should unwrap scalar return values', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ get_count: 42 }],
            rowCount: 1
        });
        const result = await client.rpc('get_count').single();
        expect(result.data).toBe(42);
        expect(result.error).toBeNull();
    });
});
