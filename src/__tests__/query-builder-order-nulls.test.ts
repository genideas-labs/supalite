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

describe('QueryBuilder: order() with nullsFirst', () => {
  let client: SupaLitePG<any>;
  let pool: Pool;

  beforeEach(() => {
    pool = new Pool();
    client = new SupaLitePG({ connectionString: 'postgresql://mock' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should add NULLS FIRST when nullsFirst is true', async () => {
    const qb = new QueryBuilder(pool, client, 'shop_gen_images', 'public')
      .select('*')
      .eq('request_hash', 'abc')
      .order('is_final', { ascending: true })
      .order('pass_no', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true });

    const { query, values } = await (qb as any).buildQuery();

    expect(query).toContain('WHERE "request_hash" = $1');
    expect(values).toEqual(['abc']);
    expect(query).toContain('ORDER BY "is_final" ASC, "pass_no" ASC NULLS FIRST, "created_at" ASC');
  });
});
