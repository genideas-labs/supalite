import { Pool } from 'pg';
import { PostgresError } from './errors';
import {
  TableName,
  TableOrViewName,
  QueryType,
  QueryResult,
  SingleQueryResult,
  DatabaseSchema,
  SchemaName,
  Row,
  InsertRow,
  UpdateRow
} from './types';

export class QueryBuilder<
  T extends DatabaseSchema,
  S extends SchemaName<T> = 'public',
  K extends TableOrViewName<T, S> = TableOrViewName<T, S>
> implements Promise<QueryResult<Row<T, S, K>> | SingleQueryResult<Row<T, S, K>>> {
  readonly [Symbol.toStringTag] = 'QueryBuilder';
  private table: K;
  private schema: S;
  private selectColumns: string | null = null;
  private whereConditions: string[] = [];
  private orConditions: string[][] = [];
  private countOption?: 'exact' | 'planned' | 'estimated';
  private headOption?: boolean;
  private orderByColumns: string[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private whereValues: any[] = [];
  private singleMode: 'strict' | 'maybe' | null = null;
  private queryType: QueryType = 'SELECT';
  private insertData?: InsertRow<T, S, K> | InsertRow<T, S, K>[];
  private updateData?: UpdateRow<T, S, K>;
  private conflictTarget?: string;

  constructor(private pool: Pool, table: K, schema: S = 'public' as S) {
    this.table = table;
    this.schema = schema;
  }

  then<TResult1 = QueryResult<Row<T, S, K>> | SingleQueryResult<Row<T, S, K>>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<Row<T, S, K>> | SingleQueryResult<Row<T, S, K>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<QueryResult<Row<T, S, K>> | SingleQueryResult<Row<T, S, K>> | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<QueryResult<Row<T, S, K>> | SingleQueryResult<Row<T, S, K>>> {
    return this.execute().finally(onfinally);
  }

  select(
    columns: string = '*',
    options?: {
      count?: 'exact' | 'planned' | 'estimated',
      head?: boolean
    }
  ): this {
    if (columns && columns !== '*') {
      this.selectColumns = columns.split(',')
        .map(col => col.trim())
        .map(col => col.startsWith('"') && col.endsWith('"') ? col : `"${col}"`)
        .join(', ');
    } else {
      this.selectColumns = columns;
    }
    this.countOption = options?.count;
    this.headOption = options?.head;
    return this;
  }

  match(conditions: { [key: string]: any }): this {
    for (const key in conditions) {
      this.whereConditions.push(`"${key}" = $${this.whereValues.length + 1}`);
      this.whereValues.push(conditions[key]);
    }
    return this;
  }

  eq(column: string, value: any): this {
    this.whereConditions.push(`"${column}" = $${this.whereValues.length + 1}`);
    this.whereValues.push(value);
    return this;
  }

  neq(column: string, value: any): this {
    this.whereConditions.push(`"${column}" != $${this.whereValues.length + 1}`);
    this.whereValues.push(value);
    return this;
  }

  is(column: string, value: any): this {
    if (value === null) {
      this.whereConditions.push(`"${column}" IS NULL`);
    } else {
      this.whereConditions.push(`"${column}" IS $${this.whereValues.length + 1}`);
      this.whereValues.push(value);
    }
    return this;
  }

  contains(column: string, value: any): this {
    this.whereConditions.push(`"${column}" @> $${this.whereValues.length + 1}`);
    this.whereValues.push(value);
    return this;
  }

  in(column: string, values: any[]): this {
    if (values.length === 0) {
      this.whereConditions.push('FALSE');
      return this;
    }
    const placeholders = values.map((_, i) => `$${this.whereValues.length + i + 1}`).join(',');
    this.whereConditions.push(`"${column}" IN (${placeholders})`);
    this.whereValues.push(...values);
    return this;
  }

  gte(column: string, value: any): this {
    this.whereConditions.push(`"${column}" >= $${this.whereValues.length + 1}`);
    this.whereValues.push(value);
    return this;
  }

  lte(column: string, value: any): this {
    this.whereConditions.push(`"${column}" <= $${this.whereValues.length + 1}`);
    this.whereValues.push(value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    const ascending = options?.ascending !== false; // undefined나 true면 오름차순, false만 내림차순
    this.orderByColumns.push(`"${column}" ${ascending ? 'ASC' : 'DESC'}`);
    return this;
  }

  limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  offset(value: number): this {
    this.offsetValue = value;
    return this;
  }

  maybeSingle(): Promise<SingleQueryResult<Row<T, S, K>>> {
    this.singleMode = 'maybe';
    return this.execute() as Promise<SingleQueryResult<Row<T, S, K>>>;
  }

  single(): Promise<SingleQueryResult<Row<T, S, K>>> {
    this.singleMode = 'strict';
    return this.execute() as Promise<SingleQueryResult<Row<T, S, K>>>;
  }

  ilike(column: string, pattern: string): this {
    this.whereConditions.push(`"${column}" ILIKE $${this.whereValues.length + 1}`);
    this.whereValues.push(pattern);
    return this;
  }

  or(conditions: string): this {
    const orParts = conditions.split(',').map(condition => {
      const [field, op, value] = condition.split('.');
      
      const validOperators = ['eq', 'neq', 'ilike', 'like', 'gt', 'gte', 'lt', 'lte'];
      if (!validOperators.includes(op)) {
        throw new Error(`Invalid operator: ${op}`);
      }

      let processedValue: any = value;
      if (value === 'null') {
        processedValue = null;
      } else if (!isNaN(Number(value))) {
        processedValue = value;
      } else if (value.match(/^\d{4}-\d{2}-\d{2}/)) {
        processedValue = value;
      }
      
      this.whereValues.push(processedValue);
      const paramIndex = this.whereValues.length;

      switch (op) {
        case 'eq':
          return `"${field}" = $${paramIndex}`;
        case 'neq':
          return `"${field}" != $${paramIndex}`;
        case 'ilike':
          return `"${field}" ILIKE $${paramIndex}`;
        case 'like':
          return `"${field}" LIKE $${paramIndex}`;
        case 'gt':
          return `"${field}" > $${paramIndex}`;
        case 'gte':
          return `"${field}" >= $${paramIndex}`;
        case 'lt':
          return `"${field}" < $${paramIndex}`;
        case 'lte':
          return `"${field}" <= $${paramIndex}`;
        default:
          return '';
      }
    }).filter(Boolean);
    
    if (orParts.length > 0) {
      this.whereConditions.push(`(${orParts.join(' OR ')})`);
    }
    return this;
  }

  returns<NewS extends SchemaName<T>, NewK extends TableName<T, NewS>>(): QueryBuilder<T, NewS, NewK> {
    return this as unknown as QueryBuilder<T, NewS, NewK>;
  }

  range(from: number, to: number): this {
    this.limitValue = to - from + 1;
    this.offsetValue = from;
    return this;
  }

  upsert(
    values: InsertRow<T, S, K>,
    options?: { onConflict: string }
  ): this {
    this.queryType = 'UPSERT';
    this.insertData = values;
    this.conflictTarget = options?.onConflict;
    return this;
  }

  private shouldReturnData(): boolean {
    return this.selectColumns !== null;
  }

  private buildWhereClause(updateValues?: any[]): string {
    if (this.whereConditions.length === 0) {
      return '';
    }

    const conditions = [...this.whereConditions];
    if (this.orConditions.length > 0) {
      conditions.push(
        this.orConditions.map(group => `(${group.join(' OR ')})`).join(' AND ')
      );
    }

    if (updateValues) {
      return ' WHERE ' + conditions
        .map(cond => cond.replace(/\$(\d+)/g, (match, num) => 
          `$${parseInt(num) + updateValues.length}`))
        .join(' AND ');
    }

    return ' WHERE ' + conditions.join(' AND ');
  }

  private buildQuery(): { query: string; values: any[] } {
    let query = '';
    let values: any[] = [];
    let insertColumns: string[] = [];
    const returning = this.shouldReturnData() ? ` RETURNING ${this.selectColumns || '*'}` : '';
    const schemaTable = `"${String(this.schema)}"."${String(this.table)}"`;
    
    switch (this.queryType) {
      case 'SELECT':
        if (this.headOption) {
          query = `SELECT COUNT(*) FROM ${schemaTable}`;
        } else {
          query = `SELECT ${this.selectColumns || '*'} FROM ${schemaTable}`;
          if (this.countOption === 'exact') {
            query = `SELECT *, COUNT(*) OVER() as exact_count FROM (${query}) subquery`;
          }
        }
        values = [...this.whereValues];
        break;

      case 'INSERT':
      case 'UPSERT': {
        if (!this.insertData) throw new Error('No data provided for insert/upsert');
        
        if (Array.isArray(this.insertData)) {
          const rows = this.insertData;
          if (rows.length === 0) throw new Error('Empty array provided for insert');
          
          insertColumns = Object.keys(rows[0]);
          // Process each row for potential JSON stringification
          const processedRowsValues = rows.map(row => 
            Object.values(row).map(val => {
              if (Array.isArray(val) || (val !== null && typeof val === 'object' && !(val instanceof Date))) {
                return JSON.stringify(val);
              }
              return val;
            })
          );
          values = processedRowsValues.flat();
          const placeholders = rows.map((_, i) => 
            `(${insertColumns.map((_, j) => `$${i * insertColumns.length + j + 1}`).join(',')})`
          ).join(',');
          
          query = `INSERT INTO ${schemaTable} ("${insertColumns.join('","')}") VALUES ${placeholders}`;
        } else {
          const insertData = this.insertData as Record<string, any>;
          insertColumns = Object.keys(insertData);
          values = Object.values(insertData).map(val => {
            if (Array.isArray(val) || (val !== null && typeof val === 'object' && !(val instanceof Date))) {
              return JSON.stringify(val);
            }
            return val;
          });
          const insertPlaceholders = values.map((_, i) => `$${i + 1}`).join(',');
          query = `INSERT INTO ${schemaTable} ("${insertColumns.join('","')}") VALUES (${insertPlaceholders})`;
        }
        
        if (this.queryType === 'UPSERT' && this.conflictTarget) {
          // Quote conflict target if it's a simple column name and not already quoted
          const conflictTargetSQL = (this.conflictTarget.includes('"') || this.conflictTarget.includes('(') || this.conflictTarget.includes(','))
            ? this.conflictTarget
            : `"${this.conflictTarget}"`;
          query += ` ON CONFLICT (${conflictTargetSQL}) DO UPDATE SET `;
          query += insertColumns
            .map((col: string) => `"${col}" = EXCLUDED."${col}"`)
            .join(', ');
        }
        
        query += returning;
        break;
      }
      case 'UPDATE': {
        if (!this.updateData) throw new Error('No data provided for update');
        const updateData = { ...this.updateData } as Record<string, unknown>;

        const now = new Date().toISOString();
        if ('modified_at' in updateData && !updateData.modified_at) {
          updateData.modified_at = now;
        }
        if ('updated_at' in updateData && !updateData.updated_at) {
          updateData.updated_at = now;
        }

        const processedUpdateValues = Object.values(updateData).map(val => {
          if (Array.isArray(val) || (val !== null && typeof val === 'object' && !(val instanceof Date))) {
            return JSON.stringify(val);
          }
          return val;
        });
        const setColumns = Object.keys(updateData).map(
          (key, index) => `"${String(key)}" = $${index + 1}`
        );
        query = `UPDATE ${schemaTable} SET ${setColumns.join(', ')}`;
        values = [...processedUpdateValues, ...this.whereValues];
        query += this.buildWhereClause(processedUpdateValues);
        query += returning;
        break;
      }
      case 'DELETE': {
        query = `DELETE FROM ${schemaTable}`;
        values = [...this.whereValues];
        query += this.buildWhereClause();
        query += returning;
        break;
      }
    }

    if (this.queryType === 'SELECT') {
      query += this.buildWhereClause();
    }

    if (this.orderByColumns.length > 0 && this.queryType === 'SELECT') {
      query += ` ORDER BY ${this.orderByColumns.join(', ')}`;
    }

    if (this.limitValue !== undefined && this.queryType === 'SELECT') {
      query += ` LIMIT ${this.limitValue}`;
    }

    if (this.offsetValue !== undefined && this.queryType === 'SELECT') {
      query += ` OFFSET ${this.offsetValue}`;
    }

    return { query, values };
  }

  async execute(): Promise<QueryResult<Row<T, S, K>> | SingleQueryResult<Row<T, S, K>>> {
    try {
      const { query, values } = this.buildQuery();
      const result = await this.pool.query(query, values);

      if (this.queryType === 'DELETE' && !this.shouldReturnData()) {
        return {
          data: [],
          error: null,
          count: result.rowCount,
          status: 200,
          statusText: 'OK',
        } as QueryResult<Row<T, S, K>>;
      }

      if (this.queryType === 'UPDATE' && !this.shouldReturnData()) {
        return {
          data: [],
          error: null,
          count: result.rowCount,
          status: 200,
          statusText: 'OK',
        } as QueryResult<Row<T, S, K>>;
      }

      if (this.queryType === 'INSERT' && !this.shouldReturnData()) {
        return {
          data: [],
          error: null,
          count: result.rowCount,
          status: 201,
          statusText: 'Created',
        } as QueryResult<Row<T, S, K>>;
      }

      if (this.singleMode) {
        if (result.rows.length > 1) {
          return {
            data: null,
            error: new PostgresError('PGRST114: Multiple rows returned'), // PGRST114: More than one row was returned
            count: result.rowCount,
            status: 406, // Not Acceptable
            statusText: 'Not Acceptable. Expected a single row but found multiple.',
          };
        }

        if (result.rows.length === 0) {
          if (this.singleMode === 'strict') {
            return {
              data: null,
              error: new PostgresError('PGRST116: No rows found'), // PGRST116: Not found
              count: 0,
              status: 404, // Not Found (more appropriate than 200 for strict single when not found)
              statusText: 'Not Found. Expected a single row but found no rows.',
            };
          }
          // this.singleMode === 'maybe'
          return {
            data: null,
            error: null,
            count: 0,
            status: 200,
            statusText: 'OK',
          };
        }
        // result.rows.length === 1
        return {
          data: result.rows[0],
          error: null,
          count: 1,
          status: 200,
          statusText: 'OK',
        } as SingleQueryResult<Row<T, S, K>>;
      }

      return {
        data: result.rows.length > 0 ? result.rows : [],
        error: null,
        count: result.rowCount,
        status: 200,
        statusText: 'OK',
      } as QueryResult<Row<T, S, K>>;
    } catch (err: any) {
      return {
        data: [],
        error: new PostgresError(err.message),
        count: null,
        status: 500,
        statusText: 'Internal Server Error',
      } as QueryResult<Row<T, S, K>>;
    }
  }

  insert(data: InsertRow<T, S, K> | InsertRow<T, S, K>[]): this {
    this.queryType = 'INSERT';
    this.insertData = data;
    return this;
  }

  update(data: UpdateRow<T, S, K>): this {
    this.queryType = 'UPDATE';
    this.updateData = data;
    return this;
  }

  delete(): this {
    this.queryType = 'DELETE';
    return this;
  }
}
