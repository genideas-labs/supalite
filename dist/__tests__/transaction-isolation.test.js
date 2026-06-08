"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_client_1 = require("../postgres-client");
const pg_1 = require("pg");
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
        const sql = [];
        return {
            sql,
            query: jest.fn((text) => {
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
const pgMock = jest.requireMock('pg');
const makeClient = () => pgMock.__makeClient();
const poolConnect = () => pgMock.__mPool.connect;
const poolOn = () => pgMock.__mPool.on;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const privateOf = (c, key) => c[key];
describe('transaction isolation (concurrency-safe scope)', () => {
    beforeEach(() => {
        poolConnect().mockReset();
        poolOn().mockClear();
        pgMock.__mPool.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
        pg_1.Pool.mockClear();
    });
    it('gives each concurrent transaction its own pooled connection', async () => {
        const a = makeClient();
        const b = makeClient();
        poolConnect().mockResolvedValueOnce(a).mockResolvedValueOnce(b);
        const client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
        let release;
        const gate = new Promise((r) => (release = r));
        const seen = [];
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
        const client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
        let insideClient;
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
        const client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
        const result = await client.transaction(async () => 'payload');
        expect(result).toBe('payload');
        expect(c.sql).toEqual(['BEGIN', 'COMMIT']);
        expect(c.release).toHaveBeenCalledTimes(1);
    });
    it('does not re-run the process-global BIGINT type parser when creating a transaction scope', async () => {
        const c = makeClient();
        poolConnect().mockResolvedValueOnce(c);
        const setTypeParser = pgMock.types.setTypeParser;
        const client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
        const callsAfterConstruct = setTypeParser.mock.calls.length;
        await client.transaction(async () => undefined);
        // The scope reuses the global parser the owner already set; re-running it
        // per transaction could flip BIGINT parsing for other clients in the process.
        expect(setTypeParser.mock.calls.length).toBe(callsAfterConstruct);
    });
    it('shares read-mostly metadata caches between parent and transaction scope', async () => {
        const c = makeClient();
        poolConnect().mockResolvedValueOnce(c);
        const client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let scope;
        await client.transaction(async (tx) => {
            scope = tx;
        });
        expect(scope.schemaCache).toBe(privateOf(client, 'schemaCache'));
        expect(scope.foreignKeyCache).toBe(privateOf(client, 'foreignKeyCache'));
    });
    it('transaction scopes do not attach error listeners to the shared pool', async () => {
        poolConnect().mockImplementation(() => Promise.resolve(makeClient()));
        const client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
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
    const clientThatFailsOn = (failing, message) => {
        const c = makeClient();
        c.query.mockImplementation((text) => {
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
        const client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
        await expect(client.begin()).rejects.toThrow('begin failed');
        expect(c.release).toHaveBeenCalledTimes(1);
        // Pass the error to release() so pg discards the possibly-broken connection.
        expect(c.release).toHaveBeenCalledWith(expect.any(Error));
        expect(privateOf(client, 'client')).toBeNull();
        expect(privateOf(client, 'isTransaction')).toBe(false);
    });
    it('releases the connection if COMMIT fails', async () => {
        const c = clientThatFailsOn('COMMIT', 'commit failed');
        poolConnect().mockResolvedValueOnce(c);
        const client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
        await client.begin();
        await expect(client.commit()).rejects.toThrow('commit failed');
        expect(c.release).toHaveBeenCalledTimes(1);
        expect(c.release).toHaveBeenCalledWith(expect.any(Error)); // discard broken client
        expect(privateOf(client, 'client')).toBeNull();
        expect(privateOf(client, 'isTransaction')).toBe(false);
    });
    it('releases the connection if ROLLBACK fails', async () => {
        const c = clientThatFailsOn('ROLLBACK', 'rollback failed');
        poolConnect().mockResolvedValueOnce(c);
        const client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
        await client.begin();
        await expect(client.rollback()).rejects.toThrow('rollback failed');
        expect(c.release).toHaveBeenCalledTimes(1);
        expect(c.release).toHaveBeenCalledWith(expect.any(Error)); // discard broken client
        expect(privateOf(client, 'client')).toBeNull();
        expect(privateOf(client, 'isTransaction')).toBe(false);
    });
    it('returns a healthy connection (no error) to the pool after a successful commit', async () => {
        const c = makeClient();
        poolConnect().mockResolvedValueOnce(c);
        const client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
        await client.transaction(async () => undefined);
        // A clean commit must NOT mark the connection broken — release with no error.
        expect(c.release).toHaveBeenCalledTimes(1);
        expect(c.release).toHaveBeenCalledWith(undefined);
    });
    it('surfaces the callback error even when ROLLBACK also fails (no masking)', async () => {
        const c = clientThatFailsOn('ROLLBACK', 'rollback failed');
        poolConnect().mockResolvedValueOnce(c);
        const client = new postgres_client_1.SupaLitePG({ connectionString: 'postgresql://mock' });
        await expect(client.transaction(async () => {
            throw new Error('callback boom');
        })).rejects.toThrow('callback boom');
        // Connection is still returned to the pool despite the rollback failure.
        expect(c.release).toHaveBeenCalledTimes(1);
    });
});
