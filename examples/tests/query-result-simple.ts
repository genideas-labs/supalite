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
          status?: string;
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

// 쿼리 결과 타입 정의
type UserRow = Database['public']['Tables']['users']['Row'];

// Supalite 클라이언트 인스턴스 생성
const supalite = new SupaliteClient<Database>({
  connectionString: process.env.DB_CONNECTION || 'postgresql://postgres:postgres@localhost:5432/testdb',
});

/**
 * 예제 1: Supabase 스타일로 데이터 조회 및 배열 메서드 사용
 * 
 * 이 예제는 Supabase 클라이언트 코드와 동일한 방식으로
 * result.data를 안전하게 사용하는 방법을 보여줍니다.
 */
async function example1() {
  try {
    // 데이터 조회
    const result = await supalite
      .from('users')
      .select('*');
    
    // 구조 분해 할당으로 data와 error 추출
    const { data, error } = result;
    
    // 에러 확인
    if (error) {
      throw new Error(`데이터 조회 중 에러 발생: ${error.message}`);
    }
    
    // data가 존재하고 배열인지 확인 (타입 가드)
    if (data && Array.isArray(data) && data.length > 0) {
      console.log(`조회된 사용자 수: ${data.length}`);
      
      // 배열 메서드 사용 (map)
      const userNames = data.map(user => user.name);
      console.log('사용자 이름 목록:', userNames);
      
      // 배열 메서드 사용 (filter)
      const filteredUsers = data.filter(user => 
        user.email.endsWith('@example.com')
      );
      console.log('example.com 이메일을 사용하는 사용자:', filteredUsers);
      
      // 배열 메서드 사용 (forEach)
      console.log('모든 사용자 정보:');
      data.forEach(user => {
        console.log(`ID: ${user.id}, 이름: ${user.name}, 이메일: ${user.email}`);
      });
      
      // 첫 번째 사용자 정보 가져오기 (Supabase 스타일)
      const firstUser = data[0];
      console.log('첫 번째 사용자:', firstUser);
    } else {
      console.log('조회된 사용자가 없습니다.');
    }

    return { data, error };
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

/**
 * 예제 2: 결과가 없을 때의 처리 (Supabase 스타일)
 * 
 * 이 예제는 Supabase 스타일로 결과가 없을 때의 처리 방법을 보여줍니다.
 */
async function example2() {
  try {
    // 존재하지 않는 조건으로 데이터 조회
    const { data, error } = await supalite
      .from('users')
      .select('*')
      .eq('id', -1); // 존재하지 않는 ID
    
    // 에러 확인
    if (error) {
      throw new Error(`데이터 조회 중 에러 발생: ${error.message}`);
    }
    
    // data가 존재하고 배열인지 확인 (타입 가드)
    if (data && Array.isArray(data)) {
      console.log('데이터가 있거나 빈 배열입니다');
      
      // 빈 배열 확인을 위해서는 length 속성 사용
      if (data.length === 0) {
        console.log('조회된 사용자가 없습니다');
      } else {
        console.log(`조회된 사용자 수: ${data.length}`);
      }
      
      // 빈 배열에도 배열 메서드 사용 가능
      const userNames = data.map(user => user.name);
      console.log('사용자 이름 목록:', userNames); // [] 출력
    } else {
      console.log('데이터가 없습니다 (이 메시지는 출력되지 않음)');
    }
    
    return { data, error };
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

/**
 * 예제 3: 에러 처리 (Supabase 스타일)
 * 
 * 이 예제는 Supabase 스타일로 에러를 처리하는 방법을 보여줍니다.
 */
async function example3() {
  try {
    // 잘못된 테이블 이름으로 데이터 조회 시도
    const { data, error } = await (supalite
      .from('non_existent_table' as any)
      .select('*'));
    
    // 에러 확인 (Supabase 스타일)
    if (error) {
      console.log(`에러 발생! 메시지: ${error.message}`);
      return { data: [], error }; // 에러 발생 시에도 data는 빈 배열
    }
    
    // 이 코드는 에러가 없을 때만 실행됨
    // data가 존재하고 배열인지 확인 (타입 가드)
    if (data && Array.isArray(data) && data.length > 0) {
      console.log(`조회된 데이터 수: ${data.length}`);
      data.forEach(item => {
        console.log(item);
      });
    } else {
      console.log('조회된 데이터가 없습니다');
    }
    
    return { data, error };
  } catch (error) {
    console.error('예상치 못한 에러 발생:', error);
    
    // 에러 객체 생성 (Supabase 스타일)
    const errorResult = {
      data: [], // 에러 발생 시에도 빈 배열 반환
      error: new PostgresError('테이블이 존재하지 않습니다.'),
      count: null,
      status: 500,
      statusText: 'Internal Server Error',
    };
    
    return errorResult;
  }
}

/**
 * 예제 4: 데이터 존재 여부 확인 (Supabase 스타일)
 * 
 * 이 예제는 Supabase 스타일로 데이터 존재 여부를 확인하는 방법을 보여줍니다.
 */
async function example4() {
  try {
    // 데이터 조회
    const { data, error } = await supalite
      .from('users')
      .select('*')
      .eq('status', 'active');
    
    // 에러 확인
    if (error) {
      throw new Error(`데이터 조회 중 에러 발생: ${error.message}`);
    }
    
    // 데이터 존재 여부 확인 (Supabase 스타일)
    // data가 존재하고 배열인지 확인 (타입 가드)
    if (data && Array.isArray(data) && data.length > 0) {
      console.log(`활성 사용자 수: ${data.length}`);
      
      // 첫 번째 사용자 정보 출력 (Supabase 스타일)
      const firstUser = data[0];
      console.log('첫 번째 활성 사용자:', firstUser);
      
      // 특정 사용자 찾기 (Supabase 스타일)
      const specificUser = data.find(user => user.name === '홍길동');
      if (specificUser) {
        console.log('홍길동 사용자 정보:', specificUser);
      }
    } else {
      console.log('활성 사용자가 없습니다');
    }
    
    return { data, error };
  } catch (error) {
    console.error('예상치 못한 에러 발생:', error);
    throw error;
  }
}

// 예제 실행 함수
async function runExamples() {
  console.log('===== 예제 1: 타입 가드 없이 데이터 조회 및 배열 메서드 사용 =====');
  await example1().catch(console.error);

  console.log('\n===== 예제 2: if (!data) 방식의 조건 처리 =====');
  await example2().catch(console.error);

  console.log('\n===== 예제 3: 에러 처리 (if (!data) 방식) =====');
  await example3().catch(console.error);

  console.log('\n===== 예제 4: 데이터 존재 여부 확인 (Supabase 스타일) =====');
  await example4().catch(console.error);
}

// 예제 실행
console.log('===== 타입 가드 없이 안전하게 사용하는 예제 =====');
runExamples().catch(console.error);

export {
  example1,
  example2,
  example3,
  example4,
  runExamples,
};
