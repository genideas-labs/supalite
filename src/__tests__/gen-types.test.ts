import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { config } from 'dotenv';
import { dumpFunctionsSql, generateTypes } from '../gen-types';

config();

const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';
const schemaName = 'gen_types_schema';
const seedFile = path.resolve(__dirname, '../../scripts/seed-gen-types.sql');
const cleanupFile = path.resolve(__dirname, '../../scripts/cleanup-gen-types.sql');

const runSqlFile = async (pool: Pool, filePath: string): Promise<void> => {
  const sql = fs.readFileSync(filePath, 'utf8');
  await pool.query(sql);
};

describe('generateTypes', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    await runSqlFile(pool, seedFile);
  });

  afterAll(async () => {
    await runSqlFile(pool, cleanupFile);
    await pool.end();
  });

  test('generates enums, bigint mapping, arrays, views, and functions', async () => {
    const output = await generateTypes({ dbUrl: connectionString, schemas: ['public', schemaName], format: 'supalite' });
    const outputWithDates = await generateTypes({
      dbUrl: connectionString,
      schemas: ['public', schemaName],
      format: 'supalite',
      dateAsDate: true,
    });
    const outputWithMeta = await generateTypes({
      dbUrl: connectionString,
      schemas: ['public', schemaName],
      format: 'supalite',
      includeRelationships: true,
      includeConstraints: true,
      includeIndexes: true,
    });
    const outputWithFunctions = await generateTypes({
      dbUrl: connectionString,
      schemas: ['public', schemaName],
      format: 'supalite',
      includeCompositeTypes: true,
      includeFunctionSignatures: true,
    });
    const outputSupabase = await generateTypes({
      dbUrl: connectionString,
      schemas: ['public', schemaName],
      format: 'supabase',
    });
    const functionsSql = await dumpFunctionsSql({ dbUrl: connectionString, schemas: ['public', schemaName] });

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
    expect(outputWithFunctions).toContain(
      `gen_types_user_summary: { Args: { user_id: bigint; }; Returns: ({ id: bigint; status: Database['public']['Enums']['gen_types_status']; })[]; };`
    );
    expect(outputWithFunctions).toContain(
      `gen_types_payload: { Args: { user_id: bigint; }; Returns: Database['public']['CompositeTypes']['gen_types_payload']; };`
    );
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
    expect(outputSupabase).toContain(`Args: never`);
    expect(outputSupabase).toContain(`foreignKeyName: "gen_types_profiles_user_id_fkey"`);
    expect(outputSupabase).toContain(`Database["public"]["CompositeTypes"]["gen_types_payload"]`);
  });
});
