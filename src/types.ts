import { PostgresError } from './errors';

export interface TableBase {
  Row: any;
  Insert: any;
  Update: any;
  Relationships: unknown[];
}

export interface DatabaseSchema {
  Tables: {
    [key: string]: TableBase;
  };
}

export type TableName<T extends DatabaseSchema> = keyof T['Tables'];
export type Row<T extends DatabaseSchema, K extends TableName<T>> = T['Tables'][K]['Row'];
export type InsertRow<T extends DatabaseSchema, K extends TableName<T>> = T['Tables'][K]['Insert'];
export type UpdateRow<T extends DatabaseSchema, K extends TableName<T>> = T['Tables'][K]['Update'] & {
  modified_at?: string;
  updated_at?: string;
};

export interface SupaliteConfig {
  user?: string;
  host?: string;
  database?: string;
  password?: string;
  port?: number;
  ssl?: boolean;
  schema?: string;
}

export type QueryType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT';

export interface QueryOptions {
  limit?: number;
  offset?: number;
  order?: {
    column: string;
    ascending?: boolean;
  };
}

export interface FilterOptions {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike';
  value: any;
}

export type BaseResult = {
  error: PostgresError | null;
  count: number | null;
  status: number;
  statusText: string;
  statusCode?: number;
};

export type QueryResult<T = any> = BaseResult & {
  data: T[] | null;
};

export type SingleQueryResult<T = any> = BaseResult & {
  data: T | null;
};
