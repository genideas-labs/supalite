"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supalitePg = exports.SupaLitePG = void 0;
const pg_1 = require("pg");
const query_builder_1 = require("./query-builder");
const errors_1 = require("./errors");
const dotenv_1 = require("dotenv");
// .env 파일 로드
(0, dotenv_1.config)();
// bigint 타입(OID: 20)을 JavaScript의 BigInt로 변환하는 파서 등록
pg_1.types.setTypeParser(20, function (val) {
    return val === null ? null : BigInt(val);
});
class SupaLitePG {
    constructor(config) {
        this.client = null;
        this.isTransaction = false;
        // connectionString이 제공되면 이를 우선 사용
        if (config?.connectionString || process.env.DB_CONNECTION) {
            try {
                const connectionString = config?.connectionString || process.env.DB_CONNECTION || '';
                // 간단한 유효성 검사 (postgresql:// 로 시작하는지)
                if (!connectionString.startsWith('postgresql://')) {
                    throw new Error('Invalid PostgreSQL connection string format. Must start with postgresql://');
                }
                this.pool = new pg_1.Pool({
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
            }
            catch (err) {
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
        this.pool = new pg_1.Pool(poolConfig);
        // Error handling
        this.pool.on('error', (err) => {
            console.error('Unexpected error on idle client', err);
            process.exit(-1);
        });
    }
    // 트랜잭션 시작
    async begin() {
        if (!this.client) {
            this.client = await this.pool.connect();
        }
        await this.client.query('BEGIN');
        this.isTransaction = true;
    }
    // 트랜잭션 커밋
    async commit() {
        if (this.isTransaction && this.client) {
            await this.client.query('COMMIT');
            this.client.release();
            this.client = null;
            this.isTransaction = false;
        }
    }
    // 트랜잭션 롤백
    async rollback() {
        if (this.isTransaction && this.client) {
            await this.client.query('ROLLBACK');
            this.client.release();
            this.client = null;
            this.isTransaction = false;
        }
    }
    // 트랜잭션 실행
    async transaction(callback) {
        await this.begin();
        try {
            const result = await callback(this);
            await this.commit();
            return result;
        }
        catch (error) {
            await this.rollback();
            throw error;
        }
    }
    from(table, schema) {
        return new query_builder_1.QueryBuilder(this.pool, table, schema || 'public');
    }
    async rpc(procedureName, params = {}) {
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
        }
        catch (err) {
            return {
                data: null,
                error: new errors_1.PostgresError(err.message, err.code),
                count: null,
                status: 500,
                statusText: 'Internal Server Error'
            };
        }
    }
    // 연결 테스트 메서드
    async testConnection() {
        try {
            const client = await this.pool.connect();
            client.release();
            return true;
        }
        catch (err) {
            console.error('Connection test failed:', err.message);
            return false;
        }
    }
    async close() {
        await this.pool.end();
    }
}
exports.SupaLitePG = SupaLitePG;
exports.supalitePg = new SupaLitePG();
