import { SupaLitePG } from '../postgres-client';
import { Pool } from 'pg';

const connectionString =
  process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';

// Manual transaction API (#17 follow-up, feature 005): begin() returns a
// connection-scoped handle; the shared singleton is never mutated.
describe('manual transaction handle (begin/commit/rollback, scoped)', () => {
  let pool: Pool;
  let db: SupaLitePG<any>;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    await pool.query('DROP TABLE IF EXISTS manual_tx_test;');
    await pool.query('CREATE TABLE manual_tx_test (id INT PRIMARY KEY, label TEXT NOT NULL);');
  });
  beforeEach(async () => {
    await pool.query('TRUNCATE manual_tx_test;');
    db = new SupaLitePG<any>({ pool }); // shared "singleton"
  });
  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS manual_tx_test;');
    await pool.end();
  });

  it('commit persists the writes and does not mutate the shared singleton', async () => {
    const tx = await db.begin();
    // The shared singleton is untouched by begin().
    expect((db as any).isTransaction).toBe(false);
    expect((db as any).client).toBeNull();
    await tx.from('manual_tx_test').insert({ id: 1, label: 'a' });
    await tx.commit();

    const { rows } = await pool.query('SELECT id FROM manual_tx_test ORDER BY id;');
    expect(rows.map((r) => r.id)).toEqual([1]);
  });

  it('rollback discards the writes (atomicity)', async () => {
    const tx = await db.begin();
    await tx.from('manual_tx_test').insert({ id: 2, label: 'b' });
    await tx.rollback();

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM manual_tx_test;');
    expect(rows[0].n).toBe(0);
  });

  it('two concurrent handles are isolated (one commits, one rolls back)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));

    const aHandle = await db.begin();
    const aDone = (async () => {
      await aHandle.from('manual_tx_test').insert({ id: 1, label: 'a' });
      await gate; // overlap with B
      await aHandle.rollback();
    })();

    const bHandle = await db.begin();
    await bHandle.from('manual_tx_test').insert({ id: 2, label: 'b' });
    await bHandle.commit();

    release();
    await aDone;

    const { rows } = await pool.query('SELECT id FROM manual_tx_test ORDER BY id;');
    expect(rows.map((r) => r.id)).toEqual([2]); // A rolled back; only B survived
  });

  it('a non-transactional query on the shared singleton is unaffected during an open handle', async () => {
    const tx = await db.begin();
    await tx.from('manual_tx_test').insert({ id: 5, label: 'e' });

    // A read on the shared singleton uses the pool, not the tx connection, and
    // must not see the uncommitted row.
    const { data, error } = await db.from('manual_tx_test').select('id');
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect((data as { id: number }[]).length).toBe(0);

    await tx.rollback();
  });

  it('returns the connection to the pool on commit, rollback, and mid-tx exception (no leak, max:1)', async () => {
    const tightPool = new Pool({ connectionString, max: 1 });
    try {
      const tight = new SupaLitePG<any>({ pool: tightPool });

      // commit path
      const t1 = await tight.begin();
      await t1.from('manual_tx_test').insert({ id: 10, label: 'x' });
      await t1.commit();

      // rollback path
      const t2 = await tight.begin();
      await t2.from('manual_tx_test').insert({ id: 11, label: 'y' });
      await t2.rollback();

      // mid-tx exception path (caller rolls back)
      const t3 = await tight.begin();
      try {
        await t3.from('manual_tx_test').insert({ id: 12, label: 'z' });
        throw new Error('boom');
      } catch {
        await t3.rollback();
      }

      // If any path leaked the single connection, this would hang until timeout.
      const { rows } = await tightPool.query('SELECT id FROM manual_tx_test ORDER BY id;');
      expect(rows.map((r) => r.id)).toEqual([10]); // only the committed row
    } finally {
      await tightPool.end();
    }
  });

  it('commit()/rollback() with no active transaction throw', async () => {
    await expect(db.commit()).rejects.toThrow('no active transaction');
    await expect(db.rollback()).rejects.toThrow('no active transaction');
  });

  it('nested begin() on an open handle throws', async () => {
    const tx = await db.begin();
    try {
      await expect(tx.begin()).rejects.toThrow('nested transactions are not supported');
    } finally {
      await tx.rollback();
    }
  });

  it('a handle is single-use: commit() then commit() again throws', async () => {
    const tx = await db.begin();
    await tx.from('manual_tx_test').insert({ id: 7, label: 'g' });
    await tx.commit();
    await expect(tx.commit()).rejects.toThrow('no active transaction');
  });
});
