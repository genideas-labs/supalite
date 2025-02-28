import { SupaLitePG } from '../postgres-client';

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
    expect(SupaLitePG).toBeDefined();
  });
  
  test('testConnection 메서드가 성공적으로 동작해야 함', async () => {
    const client = new SupaLitePG();
    const result = await client.testConnection();
    expect(result).toBe(true);
  });
});
