import { SupaLitePG } from '../postgres-client';
import { Pool } from 'pg';

/**
 * Deterministic, DB-free regression tests for the concurrency-safe transaction
 * rework. Each test pins a guarantee that the previous (shared-instance-state)
 * design violated:
 *   - each transaction() acquires its OWN pooled connection
 *   - transaction() never mutates the parent instance's tx state
 *   - begin()/commit()/rollback() always release the connection (no leak),
 *     even when BEGIN/COMMIT/ROLLBACK throws
 *   - a failing rollback never masks the original callback error
 *
 * pg is mocked so pool.connect() hands out a fresh, individually-inspectable
 * fake client per call — that's what lets us prove isolation.
 */
jest.mock('pg', () => {
  const makeClient = () => {
    const sql: string[] = [];
    return {
      sql,
      query: jest.fn((text: unknown) => {
        sql.push(String(text));
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
      release: jest.fn(),
    };
  };
  const connect = jest.fn();
  const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const on = jest.fn();
  const mPool = { query, connect, on, end: jest.fn() };
  return {
    Pool: jest.fn(() => mPool),
    types: { setTypeParser: jest.fn() },
    __makeClient: makeClient,
    __mPool: mPool,
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pgMock = jest.requireMock('pg') as any;
const makeClient = (): { sql: string[]; query: jest.Mock; release: jest.Mock } =>
  pgMock.__makeClient();
const poolConnect = (): jest.Mock => pgMock.__mPool.connect;
const poolOn = (): jest.Mock => pgMock.__mPool.on;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const privateOf = (c: SupaLitePG<any>, key: string): any => (c as any)[key];

describe('transaction isolation (concurrency-safe scope)', () => {
  beforeEach(() => {
    poolConnect().mockReset();
    poolOn().mockClear();
    pgMock.__mPool.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    (Pool as unknown as jest.Mock).mockClear();
  });

  it('gives each concurrent transaction its own pooled connection', async () => {
    const a = makeClient();
    const b = makeClient();
    poolConnect().mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    const client = new SupaLitePG({ connectionString: 'postgresql://mock' });

    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const seen: unknown[] = [];

    // Hold transaction A open so B is forced onto a second connection.
    const aDone = client.transaction(async (tx) => {
      seen.push(tx.getQueryClient());
      await gate;
    });
    const bDone = client.transaction(async (tx) => {
      seen.push(tx.getQueryClient());
    });

    await bDone;
    release();
    await aDone;

    expect(poolConnect()).toHaveBeenCalledTimes(2);
    expect(seen[0]).toBe(a);
    expect(seen[1]).toBe(b);
    expect(seen[0]).not.toBe(seen[1]);
    // Both connections returned to the pool.
    expect(a.release).toHaveBeenCalledTimes(1);
    expect(b.release).toHaveBeenCalledTimes(1);
  });

  it('does not mutate the parent instance tx state during or after a transaction', async () => {
    const c = makeClient();
    poolConnect().mockResolvedValueOnce(c);
    const client = new SupaLitePG({ connectionString: 'postgresql://mock' });

    let insideClient: unknown;
    await client.transaction(async (tx) => {
      insideClient = tx.getQueryClient();
      // While the isolated tx runs, the PARENT stays non-transactional and
      // keeps routing to the pool — that's the whole point of the fix.
      expect(client.getQueryClient()).toBe(privateOf(client, 'pool'));
      expect(privateOf(client, 'isTransaction')).toBe(false);
      expect(privateOf(client, 'client')).toBeNull();
    });

    expect(insideClient).toBe(c);
    expect(privateOf(client, 'isTransaction')).toBe(false);
    expect(privateOf(client, 'client')).toBeNull();
  });

  it('transaction() resolves with the callback return value and runs BEGIN/COMMIT', async () => {
    const c = makeClient();
    poolConnect().mockResolvedValueOnce(c);
    const client = new SupaLitePG({ connectionString: 'postgresql://mock' });

    const result = await client.transaction(async () => 'payload');

    expect(result).toBe('payload');
    expect(c.sql).toEqual(['BEGIN', 'COMMIT']);
    expect(c.release).toHaveBeenCalledTimes(1);
  });

  it('shares read-mostly metadata caches between parent and transaction scope', async () => {
    const c = makeClient();
    poolConnect().mockResolvedValueOnce(c);
    const client = new SupaLitePG({ connectionString: 'postgresql://mock' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scope: any;
    await client.transaction(async (tx) => {
      scope = tx;
    });

    expect(scope.schemaCache).toBe(privateOf(client, 'schemaCache'));
    expect(scope.foreignKeyCache).toBe(privateOf(client, 'foreignKeyCache'));
  });

  it('transaction scopes do not attach error listeners to the shared pool', async () => {
    poolConnect().mockImplementation(() => Promise.resolve(makeClient()));
    const client = new SupaLitePG({ connectionString: 'postgresql://mock' });

    // The owner attaches exactly one 'error' listener at construction.
    const ownerErrorListeners = poolOn().mock.calls.filter((args) => args[0] === 'error').length;
    expect(ownerErrorListeners).toBe(1);

    await client.transaction(async () => undefined);
    await client.transaction(async () => undefined);

    // Each transaction forks an isolated scope over the same pool; none of them
    // may add another 'error' listener (that was the external-pool leak).
    const afterErrorListeners = poolOn().mock.calls.filter((args) => args[0] === 'error').length;
    expect(afterErrorListeners).toBe(1);
  });
});

describe('transaction connection cleanup on failure', () => {
  beforeEach(() => {
    poolConnect().mockReset();
    poolOn().mockClear();
    pgMock.__mPool.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
  });

  const clientThatFailsOn = (failing: string, message: string) => {
    const c = makeClient();
    c.query.mockImplementation((text: unknown) => {
      c.sql.push(String(text));
      return String(text) === failing
        ? Promise.reject(new Error(message))
        : Promise.resolve({ rows: [], rowCount: 0 });
    });
    return c;
  };

  it('releases the connection if BEGIN fails (no leak)', async () => {
    const c = clientThatFailsOn('BEGIN', 'begin failed');
    poolConnect().mockResolvedValueOnce(c);
    const client = new SupaLitePG({ connectionString: 'postgresql://mock' });

    await expect(client.begin()).rejects.toThrow('begin failed');
    expect(c.release).toHaveBeenCalledTimes(1);
    expect(privateOf(client, 'client')).toBeNull();
    expect(privateOf(client, 'isTransaction')).toBe(false);
  });

  it('releases the connection if COMMIT fails', async () => {
    const c = clientThatFailsOn('COMMIT', 'commit failed');
    poolConnect().mockResolvedValueOnce(c);
    const client = new SupaLitePG({ connectionString: 'postgresql://mock' });

    await client.begin();
    await expect(client.commit()).rejects.toThrow('commit failed');
    expect(c.release).toHaveBeenCalledTimes(1);
    expect(privateOf(client, 'client')).toBeNull();
    expect(privateOf(client, 'isTransaction')).toBe(false);
  });

  it('releases the connection if ROLLBACK fails', async () => {
    const c = clientThatFailsOn('ROLLBACK', 'rollback failed');
    poolConnect().mockResolvedValueOnce(c);
    const client = new SupaLitePG({ connectionString: 'postgresql://mock' });

    await client.begin();
    await expect(client.rollback()).rejects.toThrow('rollback failed');
    expect(c.release).toHaveBeenCalledTimes(1);
    expect(privateOf(client, 'client')).toBeNull();
    expect(privateOf(client, 'isTransaction')).toBe(false);
  });

  it('surfaces the callback error even when ROLLBACK also fails (no masking)', async () => {
    const c = clientThatFailsOn('ROLLBACK', 'rollback failed');
    poolConnect().mockResolvedValueOnce(c);
    const client = new SupaLitePG({ connectionString: 'postgresql://mock' });

    await expect(
      client.transaction(async () => {
        throw new Error('callback boom');
      }),
    ).rejects.toThrow('callback boom');
    // Connection is still returned to the pool despite the rollback failure.
    expect(c.release).toHaveBeenCalledTimes(1);
  });
});
