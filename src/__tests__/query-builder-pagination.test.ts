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

describe('QueryBuilder pagination (limit/offset/range)', () => {
  let client: SupaLitePG<any>;
  let pool: Pool;

  beforeEach(() => {
    pool = new Pool();
    client = new SupaLitePG({ connectionString: 'postgresql://mock' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate LIMIT and OFFSET for pagination', async () => {
    const qb = new QueryBuilder(pool, client, 'posts', 'public')
      .select('*')
      .limit(10)
      .offset(20);

    const { query } = await (qb as any).buildQuery();

    expect(query).toContain('SELECT * FROM "public"."posts"');
    expect(query).toContain('LIMIT 10');
    expect(query).toContain('OFFSET 20');
  });

  it('should translate range() into LIMIT and OFFSET', async () => {
    const qb = new QueryBuilder(pool, client, 'comments', 'public')
      .select('*')
      .range(5, 9);

    const { query } = await (qb as any).buildQuery();

    // range(from, to) => LIMIT (to - from + 1), OFFSET from
    expect(query).toContain('SELECT * FROM "public"."comments"');
    expect(query).toContain('LIMIT 5');
    expect(query).toContain('OFFSET 5');
  });
});
