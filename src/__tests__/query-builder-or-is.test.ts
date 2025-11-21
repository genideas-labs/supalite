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

describe('QueryBuilder: or() with .is()', () => {
  let client: SupaLitePG<any>;
  let pool: Pool;

  beforeEach(() => {
    pool = new Pool();
    client = new SupaLitePG({ connectionString: 'postgresql://mock' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate correct SQL for or() with is(null) condition', async () => {
    const qb = new QueryBuilder(pool, client, 'credits', 'public')
      .select('*')
      .eq('wallet_id', 123)
      .gt('amount', 0)
      .or('valid_until.is.null,valid_until.gt.now()');

    // Access the private buildQuery method for testing purposes
    const { query, values } = await (qb as any).buildQuery();

    // Expected SQL structure:
    // SELECT * FROM "public"."credits" WHERE "wallet_id" = $1 AND "amount" > $2 AND ("valid_until" IS NULL OR "valid_until" > $3)
    
    expect(query).toContain('SELECT * FROM "public"."credits"');
    expect(query).toContain('WHERE "wallet_id" = $1 AND "amount" > $2 AND ("valid_until" IS NULL OR "valid_until" > $3)');

    expect(values).toHaveLength(3);
    expect(values[0]).toBe(123);
    expect(values[1]).toBe(0);
    expect(values[2]).toBe('now()'); // now() is treated as a string value
  });
});
