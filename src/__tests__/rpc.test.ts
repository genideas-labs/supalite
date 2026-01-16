import { SupaLitePG } from '../postgres-client';
import { PostgresError } from '../errors';
import { Pool } from 'pg';

// Mock pg
jest.mock('pg', () => {
  const mQuery = jest.fn();
  const mPool = {
    query: mQuery,
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue({
      release: jest.fn(),
      query: mQuery
    }),
    end: jest.fn()
  };
  return {
    Pool: jest.fn(() => mPool),
    types: {
      setTypeParser: jest.fn()
    }
  };
});

describe('SupaLitePG rpc', () => {
  let client: SupaLitePG<any>;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    // Pool 생성자가 mockPool을 반환하므로, 새 Pool을 만들어서 mockQuery에 접근
    const pool = new Pool(); 
    mockQuery = pool.query as jest.Mock;
    mockQuery.mockReset();
    
    client = new SupaLitePG();
  });

  const mockScalarReturn = () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ proretset: false, typtype: 'b', typname: 'int4' }],
      rowCount: 1
    });
  };

  const mockSetReturn = () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ proretset: true, typtype: 'c', typname: 'record' }],
      rowCount: 1
    });
  };

  test('rpc() should return multiple rows by default', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }, { id: 2 }],
      rowCount: 2
    });

    const result = await client.rpc('get_users');
    expect(result.data).toHaveLength(2);
    expect(result.error).toBeNull();
    expect(result.count).toBe(2);
  });

  test('rpc() should return empty array when no rows are found', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0
    });

    const result = await client.rpc('get_users');
    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
    expect(result.count).toBe(0);
  });

  test('rpc().single() should return single object if 1 row returned (multi-column)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'user' }],
      rowCount: 1
    });

    const result = await client.rpc('get_user').single();
    expect(result.data).toEqual({ id: 1, name: 'user' });
    expect(result.error).toBeNull();
  });

  test('rpc().single() should error if 0 rows returned', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0
    });

    const result = await client.rpc('get_user').single();
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(PostgresError);
    expect(result.error?.message).toContain('PGRST116'); // No rows found
    expect(result.error?.code).toBe('PGRST116');
  });

  test('rpc().single() should error if multiple rows returned', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }, { id: 2 }],
      rowCount: 2
    });

    const result = await client.rpc('get_user').single();
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(PostgresError);
    expect(result.error?.message).toContain('PGRST114'); // Multiple rows returned
    expect(result.error?.code).toBe('PGRST114');
  });

  test('rpc().maybeSingle() should return single object if 1 row returned (multi-column)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'user' }],
      rowCount: 1
    });

    const result = await client.rpc('get_user').maybeSingle();
    expect(result.data).toEqual({ id: 1, name: 'user' });
    expect(result.error).toBeNull();
  });

  test('rpc().maybeSingle() should return null data if 0 rows returned', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0
    });

    const result = await client.rpc('get_user').maybeSingle();
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });

  test('rpc().maybeSingle() should error if multiple rows returned', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }, { id: 2 }],
      rowCount: 2
    });

    const result = await client.rpc('get_user').maybeSingle();
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(PostgresError);
    expect(result.error?.message).toContain('PGRST114');
    expect(result.error?.code).toBe('PGRST114');
  });

  test('rpc() should unwrap scalar return values', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ get_count: 42 }], // scalar return is 1 row, 1 column
      rowCount: 1
    });
    mockScalarReturn();

    const result = await client.rpc('get_count');
    expect(result.data).toBe(42);
    expect(result.error).toBeNull();
  });

  test('rpc().single() should unwrap scalar return values', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ get_count: 42 }],
      rowCount: 1
    });
    mockScalarReturn();

    const result = await client.rpc('get_count').single();
    expect(result.data).toBe(42);
    expect(result.error).toBeNull();
  });

  test('rpc() should not unwrap set-returning single-column results', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ value: 1 }],
      rowCount: 1
    });
    mockSetReturn();

    const result = await client.rpc('get_values');
    expect(result.data).toEqual([{ value: 1 }]);
    expect(result.error).toBeNull();
  });
});
