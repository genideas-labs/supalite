import { Pool } from 'pg';
import { QueryBuilder } from './query-builder';
import { PostgresError } from './errors';
import { TableName, PostgresConfig } from './types';

export class PostgresClient {
  private pool: Pool;

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

  from<T extends TableName>(table: T): QueryBuilder<T> {
    return new QueryBuilder<T>(this.pool, table);
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

export const postgresClient = new PostgresClient();
