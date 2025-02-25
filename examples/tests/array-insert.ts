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

async function testArrayInsert() {
  console.log('Starting array insert tests...');
  try {
    // 기본 배열 INSERT 테스트
    console.log('\n1. 기본 배열 INSERT 테스트:');
    const newUsers = await client
      .from('users')
      .insert([
        {
          name: '배열1',
          email: 'array1@example.com',
          status: 'active',
          last_login: new Date().toISOString()
        },
        {
          name: '배열2',
          email: 'array2@example.com',
          status: 'active',
          last_login: new Date().toISOString()
        }
      ])
      .select();
    console.log('Inserted users:', JSON.stringify(newUsers.data, null, 2));

    // 빈 배열 테스트
    console.log('\n2. 빈 배열 테스트:');
    try {
      await client
        .from('users')
        .insert([])
        .select();
    } catch (err) {
      if (err instanceof Error) {
        console.log('Empty array error (expected):', err.message);
      }
    }

    // 다양한 데이터 타입을 포함한 배열 INSERT
    console.log('\n3. 다양한 데이터 타입을 포함한 배열 INSERT:');
    if (!newUsers.data || !Array.isArray(newUsers.data)) {
      throw new Error('Failed to insert users or invalid response type');
    }

    const [user1, user2] = newUsers.data;
    if (!user1?.id || !user2?.id) {
      throw new Error('Invalid user data');
    }

    const newPosts = await client
      .from('posts')
      .insert([
        {
          user_id: user1.id,
          title: '첫 번째 글',
          content: '안녕하세요!',
          tags: ['인사', '소개'],
          updated_at: new Date().toISOString()
        },
        {
          user_id: user2.id,
          title: '두 번째 글',
          content: '반갑습니다!',
          tags: ['인사'],
          updated_at: new Date().toISOString()
        }
      ])
      .select();
    console.log('Inserted posts:', JSON.stringify(newPosts.data, null, 2));

    // NULL 값을 포함한 배열 INSERT
    console.log('\n4. NULL 값을 포함한 배열 INSERT:');
    const newProfiles = await client
      .from('profiles')
      .insert([
        {
          user_id: user1.id,
          bio: '안녕하세요!',
          avatar_url: null,
          interests: ['코딩', '음악'],
          updated_at: new Date().toISOString()
        },
        {
          user_id: user2.id,
          bio: null,
          avatar_url: null,
          interests: ['여행'],
          updated_at: new Date().toISOString()
        }
      ])
      .select();
    console.log('Inserted profiles:', JSON.stringify(newProfiles.data, null, 2));

    // 정리: 테스트 데이터 삭제
    console.log('\n5. 테스트 데이터 정리:');
    await client
      .from('users')
      .delete()
      .in('email', ['array1@example.com', 'array2@example.com']);
    console.log('Cleanup completed');
    console.log('All tests completed successfully');

  } catch (err) {
    if (err instanceof Error) {
      console.error('Error:', err.message);
    } else {
      console.error('Unknown error:', err);
    }
  } finally {
    await client.close();
  }
}

testArrayInsert();
