import { Pool } from 'pg';
import { SupaLitePG } from '../postgres-client';
import { QueryBuilder } from '../query-builder';

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

const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('QueryBuilder or() nested parsing', () => {
  let client: SupaLitePG<any>;
  let pool: Pool;

  beforeEach(() => {
    pool = new Pool();
    client = new SupaLitePG({ connectionString: 'postgresql://mock' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should build or() with nested and(...) for keyset pagination', async () => {
    const qb = new QueryBuilder(pool, client, 'priv_images', 'public')
      .select('id,created_at')
      .or('created_at.lt.2026-02-13T09:09:32.000Z,and(created_at.eq.2026-02-13T09:09:32.000Z,id.lt.1462)');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual(['2026-02-13T09:09:32.000Z', '2026-02-13T09:09:32.000Z', '1462']);
    expect(normalizeSql(query)).toBe(
      'SELECT "id", "created_at" FROM "public"."priv_images" WHERE ("created_at" < $1 OR ("created_at" = $2 AND "id" < $3))'
    );
  });

  it('should build or() with nested or(...) groups', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('status.eq.active,or(role.eq.admin,role.eq.owner)');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual(['active', 'admin', 'owner']);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE ("status" = $1 OR ("role" = $2 OR "role" = $3))'
    );
  });

  it('should build or() with nested and/or composition', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('and(status.eq.active,or(role.eq.admin,role.eq.owner))');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual(['active', 'admin', 'owner']);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE (("status" = $1 AND ("role" = $2 OR "role" = $3)))'
    );
  });

  it('should support uppercase OR/AND group keywords', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('OR(status.eq.active,AND(role.eq.admin,id.gt.10))');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual(['active', 'admin', '10']);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE (("status" = $1 OR ("role" = $2 AND "id" > $3)))'
    );
  });

  it('should build deeply nested and/or groups', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('or(and(status.eq.active,role.eq.admin),and(status.eq.pending,or(role.eq.owner,role.eq.editor)))');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual(['active', 'admin', 'pending', 'owner', 'editor']);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE ((("status" = $1 AND "role" = $2) OR ("status" = $3 AND ("role" = $4 OR "role" = $5))))'
    );
  });

  it('should parse quoted values inside nested groups', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('and(email.eq."first.last@example.com",name.eq."last, first")');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual(['first.last@example.com', 'last, first']);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE (("email" = $1 AND "name" = $2))'
    );
  });

  it('should parse escaped dot/comma values inside nested groups', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('and(slug.eq.v1\\.2,title.eq.hello\\,world)');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual(['v1.2', 'hello,world']);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE (("slug" = $1 AND "title" = $2))'
    );
  });

  it('should support now() and is.null inside nested groups', async () => {
    const qb = new QueryBuilder(pool, client, 'credits', 'public')
      .select('*')
      .or('and(valid_until.gt.now(),deleted_at.is.null)');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual([]);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."credits" WHERE (("valid_until" > NOW() AND "deleted_at" IS NULL))'
    );
  });

  it('should preserve placeholder ordering with previous where clauses', async () => {
    const qb = new QueryBuilder(pool, client, 'priv_images', 'public')
      .select('*')
      .eq('tenant_id', 42)
      .or('and(status.eq.active,id.gt.10),created_at.lt.2026-02-13T00:00:00.000Z');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual([42, 'active', '10', '2026-02-13T00:00:00.000Z']);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."priv_images" WHERE "tenant_id" = $1 AND (("status" = $2 AND "id" > $3) OR "created_at" < $4)'
    );
  });

  it('should combine multiple or() calls with AND between groups', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('status.eq.active,role.eq.admin')
      .or('and(id.gt.10,id.lt.20)');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual(['active', 'admin', '10', '20']);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE ("status" = $1 OR "role" = $2) AND (("id" > $3 AND "id" < $4))'
    );
  });

  it('should support in operator inside nested groups', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('and(id.in.(1,2,3),status.eq.active)');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual(['1', '2', '3', 'active']);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE (("id" IN ($1,$2,$3) AND "status" = $4))'
    );
  });

  it('should support in operator with quoted values inside nested groups', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('and(role.in.("admin","super,user"),status.eq.active)');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual(['admin', 'super,user', 'active']);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE (("role" IN ($1,$2) AND "status" = $3))'
    );
  });

  it('should support in operator with null members', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('id.in.(1,null,3)');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual(['1', '3']);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE (("id" IN ($1,$2) OR "id" IS NULL))'
    );
  });

  it('should support not.eq and not.ilike inside nested groups', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('and(status.not.eq.inactive,email.not.ilike.%@spam.com)');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual(['inactive', '%@spam.com']);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE (("status" != $1 AND "email" NOT ILIKE $2))'
    );
  });

  it('should support not.is.null inside nested groups', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('deleted_at.not.is.null');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual([]);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE ("deleted_at" IS NOT NULL)'
    );
  });

  it('should support not.in operator', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('id.not.in.(1,2,3)');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual(['1', '2', '3']);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE ("id" NOT IN ($1,$2,$3))'
    );
  });

  it('should support not.in operator with null members', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('id.not.in.(1,null,3)');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual(['1', '3']);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE (("id" NOT IN ($1,$2) AND "id" IS NOT NULL))'
    );
  });

  it('should render FALSE for in with empty list', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('id.in.()');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual([]);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE (FALSE)'
    );
  });

  it('should render TRUE for not.in with empty list', async () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public')
      .select('*')
      .or('id.not.in.()');

    const { query, values } = await (qb as any).buildQuery();

    expect(values).toEqual([]);
    expect(normalizeSql(query)).toBe(
      'SELECT * FROM "public"."users" WHERE (TRUE)'
    );
  });

  it('should throw for invalid operator inside nested groups', () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public').select('*');

    expect(() => qb.or('and(status.eq.active,id.foo.1)')).toThrow('Invalid operator: foo');
  });

  it('should throw for invalid column token inside nested groups', () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public').select('*');

    expect(() => qb.or('and(created-at.eq.1,id.eq.2)')).toThrow(
      'Invalid or() column: "created-at". Use "column.operator.value" or nested and(...)/or(...).'
    );
  });

  it('should throw a clear error for malformed nested or() groups', () => {
    const qb = new QueryBuilder(pool, client, 'priv_images', 'public').select('*');

    expect(() =>
      qb.or('created_at.lt.2026-02-13T09:09:32.000Z,and(created_at.eq.2026-02-13T09:09:32.000Z,id.lt.1462')
    ).toThrow('Malformed or() condition: unbalanced parentheses.');
  });

  it('should throw for unexpected closing parenthesis in or()', () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public').select('*');

    expect(() => qb.or('status.eq.active)')).toThrow(
      'Malformed or() condition: unexpected closing parenthesis.'
    );
  });

  it('should throw for unterminated quote in or()', () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public').select('*');

    expect(() => qb.or('name.eq."unterminated')).toThrow(
      'Malformed or() condition: unterminated double quote.'
    );
  });

  it('should throw for empty nested and(...) in or()', () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public').select('*');

    expect(() => qb.or('and()')).toThrow(
      'Invalid or() condition: and(...) requires at least one segment.'
    );
  });

  it('should throw for invalid leaf segment in or()', () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public').select('*');

    expect(() => qb.or('status.eq')).toThrow(
      'Invalid or() condition segment: "status.eq". Expected "column.operator.value".'
    );
  });

  it('should throw for invalid in list format in or()', () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public').select('*');

    expect(() => qb.or('id.in.123')).toThrow(
      'Invalid or() IN value: "123". Expected parenthesized list like "(a,b)".'
    );
  });

  it('should throw for related table filters inside nested or()', () => {
    const qb = new QueryBuilder(pool, client, 'users', 'public').select('*');

    expect(() => qb.or('and(status.eq.active,profiles.name.eq.john)')).toThrow(
      'or() does not support related table filters.'
    );
  });
});
