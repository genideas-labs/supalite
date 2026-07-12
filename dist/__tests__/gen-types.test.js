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
        const output = await (0, gen_types_1.generateTypes)({ dbUrl: connectionString, schemas: ['public', schemaName], format: 'supalite' });
        const outputWithDates = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public', schemaName],
            format: 'supalite',
            dateAsDate: true,
        });
        const outputWithMeta = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public', schemaName],
            format: 'supalite',
            includeRelationships: true,
            includeConstraints: true,
            includeIndexes: true,
        });
        const outputWithFunctions = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public', schemaName],
            format: 'supalite',
            includeCompositeTypes: true,
            includeFunctionSignatures: true,
        });
        const outputSupabase = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public', schemaName],
            format: 'supabase',
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
        expect(output).toContain(`gen_types_scalar: { Args: Record<string, never>; Returns: number; };`);
        expect(output).toContain(`gen_types_set: { Args: Record<string, never>; Returns: number[]; };`);
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
        expect(outputSupabase).toContain(`export type Database = {`);
        expect(outputSupabase).toContain(`export const Constants = {`);
        expect(outputSupabase).toContain(`id: number`);
        expect(outputSupabase).toContain(`Args: Record<PropertyKey, never>`);
        expect(outputSupabase).toContain(`foreignKeyName: "gen_types_profiles_user_id_fkey"`);
        expect(outputSupabase).toContain(`Database["public"]["CompositeTypes"]["gen_types_payload"]`);
    });
    test('maps boolean, unknown, void, array returns and array/unnamed params', async () => {
        const output = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public'],
            format: 'supalite',
            includeCompositeTypes: true,
            includeFunctionSignatures: true,
        });
        // boolean and "unknown" (point) column mappings
        expect(output).toContain(`is_active: boolean;`);
        expect(output).toContain(`location: unknown | null;`);
        // enum column reference for the newly added 3-value enum
        expect(output).toContain(`priority: Database['public']['Enums']['gen_types_priority'] | null;`);
        // composite type carrying an array attribute
        expect(output).toContain(`labels: string[] | null;`);
        // function returning void -> undefined
        expect(output).toContain(`gen_types_void: { Args: Record<string, never>; Returns: undefined; };`);
        // function returning integer[] via the ARRAY return path
        expect(output).toContain(`gen_types_int_array: { Args: Record<string, never>; Returns: number[]; };`);
        // unnamed parameters fall back to arg1/arg2 in supalite
        expect(output).toContain(`gen_types_unnamed: { Args: { arg1: number; arg2: number; }; Returns: number; };`);
        // array parameter mapping
        expect(output).toContain(`gen_types_arr_param: { Args: { vals: number[]; }; Returns: number; };`);
        // 3-value enum union in the Enums block, and multi-line array form in Constants
        expect(output).toContain(`gen_types_priority: 'low' | 'medium' | 'high';`);
        expect(output).toContain(`gen_types_priority: [`);
    });
    test('renders SETOF-table return with SetofOptions and inline row columns', async () => {
        const output = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public'],
            format: 'supalite',
            includeFunctionSignatures: true,
        });
        expect(output).toContain(`SetofOptions: { from: '*'; to: 'gen_types_users'; isOneToOne: false; isSetofReturn: true; };`);
        // return type is an array of the referenced table's row columns
        expect(output).toContain(`gen_types_users_setof: { Args: Record<string, never>; Returns: ({ id: bigint;`);
    });
    test('casing options rewrite type, function and composite names', async () => {
        const camel = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public'],
            format: 'supalite',
            typeCase: 'camel',
            functionCase: 'pascal',
            includeCompositeTypes: true,
            includeFunctionSignatures: true,
        });
        const snake = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public'],
            format: 'supalite',
            typeCase: 'snake',
            functionCase: 'snake',
            includeCompositeTypes: true,
            includeFunctionSignatures: true,
        });
        // camel type case + pascal function case ('s' preserved — see splitWords fix)
        expect(camel).toContain(`genTypesPriority: 'low' | 'medium' | 'high';`);
        expect(camel).toContain(`Database['public']['Enums']['genTypesPriority']`);
        expect(camel).toContain(`GenTypesVoid: { Args: Record<string, never>; Returns: undefined; };`);
        expect(camel).toContain(`GenTypesManyArgs: { Args: { a: number; b: number; c: number; }; Returns: number; };`);
        expect(camel).toContain(`genTypesMeta: {`);
        expect(camel).toContain(`Database['public']['CompositeTypes']['genTypesPayload']`);
        // snake type + function case (already snake -> unchanged; guards against the 's'-dropping bug)
        expect(snake).toContain(`gen_types_priority: 'low' | 'medium' | 'high';`);
        expect(snake).toContain(`gen_types_void: { Args: Record<string, never>; Returns: undefined; };`);
        expect(snake).toContain(`gen_types_many_args: { Args: { a: number; b: number; c: number; }; Returns: number; };`);
    });
    test('bigintType option controls bigint column typing', async () => {
        const asString = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public'],
            format: 'supalite',
            bigintType: 'string',
        });
        const asNumber = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public'],
            format: 'supalite',
            bigintType: 'number',
        });
        expect(asString).toContain(`id: string;`);
        expect(asString).toContain(`id?: string;`);
        expect(asNumber).toContain(`id: number;`);
        expect(asNumber).toContain(`id?: number;`);
    });
    test('supabase suppresses trigger/unnamed-multi-arg fns and renders overloads', async () => {
        const output = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public'],
            format: 'supabase',
        });
        // trigger functions and unnamed multi-arg functions are dropped
        expect(output).not.toContain(`gen_types_trigger_fn`);
        expect(output).not.toContain(`gen_types_unnamed`);
        // overloaded function renders a union of Args signatures
        expect(output).toContain(`| { a: number }`);
        expect(output).toContain(`| { a: string }`);
        // function with >2 named args renders multi-line Args
        expect(output).toContain(`gen_types_many_args: {`);
        // 3-value enum renders as a multi-line union
        expect(output).toContain(`| "low"`);
        expect(output).toContain(`| "medium"`);
        expect(output).toContain(`| "high"`);
    });
    test('includeRelationships:false emits placeholder Relationships', async () => {
        const supalite = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public'],
            format: 'supalite',
            includeRelationships: false,
        });
        const supabase = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public'],
            format: 'supabase',
            includeRelationships: false,
        });
        expect(supalite).toContain(`Relationships: unknown[];`);
        expect(supabase).toContain(`Relationships: []`);
    });
    test('view relationships expand through views (view-to-view)', async () => {
        const output = await (0, gen_types_1.generateTypes)({
            dbUrl: connectionString,
            schemas: ['public'],
            format: 'supalite',
            includeRelationships: true,
        });
        // the profiles view's FK is projected onto both the base table and the users view
        expect(output).toContain(`referencedRelation: 'gen_types_users';`);
        expect(output).toContain(`referencedRelation: 'gen_types_users_view';`);
    });
    test('dumpFunctionsSql honours includeProcedures option', async () => {
        const withProcedures = await (0, gen_types_1.dumpFunctionsSql)({
            dbUrl: connectionString,
            schemas: ['public'],
            includeProcedures: true,
        });
        const functionsOnly = await (0, gen_types_1.dumpFunctionsSql)({
            dbUrl: connectionString,
            schemas: ['public'],
            includeProcedures: false,
        });
        expect(functionsOnly).toContain(`CREATE OR REPLACE FUNCTION public.gen_types_add`);
        expect(withProcedures).toContain(`CREATE OR REPLACE FUNCTION public.gen_types_add`);
    });
});
