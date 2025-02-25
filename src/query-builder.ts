import { Pool } from 'pg';
import { PostgresError } from './errors';
import {
  TableName,
  QueryType,
  QueryOptions,
  FilterOptions,
  QueryResult,
  SingleQueryResult,
  Row,
  InsertRow,
  UpdateRow,
} from './types';

export class QueryBuilder<T extends TableName, R = Row<T>> implements Promise<QueryResult<R> | SingleQueryResult<R>> {
  readonly [Symbol.toStringTag] = 'QueryBuilder';
  private table: T;
  private selectColumns: string | null = null;
  private whereConditions: string[] = [];
  private orConditions: string[][] = [];  // OR 조건을 위한 배열 추가
  private countOption?: 'exact' | 'planned' | 'estimated';
  private headOption?: boolean;
  private orderByColumns: string[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private whereValues: any[] = [];
  private isSingleResult: boolean = false;
  private queryType: QueryType = 'SELECT';
  private insertData?: InsertRow<T>;
  private updateData?: UpdateRow<T>;
  private conflictTarget?: string;

  constructor(private pool: Pool, table: T) {
    this.table = table;
  }

  then<TResult1 = QueryResult<R> | SingleQueryResult<R>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<R> | SingleQueryResult<R>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<QueryResult<R> | SingleQueryResult<R> | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<QueryResult<R> | SingleQueryResult<R>> {
    return this.execute().finally(onfinally);
  }

  select(
    columns: string = '*',
    options?: {
      count?: 'exact' | 'planned' | 'estimated',
      head?: boolean
    }
  ): this {
    this.selectColumns = columns;
    this.countOption = options?.count;
    this.headOption = options?.head;
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

  order(column: string, { ascending = true }: { ascending: boolean }): this {
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

  single(): Promise<SingleQueryResult<R>> {
    this.isSingleResult = true;
    return this.execute() as Promise<SingleQueryResult<R>>;
  }

  ilike(column: string, pattern: string): this {
    this.whereConditions.push(`"${column}" ILIKE $${this.whereValues.length + 1}`);
    this.whereValues.push(pattern);
    return this;
  }

  or(conditions: string): this {
    const orParts = conditions.split(',').map(condition => {
      const [field, op, value] = condition.split('.');
      
      // 연산자 검증
      const validOperators = ['eq', 'neq', 'ilike', 'like', 'gt', 'gte', 'lt', 'lte'];
      if (!validOperators.includes(op)) {
        throw new Error(`Invalid operator: ${op}`);
      }

      // 값 처리
      let processedValue: any = value;
      if (value === 'null') {
        processedValue = null;
      } else if (!isNaN(Number(value))) {
        processedValue = value; // 숫자 문자열 그대로 유지
      } else if (value.match(/^\d{4}-\d{2}-\d{2}/)) {
        processedValue = value; // 날짜 문자열 그대로 유지
      }
      
      this.whereValues.push(processedValue);
      const paramIndex = this.whereValues.length;

      // SQL 생성
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

  returns<NewR>(): QueryBuilder<T, NewR> {
    return this as unknown as QueryBuilder<T, NewR>;
  }

  range(from: number, to: number): this {
    this.limitValue = to - from + 1;
    this.offsetValue = from;
    return this;
  }

  upsert(
    values: InsertRow<T>,
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

  private buildQuery(): { query: string; values: any[] } {
    let query = '';
    let values: any[] = [];
    const returning = this.shouldReturnData() ? ` RETURNING ${this.selectColumns || '*'}` : '';
    
    // OR 조건 처리를 위한 함수
    const buildWhereClause = () => {
      const conditions = [...this.whereConditions];
      if (this.orConditions.length > 0) {
        conditions.push(
          this.orConditions.map(group => `(${group.join(' OR ')})`).join(' AND ')
        );
      }
      return conditions.join(' AND ');
    };
    
    switch (this.queryType) {
      case 'SELECT':
        if (this.headOption) {
          query = `SELECT COUNT(*) FROM "${this.table}"`;
        } else {
          query = `SELECT ${this.selectColumns || '*'} FROM "${this.table}"`;
          if (this.countOption === 'exact') {
            query = `SELECT *, COUNT(*) OVER() as exact_count FROM (${query}) subquery`;
          }
        }
        values = [...this.whereValues];
        break;

      case 'INSERT':
      case 'UPSERT':
        if (!this.insertData) throw new Error('No data provided for insert/upsert');
        const insertColumns = Object.keys(this.insertData);
        const insertValues = Object.values(this.insertData);
        const insertPlaceholders = insertValues.map((_, i) => `$${i + 1}`).join(',');
        query = `INSERT INTO "${this.table}" ("${insertColumns.join('","')}") VALUES (${insertPlaceholders})`;
        
        if (this.queryType === 'UPSERT' && this.conflictTarget) {
          query += ` ON CONFLICT (${this.conflictTarget}) DO UPDATE SET `;
          query += insertColumns
            .map((col) => `"${col}" = EXCLUDED."${col}"`)
            .join(', ');
        }
        
        query += returning;
        values = [...insertValues];
        break;

      case 'UPDATE':
        if (!this.updateData) throw new Error('No data provided for update');
        const updateData = { ...this.updateData };

        if ('modified_at' in updateData && !updateData.modified_at) {
          updateData.modified_at = new Date().toISOString();
        }
        if ('updated_at' in updateData && !updateData.updated_at) {
          updateData.updated_at = new Date().toISOString();
        }

        const updateValues = Object.values(updateData);
        const setColumns = Object.keys(updateData).map(
          (key, index) => `"${key}" = $${index + 1}`
        );
        query = `UPDATE "${this.table}" SET ${setColumns.join(', ')}`;
        values = [...updateValues, ...this.whereValues];

        if (this.whereConditions.length > 0) {
          query += ` WHERE ${this.whereConditions
            .map(cond => cond.replace(/\$(\d+)/g, (match, num) => `$${parseInt(num) + updateValues.length}`))
            .join(' AND ')}`;
        }
        query += returning;
        break;

      case 'DELETE':
        query = `DELETE FROM "${this.table}"`;
        values = [...this.whereValues];

        if (this.whereConditions.length > 0) {
          query += ` WHERE ${this.whereConditions.join(' AND ')}`;
        }
        query += returning;
        break;
    }

    if (this.whereConditions.length > 0 && this.queryType !== 'UPDATE') {
      query += ` WHERE ${this.whereConditions.join(' AND ')}`;
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

  async execute(): Promise<QueryResult<R> | SingleQueryResult<R>> {
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
        } as QueryResult<R>;
      }

      if (this.queryType === 'UPDATE' && !this.shouldReturnData()) {
        return {
          data: [],
          error: null,
          count: result.rowCount,
          status: 200,
          statusText: 'OK',
        } as QueryResult<R>;
      }

      if (this.queryType === 'INSERT' && !this.shouldReturnData()) {
        return {
          data: null,
          error: null,
          count: result.rowCount,
          status: 201,
          statusText: 'Created',
        };
      }

      if (this.isSingleResult) {
        if (result.rows.length > 1) {
          return {
            data: null,
            error: new PostgresError('Multiple rows returned in single result query'),
            count: result.rowCount,
            status: 406,
            statusText: 'Not Acceptable',
          };
        }

        if (result.rows.length === 0) {
          return {
            data: null,
            error: null,
            count: 0,
            status: 200,
            statusText: 'OK',
          };
        }

        return {
          data: result.rows[0],
          error: null,
          count: 1,
          status: 200,
          statusText: 'OK',
        } as SingleQueryResult<R>;
      }

      return {
        data: result.rows.length > 0 ? result.rows : null,
        error: null,
        count: result.rowCount,
        status: 200,
        statusText: 'OK',
      } as QueryResult<R>;
    } catch (err: any) {
      return {
        data: null,
        error: new PostgresError(err.message),
        count: null,
        status: 500,
        statusText: 'Internal Server Error',
      };
    }
  }

  insert(data: InsertRow<T>): this {
    this.queryType = 'INSERT';
    this.insertData = data;
    return this;
  }

  update(data: UpdateRow<T>): this {
    this.queryType = 'UPDATE';
    this.updateData = data;
    return this;
  }

  delete(): this {
    this.queryType = 'DELETE';
    return this;
  }
}
