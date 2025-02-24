import { Database } from './database.types';
import { PostgresError } from './errors';

export type TableName = keyof Database['public']['Tables'];
export type Row<T extends TableName> = Database['public']['Tables'][T]['Row'];
export type InsertRow<T extends TableName> = Database['public']['Tables'][T]['Insert'];
export type UpdateRow<T extends TableName> = Database['public']['Tables'][T]['Update'] & {
  modified_at?: string;
  updated_at?: string;
};

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseKey: string;
  schema?: string;
  autoRefreshToken?: boolean;
  persistSession?: boolean;
  detectSessionInUrl?: boolean;
  headers?: Record<string, string>;
}

export interface PostgresConfig {
  user?: string;
  host?: string;
  database?: string;
  password?: string;
  port?: number;
  ssl?: boolean;
  schema?: string;
}

export interface AuthConfig {
  autoRefreshToken?: boolean;
  persistSession?: boolean;
  detectSessionInUrl?: boolean;
}

export interface StorageConfig {
  maxFileSize?: number;
  allowedMimeTypes?: string[];
}

export type QueryType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

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

export interface QueryResult<T extends TableName> {
  data: Row<T>[] | null;
  error: PostgresError | null;
  count?: number | null;
  status?: number;
  statusText?: string;
}

export interface SingleQueryResult<T extends TableName> {
  data: Row<T> | null;
  error: PostgresError | null;
  count?: number | null;
  status?: number;
  statusText?: string;
}

export interface AuthResponse {
  user: any | null;
  session: any | null;
  error: Error | null;
}

export interface StorageResponse {
  data: {
    path: string;
    id: string;
  } | null;
  error: Error | null;
}

export interface RealtimeSubscription {
  subscribe(callback: (payload: any) => void): void;
  unsubscribe(): void;
}
