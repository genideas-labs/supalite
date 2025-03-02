import { SupaliteClient } from '../../src';
import { Database } from '../types/database';

// Node.js 타입 정의
declare const process: {
  env: {
    [key: string]: string | undefined;
  };
};

// Supalite 클라이언트 인스턴스 생성
const supalite = new SupaliteClient<Database>({
  connectionString: process.env.DB_CONNECTION || 'postgresql://postgres:postgres@localhost:5432/testdb',
});

/**
 * 예제 1: View 테이블 조회
 * 
 * 이 예제는 user_posts_view 뷰에서 데이터를 조회하는 방법을 보여줍니다.
 */
async function example1() {
  try {
    // View 테이블 조회
    const result = await supalite
      .from('user_posts_view')
      .select('*');

    console.log('===== user_posts_view 조회 결과 =====');
    console.log(`조회된 데이터 수: ${result.data.length}`);
    
    // 결과 데이터 출력
    result.data.forEach(row => {
      console.log(`사용자: ${row.user_name} (ID: ${row.user_id})`);
      console.log(`게시물: ${row.post_title} (ID: ${row.post_id})`);
      console.log(`내용: ${row.post_content || '(내용 없음)'}`);
      console.log(`작성일: ${row.post_created_at}`);
      console.log('-------------------');
    });

    return result;
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

/**
 * 예제 2: View 테이블에 조건 적용
 * 
 * 이 예제는 active_users_view 뷰에서 조건을 적용하여 데이터를 조회하는 방법을 보여줍니다.
 */
async function example2() {
  try {
    // View 테이블에 조건 적용하여 조회
    const result = await supalite
      .from('active_users_view')
      .select('*')
      .gte('post_count', 2); // 게시물이 2개 이상인 사용자만 조회

    console.log('===== active_users_view 조회 결과 (게시물 2개 이상) =====');
    console.log(`조회된 데이터 수: ${result.data.length}`);
    
    // 결과 데이터 출력
    result.data.forEach(row => {
      console.log(`사용자: ${row.name} (ID: ${row.id})`);
      console.log(`이메일: ${row.email}`);
      console.log(`마지막 로그인: ${row.last_login || '(로그인 기록 없음)'}`);
      console.log(`게시물 수: ${row.post_count}`);
      console.log('-------------------');
    });

    return result;
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

/**
 * 예제 3: View 테이블과 일반 테이블 조인
 * 
 * 이 예제는 View 테이블과 일반 테이블을 함께 사용하는 방법을 보여줍니다.
 * (실제 조인은 SQL 쿼리에서 이루어지지만, 여기서는 두 테이블을 개별적으로 조회하여 결합하는 방식으로 구현)
 */
async function example3() {
  try {
    // 1. active_users_view에서 사용자 조회
    const activeUsers = await supalite
      .from('active_users_view')
      .select('*')
      .order('post_count', { ascending: false })
      .limit(3); // 게시물이 많은 상위 3명의 사용자만 조회

    console.log('===== 게시물이 많은 상위 3명의 사용자 =====');
    
    // 2. 각 사용자의 프로필 정보 조회
    const userProfiles = await Promise.all(
      activeUsers.data.map(async user => {
        const profileResult = await supalite
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
        
        return {
          user: user,
          profile: profileResult.data
        };
      })
    );

    // 결과 데이터 출력
    userProfiles.forEach(({ user, profile }) => {
      console.log(`사용자: ${user.name} (ID: ${user.id})`);
      console.log(`이메일: ${user.email}`);
      console.log(`게시물 수: ${user.post_count}`);
      
      if (profile) {
        console.log(`프로필 정보:`);
        console.log(`  소개: ${profile.bio || '(소개 없음)'}`);
        console.log(`  아바타: ${profile.avatar_url || '(아바타 없음)'}`);
        console.log(`  관심사: ${profile.interests ? profile.interests.join(', ') : '(관심사 없음)'}`);
      } else {
        console.log('프로필 정보 없음');
      }
      
      console.log('-------------------');
    });

    return userProfiles;
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

/**
 * 예제 4: View 테이블에 단일 결과 조회
 * 
 * 이 예제는 View 테이블에서 단일 결과를 조회하는 방법을 보여줍니다.
 */
async function example4() {
  try {
    // View 테이블에서 단일 결과 조회
    const result = await supalite
      .from('user_posts_view')
      .select('*')
      .eq('post_id', 1) // ID가 1인 게시물 조회
      .single();

    console.log('===== user_posts_view에서 단일 게시물 조회 =====');
    
    if (result.data) {
      console.log(`사용자: ${result.data.user_name} (ID: ${result.data.user_id})`);
      console.log(`게시물: ${result.data.post_title} (ID: ${result.data.post_id})`);
      console.log(`내용: ${result.data.post_content || '(내용 없음)'}`);
      console.log(`작성일: ${result.data.post_created_at}`);
    } else {
      console.log('게시물을 찾을 수 없습니다.');
    }

    return result;
  } catch (error) {
    console.error('에러 발생:', error);
    throw error;
  }
}

// 예제 실행 함수
async function runExamples() {
  console.log('===== View 테이블 조회 예제 =====');
  
  console.log('\n===== 예제 1: View 테이블 조회 =====');
  await example1().catch(console.error);

  console.log('\n===== 예제 2: View 테이블에 조건 적용 =====');
  await example2().catch(console.error);

  console.log('\n===== 예제 3: View 테이블과 일반 테이블 조인 =====');
  await example3().catch(console.error);

  console.log('\n===== 예제 4: View 테이블에 단일 결과 조회 =====');
  await example4().catch(console.error);
}

// 예제 실행
console.log('===== View 테이블 조회 예제 실행 =====');
runExamples().catch(console.error);

export {
  example1,
  example2,
  example3,
  example4,
  runExamples,
};
