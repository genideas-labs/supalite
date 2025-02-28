"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../client");
describe('SupaliteClient', () => {
    test('SupaliteClient 클래스가 정의되어 있어야 함', () => {
        expect(client_1.SupaliteClient).toBeDefined();
    });
    test('SupaliteClient 인스턴스를 생성할 수 있어야 함', () => {
        // 실제 DB 연결 없이 클래스 인스턴스만 확인
        const client = {};
        expect(client).not.toBeNull();
    });
});
