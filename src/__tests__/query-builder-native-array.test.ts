import { SupaLitePG } from '../postgres-client';
import { Pool } from 'pg';
import { config } from 'dotenv';
import { DatabaseSchema, TableBase } from '../types';

config(); // Load .env variables

// Define Row/Insert/Update types for the native_array_test_table
type NativeArrayTestTableRow = { id: number; tags: string[] | null; scores: number[] | null; descriptions?: string[] | null };
type NativeArrayTestTableInsert = { id?: number; tags?: string[] | null; scores?: number[] | null; descriptions?: string[] | null };
type NativeArrayTestTableUpdate = { id?: number; tags?: string[] | null; scores?: number[] | null; descriptions?: string[] | null };

// Define our test-specific database schema including the new table
interface TestDatabaseWithNativeArray extends DatabaseSchema {
  public: {
    Tables: {
      native_array_test_table: TableBase & { Row: NativeArrayTestTableRow; Insert: NativeArrayTestTableInsert; Update: NativeArrayTestTableUpdate; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';

describe('QueryBuilder with Native Array Columns (TEXT[], INTEGER[])', () => {
  let client: SupaLitePG<TestDatabaseWithNativeArray>;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    await pool.query(`DROP TABLE IF EXISTS native_array_test_table;`);
    await pool.query(`
      CREATE TABLE native_array_test_table (
        id SERIAL PRIMARY KEY,
        tags TEXT[],
        scores INTEGER[],
        descriptions TEXT[] DEFAULT '{}' -- Example with default empty array
      );
    `);
  });

  beforeEach(async () => {
    client = new SupaLitePG<TestDatabaseWithNativeArray>({ connectionString });
    await pool.query('DELETE FROM native_array_test_table;');
    // Insert initial data using JS arrays, pg driver should handle conversion
    await pool.query(`
      INSERT INTO native_array_test_table (id, tags, scores) VALUES
      (1, ARRAY['initial_tag1', 'initial_tag2'], ARRAY[100, 200]),
      (2, '{}', ARRAY[]::INTEGER[]), -- Empty arrays
      (3, null, null); -- Null arrays
    `);
  });

  afterEach(async () => {
    if (client) {
      await client.close();
    }
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS native_array_test_table;`);
    await pool.end();
  });

  test('should INSERT and SELECT TEXT[] with data', async () => {
    const newTags = ['alpha', 'beta', 'gamma'];
    const { data, error } = await client
      .from('native_array_test_table')
      .insert({ id: 4, tags: newTags })
      .select('tags')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.tags).toEqual(newTags);
  });

  test('should INSERT and SELECT empty TEXT[]', async () => {
    const emptyTags: string[] = [];
    const { data, error } = await client
      .from('native_array_test_table')
      .insert({ id: 5, tags: emptyTags })
      .select('tags')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.tags).toEqual(emptyTags);
  });

  test('should INSERT and SELECT INTEGER[] with data', async () => {
    const newScores = [10, 20, 30, 40];
    const { data, error } = await client
      .from('native_array_test_table')
      .insert({ id: 6, scores: newScores })
      .select('scores')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.scores).toEqual(newScores);
  });

  test('should INSERT and SELECT empty INTEGER[]', async () => {
    const emptyScores: number[] = [];
    const { data, error } = await client
      .from('native_array_test_table')
      .insert({ id: 7, scores: emptyScores })
      .select('scores')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.scores).toEqual(emptyScores);
  });

  test('should INSERT and SELECT NULL for array types', async () => {
    const { data, error } = await client
      .from('native_array_test_table')
      .insert({ id: 8, tags: null, scores: null })
      .select('tags, scores')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.tags).toBeNull();
    expect(data?.scores).toBeNull();
  });

  test('should UPDATE TEXT[] column', async () => {
    const updatedTags = ['updated_initial_tag1', 'new_tag_xyz'];
    const { data, error } = await client
      .from('native_array_test_table')
      .update({ tags: updatedTags })
      .eq('id', 1)
      .select('tags')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.tags).toEqual(updatedTags);
  });
  
  test('should filter using array contains @>', async () => {
    const { data, error } = await client
      .from('native_array_test_table')
      .select('id')
      .contains('tags', ['initial_tag1'])
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.id).toBe(1);
  });
});
