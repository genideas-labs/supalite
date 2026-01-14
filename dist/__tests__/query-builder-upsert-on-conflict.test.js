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
describe('QueryBuilder: upsert() onConflict targets', () => {
    let client;
    let pool;
    beforeEach(() => {
        pool = new pg_1.Pool();
        client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
        client.getColumnPgType = jest.fn().mockResolvedValue('text');
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    it('should quote comma-separated onConflict columns', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'menu_item_opts_schema', 'public')
            .upsert({ set_id: 1, name: 'Soup' }, { onConflict: 'set_id, name' })
            .select();
        const { query } = await qb.buildQuery();
        expect(query).toContain('ON CONFLICT ("set_id", "name") DO UPDATE SET');
    });
    it('should quote array onConflict columns', async () => {
        const qb = new query_builder_1.QueryBuilder(pool, client, 'ext_menu_item_section_change', 'public')
            .upsert({ ext_menu_id: 10, ext_menu_item_id: 20 }, { onConflict: ['ext_menu_id', 'ext_menu_item_id'] });
        const { query } = await qb.buildQuery();
        expect(query).toContain('ON CONFLICT ("ext_menu_id", "ext_menu_item_id") DO UPDATE SET');
    });
});
