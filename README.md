# SupaLite

[![npm version](https://img.shields.io/badge/version-0.3.1-blue.svg)](https://www.npmjs.com/package/supalite)

가볍고 효율적인 PostgreSQL 클라이언트 라이브러리입니다. Supabase와 동일한 API를 제공하면서도 더 가볍고 빠른 구현을 제공합니다.

## 주요 기능

- 🔒 타입 안전성: TypeScript로 작성되어 완벽한 타입 지원
- 🚀 강력한 쿼리 빌더: Supabase 스타일의 직관적이고 체이닝 가능한 API
- 🌍 멀티 스키마: 여러 데이터베이스 스키마 지원
- 🛠 CRUD 작업: 간단하고 명확한 데이터베이스 작업
- 📦 RPC 지원: 저장 프로시저 호출 기능
- ⚡ 성능 최적화: 커넥션 풀링 및 효율적인 쿼리 실행
- 💪 트랜잭션 지원: Supabase에서 지원하지 않는 안전한 데이터베이스 트랜잭션 처리
- 🎯 UPSERT 지원: 삽입/업데이트 동작 제어
- 🔍 고급 필터링: OR 조건, ILIKE 검색 등 지원
- 📚 배열 작업: 다중 레코드 삽입 및 배열 데이터 처리 (JSON/JSONB 필드 포함)
- 🔄 Views, Functions, Enums 지원: Supabase 스타일의 완벽한 타입 지원

## 설치 방법

```bash
npm install supalite
```

## 타입 시스템

### 데이터베이스 스키마 정의

```typescript
// Supabase CLI의 타입 생성기로 생성된 데이터베이스 타입 정의
// 예: supabase gen types typescript --local > database.types.ts
import { Database } from './types/database';

// 타입이 적용된 클라이언트 생성
const client = new SupaLitePG<Database>({
  user: 'testuser',
  password: 'testpassword',
  host: 'localhost',
  database: 'testdb',
  port: 5432,
  ssl: false
});

// 또는 환경 변수 사용
const client = new SupaLitePG<Database>();

// Database 인터페이스 예시 (Supabase CLI로 생성된 타입과 동일한 구조)
interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: number;
          name: string;
          email: string;
          status: string;
          last_login: string | null;
          created_at: string;
        };
        Insert: {
          name: string;
          email: string;
          status?: string;
          last_login?: string | null;
        };
        Update: {
          name?: string;
          email?: string;
          status?: string;
          last_login?: string | null;
        };
        Relationships: unknown[];
      };
      // 다른 테이블들...
    };
    Views: {
      // 뷰 정의...
    };
    Functions: {
      // 함수 정의...
    };
    Enums: {
      // 열거형 정의...
    };
  };
  // 다른 스키마들...
}
```

## 사용 예시

### 데이터베이스 연결

```typescript
import { SupaLitePG } from 'supalite';
import { Database } from './types/database';

// 타입이 적용된 클라이언트 생성
const client = new SupaLitePG<Database>({
  user: 'testuser',
  password: 'testpassword',
  host: 'localhost',
  database: 'testdb',
  port: 5432,
  ssl: false
});
```

### 기본 CRUD 작업

```typescript
// 데이터 조회
const { data, error } = await client
  .from('users')
  .select('*')
  .eq('id', 1)
  .single();

// 단일 레코드 삽입
const { data, error } = await client
  .from('users')
  .insert({ 
    name: '홍길동', 
    email: 'hong@example.com' 
  });

// 다중 레코드 삽입
const { data, error } = await client
  .from('users')
  .insert([
    { name: '홍길동', email: 'hong@example.com' },
    { name: '김철수', email: 'kim@example.com' }
  ]);

// 특정 컬럼 선택
const { data } = await client
  .from('profiles')
  .select('user_id, bio, interests')
  .limit(2);

// 다중 정렬
const { data } = await client
  .from('users')
  .select('name, status, last_login')
  .order('status', { ascending: true })
  .order('last_login', { ascending: false });

// 페이지네이션
const page1 = await client
  .from('posts')
  .select('*')
  .limit(2)
  .offset(0);

// Range 쿼리
const { data } = await client
  .from('comments')
  .select('*')
  .range(1, 3);

// 조건부 UPDATE
const { data } = await client
  .from('posts')
  .update({
    views: 10,
    updated_at: new Date().toISOString()
  })
  .eq('user_id', userId)
  .select();

// UPSERT
const { data } = await client
  .from('profiles')
  .upsert({
    user_id: userId,
    bio: '새로운 프로필입니다.',
    interests: ['코딩', '음악'],
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' })
  .select()
  .single();
```

### 고급 기능 사용 예시

```typescript
// 트랜잭션 사용 (Supabase에서 지원하지 않는 기능)
await client.transaction(async (tx) => {
  const { data: user } = await tx
    .from('users')
    .insert({ name: '홍길동' })
    .select()
    .single();

  await tx
    .from('profiles')
    .insert({ user_id: user.id });
});

// OR 조건 필터링
const { data, error } = await client
  .from('users')
  .or('status.eq.active,role.eq.admin');

// 대소문자 구분 없는 검색
const { data, error } = await client
  .from('users')
  .ilike('email', '%@example.com');

// 정확한 카운트와 함께 조회
const { data, count, error } = await client
  .from('users')
  .select('*', { count: 'exact' });

// 배열 데이터 처리
const { data, error } = await client
  .from('posts')
  .insert([
    {
      title: '첫 번째 글',
      tags: ['프로그래밍', '팁'],
      content: '내용...'
    },
    {
      title: '두 번째 글',
      tags: ['여행'],
      content: '내용...'
    }
  ]);

// JSONB 배열 데이터 처리
const { data: jsonData, error: jsonError } = await client
  .from('your_jsonb_table') // 'your_jsonb_table'을 실제 테이블명으로 변경
  .insert({ 
    metadata_array: ['tag1', 2025, { active: true }] 
  })
  .select('metadata_array')
  .single();

// 다른 스키마 사용
const { data, error } = await client
  .from('users', 'other_schema')
  .select('*');
```

## API 문서

### 쿼리 메소드

- `select(columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated', head?: boolean })`: 조회할 컬럼 지정
- `insert(data: T['Tables'][K]['Insert'] | T['Tables'][K]['Insert'][])`: 단일 또는 다중 레코드 삽입
- `update(data: T['Tables'][K]['Update'])`: 레코드 업데이트
- `delete()`: 레코드 삭제
- `upsert(data: T['Tables'][K]['Insert'], options?: { onConflict: string })`: 삽입 또는 업데이트

### 필터 메소드

- `eq(column, value)`: 같음
- `neq(column, value)`: 같지 않음
- `gt(column, value)`: 보다 큼
- `gte(column, value)`: 크거나 같음
- `lt(column, value)`: 보다 작음
- `lte(column, value)`: 작거나 같음
- `like(column, pattern)`: LIKE 패턴 매칭
- `ilike(column, pattern)`: 대소문자 구분 없는 LIKE
- `in(column, values)`: IN 연산자
- `is(column, value)`: IS 연산자
- `contains(column, value)`: 배열/JSON 포함 여부
- `or(conditions)`: OR 조건 (예: 'status.eq.active,role.eq.admin')

### 기타 메소드

- `order(column, { ascending: boolean })`: 정렬
- `limit(count: number)`: 결과 개수 제한
- `offset(count: number)`: 결과 시작 위치
- `range(from: number, to: number)`: 범위 지정
- `single()`: 단일 결과 반환 (결과 없을 시 에러)
- `maybeSingle()`: 단일 결과 반환 (결과 없을 시 data: null, error: null)
- `returns<T>()`: 반환 타입 지정

### 트랜잭션 메소드

- `transaction<T>(callback: (client: SupaLitePG) => Promise<T>)`: 트랜잭션 실행
- `begin()`: 트랜잭션 시작
- `commit()`: 트랜잭션 커밋
- `rollback()`: 트랜잭션 롤백

## 환경 변수 설정

데이터베이스 연결을 위해 다음 환경 변수를 설정할 수 있습니다:

```env
DB_USER=your_db_user
DB_HOST=your_db_host
DB_NAME=your_db_name
DB_PASS=your_db_password
DB_PORT=5432
DB_SSL=true
```

## 응답 형식

모든 쿼리 메소드는 다음과 같은 형식의 응답을 반환합니다:

```typescript
interface QueryResponse<T> {
  data: T | null;        // 쿼리 결과 데이터
  error: Error | null;   // 에러 정보
  count?: number;        // 결과 레코드 수
  status: number;        // HTTP 상태 코드
  statusText: string;    // 상태 메시지
}
```

## 개발 환경 설정

### PostgreSQL 설치
PostgreSQL을 로컬에 설치하고 테스트하는 방법은 [examples/README.md](examples/README.md)를 참조하세요.

### 프로젝트 설정

```bash
# 저장소 클론
git clone https://github.com/your-username/supalite.git

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 테스트 실행
npm test

# 빌드
npm run build
```

## 라이선스

MIT 라이선스로 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

## 저작권

Copyright © 2025 Genideas Inc. and Wondong Shin (wodshin@gmail.com)
