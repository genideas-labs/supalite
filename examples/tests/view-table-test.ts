import { SupaliteClient } from '../../src';
import { Database } from '../types/database';

// 타입 테스트 함수
function testViewTableTypes() {
  // 타입 정의만 확인하는 함수 (실제로 실행되지 않음)
  async function typeCheck() {
    const supalite = new SupaliteClient<Database>();

    // 1. user_posts_view 조회 테스트
    const userPostsQuery = supalite
      .from('user_posts_view')
      .select('*');
    
    // 타입 확인: user_posts_view의 Row 타입이 올바르게 추론되는지 확인
    type UserPostsViewRow = {
      user_id: number;
      user_name: string;
      post_id: number;
      post_title: string;
      post_content: string | null;
      post_created_at: string;
    };
    
    // 타입 호환성 검사 (await 사용)
    const userPostsResult = await userPostsQuery;
    const userPostsData: UserPostsViewRow[] = userPostsResult.data;
    
    // 2. active_users_view 조회 테스트
    const activeUsersQuery = supalite
      .from('active_users_view')
      .select('*')
      .gte('post_count', 2);
    
    // 타입 확인: active_users_view의 Row 타입이 올바르게 추론되는지 확인
    type ActiveUsersViewRow = {
      id: number;
      name: string;
      email: string;
      last_login: string | null;
      post_count: number;
    };
    
    // 타입 호환성 검사 (await 사용)
    const activeUsersResult = await activeUsersQuery;
    const activeUsersData: ActiveUsersViewRow[] = activeUsersResult.data;
    
    // 3. 단일 결과 조회 테스트
    const singlePostQuery = supalite
      .from('user_posts_view')
      .select('*')
      .eq('post_id', 1)
      .single();
    
    // 타입 확인: single() 메서드 호출 시 타입이 올바르게 추론되는지 확인 (await 사용)
    const singlePostResult = await singlePostQuery;
    const singlePostData: UserPostsViewRow | null = singlePostResult.data;
    
    // 4. 일반 테이블과 View 테이블 함께 사용 테스트
    const profilesQuery = supalite
      .from('profiles')
      .select('*')
      .eq('user_id', 1);
    
    // 타입 확인: profiles 테이블의 Row 타입이 올바르게 추론되는지 확인
    type ProfileRow = {
      id: number;
      user_id: number;
      bio: string | null;
      avatar_url: string | null;
      interests: string[] | null;
      updated_at: string | null;
    };
    
    // 타입 호환성 검사 (await 사용)
    const profilesResult = await profilesQuery;
    const profilesData: ProfileRow[] = profilesResult.data;
    
    // 5. 타입 안전성 테스트: 존재하지 않는 컬럼 접근 시 타입 오류 발생 확인
    // 다음 코드는 컴파일 오류가 발생해야 함 (주석 처리)
    /*
    const invalidQuery = await supalite
      .from('user_posts_view')
      .select('*');
    
    // 존재하지 않는 컬럼 접근 시도
    const invalidData = invalidQuery.data[0].non_existent_column;
    */
    
    // 6. 타입 안전성 테스트: 존재하지 않는 테이블 접근 시 타입 오류 발생 확인
    // 다음 코드는 컴파일 오류가 발생해야 함 (주석 처리)
    /*
    const invalidTableQuery = supalite
      .from('non_existent_view')
      .select('*');
    */
    
    // 7. Insert/Update 불가능 테스트: View는 읽기 전용이므로 Insert/Update 불가능
    // 다음 코드는 컴파일 오류가 발생해야 함 (주석 처리)
    /*
    const insertQuery = supalite
      .from('user_posts_view')
      .insert({
        user_id: 1,
        user_name: '홍길동',
        post_id: 1,
        post_title: '새 게시물',
        post_content: '내용',
        post_created_at: '2025-01-01T00:00:00Z'
      });
    
    const updateQuery = supalite
      .from('user_posts_view')
      .update({
        post_title: '수정된 게시물'
      });
    */
    
    console.log('타입 검사 완료: 모든 타입이 올바르게 추론됨');
  }
  
  // 실제로는 실행되지 않는 함수이므로 호출하지 않음
  // typeCheck();
  
  console.log('View 테이블 타입 테스트 완료: 컴파일 오류 없음');
}

// 테스트 실행
testViewTableTypes();
