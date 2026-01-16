"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_client_1 = require("../postgres-client");
const pg_1 = require("pg");
let mockQuery;
jest.mock('pg', () => {
    const mQuery = jest.fn();
    const mPool = {
        query: mQuery,
        connect: jest.fn().mockResolvedValue({
            release: jest.fn(),
            query: mQuery,
        }),
        end: jest.fn(),
        on: jest.fn(),
    };
    return {
        Pool: jest.fn(() => mPool),
        types: {
            setTypeParser: jest.fn(),
        },
        __mockQuery: mQuery,
    };
});
const getMockQuery = () => jest.requireMock('pg').__mockQuery;
const buildExplainRow = (rows) => ({
    'QUERY PLAN': [{ Plan: { 'Plan Rows': rows } }],
});
describe('QueryBuilder planned/estimated count', () => {
    let client;
    beforeEach(() => {
        const pool = new pg_1.Pool();
        mockQuery = getMockQuery() ?? pool.query;
        mockQuery.mockReset();
        client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
    });
    test('planned count uses EXPLAIN estimates', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 1 }, { id: 2 }],
            rowCount: 2,
        });
        mockQuery.mockResolvedValueOnce({
            rows: [buildExplainRow(42)],
            rowCount: 1,
        });
        const result = await client
            .from('users')
            .select('*', { count: 'planned' });
        expect(result.data).toHaveLength(2);
        expect(result.count).toBe(42);
        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(String(mockQuery.mock.calls[1][0])).toContain('EXPLAIN (FORMAT JSON)');
    });
    test('estimated count with head skips data query', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [buildExplainRow(7)],
            rowCount: 1,
        });
        const result = await client
            .from('users')
            .select('*', { count: 'estimated', head: true });
        expect(result.data).toEqual([]);
        expect(result.count).toBe(7);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(String(mockQuery.mock.calls[0][0])).toContain('EXPLAIN (FORMAT JSON)');
    });
});
