import { PostgresError } from '../errors';
import { QueryResult } from '../types';

// Jest 전역 변수 선언
declare const describe: any;
declare const test: any;
declare const expect: any;

describe('QueryResult 타입 테스트', () => {
  // 결과가 있는 쿼리 테스트
  test('데이터가 있는 경우 배열이 정상적으로 반환되는지 확인', () => {
    const mockResult: QueryResult = {
      data: [{ id: 1, name: 'test' }, { id: 2, name: 'test2' }],
      error: null,
      count: 2,
      status: 200,
      statusText: 'OK',
    };

    // 배열 타입 확인
    expect(Array.isArray(mockResult.data)).toBe(true);
    
    // length 속성 확인
    expect(mockResult.data.length).toBe(2);
    
    // 배열 메서드 사용 확인
    const mapped = mockResult.data.map(item => item.id);
    expect(mapped).toEqual([1, 2]);
    
    const filtered = mockResult.data.filter(item => item.id === 1);
    expect(filtered).toEqual([{ id: 1, name: 'test' }]);
  });

  // 결과가 없는 쿼리 테스트
  test('데이터가 없는 경우 빈 배열이 반환되는지 확인', () => {
    const mockResult: QueryResult = {
      data: [],
      error: null,
      count: 0,
      status: 200,
      statusText: 'OK',
    };

    // 배열 타입 확인
    expect(Array.isArray(mockResult.data)).toBe(true);
    
    // length 속성 확인
    expect(mockResult.data.length).toBe(0);
    
    // 빈 배열에 배열 메서드 사용 확인
    const mapped = mockResult.data.map(item => item);
    expect(mapped).toEqual([]);
    
    const filtered = mockResult.data.filter(() => true);
    expect(filtered).toEqual([]);
  });

  // 에러 발생 시 테스트
  test('에러가 발생했을 때 data 필드가 빈 배열을 반환하는지 확인', () => {
    const mockResult: QueryResult = {
      data: [],
      error: new PostgresError('테스트 에러'),
      count: null,
      status: 500,
      statusText: 'Internal Server Error',
    };

    // 배열 타입 확인
    expect(Array.isArray(mockResult.data)).toBe(true);
    
    // length 속성 확인
    expect(mockResult.data.length).toBe(0);
    
    // 에러 정보 확인
    expect(mockResult.error).not.toBeNull();
    expect(mockResult.error?.message).toBe('테스트 에러');
  });

  // 타입 호환성 테스트
  test('배열 메서드를 사용할 수 있는지 확인', () => {
    const mockResult: QueryResult<{ id: number; name: string }> = {
      data: [{ id: 1, name: 'test' }, { id: 2, name: 'test2' }],
      error: null,
      count: 2,
      status: 200,
      statusText: 'OK',
    };

    // forEach 메서드 사용
    const ids: number[] = [];
    mockResult.data.forEach(item => {
      ids.push(item.id);
    });
    expect(ids).toEqual([1, 2]);

    // reduce 메서드 사용
    const sum = mockResult.data.reduce((acc, item) => acc + item.id, 0);
    expect(sum).toBe(3);

    // some 메서드 사용
    const hasId2 = mockResult.data.some(item => item.id === 2);
    expect(hasId2).toBe(true);

    // every 메서드 사용
    const allHaveNames = mockResult.data.every(item => item.name.length > 0);
    expect(allHaveNames).toBe(true);
  });
});
