import { Pool } from 'pg';

async function setupDatabase() {
  // 직접 Pool 인스턴스 생성
  const pool = new Pool({
    connectionString: process.env.DB_CONNECTION || 'postgresql://postgres:postgres@localhost:5432/testdb',
  });

  try {
    console.log('데이터베이스 설정을 시작합니다...');

    // users 테이블이 이미 존재하는지 확인
    const checkTableResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    const tableExists = checkTableResult.rows[0].exists;

    if (tableExists) {
      console.log('users 테이블이 이미 존재합니다. 테이블을 삭제하고 다시 생성합니다.');
      await pool.query('DROP TABLE IF EXISTS users;');
    }

    // users 테이블 생성
    await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(20),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('users 테이블이 생성되었습니다.');

    // 테스트 데이터 추가
    await pool.query(`
      INSERT INTO users (name, email, status) VALUES
      ('홍길동', 'hong@example.com', 'active'),
      ('김철수', 'kim@example.com', 'inactive'),
      ('이영희', 'lee@example.com', 'active');
    `);
    console.log('테스트 데이터가 추가되었습니다.');

    console.log('데이터베이스 설정이 완료되었습니다.');
  } catch (error) {
    console.error('데이터베이스 설정 중 오류 발생:', error);
    throw error;
  } finally {
    // 연결 종료
    await pool.end();
  }
}

// 스크립트 실행
setupDatabase().catch(console.error);
