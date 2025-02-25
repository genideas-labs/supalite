import { PostgresError } from './errors';

export interface DefaultSchema {
  Tables: {
    [key: string]: {
      Row: Record<string, unknown>;
      Insert: Record<string, unknown>;
      Update: Record<string, unknown>;
      Relationships: unknown[];
    };
  };
  Views: {
    [key: string]: {
      Row: Record<string, unknown>;
    };
  };
  Functions: {
    [key: string]: {
      Args: Record<string, unknown>;
      Returns: unknown;
    };
  };
  Enums: {
    [key: string]: string[];
  };
  CompositeTypes: {
    [key: string]: {
      [key: string]: unknown;
    };
  };
}

export interface SchemaBase {
  Tables: {
    [key: string]: {
      Row: Record<string, unknown>;
      Insert: Record<string, unknown>;
      Update: Record<string, unknown>;
      Relationships: unknown[];
    };
  };
  Views: {
    [key: string]: {
      Row: Record<string, unknown>;
    };
  };
  Functions: {
    [key: string]: {
      Args: Record<string, unknown>;
      Returns: unknown;
    };
  };
  Enums: {
    [key: string]: string[];
  };
  CompositeTypes: {
    [key: string]: {
      [key: string]: unknown;
    };
  };
}

export type DatabaseSchema<T extends SchemaBase = DefaultSchema> = {
  [K in keyof T]: T[K];
};

export type TableName<T extends SchemaBase = DefaultSchema> = keyof T['Tables'];
export type ViewName<T extends SchemaBase = DefaultSchema> = keyof T['Views'];
export type FunctionName<T extends SchemaBase = DefaultSchema> = keyof T['Functions'];
export type EnumName<T extends SchemaBase = DefaultSchema> = keyof T['Enums'];
export type Row<T extends SchemaBase = DefaultSchema, K extends TableName<T> = TableName<T>> = T['Tables'][K]['Row'];
export type InsertRow<T extends SchemaBase = DefaultSchema, K extends TableName<T> = TableName<T>> = T['Tables'][K]['Insert'];
export type UpdateRow<T extends SchemaBase = DefaultSchema, K extends TableName<T> = TableName<T>> = T['Tables'][K]['Update'] & {
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
