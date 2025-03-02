import { QueryBuilder } from './query-builder';
import { PostgresError } from './errors';
import { SupaliteConfig, Row, QueryResult, SingleQueryResult } from './types';
type SchemaWithTables = {
    Tables: {
        [key: string]: {
            Row: any;
            Insert: any;
            Update: any;
            Relationships: unknown[];
        };
    };
    Views?: any;
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
    constructor(config?: SupaliteConfig);
    begin(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    transaction<R>(callback: (client: SupaLitePG<T>) => Promise<R>): Promise<R>;
    from<K extends keyof T['public']['Tables']>(table: K): QueryBuilder<T, 'public', K> & Promise<QueryResult<Row<T, 'public', K>>> & {
        single(): Promise<SingleQueryResult<Row<T, 'public', K>>>;
    };
    from<S extends keyof T, K extends keyof T[S]['Tables']>(table: K, schema: S): QueryBuilder<T, S, K> & Promise<QueryResult<Row<T, S, K>>> & {
        single(): Promise<SingleQueryResult<Row<T, S, K>>>;
    };
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
