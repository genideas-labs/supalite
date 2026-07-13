import { SupaliteClient } from '../client';
import { SupaLitePG } from '../postgres-client';

describe('SupaliteClient', () => {
  test('SupaliteClient 클래스가 정의되어 있어야 함', () => {
    expect(SupaliteClient).toBeDefined();
  });

  test('생성자가 실행되어 SupaLitePG를 확장한 인스턴스를 만든다', async () => {
    // The constructor delegates to SupaLitePG(config); a bogus connection string
    // is fine because the Pool is lazy (no connection until a query).
    const client = new SupaliteClient({ connectionString: 'postgresql://mock' });
    expect(client).toBeInstanceOf(SupaLitePG);
    await client.close();
  });
});
