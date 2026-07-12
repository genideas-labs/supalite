import { SupaLitePG } from '../postgres-client';
import { PostgresError } from '../errors';
import { Pool } from 'pg';
import { config } from 'dotenv';

config();

const connectionString =
  process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';

// Uniquely-named schema so this suite is fully self-contained and re-runnable.
const SCHEMA = 'supalite_cov';

// Read the private pool off a client for tests that must assert pool-level behavior
// (type-parser side effects, listener wiring). Mirrors external-pool-listeners.test.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const poolOf = (client: SupaLitePG<any>): Pool => (client as any).pool as Pool;

describe('postgres-client (live DB coverage)', () => {
  let setupPool: Pool;

  beforeAll(async () => {
    setupPool = new Pool({ connectionString });
    await setupPool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;`);
    await setupPool.query(`CREATE SCHEMA ${SCHEMA};`);
    await setupPool.query(`
      CREATE TABLE ${SCHEMA}.cov_authors (
        id serial PRIMARY KEY,
        name text
      );
    `);
    await setupPool.query(`
      CREATE TABLE ${SCHEMA}.cov_books (
        id serial PRIMARY KEY,
        title text,
        big_col bigint,
        author_id integer REFERENCES ${SCHEMA}.cov_authors(id)
      );
    `);
    await setupPool.query(`
      CREATE TABLE ${SCHEMA}.cov_unrelated (
        id serial PRIMARY KEY
      );
    `);
    await setupPool.query(`
      CREATE FUNCTION ${SCHEMA}.cov_add(a integer, b integer)
      RETURNS integer LANGUAGE sql AS $$ SELECT a + b $$;
    `);
    await setupPool.query(`INSERT INTO ${SCHEMA}.cov_authors (id, name) VALUES (1, 'A'), (2, 'B');`);
    await setupPool.query(
      `INSERT INTO ${SCHEMA}.cov_books (id, title, big_col, author_id) VALUES (1, 'x', 9007199254740992, 1);`
    );
  });

  afterAll(async () => {
    await setupPool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;`);
    await setupPool.end();
  });

  // --- Constructor paths -------------------------------------------------

  describe('constructor', () => {
    test('logs and does not own an externally supplied pool (verbose)', () => {
      const pool = new Pool({ connectionString });
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const client = new SupaLitePG({ pool, verbose: true });
      expect(logSpy).toHaveBeenCalledWith('[SupaLite VERBOSE] Using external Pool instance');
      // External pool must not receive supalite's error listener.
      expect(pool.listenerCount('error')).toBe(0);
      logSpy.mockRestore();
      void client;
      return pool.end();
    });

    test('throws (and logs) on a malformed connection string', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(() => new SupaLitePG({ connectionString: 'mysql://nope/db' })).toThrow(
        /Failed to establish database connection/
      );
      expect(errSpy).toHaveBeenCalledWith(
        '[SupaLite ERROR] Database connection error:',
        expect.stringContaining('Invalid PostgreSQL connection string format')
      );
      errSpy.mockRestore();
    });

    test('uses individual DB_* parameters and logs them masked when verbose', async () => {
      const saved = process.env.DB_CONNECTION;
      delete process.env.DB_CONNECTION;
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let client: SupaLitePG<any> | undefined;
      try {
        client = new SupaLitePG({
          verbose: true,
          host: 'localhost',
          user: 'testuser',
          database: 'testdb',
          password: 'secret',
          port: 5432,
        });
      } finally {
        if (saved !== undefined) process.env.DB_CONNECTION = saved;
      }
      const call = logSpy.mock.calls.find((c) =>
        String(c[0]).includes('individual parameters')
      );
      expect(call).toBeDefined();
      // Password must be redacted in the log payload.
      expect((call![1] as { password: string }).password).toBe('********');
      logSpy.mockRestore();
      await client!.close();
    });

    test('an owned pool logs when it emits an idle-client error', () => {
      const client = new SupaLitePG({ connectionString });
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      poolOf(client).emit('error', new Error('idle boom'));
      expect(errSpy).toHaveBeenCalledWith(
        '[SupaLite ERROR] Unexpected error on idle client',
        expect.any(Error)
      );
      errSpy.mockRestore();
      return client.close();
    });
  });

  // --- BIGINT type-parser branches --------------------------------------
  // The parser is a process-global side effect configured by the constructor.
  // Each test constructs the client and immediately queries with that same
  // client's pool so the branch under test is the active parser at parse time.

  describe('bigint transform parsers', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const readBigint = async (client: SupaLitePG<any>, literal: string) => {
      const r = await poolOf(client).query(`SELECT ${literal}::bigint AS v`);
      return r.rows[0].v;
    };

    test("'string' returns the raw string form", async () => {
      const client = new SupaLitePG({ connectionString, bigintTransform: 'string' });
      const v = await readBigint(client, `'9007199254740992'`);
      expect(typeof v).toBe('string');
      expect(v).toBe('9007199254740992');
      await client.close();
    });

    test("'number' coerces to Number, passes null through, and warns on unsafe values (verbose)", async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const client = new SupaLitePG({
        connectionString,
        bigintTransform: 'number',
        verbose: true,
      });
      const unsafe = await readBigint(client, `'9007199254740992'`);
      expect(typeof unsafe).toBe('number');
      expect(unsafe).toBe(9007199254740992);
      const nul = await readBigint(client, 'NULL');
      expect(nul).toBeNull();
      expect(
        warnSpy.mock.calls.some((c) => String(c[0]).includes('might lose precision'))
      ).toBe(true);
      warnSpy.mockRestore();
      await client.close();
    });

    test("'number-or-string' keeps precision as string for unsafe, Number for safe (verbose warns)", async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const client = new SupaLitePG({
        connectionString,
        bigintTransform: 'number-or-string',
        verbose: true,
      });
      const unsafe = await readBigint(client, `'9007199254740992'`);
      expect(typeof unsafe).toBe('string');
      expect(unsafe).toBe('9007199254740992');
      const safe = await readBigint(client, `'42'`);
      expect(typeof safe).toBe('number');
      expect(safe).toBe(42);
      expect(
        warnSpy.mock.calls.some((c) => String(c[0]).includes('exceeds safe integer range'))
      ).toBe(true);
      warnSpy.mockRestore();
      await client.close();
    });

    test("'bigint' returns a native BigInt", async () => {
      const client = new SupaLitePG({ connectionString, bigintTransform: 'bigint' });
      const v = await readBigint(client, `'9007199254740992'`);
      expect(typeof v).toBe('bigint');
      expect(v).toBe(9007199254740992n);
      await client.close();
    });
  });

  // --- getColumnPgType ---------------------------------------------------

  describe('getColumnPgType', () => {
    test('resolves real column types and serves subsequent lookups from cache', async () => {
      const client = new SupaLitePG({ connectionString });
      // First lookup: cache miss -> queries information_schema.
      const bigType = await client.getColumnPgType(SCHEMA, 'cov_books', 'big_col');
      expect(bigType).toBe('bigint');
      // Second lookup on the SAME table: cache hit branch.
      const intType = await client.getColumnPgType(SCHEMA, 'cov_books', 'author_id');
      expect(intType).toBe('integer');
      // Unknown column on a cached table -> undefined (not an error).
      const missing = await client.getColumnPgType(SCHEMA, 'cov_books', 'no_such_col');
      expect(missing).toBeUndefined();
      await client.close();
    });

    test('returns undefined (and logs) when the schema query fails', async () => {
      const client = new SupaLitePG({ connectionString });
      await client.close(); // ends the owned pool -> subsequent connect() throws
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const result = await client.getColumnPgType(SCHEMA, 'cov_books', 'big_col');
      expect(result).toBeUndefined();
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });

  // --- getForeignKey -----------------------------------------------------

  describe('getForeignKey', () => {
    test('detects a one-to-many relationship and caches the resolved value', async () => {
      const client = new SupaLitePG({ connectionString });
      const rel = await client.getForeignKey(SCHEMA, 'cov_authors', 'cov_books');
      expect(rel).toEqual({ column: 'id', foreignColumn: 'author_id', isArray: true });
      // Repeat call returns the very same cached object (cache-hit branch).
      const cached = await client.getForeignKey(SCHEMA, 'cov_authors', 'cov_books');
      expect(cached).toBe(rel);
      await client.close();
    });

    test('detects a many-to-one relationship (reverse lookup branch)', async () => {
      const client = new SupaLitePG({ connectionString });
      const rel = await client.getForeignKey(SCHEMA, 'cov_books', 'cov_authors');
      expect(rel).toEqual({ column: 'author_id', foreignColumn: 'id', isArray: false });
      await client.close();
    });

    test('returns null when no relationship exists and caches the null result', async () => {
      const client = new SupaLitePG({ connectionString });
      const rel = await client.getForeignKey(SCHEMA, 'cov_authors', 'cov_unrelated');
      expect(rel).toBeNull();
      // Cached null path.
      const cached = await client.getForeignKey(SCHEMA, 'cov_authors', 'cov_unrelated');
      expect(cached).toBeNull();
      await client.close();
    });
  });

  // --- rpc (RpcBuilder over a live function) ------------------------------

  describe('rpc', () => {
    test('calls a scalar function with named params and unwraps the scalar result', async () => {
      const client = new SupaLitePG({ connectionString, schema: SCHEMA });
      const res = await client.rpc('cov_add', { a: 2, b: 40 });
      expect(res.error).toBeNull();
      expect(res.data).toBe(42);
      expect(res.status).toBe(200);
      await client.close();
    });

    test('returns a PostgresError when the function does not exist (execute catch path)', async () => {
      const client = new SupaLitePG({ connectionString, schema: SCHEMA });
      const res = await client.rpc('cov_missing_fn', { a: 1 });
      expect(res.data).toBeNull();
      expect(res.error).toBeInstanceOf(PostgresError);
      expect(res.status).toBe(500);
      await client.close();
    });

    test('the RpcBuilder thenable supports .catch() and .finally()', async () => {
      const client = new SupaLitePG({ connectionString, schema: SCHEMA });
      // Exercises RpcBuilder.catch (execute() resolves, so onrejected is not hit,
      // but the method body runs).
      const viaCatch = await client.rpc('cov_add', { a: 1, b: 1 }).catch(() => null);
      expect(viaCatch && viaCatch.data).toBe(2);
      // Exercises RpcBuilder.finally.
      let ran = false;
      const viaFinally = await client.rpc('cov_add', { a: 3, b: 4 }).finally(() => {
        ran = true;
      });
      expect(ran).toBe(true);
      expect(viaFinally.data).toBe(7);
      await client.close();
    });
  });

  // --- testConnection & close -------------------------------------------

  describe('testConnection and close', () => {
    test('testConnection resolves true against a live database', async () => {
      const client = new SupaLitePG({ connectionString });
      await expect(client.testConnection()).resolves.toBe(true);
      await client.close();
    });

    test('testConnection resolves false (and logs) when the pool is unusable', async () => {
      const client = new SupaLitePG({ connectionString });
      await client.close(); // ends the owned pool
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      await expect(client.testConnection()).resolves.toBe(false);
      expect(errSpy).toHaveBeenCalledWith('Connection test failed:', expect.any(String));
      errSpy.mockRestore();
    });

    test('close() is a no-op for a non-owned (external) pool', async () => {
      const pool = new Pool({ connectionString });
      const client = new SupaLitePG({ pool });
      await client.close(); // must NOT end the external pool
      const r = await pool.query('SELECT 1 AS v');
      expect(r.rows[0].v).toBe(1);
      await pool.end();
    });
  });
});
