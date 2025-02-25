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

async function testWhere() {
  try {
    // eq 테스트
    console.log('\n1. eq 테스트:');
    const activeUser = await client
      .from('users')
      .select('*')
      .eq('status', 'active')
      .single();
    console.log('Active user:', activeUser.data);

    // neq 테스트
    console.log('\n2. neq 테스트:');
    const nonActiveUsers = await client
      .from('users')
      .select('name, status')
      .neq('status', 'active');
    console.log('Non-active users:', nonActiveUsers.data);

    // is 테스트 (NULL 체크)
    console.log('\n3. is 테스트:');
    const noAvatarProfiles = await client
      .from('profiles')
      .select('user_id, bio')
      .is('avatar_url', null);
    console.log('Profiles without avatar:', noAvatarProfiles.data);

    // in 테스트
    console.log('\n4. in 테스트:');
    const specificUsers = await client
      .from('users')
      .select('*')
      .in('id', [1, 2, 3]);
    console.log('Users with specific IDs:', specificUsers.data);

    // contains 테스트 (배열)
    console.log('\n5. contains 테스트:');
    const travelProfiles = await client
      .from('profiles')
      .select('*')
      .contains('interests', ['여행']);
    console.log('Profiles interested in travel:', travelProfiles.data);

    // ilike 테스트
    console.log('\n6. ilike 테스트:');
    const searchUsers = await client
      .from('users')
      .select('*')
      .ilike('email', '%example.com');
    console.log('Users with example.com email:', searchUsers.data);

    // gte/lte 테스트 (날짜 범위)
    console.log('\n7. gte/lte 테스트:');
    const recentLogins = await client
      .from('users')
      .select('name, last_login')
      .gte('last_login', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('last_login', { ascending: false });
    console.log('Users logged in within 7 days:', recentLogins.data);

    // or 테스트
    console.log('\n8. or 테스트:');
    const popularOrRecent = await client
      .from('posts')
      .select('title, views, created_at')
      .or('views.gte.100,created_at.gte.' + new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    console.log('Popular or recent posts:', popularOrRecent.data);

    // 복합 조건
    console.log('\n9. 복합 조건 테스트:');
    const complexQuery = await client
      .from('posts')
      .select('*')
      .eq('user_id', 1)
      .gte('views', 50)
      .contains('tags', ['여행'])
      .order('created_at', { ascending: false });
    console.log('Complex query result:', complexQuery.data);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

testWhere();
