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
describe('QueryBuilder: order() with nullsFirst', () => {
    let client;
    let pool;
    beforeEach(() => {
        pool = new pg_1.Pool();
        client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    it('should add NULLS FIRST when nullsFirst is true', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'shop_gen_images', 'public')
            .select('*')
            .eq('request_hash', 'abc')
            .order('is_final', { ascending: true })
            .order('pass_no', { ascending: true, nullsFirst: true })
            .order('created_at', { ascending: true });
        const { query, values } = await qb.buildQuery();
        expect(query).toContain('WHERE "request_hash" = $1');
        expect(values).toEqual(['abc']);
        expect(query).toContain('ORDER BY "is_final" ASC, "pass_no" ASC NULLS FIRST, "created_at" ASC');
    });
});
