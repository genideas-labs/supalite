import { Pool } from 'pg';
import { PostgresError } from './errors';
import type { SupaLitePG } from './postgres-client'; // Import SupaLitePG type
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
  private joinClauses: { foreignTable: string; columns: string }[] = [];
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
  private client: SupaLitePG<T>; // Store the SupaLitePG client instance
  private verbose: boolean = false;

  constructor(
    private pool: Pool,
    client: SupaLitePG<T>, // Accept SupaLitePG instance
    table: K,
    schema: S = 'public' as S,
    verbose: boolean = false // Accept verbose setting
  ) {
    this.client = client;
    this.table = table;
    this.schema = schema;
    this.verbose = verbose;
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
    this.countOption = options?.count;
    this.headOption = options?.head;

    if (!columns || columns === '*') {
      this.selectColumns = '*';
      return this;
    }

    const joinRegex = /(\w+)\(([^)]+)\)/g;
    let match;
    const regularColumns: string[] = [];
    let lastIndex = 0;

    while ((match = joinRegex.exec(columns)) !== null) {
      const foreignTable = match[1];
      const innerColumns = match[2];
      this.joinClauses.push({ foreignTable, columns: innerColumns });

      // Add the part of the string before this match to regular columns, if any
      const preceding = columns.substring(lastIndex, match.index).trim();
      if (preceding) {
        regularColumns.push(...preceding.split(',').filter(c => c.trim()));
      }
      lastIndex = joinRegex.lastIndex;
    }

    // Add the rest of the string after the last match
    const remaining = columns.substring(lastIndex).trim();
    if (remaining) {
      regularColumns.push(...remaining.split(',').filter(c => c.trim()));
    }

    const processedColumns = regularColumns
      .map(col => col.trim())
      .filter(col => col)
      .map(col => {
        if (col === '*') return '*';
        return col.startsWith('"') && col.endsWith('"') ? col : `"${col}"`;
      });

    this.selectColumns = processedColumns.length > 0 ? processedColumns.join(', ') : null;

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

  not(column: string, operator: string, value: any): this {
    if (operator === 'is' && value === null) {
      this.whereConditions.push(`"${column}" IS NOT NULL`);
    } else {
      // 추후 다른 not 연산자들을 위해 남겨둠
      throw new Error(`Operator "${operator}" is not supported for "not" operation.`);
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

  private async buildQuery(): Promise<{ query: string; values: any[] }> { // Made async
    let query = '';
    let values: any[] = [];
    let insertColumns: string[] = [];
    const returning = this.shouldReturnData() ? ` RETURNING ${this.selectColumns || '*'}` : '';
    const schemaTable = `"${String(this.schema)}"."${String(this.table)}"`;
    
    switch (this.queryType) {
      case 'SELECT': {
        if (this.headOption) {
          query = `SELECT COUNT(*) FROM ${schemaTable}`;
          query += this.buildWhereClause();
          values = [...this.whereValues];
          break;
        }

        let selectClause = this.selectColumns;
        if (!selectClause) {
          selectClause = this.joinClauses.length > 0 ? `${schemaTable}.*` : '*';
        } else if (selectClause.includes('*') && this.joinClauses.length > 0) {
          selectClause = selectClause.replace('*', `${schemaTable}.*`);
        }

        const joinSubqueries = await Promise.all(
          this.joinClauses.map(async (join) => {
            const fk = await this.client.getForeignKey(
              String(this.schema),
              String(this.table),
              join.foreignTable
            );

            if (!fk) {
              console.warn(`[SupaLite WARNING] No foreign key found from ${join.foreignTable} to ${String(this.table)}`);
              return null;
            }

            const foreignSchemaTable = `"${String(this.schema)}"."${join.foreignTable}"`;
            return `(
              SELECT json_agg(j)
              FROM (
                SELECT ${join.columns}
                FROM ${foreignSchemaTable}
                WHERE "${fk.foreignColumn}" = ${schemaTable}."${fk.column}"
              ) as j
            ) as "${join.foreignTable}"`;
          })
        );

        const validSubqueries = joinSubqueries.filter(Boolean).join(', ');
        if (validSubqueries) {
          selectClause += `, ${validSubqueries}`;
        }

        let baseQuery = `SELECT ${selectClause} FROM ${schemaTable}`;
        baseQuery += this.buildWhereClause();
        values = [...this.whereValues];

        if (this.countOption === 'exact') {
          query = `SELECT *, COUNT(*) OVER() as exact_count FROM (${baseQuery}) subquery`;
        } else {
          query = baseQuery;
        }
        
        break;
      }

      case 'INSERT':
      case 'UPSERT': {
        if (!this.insertData) throw new Error('No data provided for insert/upsert');
        
        if (Array.isArray(this.insertData)) {
          const rows = this.insertData;
          if (rows.length === 0) throw new Error('Empty array provided for insert');
          
          insertColumns = Object.keys(rows[0]);
          const processedRowsValuesPromises = rows.map(async (row) => {
            const rowValues = [];
            for (const colName of insertColumns) { // Ensure order of values matches order of columns
              const val = (row as Record<string, any>)[colName];
              const pgType = await this.client.getColumnPgType(String(this.schema), String(this.table), colName);
              if (typeof val === 'bigint') {
                rowValues.push(val.toString());
              } else if ((pgType === 'json' || pgType === 'jsonb') && 
                         (Array.isArray(val) || (val !== null && typeof val === 'object' && !(val instanceof Date)))) {
                rowValues.push(JSON.stringify(val));
              } else {
                rowValues.push(val);
              }
            }
            return rowValues;
          });
          const processedRowsValuesArrays = await Promise.all(processedRowsValuesPromises);
          values = processedRowsValuesArrays.flat();
          const placeholders = rows.map((_, i) => 
            `(${insertColumns.map((_, j) => `$${i * insertColumns.length + j + 1}`).join(',')})`
          ).join(',');
          
          query = `INSERT INTO ${schemaTable} ("${insertColumns.join('","')}") VALUES ${placeholders}`;
        } else {
          const insertData = this.insertData as Record<string, any>;
          insertColumns = Object.keys(insertData);
          const valuePromises = insertColumns.map(async (colName) => { // Iterate by column name to get pgType
            const val = insertData[colName];
            const pgType = await this.client.getColumnPgType(String(this.schema), String(this.table), colName);
            if (typeof val === 'bigint') {
              return val.toString();
            }
            if ((pgType === 'json' || pgType === 'jsonb') && 
                (Array.isArray(val) || (val !== null && typeof val === 'object' && !(val instanceof Date)))) {
              return JSON.stringify(val);
            }
            return val;
          });
          values = await Promise.all(valuePromises);
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
        
        const updateColumns = Object.keys(updateData);
        const processedUpdateValuesPromises = updateColumns.map(async (colName) => {
          const val = (updateData as Record<string, any>)[colName];
          const pgType = await this.client.getColumnPgType(String(this.schema), String(this.table), colName);
          if (typeof val === 'bigint') {
            return val.toString();
          }
          if ((pgType === 'json' || pgType === 'jsonb') && 
              (Array.isArray(val) || (val !== null && typeof val === 'object' && !(val instanceof Date)))) {
            return JSON.stringify(val);
          }
          return val;
        });
        const processedUpdateValues = await Promise.all(processedUpdateValuesPromises);
        
        const setColumns = updateColumns.map(
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

    // Append clauses that apply to the outermost query
    if (this.queryType === 'SELECT') {
      // WHERE is already in the query or subquery
      
      // ORDER BY, LIMIT, and OFFSET always apply to the outer query
      if (this.orderByColumns.length > 0) {
        query += ` ORDER BY ${this.orderByColumns.join(', ')}`;
      }

      if (this.limitValue !== undefined) {
        query += ` LIMIT ${this.limitValue}`;
      }

      if (this.offsetValue !== undefined) {
        query += ` OFFSET ${this.offsetValue}`;
      }
    }

    return { query, values };
  }

  async execute(): Promise<QueryResult<Row<T, S, K>> | SingleQueryResult<Row<T, S, K>>> {
    try {
      const { query, values } = await this.buildQuery(); // await buildQuery
      
      if (this.verbose) {
        console.log('[SupaLite VERBOSE] SQL:', query);
        console.log('[SupaLite VERBOSE] Values:', values);
      }
      
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

      let countResult: number | null = null;
      let dataResult = result.rows;

      if (this.headOption) {
        countResult = Number(result.rows[0].count);
        dataResult = [];
      } else if (this.countOption === 'exact') {
        if (result.rows.length > 0) {
          countResult = Number(result.rows[0].exact_count);
          // exact_count 열을 모든 데이터 객체에서 제거
          dataResult = result.rows.map(row => {
            const newRow = { ...row };
            delete (newRow as any).exact_count;
            return newRow;
          });
        } else {
          countResult = 0;
        }
      } else {
        countResult = result.rowCount;
      }

      if (this.singleMode) {
        if (dataResult.length > 1) {
          return {
            data: null,
            error: new PostgresError('PGRST114: Multiple rows returned'),
            count: countResult,
            status: 406,
            statusText: 'Not Acceptable. Expected a single row but found multiple.',
          };
        }

        if (dataResult.length === 0) {
          if (this.singleMode === 'strict') {
            return {
              data: null,
              error: new PostgresError('PGRST116: No rows found'),
              count: 0,
              status: 404,
              statusText: 'Not Found. Expected a single row but found no rows.',
            };
          }
          return {
            data: null,
            error: null,
            count: 0,
            status: 200,
            statusText: 'OK',
          };
        }
        return {
          data: dataResult[0],
          error: null,
          count: 1,
          status: 200,
          statusText: 'OK',
        } as SingleQueryResult<Row<T, S, K>>;
      }

      return {
        data: dataResult,
        error: null,
        count: countResult,
        status: 200,
        statusText: 'OK',
      } as QueryResult<Row<T, S, K>>;
    } catch (err: any) {
      if (this.verbose) {
        console.error('[SupaLite VERBOSE] Error:', err);
      }
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
