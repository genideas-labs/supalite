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

async function testTransaction() {
  try {
    // 성공 케이스
    console.log('\n1. 트랜잭션 성공 케이스:');
    const successResult = await client.transaction(async (tx) => {
      // 사용자 생성
      const user = await tx
        .from('users')
        .insert({
          name: '트랜잭션테스트',
          email: 'transaction@example.com',
          status: 'active',
          last_login: new Date().toISOString()
        })
        .select()
        .single();

      if (!user.data?.id) {
        throw new Error('Failed to create user');
      }

      // 프로필 생성
      const profile = await tx
        .from('profiles')
        .insert({
          user_id: user.data.id,
          bio: '트랜잭션으로 생성된 프로필',
          interests: ['테스트'],
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      return { user: user.data, profile: profile.data };
    });
    console.log('Transaction success:', successResult);

    // 실패 케이스 (롤백)
    console.log('\n2. 트랜잭션 실패 케이스 (중복 이메일):');
    try {
      await client.transaction(async (tx) => {
        // 첫 번째 사용자 생성 (성공)
        await tx
          .from('users')
          .insert({
            name: '트랜잭션실패1',
            email: 'fail@example.com',
            status: 'active',
            last_login: new Date().toISOString()
          });

        // 두 번째 사용자 생성 (같은 이메일로 시도 - 실패)
        await tx
          .from('users')
          .insert({
            name: '트랜잭션실패2',
            email: 'fail@example.com', // 중복 이메일
            status: 'active',
            last_login: new Date().toISOString()
          });
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.log('Expected error (rollback successful):', errorMessage);
      
      // 롤백 확인
      const checkUsers = await client
        .from('users')
        .select('*')
        .eq('email', 'fail@example.com');
      const users = checkUsers.data as Database['Tables']['users']['Row'][];
      console.log('Rollback verified - no users found:', !users || users.length === 0);
    }

    // 중첩 트랜잭션
    console.log('\n3. 중첩 트랜잭션 테스트:');
    const nestedResult = await client.transaction(async (tx1) => {
      // 외부 트랜잭션: 사용자 생성
      const user = await tx1
        .from('users')
        .insert({
          name: '중첩트랜잭션',
          email: 'nested@example.com',
          status: 'active',
          last_login: new Date().toISOString()
        })
        .select()
        .single();

      if (!user.data?.id) {
        throw new Error('Failed to create user');
      }

      // 내부 트랜잭션: 포스트와 댓글 생성
      return await tx1.transaction(async (tx2) => {
        const post = await tx2
          .from('posts')
          .insert({
            user_id: user.data!.id,
            title: '중첩 트랜잭션 테스트',
            content: '트랜잭션 안의 트랜잭션',
            tags: ['테스트'],
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (!post.data?.id) {
          throw new Error('Failed to create post');
        }

        const comment = await tx2
          .from('comments')
          .insert({
            post_id: post.data.id,
            user_id: user.data!.id,
            content: '자동 생성된 댓글'
          })
          .select()
          .single();

        return {
          user: user.data,
          post: post.data,
          comment: comment.data
        };
      });
    });
    console.log('Nested transaction result:', nestedResult);

    // 정리: 테스트 데이터 삭제
    console.log('\n4. 테스트 데이터 정리:');
    await client.transaction(async (tx) => {
      await tx
        .from('users')
        .delete()
        .in('email', ['transaction@example.com', 'nested@example.com']);
    });
    console.log('Cleanup completed');

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Unexpected error:', errorMessage);
  } finally {
    await client.close();
  }
}

testTransaction();
