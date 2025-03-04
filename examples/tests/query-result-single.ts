import { SupaliteClient } from '../../src';
import { PostgresError } from '../../src/errors';
import { SingleQueryResult } from '../../src/types';

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

// 사용자 행 타입 정의
type UserRow = Database['public']['Tables']['users']['Row'];

// Supalite 클라이언트 인스턴스 생성
const supalite = new SupaliteClient<Database>({
  connectionString: process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb',
});

/**
 * 예제 1: single() 메서드를 사용하여 단일 행 조회
 * 
 * 이 예제는 ID로 단일 사용자를 조회하는 방법을 보여줍니다.
 */
async function example1() {
  try {
    // ID로 단일 사용자 조회
    const { data, error } = await supalite
      .from('users')
      .select('*')
      .eq('id', 1)
      .single();
    
    // 에러 확인
    if (error) {
      throw new Error(`데이터 조회 중 에러 발생: ${error.message}`);
    }
    
    // data가 존재하는지 확인 (null이 아닌지)
    if (data) {
      console.log('사용자 정보:');
      console.log(`ID: ${data.id}, 이름: ${data.name}, 이메일: ${data.email}`);
      
      // 단일 행의 특정 필드에 직접 접근 가능
      console.log(`사용자 이름: ${data.name}`);
    } else {
      console.log('해당 ID의 사용자가 없습니다.');
    }

    return { data, error };
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

/**
 * 예제 2: 결과가 없을 때의 처리
 * 
 * 이 예제는 존재하지 않는 ID로 사용자를 조회할 때의 처리 방법을 보여줍니다.
 */
async function example2() {
  try {
    // 존재하지 않는 ID로 사용자 조회
    const { data, error } = await supalite
      .from('users')
      .select('*')
      .eq('id', -1) // 존재하지 않는 ID
      .single();
    
    // 에러 확인
    if (error) {
      throw new Error(`데이터 조회 중 에러 발생: ${error.message}`);
    }
    
    // data가 null인지 확인
    if (!data) {
      console.log('해당 ID의 사용자가 없습니다.');
      return { data, error };
    }
    
    // 이 코드는 data가 null이 아닐 때만 실행됨
    console.log('사용자 정보:');
    console.log(`ID: ${data.id}, 이름: ${data.name}, 이메일: ${data.email}`);
    
    return { data, error };
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

/**
 * 예제 3: 여러 행이 반환될 때의 에러 처리
 * 
 * 이 예제는 single() 메서드를 사용했을 때 여러 행이 반환되는 경우의 에러 처리 방법을 보여줍니다.
 */
async function example3() {
  try {
    // 조건 없이 모든 사용자 조회 시도 (여러 행이 반환될 수 있음)
    const { data, error } = await supalite
      .from('users')
      .select('*')
      .single();
    
    // 에러 확인 (여러 행이 반환되면 에러가 발생함)
    if (error) {
      console.log(`에러 발생! 메시지: ${error.message}`);
      // 에러 처리 로직
      return { data, error };
    }
    
    // 이 코드는 에러가 없을 때만 실행됨 (즉, 행이 0개 또는 1개일 때)
    if (data) {
      console.log('사용자 정보:');
      console.log(`ID: ${data.id}, 이름: ${data.name}, 이메일: ${data.email}`);
    } else {
      console.log('사용자가 없습니다.');
    }
    
    return { data, error };
  } catch (error) {
    console.error('예상치 못한 에러 발생:', error);
    throw error;
  }
}

/**
 * 예제 4: 조건부 로직 처리
 * 
 * 이 예제는 single() 메서드를 사용하여 조건부 로직을 처리하는 방법을 보여줍니다.
 */
async function example4() {
  try {
    // 특정 이메일로 사용자 조회
    const { data, error } = await supalite
      .from('users')
      .select('*')
      .eq('email', 'test@example.com')
      .single();
    
    // 에러 확인
    if (error) {
      throw new Error(`데이터 조회 중 에러 발생: ${error.message}`);
    }
    
    // 사용자가 존재하는지 여부에 따라 다른 로직 실행
    if (data) {
      // 사용자가 존재하는 경우
      console.log('기존 사용자 정보:');
      console.log(`ID: ${data.id}, 이름: ${data.name}, 이메일: ${data.email}`);
      
      // 사용자 정보 업데이트 로직
      const updateResult = await supalite
        .from('users')
        .update({ name: '업데이트된 이름' })
        .eq('id', data.id)
        .single();
      
      console.log('사용자 정보가 업데이트되었습니다.');
    } else {
      // 사용자가 존재하지 않는 경우
      console.log('해당 이메일의 사용자가 없습니다. 새 사용자를 생성합니다.');
      
      // 새 사용자 생성 로직
      const insertResult = await supalite
        .from('users')
        .insert({
          name: '새 사용자',
          email: 'test@example.com',
          created_at: new Date().toISOString()
        })
        .single();
      
      console.log('새 사용자가 생성되었습니다.');
    }
    
    return { data, error };
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

/**
 * 예제 5: 타입 안전성 확인
 * 
 * 이 예제는 single() 메서드의 타입 안전성을 확인하는 방법을 보여줍니다.
 */
async function example5() {
  try {
    // ID로 단일 사용자 조회
    const result = await supalite
      .from('users')
      .select('*')
      .eq('id', 1)
      .single();
    
    // 타입 단언 없이도 SingleQueryResult<UserRow> 타입으로 인식됨
    const { data, error }: SingleQueryResult<UserRow> = result;
    
    // 에러 확인
    if (error) {
      throw new Error(`데이터 조회 중 에러 발생: ${error.message}`);
    }
    
    // data가 null이 아닌지 확인
    if (data) {
      // 타입 안전성: data는 UserRow 타입으로 인식됨
      const { id, name, email, status, created_at } = data;
      
      console.log('사용자 정보 (구조 분해 할당):');
      console.log(`ID: ${id}, 이름: ${name}, 이메일: ${email}`);
      console.log(`상태: ${status || '없음'}, 생성일: ${created_at}`);
    } else {
      console.log('해당 ID의 사용자가 없습니다.');
    }
    
    return { data, error };
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

// 예제 실행 함수
async function runExamples() {
  console.log('===== 예제 1: single() 메서드를 사용하여 단일 행 조회 =====');
  await example1().catch(console.error);

  console.log('\n===== 예제 2: 결과가 없을 때의 처리 =====');
  await example2().catch(console.error);

  console.log('\n===== 예제 3: 여러 행이 반환될 때의 에러 처리 =====');
  await example3().catch(console.error);

  console.log('\n===== 예제 4: 조건부 로직 처리 =====');
  await example4().catch(console.error);

  console.log('\n===== 예제 5: 타입 안전성 확인 =====');
  await example5().catch(console.error);
}

// 예제 실행
console.log('===== single() 메서드 사용 예제 =====');
runExamples().catch(console.error);

export {
  example1,
  example2,
  example3,
  example4,
  example5,
  runExamples,
};
