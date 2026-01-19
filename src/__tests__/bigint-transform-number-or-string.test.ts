import { SupaLitePG } from '../postgres-client';
import { Pool } from 'pg';
import { config } from 'dotenv';
import { DatabaseSchema, TableBase } from '../types';

config();

type BigintTransformRow = { id: number; bigint_value: number | string | null };
type BigintTransformInsert = { id?: number; bigint_value?: number | string | null };
type BigintTransformUpdate = { id?: number; bigint_value?: number | string | null };

interface BigintTransformDatabase extends DatabaseSchema {
  public: {
    Tables: {
      bigint_transform_number_or_string: TableBase & {
        Row: BigintTransformRow;
        Insert: BigintTransformInsert;
        Update: BigintTransformUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';

describe('BigInt transform default number-or-string', () => {
  let client: SupaLitePG<BigintTransformDatabase>;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    await pool.query('DROP TABLE IF EXISTS bigint_transform_number_or_string;');
    await pool.query(`
      CREATE TABLE bigint_transform_number_or_string (
        id SERIAL PRIMARY KEY,
        bigint_value BIGINT
      );
    `);
  });

  beforeEach(async () => {
    client = new SupaLitePG<BigintTransformDatabase>({ connectionString });
    await pool.query('DELETE FROM bigint_transform_number_or_string;');
    await pool.query(`
      INSERT INTO bigint_transform_number_or_string (id, bigint_value) VALUES
      (1, '9007199254740991'),
      (2, '9007199254740992'),
      (3, '-9007199254740991'),
      (4, '-9007199254740992'),
      (5, null);
    `);
  });

  afterEach(async () => {
    if (client) {
      await client.close();
    }
  });

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS bigint_transform_number_or_string;');
    await pool.end();
  });

  test('returns numbers for safe values and strings for unsafe values', async () => {
    const { data, error } = await client
      .from('bigint_transform_number_or_string')
      .select('id, bigint_value')
      .order('id');

    expect(error).toBeNull();
    expect(data).toHaveLength(5);

    const [safePos, unsafePos, safeNeg, unsafeNeg, nullRow] = data;

    expect(typeof safePos.bigint_value).toBe('number');
    expect(safePos.bigint_value).toBe(9007199254740991);

    expect(typeof unsafePos.bigint_value).toBe('string');
    expect(unsafePos.bigint_value).toBe('9007199254740992');

    expect(typeof safeNeg.bigint_value).toBe('number');
    expect(safeNeg.bigint_value).toBe(-9007199254740991);

    expect(typeof unsafeNeg.bigint_value).toBe('string');
    expect(unsafeNeg.bigint_value).toBe('-9007199254740992');

    expect(nullRow.bigint_value).toBeNull();
  });
});
