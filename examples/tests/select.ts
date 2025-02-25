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

async function testSelect() {
  try {
    // 기본 SELECT
    console.log('\n1. 기본 SELECT 테스트:');
    const users = await client
      .from('users')
      .select('*')
      .limit(2);
    console.log('Users:', users.data);

    // 특정 컬럼 선택
    console.log('\n2. 특정 컬럼 SELECT 테스트:');
    const profiles = await client
      .from('profiles')
      .select('user_id, bio, interests')
      .limit(2);
    console.log('Profiles:', profiles.data);

    // COUNT 쿼리
    console.log('\n3. COUNT 쿼리 테스트:');
    const activeUsers = await client
      .from('users')
      .select('*', { count: 'exact' })
      .eq('status', 'active');
    console.log('Active users count:', activeUsers.count);

    // 정렬
    console.log('\n4. 정렬 테스트:');
    const sortedPosts = await client
      .from('posts')
      .select('title, views')
      .order('views', { ascending: false })
      .limit(3);
    console.log('Top 3 posts by views:', sortedPosts.data);

    // 다중 정렬
    console.log('\n5. 다중 정렬 테스트:');
    const usersByStatus = await client
      .from('users')
      .select('name, status, last_login')
      .order('status', { ascending: true })
      .order('last_login', { ascending: false });
    console.log('Users sorted by status and last_login:', usersByStatus.data);

    // 페이지네이션
    console.log('\n6. 페이지네이션 테스트:');
    const page1 = await client
      .from('posts')
      .select('*')
      .limit(2)
      .offset(0);
    console.log('Page 1:', page1.data);

    const page2 = await client
      .from('posts')
      .select('*')
      .limit(2)
      .offset(2);
    console.log('Page 2:', page2.data);

    // Range
    console.log('\n7. Range 테스트:');
    const range = await client
      .from('comments')
      .select('*')
      .range(1, 3);
    console.log('Comments range 1-3:', range.data);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

testSelect();
