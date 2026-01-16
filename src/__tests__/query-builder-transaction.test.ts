import { SupaLitePG } from '../postgres-client';
import { Pool } from 'pg';

let mockPoolQuery: jest.Mock;
let mockClientQuery: jest.Mock;

jest.mock('pg', () => {
  const mPoolQuery = jest.fn();
  const mClientQuery = jest.fn();
  const mPool = {
    query: mPoolQuery,
    connect: jest.fn().mockResolvedValue({
      query: mClientQuery,
      release: jest.fn(),
    }),
    end: jest.fn(),
    on: jest.fn(),
  };
  return {
    Pool: jest.fn(() => mPool),
    types: {
      setTypeParser: jest.fn(),
    },
    __mockPoolQuery: mPoolQuery,
    __mockClientQuery: mClientQuery,
  };
});

const getMockPoolQuery = () =>
  (jest.requireMock('pg') as { __mockPoolQuery: jest.Mock }).__mockPoolQuery;
const getMockClientQuery = () =>
  (jest.requireMock('pg') as { __mockClientQuery: jest.Mock }).__mockClientQuery;

describe('QueryBuilder transaction execution', () => {
  let client: SupaLitePG<any>;

  beforeEach(() => {
    const pool = new Pool();
    mockPoolQuery = getMockPoolQuery() ?? (pool.query as jest.Mock);
    mockPoolQuery.mockReset();
    mockClientQuery = getMockClientQuery() ?? jest.fn();
    mockClientQuery.mockReset();
    client = new SupaLitePG({ connectionString: 'postgresql://mock' });
  });

  test('uses pool query outside of transactions', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }],
      rowCount: 1,
    });

    const result = await client.from('users').select('*');

    expect(result.data).toEqual([{ id: 1 }]);
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  test('uses transaction client inside a transaction', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 2 }], rowCount: 1 });

    await client.begin();
    const result = await client.from('users').select('*');

    expect(result.data).toEqual([{ id: 2 }]);
    expect(mockPoolQuery).not.toHaveBeenCalled();
    const selectCall = mockClientQuery.mock.calls.find((call) =>
      String(call[0]).startsWith('SELECT')
    );
    expect(selectCall).toBeTruthy();
  });
});
