import { Pool } from 'pg';
import { SupaLitePG } from '../postgres-client';
import { QueryBuilder } from '../query-builder';

// Mock the Pool and its query method, and the types object
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  };
  const mTypes = {
    setTypeParser: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool), types: mTypes };
});

describe('QueryBuilder: update() with .is()', () => {
  let client: SupaLitePG<any>;
  let pool: Pool;

  beforeEach(() => {
    pool = new Pool();
    client = new SupaLitePG({ connectionString: 'postgresql://mock' });
    // Mock getColumnPgType to return a default type
    (client as any).getColumnPgType = jest.fn().mockResolvedValue('text');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate correct SQL for update with is(null) condition', async () => {
    const qb = new QueryBuilder(pool, client, 'order_menu_items', 'public')
      .update({ 
        order_closed_time: new Date().toISOString(), 
        last_act_member_owner_id: 123 
      })
      .eq('table_name', 'test_table')
      .eq('menu_id', 456)
      .is('order_closed_time', null)
      .select();

    // Access the private buildQuery method for testing purposes
    const { query, values } = await (qb as any).buildQuery();

    // The update values come first ($1, $2), then the where clause values ($3, $4)
    // "order_closed_time" IS NULL does not use a placeholder
    
    expect(query).toContain('UPDATE "public"."order_menu_items" SET');
    expect(query).toContain('"order_closed_time" = $1');
    expect(query).toContain('"last_act_member_owner_id" = $2');
    expect(query).toContain('WHERE "table_name" = $3 AND "menu_id" = $4 AND "order_closed_time" IS NULL');
    expect(query).toContain('RETURNING *'); // due to .select()

    expect(values).toHaveLength(4);
    expect(values[2]).toBe('test_table');
    expect(values[3]).toBe(456);
  });
});
