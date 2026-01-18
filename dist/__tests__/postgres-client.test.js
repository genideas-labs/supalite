"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const postgres_client_1 = require("../postgres-client");
// pg 모듈 모킹
jest.mock('pg', () => {
    const mockPool = {
        connect: jest.fn().mockResolvedValue({
            release: jest.fn()
        }),
        query: jest.fn(),
        end: jest.fn(),
        on: jest.fn()
    };
    return {
        Pool: jest.fn(() => mockPool),
        types: {
            setTypeParser: jest.fn()
        }
    };
});
// dotenv 모듈 모킹
jest.mock('dotenv', () => ({
    config: jest.fn()
}));
describe('SupaLitePG', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    test('SupaLitePG 클래스가 정의되어 있어야 함', () => {
        expect(postgres_client_1.SupaLitePG).toBeDefined();
    });
    test('testConnection 메서드가 성공적으로 동작해야 함', async () => {
        const client = new postgres_client_1.SupaLitePG();
        const result = await client.testConnection();
        expect(result).toBe(true);
    });
    test('외부 Pool 주입 시 내부 Pool을 생성하지 않아야 함', () => {
        const poolMock = pg_1.Pool;
        const injectedPool = {
            on: jest.fn(),
            end: jest.fn(),
            connect: jest.fn(),
            query: jest.fn()
        };
        expect(() => {
            new postgres_client_1.SupaLitePG({
                pool: injectedPool,
                connectionString: 'invalid-connection-string'
            });
        }).not.toThrow();
        expect(poolMock).not.toHaveBeenCalled();
        expect(injectedPool.on).toHaveBeenCalledTimes(1);
    });
    test('외부 Pool 주입 시 close()가 pool.end를 호출하지 않아야 함', async () => {
        const injectedPool = {
            on: jest.fn(),
            end: jest.fn()
        };
        const client = new postgres_client_1.SupaLitePG({ pool: injectedPool });
        await client.close();
        expect(injectedPool.end).not.toHaveBeenCalled();
    });
    test('getQueryClient는 외부 Pool을 그대로 반환해야 함', () => {
        const injectedPool = {
            on: jest.fn(),
            end: jest.fn()
        };
        const client = new postgres_client_1.SupaLitePG({ pool: injectedPool });
        expect(client.getQueryClient()).toBe(injectedPool);
    });
});
