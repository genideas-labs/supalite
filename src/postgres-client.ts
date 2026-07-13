import { Pool, PoolClient, types, PoolConfig } from 'pg'; // PoolConfig 추가
import { QueryBuilder } from './query-builder';
import { PostgresError } from './errors';
import { TableOrViewName, SupaliteConfig, Row, QueryResult, SingleQueryResult, BigintTransformType } from './types'; // BigintTransformType 추가
import { config as dotenvConfig } from 'dotenv';

// .env 파일 로드
dotenvConfig();

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

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
  private static returnTypeCache: Map<string, boolean> = new Map();

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

  private async isScalarReturn(): Promise<boolean> {
    const cacheKey = `${this.schema}.${this.procedureName}`;
    const cached = RpcBuilder.returnTypeCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const metaQuery = `
        SELECT p.proretset, t.typtype, t.typname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_type t ON t.oid = p.prorettype
        WHERE n.nspname = $1 AND p.proname = $2
        LIMIT 1
      `;
      const metaResult = await this.pool.query(metaQuery, [this.schema, this.procedureName]);
      if (metaResult.rows.length === 0) {
        RpcBuilder.returnTypeCache.set(cacheKey, false);
        return false;
      }

      const { proretset, typtype, typname } = metaResult.rows[0];
      const isScalar = !proretset && typtype !== 'c' && typname !== 'record';
      RpcBuilder.returnTypeCache.set(cacheKey, isScalar);
      return isScalar;
    } catch {
      return false;
    }
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
      const isScalarReturn = isScalarCandidate ? await this.isScalarReturn() : false;

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
        if (isScalarCandidate && isScalarReturn) {
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
      if (isScalarCandidate && isScalarReturn) {
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
        data: result.rows,
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

/**
 * Internal one-shot channel: createTransactionScope() sets this so the next
 * SupaLitePG constructor skips the process-global pg.types.setTypeParser setup
 * (the owning client already configured it). Set and reset synchronously around
 * `new SupaLitePG` — there is no await between assignment and construction, so
 * concurrent transaction() calls cannot race on it. Kept out of the public
 * constructor signature so the published type surface is unchanged.
 */
let skipNextTypeParserSetup = false;

export class SupaLitePG<T extends { [K: string]: SchemaWithTables }> {
  private pool: Pool;
  private client: any | null = null;
  private isTransaction: boolean = false;
  private schema: string;
  private schemaCache: Map<string, Map<string, string>> = new Map(); // schemaName.tableName -> Map<columnName, pgDataType>
  private foreignKeyCache: Map<string, any> = new Map();
  public verbose: boolean = false;
  private bigintTransform: BigintTransformType;
  private ownsPool: boolean = true;

  constructor(config?: SupaliteConfig) {
    this.verbose = config?.verbose || process.env.SUPALITE_VERBOSE === 'true' || false;
    this.bigintTransform = config?.bigintTransform || 'number-or-string'; // 기본값 'number-or-string'

    if (this.verbose) {
      console.log(`[SupaLite VERBOSE] BIGINT transform mode set to: '${this.bigintTransform}'`);
    }

    // 타입 파서 설정 (process-global). Skipped for isolated transaction scopes —
    // the owning client already configured the global parser for this
    // bigintTransform; re-running setTypeParser() on every transaction() would
    // re-assert it process-wide and could flip BIGINT parsing for another
    // SupaLitePG instance in the same process using a different bigintTransform.
    if (!skipNextTypeParserSetup)
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
      case 'number-or-string':
        types.setTypeParser(20, (val: string | null) => {
          if (val === null) return null;
          const bigValue = BigInt(val);
          if (bigValue > MAX_SAFE_BIGINT || bigValue < MIN_SAFE_BIGINT) {
            if (this.verbose) {
              console.warn(
                `[SupaLite VERBOSE WARNING] BIGINT value ${val} exceeds safe integer range; ` +
                'returning string to preserve precision.'
              );
            }
            return val;
          }
          return Number(val);
        });
        break;
      case 'bigint':
      default: // 기본값 및 'bigint' 명시 시
        types.setTypeParser(20, (val: string | null) => val === null ? null : BigInt(val));
        break;
    }

    this.schema = config?.schema || 'public';

    if (config?.pool) {
      this.pool = config.pool;
      this.ownsPool = false;
      if (this.verbose) {
        console.log('[SupaLite VERBOSE] Using external Pool instance');
      }
    } else {
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
    }

    // Error handling — only manage listeners on a pool we own. For an external
    // pool (ownsPool=false) the caller owns its lifecycle and error handling;
    // attaching here would leak a listener per constructed/forked client.
    if (this.ownsPool) {
      this.pool.on('error', (err) => {
        console.error('[SupaLite ERROR] Unexpected error on idle client', err);
      });
    }
  }

  /**
   * Internal transaction plumbing — mutates THIS instance's connection state.
   * Only ever invoked on a fresh per-transaction scope (from `begin()` /
   * `transaction()`), never on a shared instance, so the mutation is safe.
   */
  private async startTx(): Promise<void> {
    if (!this.client) {
      this.client = await this.pool.connect();
    }
    try {
      await this.client.query('BEGIN');
      this.isTransaction = true;
    } catch (err) {
      // BEGIN failed: release the just-acquired connection so it doesn't leak
      // (isTransaction is still false, so commit()/rollback() won't release it).
      // Hand the error to release() so pg discards a possibly-broken connection
      // (reset/timeout) instead of returning it to the pool for reuse.
      this.client.release(err as Error);
      this.client = null;
      throw err;
    }
  }

  /** Internal: COMMIT + release on the scope's own connection (see startTx). */
  private async commitTx(): Promise<void> {
    if (this.isTransaction && this.client) {
      let commitError: unknown;
      try {
        await this.client.query('COMMIT');
      } catch (err) {
        commitError = err;
        throw err;
      } finally {
        // On COMMIT failure the connection may be in an unknown state — pass the
        // error to release() so pg discards it instead of reusing a broken client.
        this.client.release(commitError as Error | undefined);
        this.client = null;
        this.isTransaction = false;
      }
    }
  }

  /** Internal: ROLLBACK + release on the scope's own connection (see startTx). */
  private async rollbackTx(): Promise<void> {
    if (this.isTransaction && this.client) {
      let rollbackError: unknown;
      try {
        await this.client.query('ROLLBACK');
      } catch (err) {
        rollbackError = err;
        throw err;
      } finally {
        // On ROLLBACK failure the connection may be in an unknown state — pass the
        // error to release() so pg discards it instead of reusing a broken client.
        this.client.release(rollbackError as Error | undefined);
        this.client = null;
        this.isTransaction = false;
      }
    }
  }

  /**
   * Creates an isolated SupaLitePG bound to the SAME pool but with independent
   * transaction state (its own `client`/`isTransaction`). Used by transaction()
   * so concurrent transactions never collide on shared instance state. The pool
   * is shared and not owned (no error listener is attached — see constructor).
   */
  private createTransactionScope(): SupaLitePG<T> {
    // Reuse the global type parser the owning client already configured; the
    // constructor reads this flag to skip re-running setTypeParser (a
    // process-global side effect) for every transaction. Reset in finally so a
    // construction failure can't leave the flag set for the next instance.
    skipNextTypeParserSetup = true;
    let scope: SupaLitePG<T>;
    try {
      scope = new SupaLitePG<T>({
        pool: this.pool,
        schema: this.schema,
        bigintTransform: this.bigintTransform,
        verbose: this.verbose,
      });
    } finally {
      skipNextTypeParserSetup = false;
    }
    // Share the read-mostly metadata caches so each transaction doesn't cold-populate
    // information_schema. Safe: caches are append-only after the first miss, and JS is
    // single-threaded (no torn writes across awaits).
    scope.schemaCache = this.schemaCache;
    scope.foreignKeyCache = this.foreignKeyCache;
    return scope;
  }

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
  async begin(): Promise<SupaLitePG<T>> {
    if (this.isTransaction) {
      throw new Error('nested transactions are not supported');
    }
    const tx = this.createTransactionScope();
    await tx.startTx();
    return tx;
  }

  /**
   * Commits the transaction on this handle (from {@link begin}) and releases its
   * connection. Throws if there is no active transaction.
   */
  async commit(): Promise<void> {
    if (!(this.isTransaction && this.client)) {
      throw new Error('no active transaction — call begin() to obtain a transaction handle');
    }
    await this.commitTx();
  }

  /**
   * Rolls back the transaction on this handle (from {@link begin}) and releases its
   * connection. Throws if there is no active transaction.
   */
  async rollback(): Promise<void> {
    if (!(this.isTransaction && this.client)) {
      throw new Error('no active transaction — call begin() to obtain a transaction handle');
    }
    await this.rollbackTx();
  }

  // 트랜잭션 실행 (concurrency-safe: isolated scope per call)
  async transaction<R>(
    callback: (client: SupaLitePG<T>) => Promise<R>
  ): Promise<R> {
    const tx = this.createTransactionScope();
    await tx.startTx();
    try {
      const result = await callback(tx);
      await tx.commitTx();
      return result;
    } catch (error) {
      // Roll back, but never let a rollback failure mask the original error.
      try {
        await tx.rollbackTx();
      } catch (rollbackError) {
        if (this.verbose) {
          console.error('[SupaLite] rollback failed after a transaction error', rollbackError);
        }
      }
      throw error;
    }
  }

  public getQueryClient(): Pool | PoolClient {
    if (this.isTransaction && this.client) {
      return this.client as PoolClient;
    }
    return this.pool;
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
    if (!this.ownsPool) {
      return;
    }
    await this.pool.end();
  }
}

export const supalitePg = new SupaLitePG();
