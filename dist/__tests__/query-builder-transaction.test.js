"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_client_1 = require("../postgres-client");
const pg_1 = require("pg");
let mockPoolQuery;
let mockClientQuery;
jest.mock('pg', () => {
    const mPoolQuery = jest.fn();
    const mClientQuery = jest.fn();
    const mPool = {
        query: mPoolQuery,
        connect: jest.fn().mockResolvedValue({
            query: mClientQuery,
            release: jest.fn(),
        }),
        end: jest.fn(),
        on: jest.fn(),
    };
    return {
        Pool: jest.fn(() => mPool),
        types: {
            setTypeParser: jest.fn(),
        },
        __mockPoolQuery: mPoolQuery,
        __mockClientQuery: mClientQuery,
    };
});
const getMockPoolQuery = () => jest.requireMock('pg').__mockPoolQuery;
const getMockClientQuery = () => jest.requireMock('pg').__mockClientQuery;
describe('QueryBuilder transaction execution', () => {
    let client;
    beforeEach(() => {
        const pool = new pg_1.Pool();
        mockPoolQuery = getMockPoolQuery() ?? pool.query;
        mockPoolQuery.mockReset();
        mockClientQuery = getMockClientQuery() ?? jest.fn();
        mockClientQuery.mockReset();
        client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
    });
    test('uses pool query outside of transactions', async () => {
        mockPoolQuery.mockResolvedValueOnce({
            rows: [{ id: 1 }],
            rowCount: 1,
        });
        const result = await client.from('users').select('*');
        expect(result.data).toEqual([{ id: 1 }]);
        expect(mockPoolQuery).toHaveBeenCalledTimes(1);
        expect(mockClientQuery).not.toHaveBeenCalled();
    });
    test('uses transaction client inside a transaction', async () => {
        mockClientQuery
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })
            .mockResolvedValueOnce({ rows: [{ id: 2 }], rowCount: 1 });
        await client.begin();
        const result = await client.from('users').select('*');
        expect(result.data).toEqual([{ id: 2 }]);
        expect(mockPoolQuery).not.toHaveBeenCalled();
        const selectCall = mockClientQuery.mock.calls.find((call) => String(call[0]).startsWith('SELECT'));
        expect(selectCall).toBeTruthy();
    });
});
