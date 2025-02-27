import { SupaLitePG } from '../../src';
import { Database } from '../types/database';
import { config } from 'dotenv';
import { Pool } from 'pg';

// .env 파일 로드
config();

// 테스트를 위한 직접 Pool 인스턴스 생성
const pool = new Pool({
  user: 'testuser',
  password: 'testpassword',
  host: 'localhost',
  database: 'testdb',
  port: 5432,
  ssl: false
});

// SupaLitePG 인스턴스 생성
const client = new SupaLitePG<Database>({
  user: 'testuser',
  password: 'testpassword',
  host: 'localhost',
  database: 'testdb',
  port: 5432,
  ssl: false
});

// bigint 테스트를 위한 임시 테이블 생성
async function createTestTable() {
  try {
    console.log('bigint 테스트를 위한 임시 테이블 생성 중...');
    
    // 기존 테이블이 있으면 삭제
    await pool.query('DROP TABLE IF EXISTS bigint_test');
    
    // 새 테이블 생성
    await pool.query(`
      CREATE TABLE bigint_test (
        id SERIAL PRIMARY KEY,
        small_int BIGINT,           -- JavaScript Number 범위 내 값
        large_int BIGINT,           -- JavaScript Number 범위 초과 값
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    console.log('테이블 생성 완료');
    
    // 테스트 데이터 삽입
    await pool.query(`
      INSERT INTO bigint_test (small_int, large_int) VALUES
      (123456789, 9007199254740992),                    -- Number.MAX_SAFE_INTEGER + 1
      (987654321, 9007199254740993),                    -- Number.MAX_SAFE_INTEGER + 2
      (555555555, 9223372036854775807)                  -- PostgreSQL bigint 최대값
    `);
    
    console.log('테스트 데이터 삽입 완료');
  } catch (err) {
    console.error('테이블 생성 중 오류:', err);
    throw err;
  }
}

// 테스트 테이블 삭제
async function dropTestTable() {
  try {
    await pool.query('DROP TABLE IF EXISTS bigint_test');
    console.log('테스트 테이블 삭제 완료');
  } catch (err) {
    console.error('테이블 삭제 중 오류:', err);
  }
}

// bigint 값 조회 테스트
async function testBigintSelect() {
  console.log('\n1. bigint 값 조회 테스트:');
  
  try {
    const result = await pool.query('SELECT * FROM bigint_test');
    
    console.log('조회 결과:');
    result.rows.forEach(row => {
      console.log(`ID: ${row.id}`);
      console.log(`small_int: ${row.small_int} (타입: ${typeof row.small_int})`);
      console.log(`large_int: ${row.large_int} (타입: ${typeof row.large_int})`);
      console.log('---');
    });
    
    // 첫 번째 행의 large_int 값이 BigInt 타입인지 확인
    const firstRow = result.rows[0];
    if (typeof firstRow.large_int === 'bigint') {
      console.log('✅ 성공: large_int 값이 BigInt 타입으로 반환됨');
    } else {
      console.log(`❌ 실패: large_int 값이 ${typeof firstRow.large_int} 타입으로 반환됨`);
    }
    
    // 큰 정수 값이 정확히 유지되는지 확인
    const thirdRow = result.rows[2];
    if (thirdRow.large_int === BigInt('9223372036854775807')) {
      console.log('✅ 성공: 큰 정수 값이 정확히 유지됨');
    } else {
      console.log(`❌ 실패: 큰 정수 값이 ${thirdRow.large_int}로 반환됨`);
    }
  } catch (err) {
    console.error('조회 중 오류:', err);
  }
}

// bigint 값 삽입 테스트
async function testBigintInsert() {
  console.log('\n2. bigint 값 삽입 테스트:');
  
  try {
    // BigInt 값 삽입
    const insertResult = await pool.query(
      'INSERT INTO bigint_test (small_int, large_int) VALUES ($1, $2) RETURNING *',
      [12345, BigInt('9223372036854775807')] // PostgreSQL bigint 최대값
    );
    
    console.log('삽입된 행:', insertResult.rows[0]);
    
    // 삽입된 값 확인
    const checkResult = await pool.query(
      'SELECT * FROM bigint_test WHERE id = $1',
      [insertResult.rows[0].id]
    );
    
    const insertedRow = checkResult.rows[0];
    console.log('확인된 행:', insertedRow);
    
    if (insertedRow.large_int === BigInt('9223372036854775807')) {
      console.log('✅ 성공: BigInt 값이 정확히 삽입되고 조회됨');
    } else {
      console.log(`❌ 실패: 삽입된 값이 ${insertedRow.large_int}로 반환됨`);
    }
  } catch (err) {
    console.error('삽입 중 오류:', err);
  }
}

// bigint 값 업데이트 테스트
async function testBigintUpdate() {
  console.log('\n3. bigint 값 업데이트 테스트:');
  
  try {
    // 첫 번째 행 업데이트
    const updateResult = await pool.query(
      'UPDATE bigint_test SET large_int = $1 WHERE id = 1 RETURNING *',
      [BigInt('9223372036854775800')] // PostgreSQL bigint 최대값에 가까운 값
    );
    
    console.log('업데이트된 행:', updateResult.rows[0]);
    
    // 업데이트된 값 확인
    const checkResult = await pool.query('SELECT * FROM bigint_test WHERE id = 1');
    const updatedRow = checkResult.rows[0];
    
    console.log('확인된 행:', updatedRow);
    
    if (updatedRow.large_int === BigInt('9223372036854775800')) {
      console.log('✅ 성공: BigInt 값이 정확히 업데이트되고 조회됨');
    } else {
      console.log(`❌ 실패: 업데이트된 값이 ${updatedRow.large_int}로 반환됨`);
    }
  } catch (err) {
    console.error('업데이트 중 오류:', err);
  }
}

// client.insert() 함수를 사용한 bigint 테스트
async function testClientInsert() {
  console.log('\n4. client.insert() 함수를 사용한 bigint 테스트:');
  
  try {
    // client.insert() 함수를 사용하여 BigInt 값 삽입
    const insertResult = await client
      .from('bigint_test')
      .insert({
        small_int: BigInt('123456'),
        large_int: BigInt('9007199254740995') // Number.MAX_SAFE_INTEGER + 3
      });
    
    if (insertResult.error) {
      console.error('삽입 중 오류:', insertResult.error);
      return;
    }
    
    console.log('삽입 결과:', insertResult);
    
    // 삽입된 데이터 조회
    const selectResult = await client
      .from('bigint_test')
      .select('*')
      .eq('small_int', BigInt('123456'))
      .single();
    
    if (selectResult.error) {
      console.error('조회 중 오류:', selectResult.error);
      return;
    }
    
    console.log('조회된 행:', selectResult.data);
    
    if (selectResult.data && typeof selectResult.data.large_int === 'bigint') {
      console.log('✅ 성공: client.insert()로 삽입한 BigInt 값이 올바르게 반환됨');
      console.log(`large_int 값: ${selectResult.data.large_int}, 타입: ${typeof selectResult.data.large_int}`);
    } else if (selectResult.data) {
      console.log(`❌ 실패: large_int 타입이 ${typeof selectResult.data.large_int}`);
    } else {
      console.log('❌ 실패: 데이터를 찾을 수 없음');
    }
  } catch (err) {
    console.error('client.insert() 테스트 중 오류:', err);
  }
}

// client.update() 함수를 사용한 bigint 테스트
async function testClientUpdate() {
  console.log('\n5. client.update() 함수를 사용한 bigint 테스트:');
  
  try {
    // 업데이트할 행 찾기
    const selectResult = await client
      .from('bigint_test')
      .select('*')
      .eq('small_int', BigInt('123456'))
      .single();
    
    if (selectResult.error || !selectResult.data) {
      console.error('업데이트할 행을 찾을 수 없음:', selectResult.error);
      return;
    }
    
    const rowId = selectResult.data.id;
    console.log(`ID ${rowId}인 행 업데이트 시도...`);
    
    // client.update() 함수를 사용하여 BigInt 값 업데이트
    const updateResult = await client
      .from('bigint_test')
      .update({
        large_int: BigInt('9223372036854775000') // PostgreSQL bigint 최대값에 가까운 값
      })
      .eq('id', rowId);
    
    if (updateResult.error) {
      console.error('업데이트 중 오류:', updateResult.error);
      return;
    }
    
    console.log('업데이트 결과:', updateResult);
    
    // 업데이트된 데이터 조회
    const checkResult = await client
      .from('bigint_test')
      .select('*')
      .eq('id', rowId)
      .single();
    
    if (checkResult.error) {
      console.error('조회 중 오류:', checkResult.error);
      return;
    }
    
    console.log('업데이트된 행:', checkResult.data);
    
    if (checkResult.data && checkResult.data.large_int === BigInt('9223372036854775000')) {
      console.log('✅ 성공: client.update()로 업데이트한 BigInt 값이 정확히 저장되고 조회됨');
    } else if (checkResult.data) {
      console.log(`❌ 실패: 업데이트된 값이 ${checkResult.data.large_int}로 반환됨`);
    } else {
      console.log('❌ 실패: 데이터를 찾을 수 없음');
    }
  } catch (err) {
    console.error('client.update() 테스트 중 오류:', err);
  }
}

// 쿼리 빌더를 사용한 bigint 테스트
async function testQueryBuilder() {
  console.log('\n6. 쿼리 빌더를 사용한 bigint 테스트:');
  
  try {
    // 쿼리 빌더를 사용하여 데이터 조회
    const result = await client
      .from('bigint_test')
      .select('*')
      .eq('id', 1)
      .single();
    
    if (result.error) {
      console.error('쿼리 빌더 조회 중 오류:', result.error);
      return;
    }
    
    if (!result.data) {
      console.log('❌ 실패: 테스트 데이터를 찾을 수 없음');
      return;
    }
    
    console.log('쿼리 빌더 결과:', result.data);
    console.log('large_int 타입:', typeof result.data.large_int);
    
    if (typeof result.data.large_int === 'bigint') {
      console.log('✅ 성공: 쿼리 빌더를 통해 BigInt 타입이 올바르게 반환됨');
    } else {
      console.log(`❌ 실패: 쿼리 빌더 결과의 large_int 타입이 ${typeof result.data.large_int}`);
    }
  } catch (err) {
    console.error('쿼리 빌더 테스트 중 오류:', err);
  }
}

// 모든 테스트 실행
async function runAllTests() {
  console.log('=== bigint 지원 테스트 시작 ===');
  
  try {
    await createTestTable();
    await testBigintSelect();
    await testBigintInsert();
    await testBigintUpdate();
    await testClientInsert();
    await testClientUpdate();
    await testQueryBuilder();
  } catch (err) {
    console.error('테스트 중 오류 발생:', err);
  } finally {
    await dropTestTable();
    await client.close();
    await pool.end();
  }
  
  console.log('\n=== 모든 테스트 완료 ===');
}

runAllTests();
