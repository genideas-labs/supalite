import { PostgresError } from '../errors';

describe('PostgresError', () => {
  test('copies fields from a pg error object', () => {
    const err = new PostgresError('duplicate key', {
      code: '23505',
      detail: 'Key (id)=(1) already exists.',
      hint: 'use upsert',
      position: '12',
      schema: 'public',
      table: 'users',
      column: 'id',
      dataType: 'bigint',
      constraint: 'users_pkey',
    });
    expect(err.name).toBe('PostgresError');
    expect(err).toBeInstanceOf(PostgresError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('23505');
    expect(err.details).toBe('Key (id)=(1) already exists.');
    expect(err.hint).toBe('use upsert');
    expect(err.position).toBe('12');
    expect(err.schema).toBe('public');
    expect(err.table).toBe('users');
    expect(err.column).toBe('id');
    expect(err.dataType).toBe('bigint');
    expect(err.constraint).toBe('users_pkey');
  });

  test('extracts a PGRST code from the message when no code is given', () => {
    const err = new PostgresError('relation not found (PGRST116)');
    expect(err.code).toBe('PGRST116');
  });

  test('leaves code undefined when neither source provides one', () => {
    const err = new PostgresError('boom');
    expect(err.code).toBeUndefined();
  });

  test('toJSON round-trips the public fields', () => {
    const err = new PostgresError('x', { code: '42P01', detail: 'd' });
    expect(err.toJSON()).toEqual({
      message: 'x',
      code: '42P01',
      details: 'd',
      hint: undefined,
      position: undefined,
      schema: undefined,
      table: undefined,
      column: undefined,
      dataType: undefined,
      constraint: undefined,
    });
  });
});
