"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_client_1 = require("../postgres-client");
const pg_1 = require("pg");
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)(); // .env 변수 로드
const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';
describe("QueryBuilder: select({ count: 'exact' })", () => {
    let client;
    let pool;
    const totalUsers = 10;
    beforeAll(async () => {
        pool = new pg_1.Pool({ connectionString });
        // count_test_users 테이블이 없는 경우 생성
        await pool.query(`
      CREATE TABLE IF NOT EXISTS count_test_users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL
      );
    `);
    });
    beforeEach(async () => {
        client = new postgres_client_1.SupaLitePG({ connectionString, verbose: true }); // verbose 활성화
        // 테스트 데이터 정리 및 삽입
        await pool.query('DELETE FROM count_test_users;');
        const usersToInsert = [];
        for (let i = 1; i <= totalUsers; i++) {
            usersToInsert.push({
                name: `User ${i}`,
                email: `user${i}@example.com`,
            });
        }
        // SupaLite의 insert 메서드를 사용하여 데이터 삽입
        await client.from('count_test_users').insert(usersToInsert);
    });
    afterEach(async () => {
        if (client) {
            await client.close();
        }
    });
    afterAll(async () => {
        await pool.end();
    });
    test('should return the exact total count without limit', async () => {
        const { data, error, count } = await client
            .from('count_test_users')
            .select('*', { count: 'exact' });
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.length).toBe(totalUsers);
        expect(count).toBe(totalUsers);
    });
    test('should return the exact total count with limit', async () => {
        const limit = 3;
        const { data, error, count } = await client
            .from('count_test_users')
            .select('*', { count: 'exact' })
            .limit(limit);
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.length).toBe(limit);
        expect(count).toBe(totalUsers); // count는 limit과 상관없이 전체 개수여야 함
    });
    test('should return a count of 0 when no rows are found', async () => {
        const { data, error, count } = await client
            .from('count_test_users')
            .select('*', { count: 'exact' })
            .eq('name', 'NonExistentUser');
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.length).toBe(0);
        expect(count).toBe(0);
    });
    test('data should not contain the exact_count column', async () => {
        const { data, error } = await client
            .from('count_test_users')
            .select('*', { count: 'exact' })
            .limit(1);
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.length).toBe(1);
        // exact_count 속성이 최종 결과에 포함되지 않았는지 확인
        expect(data[0]).not.toHaveProperty('exact_count');
    });
    test('should return only the exact count when head is true', async () => {
        const { data, error, count } = await client
            .from('count_test_users')
            .select('*', { count: 'exact', head: true });
        expect(error).toBeNull();
        expect(data).toEqual([]); // head: true일 때는 데이터가 비어있어야 함
        expect(count).toBe(totalUsers);
    });
    test('should return the exact total count with range', async () => {
        const from = 2;
        const to = 5;
        const { data, error, count } = await client
            .from('count_test_users')
            .select('*', { count: 'exact' })
            .range(from, to);
        expect(error).toBeNull();
        expect(data).not.toBeNull();
        expect(data?.length).toBe(to - from + 1);
        expect(count).toBe(totalUsers);
    });
});
