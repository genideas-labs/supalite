import { QueryBuilder } from './query-builder';
import { PostgresError } from './errors';
import { TableOrViewName, SupaliteConfig, Row, QueryResult, SingleQueryResult } from './types';
type SchemaWithTables = {
    Tables: {
        [key: string]: {
            Row: any;
            Insert: any;
            Update: any;
            Relationships: unknown[];
        };
    };
    Views?: {
        [key: string]: {
            Row: any;
        };
    };
    Functions?: any;
    Enums?: any;
    CompositeTypes?: any;
};
export declare class SupaLitePG<T extends {
    [K: string]: SchemaWithTables;
}> {
    private pool;
    private client;
    private isTransaction;
    private schema;
    private schemaCache;
    private foreignKeyCache;
    verbose: boolean;
    private bigintTransform;
    constructor(config?: SupaliteConfig);
    begin(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    transaction<R>(callback: (client: SupaLitePG<T>) => Promise<R>): Promise<R>;
    from<K extends TableOrViewName<T, 'public'>>(table: K): QueryBuilder<T, 'public', K> & Promise<QueryResult<Row<T, 'public', K>>> & {
        single(): Promise<SingleQueryResult<Row<T, 'public', K>>>;
    };
    from<S extends keyof T, K extends TableOrViewName<T, S>>(table: K, schema: S): QueryBuilder<T, S, K> & Promise<QueryResult<Row<T, S, K>>> & {
        single(): Promise<SingleQueryResult<Row<T, S, K>>>;
    };
    getColumnPgType(dbSchema: string, tableName: string, columnName: string): Promise<string | undefined>;
    getForeignKey(schema: string, table: string, foreignTable: string): Promise<{
        column: string;
        foreignColumn: string;
    } | null>;
    rpc(procedureName: string, params?: Record<string, any>): Promise<{
        data: any;
        error: PostgresError | null;
        count?: number | null;
        status?: number;
        statusText?: string;
    }>;
    testConnection(): Promise<boolean>;
    close(): Promise<void>;
}
export declare const supalitePg: SupaLitePG<{
    [K: string]: SchemaWithTables;
}>;
export {};
