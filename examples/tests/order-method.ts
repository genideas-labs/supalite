import { SupaliteClient } from '../../src';
import { PostgresError } from '../../src/errors';

// 데이터베이스 스키마 타입 정의
type Database = {
  public: {
    Tables: {
      code_routes: {
        Row: {
          id: number;
          prefix_code: string;
          post_index: number;
          title: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          prefix_code: string;
          post_index: number;
          title: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          prefix_code?: string;
          post_index?: number;
          title?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
  };
};

// Supalite 클라이언트 인스턴스 생성
const supalite = new SupaliteClient<Database>({
  connectionString: process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb',
});

/**
 * 테스트 데이터베이스 설정
 */
async function setupDatabase() {
  try {
    console.log('데이터베이스 설정을 시작합니다...');

    // code_routes 테이블이 이미 존재하는지 확인
    const checkTableResult = await supalite.rpc('check_table_exists', { table_name: 'code_routes' });
    
    if (checkTableResult.error) {
      // RPC가 없는 경우 직접 쿼리 실행
      const pool = new (require('pg').Pool)({
        connectionString: process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb',
      });
      
      const tableExistsResult = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'code_routes'
        );
      `);
      
      const tableExists = tableExistsResult.rows[0].exists;
      
      if (!tableExists) {
        console.log('code_routes 테이블이 존재하지 않습니다. 테이블을 생성합니다.');
        
        // code_routes 테이블 생성
        await pool.query(`
          CREATE TABLE code_routes (
            id SERIAL PRIMARY KEY,
            prefix_code VARCHAR(50) NOT NULL,
            post_index INTEGER NOT NULL,
            title VARCHAR(200) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        
        // 테스트 데이터 추가
        await pool.query(`
          INSERT INTO code_routes (prefix_code, post_index, title) VALUES
          ('ABC', 3, '세 번째 게시물'),
          ('ABC', 1, '첫 번째 게시물'),
          ('ABC', 2, '두 번째 게시물'),
          ('XYZ', 1, 'XYZ 첫 번째'),
          ('XYZ', 2, 'XYZ 두 번째');
        `);
        
        console.log('code_routes 테이블이 생성되고 테스트 데이터가 추가되었습니다.');
      } else {
        console.log('code_routes 테이블이 이미 존재합니다. 기존 테이블을 사용합니다.');
      }
      
      await pool.end();
    } else {
      console.log('code_routes 테이블이 이미 존재합니다. 기존 테이블을 사용합니다.');
    }

    console.log('데이터베이스 설정이 완료되었습니다.');
  } catch (error) {
    console.error('데이터베이스 설정 중 오류 발생:', error);
    throw error;
  }
}

/**
 * 예제 1: 컬럼 이름만 전달하는 경우 (오름차순)
 * 
 * 이 예제는 .order('post_index')와 같이 컬럼 이름만 전달하는 경우
 * 기본적으로 오름차순 정렬이 적용되는지 확인합니다.
 */
async function example1() {
  try {
    console.log('예제 1: 컬럼 이름만 전달하는 경우 (오름차순)');
    
    // prefix_code가 'ABC'인 항목을 post_index 기준으로 정렬 (오름차순)
    const { data, error } = await supalite
      .from('code_routes')
      .select('*')
      .eq('prefix_code', 'ABC')
      .order('post_index'); // 컬럼 이름만 전달 (오름차순)
    
    // 에러 확인
    if (error) {
      throw new Error(`데이터 조회 중 에러 발생: ${error.message}`);
    }
    
    // 결과 출력
    console.log('조회 결과:');
    data.forEach(item => {
      console.log(`ID: ${item.id}, 접두어: ${item.prefix_code}, 인덱스: ${item.post_index}, 제목: ${item.title}`);
    });
    
    // 정렬 확인
    if (data.length > 1) {
      let isAscending = true;
      for (let i = 1; i < data.length; i++) {
        if (data[i].post_index < data[i-1].post_index) {
          isAscending = false;
          break;
        }
      }
      
      console.log(`정렬 결과: ${isAscending ? '오름차순 정렬 확인됨 ✓' : '오름차순 정렬 실패 ✗'}`);
    }
    
    return { data, error };
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

/**
 * 예제 2: 오름차순을 명시적으로 지정하는 경우
 * 
 * 이 예제는 .order('post_index', { ascending: true })와 같이
 * 오름차순을 명시적으로 지정하는 경우를 테스트합니다.
 */
async function example2() {
  try {
    console.log('예제 2: 오름차순을 명시적으로 지정하는 경우');
    
    // prefix_code가 'ABC'인 항목을 post_index 기준으로 정렬 (명시적 오름차순)
    const { data, error } = await supalite
      .from('code_routes')
      .select('*')
      .eq('prefix_code', 'ABC')
      .order('post_index', { ascending: true }); // 명시적 오름차순
    
    // 에러 확인
    if (error) {
      throw new Error(`데이터 조회 중 에러 발생: ${error.message}`);
    }
    
    // 결과 출력
    console.log('조회 결과:');
    data.forEach(item => {
      console.log(`ID: ${item.id}, 접두어: ${item.prefix_code}, 인덱스: ${item.post_index}, 제목: ${item.title}`);
    });
    
    // 정렬 확인
    if (data.length > 1) {
      let isAscending = true;
      for (let i = 1; i < data.length; i++) {
        if (data[i].post_index < data[i-1].post_index) {
          isAscending = false;
          break;
        }
      }
      
      console.log(`정렬 결과: ${isAscending ? '오름차순 정렬 확인됨 ✓' : '오름차순 정렬 실패 ✗'}`);
    }
    
    return { data, error };
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

/**
 * 예제 3: 내림차순을 지정하는 경우
 * 
 * 이 예제는 .order('post_index', { ascending: false })와 같이
 * 내림차순을 지정하는 경우를 테스트합니다.
 */
async function example3() {
  try {
    console.log('예제 3: 내림차순을 지정하는 경우');
    
    // prefix_code가 'ABC'인 항목을 post_index 기준으로 정렬 (내림차순)
    const { data, error } = await supalite
      .from('code_routes')
      .select('*')
      .eq('prefix_code', 'ABC')
      .order('post_index', { ascending: false }); // 내림차순
    
    // 에러 확인
    if (error) {
      throw new Error(`데이터 조회 중 에러 발생: ${error.message}`);
    }
    
    // 결과 출력
    console.log('조회 결과:');
    data.forEach(item => {
      console.log(`ID: ${item.id}, 접두어: ${item.prefix_code}, 인덱스: ${item.post_index}, 제목: ${item.title}`);
    });
    
    // 정렬 확인
    if (data.length > 1) {
      let isDescending = true;
      for (let i = 1; i < data.length; i++) {
        if (data[i].post_index > data[i-1].post_index) {
          isDescending = false;
          break;
        }
      }
      
      console.log(`정렬 결과: ${isDescending ? '내림차순 정렬 확인됨 ✓' : '내림차순 정렬 실패 ✗'}`);
    }
    
    return { data, error };
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

/**
 * 예제 4: Supabase 스타일 쿼리 테스트
 * 
 * 이 예제는 사용자가 요청한 형식의 쿼리가 제대로 동작하는지 테스트합니다.
 */
async function example4() {
  try {
    console.log('예제 4: Supabase 스타일 쿼리 테스트');
    
    // Supabase 스타일 쿼리
    const { data, error } = await supalite
      .from('code_routes')
      .select('*')
      .eq('prefix_code', 'ABC')
      .order('post_index');
    
    // 에러 확인
    if (error) {
      throw new Error(`데이터 조회 중 에러 발생: ${error.message}`);
    }
    
    // 결과 출력
    console.log('조회 결과:');
    data.forEach(item => {
      console.log(`ID: ${item.id}, 접두어: ${item.prefix_code}, 인덱스: ${item.post_index}, 제목: ${item.title}`);
    });
    
    console.log('Supabase 스타일 쿼리가 성공적으로 실행되었습니다.');
    
    return { data, error };
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

// 예제 실행 함수
async function runExamples() {
  // 데이터베이스 설정
  await setupDatabase();
  
  console.log('\n===== order 메서드 테스트 =====\n');
  
  // 예제 실행
  await example1().catch(console.error);
  console.log('\n----------------------------\n');
  
  await example2().catch(console.error);
  console.log('\n----------------------------\n');
  
  await example3().catch(console.error);
  console.log('\n----------------------------\n');
  
  await example4().catch(console.error);
}

// 스크립트 실행
runExamples().catch(console.error);
