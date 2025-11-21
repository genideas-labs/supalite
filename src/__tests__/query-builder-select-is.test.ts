import { Pool } from 'pg';
import { SupaLitePG } from '../postgres-client';
import { QueryBuilder } from '../query-builder';

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

describe('QueryBuilder: select() with .is() and .order()', () => {
  let client: SupaLitePG<any>;
  let pool: Pool;

  beforeEach(() => {
    pool = new Pool();
    client = new SupaLitePG({ connectionString: 'postgresql://mock' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate correct SQL for select with count, eq, is(null), and order', async () => {
    const qb = new QueryBuilder(pool, client, 'orders', 'public')
      .select('*', { count: 'exact' })
      .eq('menu_id', 123)
      .eq('table_name', 'test_table')
      .is('order_closed_time', null)
      .order('created_at', { ascending: false });

    // Access the private buildQuery method for testing purposes
    const { query, values } = await (qb as any).buildQuery();

    // Expected SQL structure:
    // SELECT *, COUNT(*) OVER() as exact_count FROM (SELECT * FROM "public"."orders" WHERE "menu_id" = $1 AND "table_name" = $2 AND "order_closed_time" IS NULL) subquery ORDER BY "created_at" DESC
    
    expect(query).toContain('SELECT *, COUNT(*) OVER() as exact_count FROM');
    expect(query).toContain('(SELECT * FROM "public"."orders"');
    expect(query).toContain('WHERE "menu_id" = $1 AND "table_name" = $2 AND "order_closed_time" IS NULL');
    expect(query).toContain(') subquery');
    expect(query).toContain('ORDER BY "created_at" DESC');

    expect(values).toHaveLength(2);
    expect(values[0]).toBe(123);
    expect(values[1]).toBe('test_table');
  });
});
