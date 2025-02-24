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

export class QueryBuilder<T extends TableName> {
  private table: T;
  private selectColumns: string | null = null;
  private whereConditions: string[] = [];
  private orderByColumns: string[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private whereValues: any[] = [];
  private isSingleResult: boolean = false;
  private queryType: QueryType = 'SELECT';
  private insertData?: InsertRow<T>;
  private updateData?: UpdateRow<T>;
  private returningSingle: boolean = false;

  constructor(private pool: Pool, table: T) {
    this.table = table;
    return new Proxy(this, {
      get(target: QueryBuilder<T>, prop: string | symbol, receiver: any) {
        if (prop === 'then') {
          return (
            resolve: (value: QueryResult<T> | SingleQueryResult<T>) => void,
            reject: (reason: any) => void
          ) => {
            return target.execute().then(resolve, reject);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  select(columns: string = '*'): this {
    this.selectColumns = columns;
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

  single(): Promise<SingleQueryResult<T>> {
    this.isSingleResult = true;
    this.returningSingle = true;
    return this.execute() as Promise<SingleQueryResult<T>>;
  }

  private shouldReturnData(): boolean {
    return this.selectColumns !== null;
  }

  private buildQuery(): { query: string; values: any[] } {
    let query = '';
    let values: any[] = [];
    const returning = this.shouldReturnData() ? ` RETURNING ${this.selectColumns || '*'}` : '';

    switch (this.queryType) {
      case 'SELECT':
        query = `SELECT ${this.selectColumns || '*'} FROM "${this.table}"`;
        values = [...this.whereValues];
        break;

      case 'INSERT':
        if (!this.insertData) throw new Error('No data provided for insert');
        const insertColumns = Object.keys(this.insertData);
        const insertValues = Object.values(this.insertData);
        const insertPlaceholders = insertValues.map((_, i) => `$${i + 1}`).join(',');
        query = `INSERT INTO "${this.table}" ("${insertColumns.join('","')}") VALUES (${insertPlaceholders})${returning}`;
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

  async execute(): Promise<QueryResult<T> | SingleQueryResult<T>> {
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
        } as QueryResult<T>;
      }

      if (this.queryType === 'UPDATE' && !this.shouldReturnData()) {
        return {
          data: [],
          error: null,
          count: result.rowCount,
          status: 200,
          statusText: 'OK',
        } as QueryResult<T>;
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
        } as SingleQueryResult<T>;
      }

      return {
        data: result.rows.length > 0 ? result.rows : null,
        error: null,
        count: result.rowCount,
        status: 200,
        statusText: 'OK',
      } as QueryResult<T>;
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
