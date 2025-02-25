import { SupaLitePG } from '../../dist';
import { Database } from '../types/database';

const client = new SupaLitePG<Database>({
  user: 'testuser',
  password: 'testpassword',
  host: 'localhost',
  database: 'testdb',
  port: 5432,
  ssl: false
});

async function testSpecial() {
  try {
    // single() 메서드 테스트
    console.log('\n1. single() 성공 케이스:');
    const singleUser = await client
      .from('users')
      .select('*')
      .eq('email', 'hong@example.com')
      .single();
    console.log('Single user:', singleUser.data);

    console.log('\n2. single() 실패 케이스 (여러 결과):');
    const multipleUsers = await client
      .from('users')
      .select('*')
      .eq('status', 'active')
      .single();
    console.log('Multiple users error:', multipleUsers.error);

    // 복잡한 조인 쿼리
    console.log('\n3. 사용자별 포스트 및 댓글 수:');
    const userStats = await client
      .from('users')
      .select(`
        id,
        name,
        (SELECT COUNT(*) FROM posts WHERE posts.user_id = users.id) as post_count,
        (SELECT COUNT(*) FROM comments WHERE comments.user_id = users.id) as comment_count
      `)
      .order('name', { ascending: true });
    console.log('User statistics:', userStats.data);

    // 에러 처리 테스트
    console.log('\n4. 존재하지 않는 컬럼 테스트:');
    const nonExistentColumn = await client
      .from('users')
      .select('non_existent_column');
    console.log('Non-existent column error:', nonExistentColumn.error);

    console.log('\n5. 잘못된 테이블 테스트:');
    const nonExistentTable = await (client as any)
      .from('non_existent_table')
      .select('*');
    console.log('Non-existent table error:', nonExistentTable.error);

    // 복잡한 필터링과 정렬
    console.log('\n6. 복잡한 필터링과 정렬:');
    const complexQuery = await client
      .from('posts')
      .select('title, content, views')
      .gte('views', 50)
      .contains('tags', ['여행'])
      .order('views', { ascending: false })
      .limit(5);
    console.log('Complex query result:', complexQuery.data);

    // 서브쿼리 테스트
    console.log('\n7. 서브쿼리를 사용한 필터링:');
    const subqueryTest = await client
      .from('users')
      .select(`
        name,
        email,
        (
          SELECT json_agg(json_build_object('title', title, 'views', views))
          FROM posts
          WHERE posts.user_id = users.id
          AND views > 100
        ) as popular_posts
      `)
      .eq('status', 'active');
    console.log('Subquery test result:', subqueryTest.data);

    // NULL 처리 테스트
    console.log('\n8. NULL 값 처리:');
    const nullTest = await client
      .from('profiles')
      .select('*')
      .is('avatar_url', null)
      .is('bio', null);
    console.log('Null test result:', nullTest.data);

    // 타입 변환 테스트
    console.log('\n9. 타입 변환 및 집계:');
    const aggregationTest = await client
      .from('posts')
      .select('user_id, views')
      .gte('views', 0);
    console.log('Aggregation test result:', aggregationTest.data);

  } catch (err) {
    console.error('Unexpected error:', err);
  } finally {
    await client.close();
  }
}

testSpecial();
