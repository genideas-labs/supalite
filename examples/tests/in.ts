import { SupaLitePG } from '../../src';
import { Database } from '../types/database';

const client = new SupaLitePG<Database>({
  user: 'testuser',
  password: 'testpassword',
  host: 'localhost',
  database: 'testdb',
  port: 5432,
  ssl: false
});

async function testIn() {
  try {
    // 기본 IN 쿼리 테스트
    console.log('\n1. 기본 IN 쿼리 테스트:');
    const users = await client
      .from('users')
      .select('name, email, status')
      .in('id', [1, 2, 3]);
    console.log('Users with IDs 1, 2, 3:', users.data);

    // 빈 배열 테스트
    console.log('\n2. 빈 배열 테스트:');
    const emptyResult = await client
      .from('users')
      .select('*')
      .in('id', []);
    console.log('Empty array result (should be null):', emptyResult.data);

    // NULL 값 포함 테스트
    console.log('\n3. NULL 값 포함 테스트:');
    const postsWithNulls = await client
      .from('posts')
      .select('title, content')
      .in('user_id', [1, null, 3]);
    console.log('Posts with user_ids [1, null, 3]:', postsWithNulls.data);

    // 다른 조건과 함께 사용
    console.log('\n4. 다른 조건과 함께 사용:');
    const activeUsers = await client
      .from('users')
      .select('name, email, status')
      .in('id', [1, 2, 3, 4])
      .eq('status', 'active');
    console.log('Active users with specific IDs:', activeUsers.data);

    // 여러 컬럼에 대한 IN 쿼리
    console.log('\n5. 여러 컬럼에 대한 IN 쿼리:');
    const multiColumnIn = await client
      .from('posts')
      .select('title, views')
      .in('user_id', [1, 2])
      .in('views', [50, 100, 150]);
    console.log('Posts with specific user_ids and views:', multiColumnIn.data);

    // ORDER BY와 함께 사용
    console.log('\n6. ORDER BY와 함께 사용:');
    const orderedUsers = await client
      .from('users')
      .select('name, status, last_login')
      .in('id', [1, 2, 3, 4, 5])
      .order('last_login', { ascending: false });
    console.log('Users ordered by last_login:', orderedUsers.data);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

testIn();
