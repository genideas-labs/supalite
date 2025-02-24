import { Pool } from 'pg';
import { QueryBuilder } from './query-builder';
import { PostgresError } from './errors';
import { TableName, PostgresConfig, Row } from './types';

export class PostgresClient {
  private pool: Pool;
  private client: any | null = null;
  private isTransaction: boolean = false;

  constructor(config?: PostgresConfig) {
    this.pool = new Pool({
      user: config?.user || process.env.DB_USER,
      host: config?.host || process.env.DB_HOST,
      database: config?.database || process.env.DB_NAME,
      password: config?.password || process.env.DB_PASS,
      port: config?.port || Number(process.env.DB_PORT) || 5432,
      ssl: config?.ssl || process.env.DB_SSL === 'true',
    });

    // Error handling
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
  }

  // 트랜잭션 시작
  async begin(): Promise<void> {
    if (!this.client) {
      this.client = await this.pool.connect();
    }
    await this.client.query('BEGIN');
    this.isTransaction = true;
  }

  // 트랜잭션 커밋
  async commit(): Promise<void> {
    if (this.isTransaction && this.client) {
      await this.client.query('COMMIT');
      this.client.release();
      this.client = null;
      this.isTransaction = false;
    }
  }

  // 트랜잭션 롤백
  async rollback(): Promise<void> {
    if (this.isTransaction && this.client) {
      await this.client.query('ROLLBACK');
      this.client.release();
      this.client = null;
      this.isTransaction = false;
    }
  }

  // 트랜잭션 실행
  async transaction<T>(
    callback: (client: PostgresClient) => Promise<T>
  ): Promise<T> {
    await this.begin();
    try {
      const result = await callback(this);
      await this.commit();
      return result;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  from<T extends TableName>(table: T): QueryBuilder<T, Row<T>> {
    return new QueryBuilder<T, Row<T>>(this.pool, table);
  }

  async rpc(
    procedureName: string,
    params: Record<string, any> = {}
  ): Promise<{
    data: any;
    error: PostgresError | null;
    count?: number | null;
    status?: number;
    statusText?: string;
  }> {
    try {
      const paramNames = Object.keys(params);
      const paramValues = Object.values(params);
      const paramPlaceholders = paramNames.length > 0
        ? paramNames.map((name, i) => `"${name}" := $${i + 1}`).join(', ')
        : '';

      const query = paramPlaceholders
        ? `SELECT * FROM ${procedureName}(${paramPlaceholders})`
        : `SELECT * FROM ${procedureName}()`;

      const result = await this.pool.query(query, paramValues);

      if (result.rows.length === 1 && Object.keys(result.rows[0]).length === 1) {
        const singleValue = Object.values(result.rows[0])[0];
        return {
          data: singleValue,
          error: null,
          count: 1,
          status: 200,
          statusText: 'OK'
        };
      }

      return {
        data: result.rows.length > 0 ? result.rows : null,
        error: null,
        count: result.rowCount,
        status: 200,
        statusText: 'OK'
      };
    } catch (err: any) {
      return {
        data: null,
        error: new PostgresError(err.message, err.code),
        count: null,
        status: 500,
        statusText: 'Internal Server Error'
      };
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export const postgresAdmin = new PostgresClient();
