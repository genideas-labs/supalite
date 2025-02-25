import { SupaliteConfig, QueryOptions, FilterOptions, DatabaseSchema } from './types';
import { SupaLitePG } from './postgres-client';

export class SupaliteClient<T extends DatabaseSchema> extends SupaLitePG<T> {
  constructor(config?: SupaliteConfig) {
    super(config);
  }
}

export { SupaLitePG } from './postgres-client';
export * from './types';
export * from './errors';
