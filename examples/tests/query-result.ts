import { SupaliteClient } from '../../src';
import { PostgresError } from '../../src/errors';
import { QueryResult } from '../../src/types';

// Node.js 타입 정의
declare const process: {
  env: {
    [key: string]: string | undefined;
  };
};

// 데이터베이스 스키마 타입 정의
type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: number;
          name: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          email: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          email?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
  };
};

// Supalite 클라이언트 인스턴스 생성
const supalite = new SupaliteClient<Database>({
  connectionString: process.env.DB_CONNECTION || 'postgresql://postgres:postgres@localhost:5432/testdb',
});

/**
 * 예제 1: 데이터 조회 및 배열 메서드 사용
 * 
 * 이 예제는 users 테이블에서 데이터를 조회하고, 
 * 결과가 항상 배열로 반환되므로 배열 메서드를 안전하게 사용할 수 있음을 보여줍니다.
 */
async function example1() {
  try {
    // 데이터 조회
    const result = await supalite
      .from('users')
      .select('*');

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
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

/**
 * 예제 2: 결과가 없을 때의 처리
 * 
 * 이 예제는 조건에 맞는 데이터가 없을 때도 
 * 빈 배열이 반환되므로 안전하게 배열 메서드를 사용할 수 있음을 보여줍니다.
 */
async function example2() {
  try {
    // 존재하지 않는 조건으로 데이터 조회
    const result = await supalite
      .from('users')
      .select('*')
      .eq('id', -1); // 존재하지 않는 ID

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
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

/**
 * 예제 3: 에러 처리
 * 
 * 이 예제는 에러가 발생했을 때도 
 * data 필드가 빈 배열을 반환하므로 안전하게 사용할 수 있음을 보여줍니다.
 */
async function example3() {
  try {
    // 잘못된 테이블 이름으로 데이터 조회 시도 (타입 캐스팅으로 컴파일 에러 회피)
    const result = await (supalite
      .from('non_existent_table' as any)
      .select('*'));

    // 이 코드는 실행되지 않음 (에러가 발생하여 catch 블록으로 이동)
    // 타입 가드: result.data가 배열인지 확인
    if (Array.isArray(result.data)) {
      console.log(`조회된 데이터 수: ${result.data.length}`);
    }
    return result;
  } catch (error) {
    // 에러 객체 생성 (실제로는 supalite에서 반환한 에러 객체를 사용)
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
async function example4() {
  try {
    // 데이터 조회
    const result = await supalite
      .from('users')
      .select('*');

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
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

// 예제 실행 함수
async function runExamples() {
  console.log('===== 예제 1: 데이터 조회 및 배열 메서드 사용 =====');
  await example1().catch(console.error);

  console.log('\n===== 예제 2: 결과가 없을 때의 처리 =====');
  await example2().catch(console.error);

  console.log('\n===== 예제 3: 에러 처리 =====');
  await example3().catch(console.error);

  console.log('\n===== 예제 4: Supabase 호환성 예제 =====');
  await example4().catch(console.error);
}

// 예제 실행
console.log('===== 실제 데이터베이스 연결을 통한 예제 실행 =====');
runExamples().catch(console.error);

export {
  example1,
  example2,
  example3,
  example4,
  runExamples,
};
