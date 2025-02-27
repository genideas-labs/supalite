import { Pool } from 'pg';
import { QueryBuilder } from './query-builder';
import { PostgresError } from './errors';
import { TableName, SupaliteConfig, Row, DatabaseSchema, SchemaName, AsDatabaseSchema } from './types';
import { config as dotenvConfig } from 'dotenv';

// .env 파일 로드
dotenvConfig();

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

export class SupaLitePG<T extends { [K: string]: SchemaWithTables }> {
  private pool: Pool;
  private client: any | null = null;
  private isTransaction: boolean = false;
  private schema: string;

  constructor(config?: SupaliteConfig) {
    // connectionString이 제공되면 이를 우선 사용
    if (config?.connectionString || process.env.DB_CONNECTION) {
      try {
        const connectionString = config?.connectionString || process.env.DB_CONNECTION || '';
        
        // 간단한 유효성 검사 (postgresql:// 로 시작하는지)
        if (!connectionString.startsWith('postgresql://')) {
          throw new Error('Invalid PostgreSQL connection string format. Must start with postgresql://');
        }
        
        this.pool = new Pool({ 
          connectionString,
          ssl: config?.ssl !== undefined ? config.ssl : process.env.DB_SSL === 'true'
        });
        
        // 스키마 설정
        this.schema = config?.schema || 'public';
        
        // 디버그용 로그
        console.log('Database connection using connection string');
        
        // Error handling
        this.pool.on('error', (err) => {
          console.error('Unexpected error on idle client', err);
          process.exit(-1);
        });
        
        return;
      } catch (err: any) {
        console.error('Database connection error:', err.message);
        throw new Error(`Failed to establish database connection: ${err.message}`);
      }
    }
    
    // 기존 코드: 개별 매개변수 사용
    const poolConfig = {
      user: config?.user || process.env.DB_USER,
      host: config?.host || process.env.DB_HOST,
      database: config?.database || process.env.DB_NAME,
      password: config?.password || process.env.DB_PASS,
      port: config?.port || Number(process.env.DB_PORT) || 5432,
      ssl: config?.ssl || process.env.DB_SSL === 'true',
    };

    this.schema = config?.schema || 'public';

    // 디버그용 로그 (비밀번호는 제외)
    console.log('Database connection config:', {
      ...poolConfig,
      password: '********'
    });

    this.pool = new Pool(poolConfig);

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
  async transaction<R>(
    callback: (client: SupaLitePG<T>) => Promise<R>
  ): Promise<R> {
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

  from<K extends keyof T['public']['Tables']>(
    table: K
  ): QueryBuilder<T, 'public', K>;
  from<S extends keyof T, K extends keyof T[S]['Tables']>(
    table: K,
    schema: S
  ): QueryBuilder<T, S, K>;
  from<S extends keyof T, K extends keyof T[S]['Tables']>(
    table: K,
    schema?: S
  ): QueryBuilder<T, S, K> {
    return new QueryBuilder<T, S, K>(
      this.pool,
      table,
      schema || 'public' as S
    );
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
        ? `SELECT * FROM "${this.schema}"."${procedureName}"(${paramPlaceholders})`
        : `SELECT * FROM "${this.schema}"."${procedureName}"()`;

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

  // 연결 테스트 메서드
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      client.release();
      return true;
    } catch (err: any) {
      console.error('Connection test failed:', err.message);
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export const supalitePg = new SupaLitePG();
