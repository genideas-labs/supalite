"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const postgres_client_1 = require("../postgres-client");
const query_builder_1 = require("../query-builder");
// Mock the Pool and its query method, and the types object
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
describe('QueryBuilder: or() with .is()', () => {
    let client;
    let pool;
    beforeEach(() => {
        pool = new pg_1.Pool();
        client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    it('should generate correct SQL for or() with is(null) condition', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'credits', 'public')
            .select('*')
            .eq('wallet_id', 123)
            .gt('amount', 0)
            .or('valid_until.is.null,valid_until.gt.now()');
        // Access the private buildQuery method for testing purposes
        const { query, values } = await qb.buildQuery();
        // Expected SQL structure:
        // SELECT * FROM "public"."credits" WHERE "wallet_id" = $1 AND "amount" > $2 AND ("valid_until" IS NULL OR "valid_until" > NOW())
        expect(query).toContain('SELECT * FROM "public"."credits"');
        expect(query).toContain('WHERE "wallet_id" = $1 AND "amount" > $2 AND ("valid_until" IS NULL OR "valid_until" > NOW())');
        expect(values).toHaveLength(2);
        expect(values[0]).toBe(123);
        expect(values[1]).toBe(0);
    });
});
