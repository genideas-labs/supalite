"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_client_1 = require("../postgres-client");
const pg_1 = require("pg");
const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';
describe('external pool error listeners', () => {
    it('does not attach an error listener to a pool it does not own', () => {
        const pool = new pg_1.Pool({ connectionString });
        const before = pool.listenerCount('error');
        // Construct several clients over the SAME external pool.
        new postgres_client_1.SupaLitePG({ pool });
        new postgres_client_1.SupaLitePG({ pool });
        new postgres_client_1.SupaLitePG({ pool });
        const after = pool.listenerCount('error');
        expect(after).toBe(before); // supalite must not add listeners to an external pool
        return pool.end();
    });
    it('does attach an error listener to a pool it creates itself', () => {
        const client = new postgres_client_1.SupaLitePG({ connectionString });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pool = client['pool'];
        expect(pool.listenerCount('error')).toBeGreaterThanOrEqual(1);
        return client.close();
    });
});
