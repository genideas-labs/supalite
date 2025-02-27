import { SupaLitePG } from '../../src';
import { Database } from '../types/database';
import { config } from 'dotenv';

// .env 파일 로드
config();

// 테스트 1: 직접 connectionString 사용
async function testDirectConnectionString() {
  console.log('\n테스트 1: 직접 connectionString 사용');
  
  const connectionString = 'postgresql://testuser:testpassword@localhost:5432/testdb';
  
  const client = new SupaLitePG<Database>({
    connectionString,
    ssl: false
  });

  try {
    console.log('연결 문자열 사용하여 연결 시도...');
    
    const isConnected = await client.testConnection();
    if (!isConnected) {
      console.error('연결 테스트 실패');
      return;
    }
    
    console.log('연결 성공!');
    
    const users = await client
      .from('users')
      .select('name, email')
      .limit(3);
    
    if (users.error) {
      console.error('Error:', users.error);
    } else {
      console.log('사용자 데이터:', users.data);
    }
  } catch (err) {
    console.error('예상치 못한 오류:', err);
  } finally {
    await client.close();
  }
}

// 테스트 2: 환경 변수 DB_CONNECTION 사용
async function testEnvConnectionString() {
  console.log('\n테스트 2: 환경 변수 DB_CONNECTION 사용');
  
  // 기존 환경 변수 백업
  const originalConnection = process.env.DB_CONNECTION;
  
  // 테스트용 환경 변수 설정
  process.env.DB_CONNECTION = 'postgresql://testuser:testpassword@localhost:5432/testdb';
  
  const client = new SupaLitePG<Database>();

  try {
    console.log('환경 변수 DB_CONNECTION 사용하여 연결 시도...');
    
    const isConnected = await client.testConnection();
    if (!isConnected) {
      console.error('연결 테스트 실패');
      return;
    }
    
    console.log('연결 성공!');
    
    const users = await client
      .from('users')
      .select('name, email')
      .limit(3);
    
    if (users.error) {
      console.error('Error:', users.error);
    } else {
      console.log('사용자 데이터:', users.data);
    }
  } catch (err) {
    console.error('예상치 못한 오류:', err);
  } finally {
    // 환경 변수 복원
    process.env.DB_CONNECTION = originalConnection;
    await client.close();
  }
}

// 테스트 3: Supabase 형식 연결 문자열 테스트
async function testSupabaseConnectionString() {
  console.log('\n테스트 3: Supabase 형식 연결 문자열 테스트');
  
  const connectionString = 'postgresql://postgres.hszfgulbsaxwqiinsjca:Q7yJXJeETUeGGyib@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
  
  const client = new SupaLitePG<Database>({
    connectionString,
    ssl: true
  });

  try {
    console.log('Supabase 형식 연결 문자열 사용하여 연결 시도...');
    
    const isConnected = await client.testConnection();
    if (!isConnected) {
      console.error('연결 테스트 실패');
      return;
    }
    
    console.log('연결 성공!');
    
    const users = await client
      .from('users')
      .select('name, email')
      .limit(3);
    
    if (users.error) {
      console.error('Error:', users.error);
    } else {
      console.log('사용자 데이터:', users.data);
    }
  } catch (err) {
    console.error('예상치 못한 오류:', err);
  } finally {
    await client.close();
  }
}

// 테스트 4: 잘못된 연결 문자열 테스트
async function testInvalidConnectionString() {
  console.log('\n테스트 4: 잘못된 연결 문자열 테스트');
  
  try {
    // 잘못된 형식의 연결 문자열
    const invalidConnectionString = 'invalid://user:pass@host:port/db';
    
    console.log('잘못된 형식의 연결 문자열로 연결 시도...');
    
    const client = new SupaLitePG<Database>({
      connectionString: invalidConnectionString
    });
    
    // 이 부분은 실행되지 않아야 함 (위에서 예외가 발생해야 함)
    console.error('오류: 잘못된 연결 문자열로 인스턴스 생성 성공');
    await client.close();
  } catch (err: any) {
    console.log('예상된 오류 발생:', err.message);
  }
  
  try {
    // 존재하지 않는 서버 연결 문자열
    const nonExistentServerString = 'postgresql://user:pass@non-existent-server:5432/db';
    
    console.log('존재하지 않는 서버에 연결 시도...');
    
    const client = new SupaLitePG<Database>({
      connectionString: nonExistentServerString
    });
    
    const isConnected = await client.testConnection();
    
    if (!isConnected) {
      console.log('예상대로 연결 실패');
    } else {
      console.error('오류: 존재하지 않는 서버에 연결 성공함');
    }
    
    await client.close();
  } catch (err: any) {
    console.log('예상된 오류 발생:', err.message);
  }
}

// 모든 테스트 실행
async function runAllTests() {
  console.log('=== 연결 문자열(URI) 테스트 시작 ===');
  
  await testDirectConnectionString();
  await testEnvConnectionString();
  await testSupabaseConnectionString();
  await testInvalidConnectionString();
  
  console.log('\n=== 모든 테스트 완료 ===');
}

runAllTests();
