import { PostgresError } from './errors';
export type Json = string | number | bigint | boolean | null | {
    [key: string]: Json | undefined;
} | Json[];
export interface TableBase {
    Row: any;
    Insert: any;
    Update: any;
    Relationships: unknown[];
}
export interface SchemaDefinition {
    Tables: {
        [key: string]: TableBase;
    };
    Views?: {
        [key: string]: any;
    };
    Functions?: {
        [key: string]: any;
    };
    Enums?: {
        [key: string]: any;
    };
    CompositeTypes?: {
        [key: string]: any;
    };
}
export interface DatabaseSchema {
    [schema: string]: SchemaDefinition;
}
export type AsDatabaseSchema<T> = {
    [K in keyof T]: T[K] extends {
        Tables: any;
    } ? SchemaDefinition & T[K] : never;
};
export type SchemaName<T extends DatabaseSchema> = keyof T;
export type TableName<T extends DatabaseSchema, S extends SchemaName<T> = SchemaName<T>> = keyof T[S]['Tables'];
export type ViewName<T extends DatabaseSchema, S extends SchemaName<T> = SchemaName<T>> = keyof NonNullable<T[S]['Views']>;
export type TableOrViewName<T extends DatabaseSchema, S extends SchemaName<T> = SchemaName<T>> = TableName<T, S> | ViewName<T, S>;
export type Row<T extends DatabaseSchema, S extends SchemaName<T>, K extends TableOrViewName<T, S>> = K extends TableName<T, S> ? T[S]['Tables'][K]['Row'] : K extends ViewName<T, S> ? NonNullable<T[S]['Views']>[K]['Row'] : never;
export type InsertRow<T extends DatabaseSchema, S extends SchemaName<T>, K extends TableOrViewName<T, S>> = K extends TableName<T, S> ? T[S]['Tables'][K]['Insert'] : never;
export type UpdateRow<T extends DatabaseSchema, S extends SchemaName<T>, K extends TableOrViewName<T, S>> = K extends TableName<T, S> ? T[S]['Tables'][K]['Update'] & {
    modified_at?: string;
    updated_at?: string;
} : never;
export type EnumType<T extends DatabaseSchema, S extends SchemaName<T>, E extends keyof NonNullable<T[S]['Enums']>> = NonNullable<T[S]['Enums']>[E];
export interface SupaliteConfig {
    connectionString?: string;
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
    data: Array<T>;
};
export type SingleQueryResult<T = any> = BaseResult & {
    data: T | null;
};
