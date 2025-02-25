import { SupaliteConfig, QueryOptions, FilterOptions, SchemaBase, DefaultSchema } from './types';
import { SupaLitePG } from './postgres-client';
import { TableName } from './types';

export class SupaLiteClient<T extends SchemaBase = DefaultSchema> {
  private postgresClient: SupaLitePG<T>;

  constructor(private config: SupaliteConfig) {
    this.postgresClient = new SupaLitePG<T>({      
      database: config.database || 'postgres',
      user: config.user || 'postgres',
      password: config.password || 'postgres',
      port: config.port || 5432,
      ssl: config.ssl || false,
    });
  }

  from<K extends TableName<T>>(table: K) {
    return this.postgresClient.from<K>(table);
  }

  async rpc(procedureName: string, params: Record<string, any> = {}) {
    return this.postgresClient.rpc(procedureName, params);
  }

  async close() {
    await this.postgresClient.close();
  }
}
