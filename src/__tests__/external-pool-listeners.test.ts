import { SupaLitePG } from '../postgres-client';
import { Pool } from 'pg';

const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';

describe('external pool error listeners', () => {
  it('does not attach an error listener to a pool it does not own', () => {
    const pool = new Pool({ connectionString });
    const before = pool.listenerCount('error');
    // Construct several clients over the SAME external pool.
    new SupaLitePG({ pool });
    new SupaLitePG({ pool });
    new SupaLitePG({ pool });
    const after = pool.listenerCount('error');
    expect(after).toBe(before); // supalite must not add listeners to an external pool
    return pool.end();
  });

  it('does attach an error listener to a pool it creates itself', () => {
    const client = new SupaLitePG({ connectionString });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = (client as any)['pool'] as Pool;
    expect(pool.listenerCount('error')).toBeGreaterThanOrEqual(1);
    return client.close();
  });
});
