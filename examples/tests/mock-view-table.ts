import { PostgresError } from '../../src/errors';
import { QueryResult, SingleQueryResult } from '../../src/types';

// 모의 데이터: user_posts_view
const mockUserPostsView = [
  { 
    user_id: 1, 
    user_name: '홍길동', 
    post_id: 1, 
    post_title: '첫 번째 게시물', 
    post_content: '안녕하세요, 첫 번째 게시물입니다.', 
    post_created_at: '2025-01-01T00:00:00Z' 
  },
  { 
    user_id: 1, 
    user_name: '홍길동', 
    post_id: 2, 
    post_title: '여행 후기', 
    post_content: '지난 주말 여행 다녀왔습니다.', 
    post_created_at: '2025-01-02T00:00:00Z' 
  },
  { 
    user_id: 2, 
    user_name: '김철수', 
    post_id: 3, 
    post_title: '프로그래밍 팁', 
    post_content: '효율적인 코딩을 위한 팁을 공유합니다.', 
    post_created_at: '2025-01-03T00:00:00Z' 
  },
  { 
    user_id: 2, 
    user_name: '김철수', 
    post_id: 7, 
    post_title: '두 번째 프로그래밍 팁', 
    post_content: '더 많은 프로그래밍 팁을 공유합니다.', 
    post_created_at: '2025-01-07T00:00:00Z' 
  },
  { 
    user_id: 3, 
    user_name: '이영희', 
    post_id: 4, 
    post_title: '디자인 포트폴리오', 
    post_content: '최근 작업한 디자인 포트폴리오입니다.', 
    post_created_at: '2025-01-04T00:00:00Z' 
  },
  { 
    user_id: 4, 
    user_name: '박지민', 
    post_id: 5, 
    post_title: '공부 방법', 
    post_content: '효과적인 공부 방법을 공유합니다.', 
    post_created_at: '2025-01-05T00:00:00Z' 
  },
  { 
    user_id: 5, 
    user_name: '최민수', 
    post_id: 6, 
    post_title: '맛있는 레시피', 
    post_content: '간단하게 만들 수 있는 레시피를 공유합니다.', 
    post_created_at: '2025-01-06T00:00:00Z' 
  }
];

// 모의 데이터: active_users_view
const mockActiveUsersView = [
  { id: 1, name: '홍길동', email: 'hong@example.com', last_login: '2025-01-30T00:00:00Z', post_count: 2 },
  { id: 2, name: '김철수', email: 'kim@example.com', last_login: '2025-01-28T00:00:00Z', post_count: 2 },
  { id: 4, name: '박지민', email: 'park@example.com', last_login: '2025-01-31T19:00:00Z', post_count: 1 },
  { id: 5, name: '최민수', email: 'choi@example.com', last_login: '2025-02-01T00:00:00Z', post_count: 1 }
];

// 모의 데이터: profiles
const mockProfiles = [
  { id: 1, user_id: 1, bio: '안녕하세요, 홍길동입니다.', avatar_url: 'https://example.com/avatar1.jpg', interests: ['여행', '독서', '영화'], updated_at: null },
  { id: 2, user_id: 2, bio: '프로그래머 김철수입니다.', avatar_url: 'https://example.com/avatar2.jpg', interests: ['코딩', '게임'], updated_at: null },
  { id: 3, user_id: 3, bio: '디자이너 이영희입니다.', avatar_url: 'https://example.com/avatar3.jpg', interests: ['디자인', '그림', '음악'], updated_at: null },
  { id: 4, user_id: 4, bio: '학생 박지민입니다.', avatar_url: 'https://example.com/avatar4.jpg', interests: ['공부', '독서'], updated_at: null },
  { id: 5, user_id: 5, bio: '요리사 최민수입니다.', avatar_url: 'https://example.com/avatar5.jpg', interests: ['요리', '여행'], updated_at: null }
];

// 모의 QueryResult 생성 함수
function createMockQueryResult<T>(data: T[]): QueryResult<T> {
  return {
    data,
    error: null,
    count: data.length,
    status: 200,
    statusText: 'OK'
  };
}

// 모의 SingleQueryResult 생성 함수
function createMockSingleQueryResult<T>(data: T | null): SingleQueryResult<T> {
  return {
    data,
    error: null,
    count: data ? 1 : 0,
    status: 200,
    statusText: 'OK'
  };
}

/**
 * 예제 1: View 테이블 조회
 * 
 * 이 예제는 user_posts_view 뷰에서 데이터를 조회하는 방법을 보여줍니다.
 */
function example1() {
  // 모의 데이터로 QueryResult 생성
  const result = createMockQueryResult(mockUserPostsView);

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
}

/**
 * 예제 2: View 테이블에 조건 적용
 * 
 * 이 예제는 active_users_view 뷰에서 조건을 적용하여 데이터를 조회하는 방법을 보여줍니다.
 */
function example2() {
  // 게시물이 2개 이상인 사용자만 필터링
  const filteredData = mockActiveUsersView.filter(user => user.post_count >= 2);
  const result = createMockQueryResult(filteredData);

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
}

/**
 * 예제 3: View 테이블과 일반 테이블 조인
 * 
 * 이 예제는 View 테이블과 일반 테이블을 함께 사용하는 방법을 보여줍니다.
 */
function example3() {
  // 1. active_users_view에서 사용자 조회 (게시물 수 기준 내림차순 정렬 후 상위 3명)
  const sortedUsers = [...mockActiveUsersView].sort((a, b) => b.post_count - a.post_count).slice(0, 3);
  const activeUsers = createMockQueryResult(sortedUsers);

  console.log('===== 게시물이 많은 상위 3명의 사용자 =====');
  
  // 2. 각 사용자의 프로필 정보 조회
  const userProfiles = activeUsers.data.map(user => {
    const profile = mockProfiles.find(p => p.user_id === user.id);
    const profileResult = createMockSingleQueryResult(profile || null);
    
    return {
      user: user,
      profile: profileResult.data
    };
  });

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
}

/**
 * 예제 4: View 테이블에 단일 결과 조회
 * 
 * 이 예제는 View 테이블에서 단일 결과를 조회하는 방법을 보여줍니다.
 */
function example4() {
  // ID가 1인 게시물 조회
  const post = mockUserPostsView.find(p => p.post_id === 1) || null;
  const result = createMockSingleQueryResult(post);

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
}

// 예제 실행 함수
function runExamples() {
  console.log('===== View 테이블 조회 예제 =====');
  
  console.log('\n===== 예제 1: View 테이블 조회 =====');
  example1();

  console.log('\n===== 예제 2: View 테이블에 조건 적용 =====');
  example2();

  console.log('\n===== 예제 3: View 테이블과 일반 테이블 조인 =====');
  example3();

  console.log('\n===== 예제 4: View 테이블에 단일 결과 조회 =====');
  example4();
}

// 예제 실행
console.log('===== View 테이블 조회 예제 실행 (모의 데이터) =====');
runExamples();

export {
  example1,
  example2,
  example3,
  example4,
  runExamples,
};
