import { Pool } from 'pg';
import { SupaLitePG } from '../postgres-client';
import { QueryBuilder } from '../query-builder';

// Mock the Pool and its query method, and the types object
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    end: jest.fn(),
    on: jest.fn(), // Add 'on' method to the mock pool
  };
  const mTypes = {
    setTypeParser: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool), types: mTypes };
});

describe('QueryBuilder: not()', () => {
  let client: SupaLitePG<any>;
  let pool: Pool;

  beforeEach(() => {
    pool = new Pool();
    // SupaLitePG는 내부적으로 Pool을 생성하므로, 테스트에서는
    // jest.mock을 통해 모의 Pool이 사용되도록 설정합니다.
    // 생성자에 pool을 직접 전달하는 대신, connectionString을 모의로 전달하거나
    // 아무것도 전달하지 않아도 됩니다.
    client = new SupaLitePG({ connectionString: 'postgresql://mock' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate a "IS NOT NULL" condition for .not("column", "is", null)', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('name')
      .not('email', 'is', null);

    // Access the private buildQuery method for testing purposes
    const { query } = await (qb as any).buildQuery();

    expect(query).toContain('WHERE "email" IS NOT NULL');
  });

  it('should throw an error for unsupported operators in .not()', () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public');

    expect(() => {
      qb.not('status', 'eq', 'active');
    }).toThrow('Operator "eq" is not supported for "not" operation.');
  });

  it('should handle multiple conditions including .not()', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .eq('status', 'active')
      .not('deleted_at', 'is', null);

    const { query } = await (qb as any).buildQuery();

    expect(query).toContain('WHERE "status" = $1 AND "deleted_at" IS NOT NULL');
  });
});
