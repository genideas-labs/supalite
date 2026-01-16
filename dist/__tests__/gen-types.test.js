"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const pg_1 = require("pg");
const dotenv_1 = require("dotenv");
const gen_types_1 = require("../gen-types");
(0, dotenv_1.config)();
const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';
const schemaName = 'gen_types_schema';
const seedFile = node_path_1.default.resolve(__dirname, '../../scripts/seed-gen-types.sql');
const cleanupFile = node_path_1.default.resolve(__dirname, '../../scripts/cleanup-gen-types.sql');
const runSqlFile = async (pool, filePath) => {
    const sql = node_fs_1.default.readFileSync(filePath, 'utf8');
    await pool.query(sql);
};
describe('generateTypes', () => {
    let pool;
    beforeAll(async () => {
        pool = new pg_1.Pool({ connectionString });
        await runSqlFile(pool, seedFile);
    });
    afterAll(async () => {
        await runSqlFile(pool, cleanupFile);
        await pool.end();
    });
    test('generates enums, bigint mapping, arrays, views, and functions', async () => {
        const output = await (0, gen_types_1.generateTypes)({ dbUrl: connectionString, schemas: ['public', schemaName] });
        const outputWithDates = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public', schemaName],
            dateAsDate: true,
        });
        const outputWithMeta = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public', schemaName],
            includeRelationships: true,
            includeConstraints: true,
            includeIndexes: true,
        });
        const outputWithFunctions = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public', schemaName],
            includeCompositeTypes: true,
            includeFunctionSignatures: true,
        });
        const functionsSql = await (0, gen_types_1.dumpFunctionsSql)({ dbUrl: connectionString, schemas: ['public', schemaName] });
        expect(output).toContain(`public: {`);
        expect(output).toContain(`${schemaName}: {`);
        expect(output).toContain(`gen_types_status: 'active' | 'inactive';`);
        expect(output).toContain(`status: Database['public']['Enums']['gen_types_status'];`);
        expect(output).toContain(`status_history: Database['public']['Enums']['gen_types_status'][] | null;`);
        expect(output).toContain(`metadata: Json | null;`);
        expect(output).toContain(`tags: string[] | null;`);
        expect(output).toContain(`scores: number[] | null;`);
        expect(output).toContain(`id: bigint;`);
        expect(output).toContain(`id?: bigint;`);
        expect(output).toContain(`gen_types_users_view: {`);
        expect(output).toContain(`gen_types_scalar: { Args: Record<string, unknown>; Returns: unknown; };`);
        expect(output).toContain(`gen_types_set: { Args: Record<string, unknown>; Returns: unknown[]; };`);
        expect(outputWithDates).toContain(`created_at: Date;`);
        expect(outputWithDates).toContain(`created_at?: Date;`);
        expect(outputWithMeta).toContain(`foreignKeyName: 'gen_types_profiles_user_id_fkey';`);
        expect(outputWithMeta).toContain(`isOneToOne: true;`);
        expect(outputWithMeta).toContain(`gen_types_profiles_user_id_key`);
        expect(outputWithMeta).toContain(`gen_types_profiles_nickname_check`);
        expect(outputWithMeta).toContain(`gen_types_profiles_nickname_idx`);
        expect(outputWithFunctions).toContain(`gen_types_add: { Args: { a: number; b: number; }; Returns: number; };`);
        expect(outputWithFunctions).toContain(`gen_types_user_summary: { Args: { user_id: bigint; }; Returns: ({ id: bigint; status: Database['public']['Enums']['gen_types_status']; })[]; };`);
        expect(outputWithFunctions).toContain(`gen_types_payload: { Args: { user_id: bigint; }; Returns: Database['public']['CompositeTypes']['gen_types_payload']; };`);
        expect(outputWithFunctions).toContain(`gen_types_payload: {`);
        expect(outputWithFunctions).toContain(`note: string`);
        expect(functionsSql).toContain(`CREATE OR REPLACE FUNCTION public.gen_types_add`);
        expect(functionsSql).toContain(`CREATE OR REPLACE FUNCTION public.gen_types_user_summary`);
        expect(functionsSql).toContain(`CREATE OR REPLACE FUNCTION public.gen_types_payload`);
        expect(functionsSql).toContain(`CREATE OR REPLACE FUNCTION public.gen_types_scalar`);
        expect(functionsSql).toContain(`CREATE OR REPLACE FUNCTION public.gen_types_set`);
    });
});
