import { SupaLitePG } from '../postgres-client';
import { Pool } from 'pg';

const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';

describe('concurrent transactions (isolated scope)', () => {
  let pool: Pool;
  let client: SupaLitePG<any>;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    await pool.query('DROP TABLE IF EXISTS concurrency_test;');
    await pool.query('CREATE TABLE concurrency_test (id INT PRIMARY KEY, label TEXT NOT NULL);');
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE concurrency_test;');
    client = new SupaLitePG<any>({ pool });
  });
  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS concurrency_test;');
    await pool.end();
  });

  it('runs two concurrent transactions on one client without interfering', async () => {
    await Promise.all([
      client.transaction(async (tx) => {
        await tx.from('concurrency_test').insert({ id: 1, label: 'a' });
      }),
      client.transaction(async (tx) => {
        await tx.from('concurrency_test').insert({ id: 2, label: 'b' });
      }),
    ]);
    const { rows } = await pool.query('SELECT id FROM concurrency_test ORDER BY id;');
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it('rolls back when the callback throws (no partial commit)', async () => {
    await expect(
      client.transaction(async (tx) => {
        await tx.from('concurrency_test').insert({ id: 3, label: 'c' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM concurrency_test;');
    expect(rows[0].n).toBe(0);
  });

  it('a non-transactional query on the shared client is unaffected during a transaction', async () => {
    // Hold a transaction open while issuing a read on the SAME shared client.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const txPromise = client.transaction(async (tx) => {
      await tx.from('concurrency_test').insert({ id: 4, label: 'd' });
      await gate; // keep the tx open
    });
    // While the tx is open, a read on the shared client must succeed (uses the pool, not the tx connection).
    const { data, error } = await client.from('concurrency_test').select('id');
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    release();
    await txPromise;
  });
});
