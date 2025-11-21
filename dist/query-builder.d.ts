import { Pool } from 'pg';
import type { SupaLitePG } from './postgres-client';
import { TableName, TableOrViewName, QueryResult, SingleQueryResult, DatabaseSchema, SchemaName, Row, InsertRow, UpdateRow } from './types';
export declare class QueryBuilder<T extends DatabaseSchema, S extends SchemaName<T> = 'public', K extends TableOrViewName<T, S> = TableOrViewName<T, S>> implements Promise<QueryResult<Row<T, S, K>> | SingleQueryResult<Row<T, S, K>>> {
    private pool;
    readonly [Symbol.toStringTag] = "QueryBuilder";
    private table;
    private schema;
    private selectColumns;
    private joinClauses;
    private whereConditions;
    private orConditions;
    private countOption?;
    private headOption?;
    private orderByColumns;
    private limitValue?;
    private offsetValue?;
    private whereValues;
    private singleMode;
    private queryType;
    private insertData?;
    private updateData?;
    private conflictTarget?;
    private client;
    private verbose;
    constructor(pool: Pool, client: SupaLitePG<T>, // Accept SupaLitePG instance
    table: K, schema?: S, verbose?: boolean);
    then<TResult1 = QueryResult<Row<T, S, K>> | SingleQueryResult<Row<T, S, K>>, TResult2 = never>(onfulfilled?: ((value: QueryResult<Row<T, S, K>> | SingleQueryResult<Row<T, S, K>>) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2>;
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null): Promise<QueryResult<Row<T, S, K>> | SingleQueryResult<Row<T, S, K>> | TResult>;
    finally(onfinally?: (() => void) | null): Promise<QueryResult<Row<T, S, K>> | SingleQueryResult<Row<T, S, K>>>;
    select(columns?: string, options?: {
        count?: 'exact' | 'planned' | 'estimated';
        head?: boolean;
    }): this;
    match(conditions: {
        [key: string]: any;
    }): this;
    eq(column: string, value: any): this;
    neq(column: string, value: any): this;
    is(column: string, value: any): this;
    not(column: string, operator: string, value: any): this;
    contains(column: string, value: any): this;
    in(column: string, values: any[]): this;
    gt(column: string, value: any): this;
    gte(column: string, value: any): this;
    lt(column: string, value: any): this;
    lte(column: string, value: any): this;
    order(column: string, options?: {
        ascending?: boolean;
    }): this;
    limit(value: number): this;
    offset(value: number): this;
    maybeSingle(): Promise<SingleQueryResult<Row<T, S, K>>>;
    single(): Promise<SingleQueryResult<Row<T, S, K>>>;
    ilike(column: string, pattern: string): this;
    or(conditions: string): this;
    returns<NewS extends SchemaName<T>, NewK extends TableName<T, NewS>>(): QueryBuilder<T, NewS, NewK>;
    range(from: number, to: number): this;
    upsert(values: InsertRow<T, S, K>, options?: {
        onConflict: string;
    }): this;
    private shouldReturnData;
    private buildWhereClause;
    private buildQuery;
    execute(): Promise<QueryResult<Row<T, S, K>> | SingleQueryResult<Row<T, S, K>>>;
    insert(data: InsertRow<T, S, K> | InsertRow<T, S, K>[]): this;
    update(data: UpdateRow<T, S, K>): this;
    delete(): this;
}
