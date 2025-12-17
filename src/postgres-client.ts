import { Pool, types, PoolConfig } from 'pg'; // PoolConfig 추가
import { QueryBuilder } from './query-builder';
import { PostgresError } from './errors';
import { TableOrViewName, SupaliteConfig, Row, QueryResult, SingleQueryResult, BigintTransformType } from './types'; // BigintTransformType 추가
import { config as dotenvConfig } from 'dotenv';

// .env 파일 로드
dotenvConfig();

// 타입 파서 설정은 생성자 내부로 이동

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

export class RpcBuilder implements Promise<any> {
  readonly [Symbol.toStringTag] = 'RpcBuilder';
  private singleMode: 'strict' | 'maybe' | null = null;

  constructor(
    private pool: Pool,
    private schema: string,
    private procedureName: string,
    private params: Record<string, any> = {}
  ) {}

  single() {
    this.singleMode = 'strict';
    return this;
  }

  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<any | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<any> {
    return this.execute().finally(onfinally);
  }

  async execute(): Promise<{
    data: any;
    error: PostgresError | null;
    count?: number | null;
    status?: number;
    statusText?: string;
  }> {
    try {
      const paramNames = Object.keys(this.params);
      const paramValues = Object.values(this.params);
      const paramPlaceholders = paramNames.length > 0
        ? paramNames.map((name, i) => `"${name}" := $${i + 1}`).join(', ')
        : '';

      const query = paramPlaceholders
        ? `SELECT * FROM "${this.schema}"."${this.procedureName}"(${paramPlaceholders})`
        : `SELECT * FROM "${this.schema}"."${this.procedureName}"()`;

      const result = await this.pool.query(query, paramValues);

      // Handle scalar return values (Supabase special handling)
      // If result has 1 row and 1 column, and we are not in strict table mode (which rpc generally isn't),
      // we check if it looks like a scalar return.
      // However, if single() is called, we must respect row constraints.
      
      let data: any = result.rows;

      // Unwrapping logic for scalar functions (legacy Supabase behavior emulation)
      // If it returns a single row with a single column, treat as scalar IF not forcing array via logic.
      // But here we'll stick to basic row handling first, then apply singleMode.
      
      // NOTE: Original logic had:
      // if (result.rows.length === 1 && Object.keys(result.rows[0]).length === 1) { ... return single value ... }
      // This implies unwrapping happens by default if it looks like a scalar.
      
      const isScalarCandidate = result.rows.length === 1 && Object.keys(result.rows[0]).length === 1;

      if (this.singleMode) {
        if (result.rows.length > 1) {
          return {
            data: null,
            error: new PostgresError('PGRST114: Multiple rows returned'),
            count: null,
            status: 406,
            statusText: 'Not Acceptable. Expected a single row but found multiple.'
          };
        }

        if (result.rows.length === 0) {
          if (this.singleMode === 'strict') {
            return {
              data: null,
              error: new PostgresError('PGRST116: No rows found'),
              count: null,
              status: 404,
              statusText: 'Not Found. Expected a single row but found no rows.'
            };
          }
          // maybeSingle -> null data, no error
          return {
            data: null,
            error: null,
            count: 0,
            status: 200,
            statusText: 'OK'
          };
        }

        // 1 row found
        // Check for scalar unwrapping
        if (Object.keys(result.rows[0]).length === 1) {
           data = Object.values(result.rows[0])[0];
        } else {
           data = result.rows[0];
        }
        
        return {
          data,
          error: null,
          count: 1,
          status: 200,
          statusText: 'OK'
        };
      }

      // Default behavior (no .single() called)
      if (isScalarCandidate) {
         data = Object.values(result.rows[0])[0];
         return {
          data,
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
}

export class SupaLitePG<T extends { [K: string]: SchemaWithTables }> {
  private pool: Pool;
  private client: any | null = null;
  private isTransaction: boolean = false;
  private schema: string;
  private schemaCache: Map<string, Map<string, string>> = new Map(); // schemaName.tableName -> Map<columnName, pgDataType>
  private foreignKeyCache: Map<string, any> = new Map();
  public verbose: boolean = false;
  private bigintTransform: BigintTransformType;

  constructor(config?: SupaliteConfig) {
    this.verbose = config?.verbose || process.env.SUPALITE_VERBOSE === 'true' || false;
    this.bigintTransform = config?.bigintTransform || 'bigint'; // 기본값 'bigint'

    if (this.verbose) {
      console.log(`[SupaLite VERBOSE] BIGINT transform mode set to: '${this.bigintTransform}'`);
    }

    // 타입 파서 설정
    switch (this.bigintTransform) {
      case 'string':
        types.setTypeParser(20, (val: string | null) => val === null ? null : val); // pg는 이미 문자열로 줌
        break;
      case 'number':
        types.setTypeParser(20, (val: string | null) => {
          if (val === null) return null;
          const num = Number(val);
          if (this.verbose && (num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER)) {
            console.warn(
              `[SupaLite VERBOSE WARNING] BIGINT value ${val} converted to Number might lose precision. ` +
              `Max safe integer is ${Number.MAX_SAFE_INTEGER}.`
            );
          }
          return num;
        });
        break;
      case 'bigint':
      default: // 기본값 및 'bigint' 명시 시
        types.setTypeParser(20, (val: string | null) => val === null ? null : BigInt(val));
        break;
    }
    
    let poolConfigOptions: PoolConfig = {};

    // connectionString이 제공되면 이를 우선 사용
    if (config?.connectionString || process.env.DB_CONNECTION) {
      try {
        const connectionString = config?.connectionString || process.env.DB_CONNECTION || '';
        
        if (!connectionString.startsWith('postgresql://')) {
          throw new Error('Invalid PostgreSQL connection string format. Must start with postgresql://');
        }
        
        poolConfigOptions.connectionString = connectionString;
        poolConfigOptions.ssl = config?.ssl !== undefined ? config.ssl : process.env.DB_SSL === 'true';
        
        if (this.verbose) {
          console.log('[SupaLite VERBOSE] Database connection using connection string');
        }
        
      } catch (err: any) {
        console.error('[SupaLite ERROR] Database connection error:', err.message);
        throw new Error(`Failed to establish database connection: ${err.message}`);
      }
    } else {
      // 기존 코드: 개별 매개변수 사용
      poolConfigOptions = {
        user: config?.user || process.env.DB_USER,
        host: config?.host || process.env.DB_HOST,
        database: config?.database || process.env.DB_NAME,
        password: config?.password || process.env.DB_PASS,
        port: config?.port || Number(process.env.DB_PORT) || 5432,
        ssl: config?.ssl !== undefined ? config.ssl : process.env.DB_SSL === 'true', // ssl 설정 명시적 처리
      };
      if (this.verbose) {
        console.log('[SupaLite VERBOSE] Database connection using individual parameters:', {
          ...poolConfigOptions,
          password: '********'
        });
      }
    }
    
    this.pool = new Pool(poolConfigOptions);
    this.schema = config?.schema || 'public';

    // Error handling
    this.pool.on('error', (err) => {
      console.error('[SupaLite ERROR] Unexpected error on idle client', err);
      // Consider if process.exit is too drastic for a library. Maybe re-throw or emit an event.
      // process.exit(-1); 
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

  from<K extends TableOrViewName<T, 'public'>>(
    table: K
  ): QueryBuilder<T, 'public', K> & Promise<QueryResult<Row<T, 'public', K>>> & { single(): Promise<SingleQueryResult<Row<T, 'public', K>>> };
  from<S extends keyof T, K extends TableOrViewName<T, S>>(
    table: K,
    schema: S
  ): QueryBuilder<T, S, K> & Promise<QueryResult<Row<T, S, K>>> & { single(): Promise<SingleQueryResult<Row<T, S, K>>> };
  from<S extends keyof T, K extends TableOrViewName<T, S>>(
    table: K,
    schema?: S
  ): QueryBuilder<T, S, K> & Promise<QueryResult<Row<T, S, K>>> & { single(): Promise<SingleQueryResult<Row<T, S, K>>> } {
    // QueryBuilder constructor will be updated to accept these arguments
    return new (QueryBuilder as any)( // Use 'as any' temporarily if QueryBuilder constructor not yet updated
      this.pool,
      this, // Pass the SupaLitePG instance itself
      table,
      schema || ('public' as S),
      this.verbose // Pass verbose setting
    ) as QueryBuilder<T, S, K> & Promise<QueryResult<Row<T, S, K>>> & { single(): Promise<SingleQueryResult<Row<T, S, K>>> };
  }

  public async getColumnPgType(dbSchema: string, tableName: string, columnName: string): Promise<string | undefined> {
    const tableKey = `${dbSchema}.${tableName}`;
    if (this.verbose) console.log(`[SupaLite VERBOSE] getColumnPgType called for ${tableKey}.${columnName}`);

    let tableInfo = this.schemaCache.get(tableKey);

    if (!tableInfo) {
      if (this.verbose) console.log(`[SupaLite VERBOSE] Cache miss for table ${tableKey}. Querying information_schema.`);
      try {
        const query = `
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_schema = $1 AND table_name = $2;
        `;
        // Use a temporary client from the pool for this schema query
        // if not in a transaction, or use the transaction client if in one.
        const activeClient = this.isTransaction && this.client ? this.client : await this.pool.connect();
        try {
          const result = await activeClient.query(query, [dbSchema, tableName]);
          tableInfo = new Map<string, string>();
          result.rows.forEach((row: { column_name: string; data_type: string }) => { // Add type for row
            tableInfo!.set(row.column_name, row.data_type.toLowerCase());
          });
          this.schemaCache.set(tableKey, tableInfo);
          if (this.verbose) console.log(`[SupaLite VERBOSE] Cached schema for ${tableKey}:`, tableInfo);
        } finally {
          if (!(this.isTransaction && this.client)) { // Only release if it's a temp client not managed by transaction
            (activeClient as any).release(); // Cast to any if 'release' is not on type PoolClient from transaction
          }
        }
      } catch (err: any) {
        console.error(`[SupaLite ERROR] Failed to query information_schema for ${tableKey}:`, err.message);
        return undefined; 
      }
    } else {
      if (this.verbose) console.log(`[SupaLite VERBOSE] Cache hit for table ${tableKey}.`);
    }
    
    const pgType = tableInfo?.get(columnName);
    if (this.verbose) console.log(`[SupaLite VERBOSE] pgType for ${tableKey}.${columnName}: ${pgType}`);
    return pgType;
  }

  public async getForeignKey(
    schema: string,
    table: string,
    foreignTable: string
  ): Promise<{ column: string; foreignColumn: string; isArray: boolean } | null> {
    const cacheKey = `${schema}.${table}.${foreignTable}`;
    if (this.foreignKeyCache.has(cacheKey)) {
      return this.foreignKeyCache.get(cacheKey);
    }

    const query = `
      SELECT
        kcu.column_name,
        ccu.column_name AS foreign_column_name
      FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE
        tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
        AND ccu.table_name = $3;
    `;

    const activeClient = this.isTransaction && this.client ? this.client : await this.pool.connect();
    try {
      // 1) One-to-many: `foreignTable` has a foreign key referencing `table`
      // e.g. authors <- books.author_id, so embedding books(*) on authors returns an array
      const result = await activeClient.query(query, [schema, foreignTable, table]);
      if (result.rows.length > 0) {
        const relationship = {
          column: result.rows[0].foreign_column_name,
          foreignColumn: result.rows[0].column_name,
          isArray: true,
        };
        this.foreignKeyCache.set(cacheKey, relationship);
        return relationship;
      }

      // 2) Many-to-one: `table` has a foreign key referencing `foreignTable`
      // e.g. books.author_id -> authors.id, so embedding authors(*) on books returns an object
      const reverseResult = await activeClient.query(query, [schema, table, foreignTable]);
      if (reverseResult.rows.length > 0) {
        const relationship = {
          column: reverseResult.rows[0].column_name,
          foreignColumn: reverseResult.rows[0].foreign_column_name,
          isArray: false,
        };
        this.foreignKeyCache.set(cacheKey, relationship);
        return relationship;
      }
    } finally {
      if (!(this.isTransaction && this.client)) {
        (activeClient as any).release();
      }
    }

    this.foreignKeyCache.set(cacheKey, null);
    return null;
  }

  rpc(
    procedureName: string,
    params: Record<string, any> = {}
  ): RpcBuilder {
    return new RpcBuilder(this.pool, this.schema, procedureName, params);
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
