import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { config } from 'dotenv';
import { generateBaselineSql } from '../db-pull';
import { generateBaselineSql as rootExport } from '../index';

config();

const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';
const schemaName = 'db_pull_schema';
const seedFile = path.resolve(__dirname, '../../scripts/seed-db-pull.sql');
const cleanupFile = path.resolve(__dirname, '../../scripts/cleanup-db-pull.sql');

const runSqlFile = async (pool: Pool, filePath: string): Promise<void> => {
  const sql = fs.readFileSync(filePath, 'utf8');
  await pool.query(sql);
};

jest.setTimeout(180000);

describe('generateBaselineSql', () => {
  let pool: Pool;
  let baseline: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    await runSqlFile(pool, seedFile);
    baseline = await generateBaselineSql({ dbUrl: connectionString, schemas: [schemaName] });
  });

  afterAll(async () => {
    await runSqlFile(pool, cleanupFile);
    await pool.end();
  });

  test('is exported from the package root', () => {
    expect(rootExport).toBe(generateBaselineSql);
  });

  test('header, schema creation, and normalization', () => {
    expect(baseline).toContain('-- supalite db pull baseline');
    expect(baseline).toContain('SET check_function_bodies = off;');
    expect(baseline).toContain('CREATE SCHEMA IF NOT EXISTS db_pull_schema;');
    expect(baseline).not.toContain('\r');
    expect(baseline.endsWith('\n')).toBe(true);
    expect(baseline.endsWith('\n\n')).toBe(false);
  });
});
