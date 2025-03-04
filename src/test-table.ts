import { SupaLitePG } from './postgres-client';
import { Database } from './database.types';

export async function insertIntoTestTable(
  client: SupaLitePG<any>,
  name: string,
  value: number
) {
  const { data, error } = await client
    .from('test_table')
    .insert({ name, value })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getFromTestTable(
  client: SupaLitePG<any>,
  conditions: { [key: string]: any }
) {
  const { data, error } = await client.from('test_table').select('*').match(conditions);

  if (error) {
    throw error;
  }

  return data;
}
