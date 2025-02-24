import { SupabaseConfig, QueryOptions, FilterOptions } from './types';
import { PostgresClient } from './postgres-client';
import { TableName } from './types';

export class SupabaseClient {
  private postgresClient: PostgresClient;

  constructor(private config: SupabaseConfig) {
    this.postgresClient = new PostgresClient({
      host: new URL(config.supabaseUrl).hostname,
      database: 'postgres',
      user: 'postgres',
      password: config.supabaseKey,
      port: 5432,
      ssl: true,
    });
  }

  from<T extends TableName>(table: T) {
    return this.postgresClient.from<T>(table);
  }

  async rpc(procedureName: string, params: Record<string, any> = {}) {
    return this.postgresClient.rpc(procedureName, params);
  }

  async close() {
    await this.postgresClient.close();
  }
}
