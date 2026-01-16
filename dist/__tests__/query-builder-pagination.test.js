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
describe('QueryBuilder pagination (limit/offset/range)', () => {
    let client;
    let pool;
    beforeEach(() => {
        pool = new pg_1.Pool();
        client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    it('should generate LIMIT and OFFSET for pagination', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'posts', 'public')
            .select('*')
            .limit(10)
            .offset(20);
        const { query } = await qb.buildQuery();
        expect(query).toContain('SELECT * FROM "public"."posts"');
        expect(query).toContain('LIMIT 10');
        expect(query).toContain('OFFSET 20');
    });
    it('should translate range() into LIMIT and OFFSET', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'comments', 'public')
            .select('*')
            .range(5, 9);
        const { query } = await qb.buildQuery();
        // range(from, to) => LIMIT (to - from + 1), OFFSET from
        expect(query).toContain('SELECT * FROM "public"."comments"');
        expect(query).toContain('LIMIT 5');
        expect(query).toContain('OFFSET 5');
    });
});
