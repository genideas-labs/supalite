"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
    test('SupaLitePG 클래스가 정의되어 있어야 함', () => {
        expect(postgres_client_1.SupaLitePG).toBeDefined();
    });
    test('testConnection 메서드가 성공적으로 동작해야 함', async () => {
        const client = new postgres_client_1.SupaLitePG();
        const result = await client.testConnection();
        expect(result).toBe(true);
    });
});
