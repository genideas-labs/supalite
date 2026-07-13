"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../client");
const postgres_client_1 = require("../postgres-client");
describe('SupaliteClient', () => {
    test('SupaliteClient 클래스가 정의되어 있어야 함', () => {
        expect(client_1.SupaliteClient).toBeDefined();
    });
    test('생성자가 실행되어 SupaLitePG를 확장한 인스턴스를 만든다', async () => {
        // The constructor delegates to SupaLitePG(config); a bogus connection string
        // is fine because the Pool is lazy (no connection until a query).
        const client = new client_1.SupaliteClient({ connectionString: 'postgresql://mock' });
        expect(client).toBeInstanceOf(postgres_client_1.SupaLitePG);
        await client.close();
    });
});
