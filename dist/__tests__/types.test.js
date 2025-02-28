"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
describe('Types', () => {
    test('SupaliteConfig 타입이 정의되어 있어야 함', () => {
        // 타입이 존재하는지 확인하는 간단한 테스트
        const config = {
            connectionString: 'postgresql://user:pass@localhost:5432/db'
        };
        expect(config).toBeDefined();
        expect(config.connectionString).toBe('postgresql://user:pass@localhost:5432/db');
    });
});
