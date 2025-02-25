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

async function testMutation() {
  try {
    // INSERT 테스트
    console.log('\n1. 단일 INSERT 테스트:');
    const newUser = await client
      .from('users')
      .insert({
        name: '신규사용자',
        email: 'new@example.com',
        status: 'active',
        last_login: new Date().toISOString()
      })
      .select()
      .single();
    console.log('Inserted user:', newUser.data);

    // 다중 INSERT 테스트
    console.log('\n2. 다중 INSERT 테스트:');
    if (newUser.data) {
      // 첫 번째 포스트 추가
      const post1 = await client
        .from('posts')
        .insert({
          user_id: newUser.data.id,
          title: '첫 번째 글',
          content: '안녕하세요!',
          tags: ['인사', '소개'],
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      console.log('First post:', post1.data);

      // 두 번째 포스트 추가
      const post2 = await client
        .from('posts')
        .insert({
          user_id: newUser.data.id,
          title: '두 번째 글',
          content: '반갑습니다!',
          tags: ['인사'],
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      console.log('Second post:', post2.data);
    }

    // UPDATE 테스트
    console.log('\n3. UPDATE 테스트:');
    const updatedUser = await client
      .from('users')
      .update({
        status: 'inactive',
        last_login: new Date().toISOString()
      })
      .eq('email', 'new@example.com')
      .select()
      .single();
    console.log('Updated user:', updatedUser.data);

    // UPSERT 테스트
    console.log('\n4. UPSERT 테스트:');
    const upsertProfile = await client
      .from('profiles')
      .upsert({
        user_id: newUser.data?.id ?? 0,
        bio: '새로운 프로필입니다.',
        interests: ['코딩', '음악'],
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select()
      .single();
    console.log('Upserted profile:', upsertProfile.data);

    // 조건부 UPDATE 테스트
    console.log('\n5. 조건부 UPDATE 테스트:');
    const updatedPosts = await client
      .from('posts')
      .update({
        views: 10,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', newUser.data?.id)
      .select();
    console.log('Updated posts:', updatedPosts.data);

    // DELETE 테스트
    console.log('\n6. DELETE 테스트:');
    const deletedPosts = await client
      .from('posts')
      .delete()
      .eq('user_id', newUser.data?.id)
      .select();
    console.log('Deleted posts:', deletedPosts.data);

    const deletedUser = await client
      .from('users')
      .delete()
      .eq('id', newUser.data?.id)
      .select()
      .single();
    console.log('Deleted user:', deletedUser.data);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

testMutation();
