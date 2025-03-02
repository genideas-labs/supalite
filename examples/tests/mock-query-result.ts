import { PostgresError } from '../../src/errors';
import { QueryResult } from '../../src/types';

// 모의 데이터
const mockUsers = [
  { id: 1, name: '홍길동', email: 'hong@example.com', created_at: '2025-01-01T00:00:00Z' },
  { id: 2, name: '김철수', email: 'kim@example.com', created_at: '2025-01-02T00:00:00Z' },
  { id: 3, name: '이영희', email: 'lee@gmail.com', created_at: '2025-01-03T00:00:00Z' }
];

// 모의 QueryResult 생성 함수
function createMockQueryResult<T>(data: T[]): QueryResult<T> {
  return {
    data,
    error: null,
    count: data.length,
    status: 200,
    statusText: 'OK'
  };
}

/**
 * 예제 1: 데이터 조회 및 배열 메서드 사용
 * 
 * 이 예제는 users 테이블에서 데이터를 조회하고, 
 * 결과가 항상 배열로 반환되므로 배열 메서드를 안전하게 사용할 수 있음을 보여줍니다.
 */
function example1() {
  // 모의 데이터로 QueryResult 생성
  const result = createMockQueryResult(mockUsers);

  // 타입 가드: result.data가 배열인지 확인
  if (Array.isArray(result.data)) {
    // 결과가 항상 배열이므로 length 속성 사용 가능
    console.log(`조회된 사용자 수: ${result.data.length}`);

    // 배열 메서드 사용 (map)
    const userNames = result.data.map(user => user.name);
    console.log('사용자 이름 목록:', userNames);

    // 배열 메서드 사용 (filter)
    const filteredUsers = result.data.filter(user => 
      user.email.endsWith('@example.com')
    );
    console.log('example.com 이메일을 사용하는 사용자:', filteredUsers);

    // 배열 메서드 사용 (forEach)
    console.log('모든 사용자 정보:');
    result.data.forEach(user => {
      console.log(`ID: ${user.id}, 이름: ${user.name}, 이메일: ${user.email}`);
    });
  }

  return result;
}

/**
 * 예제 2: 결과가 없을 때의 처리
 * 
 * 이 예제는 조건에 맞는 데이터가 없을 때도 
 * 빈 배열이 반환되므로 안전하게 배열 메서드를 사용할 수 있음을 보여줍니다.
 */
function example2() {
  // 빈 배열로 QueryResult 생성 (타입 정보 추가)
  const result = createMockQueryResult<{id: number; name: string; email: string; created_at: string}>([]);

  // 타입 가드: result.data가 배열인지 확인
  if (Array.isArray(result.data)) {
    // 결과가 없어도 빈 배열이 반환되므로 length 속성 사용 가능
    console.log(`조회된 사용자 수: ${result.data.length}`); // 0 출력

    // 빈 배열에도 배열 메서드 사용 가능
    const userNames = result.data.map(user => user.name);
    console.log('사용자 이름 목록:', userNames); // [] 출력

    // 조건부 처리
    if (result.data.length === 0) {
      console.log('조건에 맞는 사용자가 없습니다.');
    } else {
      console.log('조건에 맞는 사용자가 있습니다.');
    }
  }

  return result;
}

/**
 * 예제 3: 에러 처리
 * 
 * 이 예제는 에러가 발생했을 때도 
 * data 필드가 빈 배열을 반환하므로 안전하게 사용할 수 있음을 보여줍니다.
 */
function example3() {
  try {
    // 에러 발생 시뮬레이션
    throw new Error('테이블이 존재하지 않습니다.');
  } catch (error) {
    // 에러 객체 생성
    const errorResult = {
      data: [], // 에러 발생 시에도 빈 배열 반환
      error: new PostgresError('테이블이 존재하지 않습니다.'),
      count: null,
      status: 500,
      statusText: 'Internal Server Error',
    };

    // 에러가 발생해도 data 필드는 빈 배열이므로 안전하게 사용 가능
    console.log(`에러 발생! 데이터 수: ${errorResult.data.length}`); // 0 출력
    console.log(`에러 메시지: ${errorResult.error?.message}`);

    return errorResult;
  }
}

/**
 * 예제 4: Supabase 호환성 예제
 * 
 * 이 예제는 Supabase 코드를 Supalite로 마이그레이션할 때
 * 타입 호환성 문제 없이 사용할 수 있음을 보여줍니다.
 */
function example4() {
  // 모의 데이터로 QueryResult 생성
  const result = createMockQueryResult(mockUsers);

  // 타입 가드: result.data가 배열인지 확인
  if (Array.isArray(result.data)) {
    // Supabase 코드와 동일하게 length 속성 사용
    const userCount = result.data.length;
    console.log(`사용자 수: ${userCount}`);

    // Supabase 코드와 동일하게 배열 메서드 사용
    const processedUsers = result.data.map(user => ({
      id: user.id,
      displayName: user.name,
      emailAddress: user.email,
    }));

    // 배열 파라미터로 전달
    const processUsers = (users: any[]) => {
      return users.map(user => `${user.name} (${user.email})`);
    };

    // result.data를 배열 파라미터로 전달 (Supabase 호환)
    const userList = processUsers(result.data);
    console.log('사용자 목록:', userList);

    return {
      userCount,
      processedUsers,
      userList,
    };
  }
  
  return { userCount: 0, processedUsers: [], userList: [] };
}

// 예제 실행 함수
function runExamples() {
  console.log('===== 예제 1: 데이터 조회 및 배열 메서드 사용 =====');
  example1();

  console.log('\n===== 예제 2: 결과가 없을 때의 처리 =====');
  example2();

  console.log('\n===== 예제 3: 에러 처리 =====');
  example3();

  console.log('\n===== 예제 4: Supabase 호환성 예제 =====');
  example4();
}

// 예제 실행
runExamples();

export {
  example1,
  example2,
  example3,
  example4,
  runExamples,
};
