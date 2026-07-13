import { Pool, PoolClient } from 'pg';
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
/** A resolved foreign-key relationship used for PostgREST-style embeds. */
type ForeignKeyInfo = {
    column: string;
    foreignColumn: string;
    isArray: boolean;
};
export declare class RpcBuilder implements Promise<any> {
    private pool;
    private schema;
    private procedureName;
    private params;
    readonly [Symbol.toStringTag] = "RpcBuilder";
    private singleMode;
    private static returnTypeCache;
    constructor(pool: Pool, schema: string, procedureName: string, params?: Record<string, any>);
    single(): this;
    maybeSingle(): this;
    then<TResult1 = any, TResult2 = never>(onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2>;
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null): Promise<any | TResult>;
    finally(onfinally?: (() => void) | null): Promise<any>;
    private isScalarReturn;
    execute(): Promise<{
        data: any;
        error: PostgresError | null;
        count?: number | null;
        status?: number;
        statusText?: string;
    }>;
}
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
    private ownsPool;
    constructor(config?: SupaliteConfig);
    /**
     * Internal transaction plumbing — mutates THIS instance's connection state.
     * Only ever invoked on a fresh per-transaction scope (from `begin()` /
     * `transaction()`), never on a shared instance, so the mutation is safe.
     */
    private startTx;
    /** Internal: COMMIT + release on the scope's own connection (see startTx). */
    private commitTx;
    /** Internal: ROLLBACK + release on the scope's own connection (see startTx). */
    private rollbackTx;
    /**
     * Creates an isolated SupaLitePG bound to the SAME pool but with independent
     * transaction state (its own `client`/`isTransaction`). Used by transaction()
     * so concurrent transactions never collide on shared instance state. The pool
     * is shared and not owned (no error listener is attached — see constructor).
     */
    private createTransactionScope;
    /**
     * Begins a transaction and returns a **connection-scoped handle** — a child
     * client bound to one connection borrowed from the shared pool. This instance
     * is NOT mutated, so calling `begin()` on a shared singleton is concurrency-safe:
     * run your statements on the returned handle and finalize with
     * `handle.commit()` / `handle.rollback()`.
     *
     * ```ts
     * const tx = await db.begin();
     * try { await tx.from('t').insert(row); await tx.commit(); }
     * catch (e) { await tx.rollback(); throw e; }
     * ```
     *
     * For fully-managed transactions prefer {@link transaction} (auto commit/rollback
     * and connection release). Nested transactions (calling `begin()` on a handle)
     * are not supported.
     */
    begin(): Promise<SupaLitePG<T>>;
    /**
     * Commits the transaction on this handle (from {@link begin}) and releases its
     * connection. Throws if there is no active transaction.
     */
    commit(): Promise<void>;
    /**
     * Rolls back the transaction on this handle (from {@link begin}) and releases its
     * connection. Throws if there is no active transaction.
     */
    rollback(): Promise<void>;
    transaction<R>(callback: (client: SupaLitePG<T>) => Promise<R>): Promise<R>;
    getQueryClient(): Pool | PoolClient;
    from<K extends TableOrViewName<T, 'public'>>(table: K): QueryBuilder<T, 'public', K> & Promise<QueryResult<Row<T, 'public', K>>> & {
        single(): Promise<SingleQueryResult<Row<T, 'public', K>>>;
    };
    from<S extends keyof T, K extends TableOrViewName<T, S>>(table: K, schema: S): QueryBuilder<T, S, K> & Promise<QueryResult<Row<T, S, K>>> & {
        single(): Promise<SingleQueryResult<Row<T, S, K>>>;
    };
    getColumnPgType(dbSchema: string, tableName: string, columnName: string): Promise<string | undefined>;
    getForeignKey(schema: string, table: string, foreignTable: string): Promise<ForeignKeyInfo | null>;
    rpc(procedureName: string, params?: Record<string, any>): RpcBuilder;
    testConnection(): Promise<boolean>;
    close(): Promise<void>;
}
export declare const supalitePg: SupaLitePG<{
    [K: string]: SchemaWithTables;
}>;
export {};
