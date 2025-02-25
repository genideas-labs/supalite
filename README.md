# SupaLite

가볍고 효율적인 PostgreSQL 클라이언트 라이브러리입니다. Supabase와 동일한 API를 제공하면서도 더 가볍고 빠른 구현을 제공합니다.

## 주요 기능

- 🔒 타입 안전성: TypeScript로 작성되어 완벽한 타입 지원
- 🚀 강력한 쿼리 빌더: Supabase 스타일의 직관적이고 체이닝 가능한 API
- 🛠 CRUD 작업: 간단하고 명확한 데이터베이스 작업
- 📦 RPC 지원: 저장 프로시저 호출 기능
- ⚡ 성능 최적화: 커넥션 풀링 및 효율적인 쿼리 실행
- 💪 트랜잭션 지원: 안전한 데이터베이스 트랜잭션 처리
- 🎯 UPSERT 지원: 삽입/업데이트 동작 제어
- 🔍 고급 필터링: OR 조건, ILIKE 검색 등 지원

## 설치 방법

```bash
npm install supalite
```

## 사용 예시

### 데이터베이스 연결

#### 기존 pg 라이브러리 스타일
```typescript
import { SupaLitePG } from 'supalite';

// 기존 pg 설정 방식과 동일
const db = new SupaLitePG({
  user: 'dbuser',
  host: 'database.server.com',
  database: 'mydb',
  password: 'secretpassword',
  port: 5432,
  ssl: true
});

// 또는 환경 변수 사용 (자동으로 process.env 값을 사용)
const db = new SupaLitePG();

// 기존 pg 스타일 쿼리
const result = await db.pool.query(
  'SELECT * FROM users WHERE id = $1',
  [1]
);

// 새로운 쿼리 빌더 사용
const { data, error } = await db
  .from('users')
  .select('*')
  .eq('id', 1)
  .single();
```

#### Supabase 스타일

```typescript
import { supalitePg } from 'supalite';

// 데이터 조회
const { data, error } = await supalitePg
  .from('users')
  .select('*')
  .eq('id', 1)
  .single();

// 데이터 삽입
const { data, error } = await supalitePg
  .from('users')
  .insert({ 
    name: '홍길동', 
    email: 'hong@example.com' 
  });

// RPC 호출
const { data, error } = await supalitePg
  .rpc('calculate_total', { x: 1, y: 2 });
```

### 고급 기능 사용 예시

```typescript
// 트랜잭션 사용
await supalitePg.transaction(async (client) => {
  const { data: user } = await client
    .from('users')
    .insert({ name: '홍길동' })
    .select()
    .single();

  await client
    .from('profiles')
    .insert({ user_id: user.id });
});

// UPSERT 작업
const { data, error } = await supalitePg
  .from('users')
  .upsert(
    { id: 1, name: '홍길동', updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  );

// OR 조건 필터링
const { data, error } = await supalitePg
  .from('users')
  .or('status.eq.active,role.eq.admin');

// 대소문자 구분 없는 검색
const { data, error } = await supalitePg
  .from('users')
  .ilike('email', '%@example.com');

// 정확한 카운트와 함께 조회
const { data, count, error } = await supalitePg
  .from('users')
  .select('*', { count: 'exact' });
```

## API 문서

### 쿼리 메소드

- `select(columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated', head?: boolean })`: 조회할 컬럼 지정
- `insert(data: object)`: 새 레코드 삽입
- `update(data: object)`: 레코드 업데이트
- `delete()`: 레코드 삭제
- `upsert(data: object, options?: { onConflict: string })`: 삽입 또는 업데이트

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
- `single()`: 단일 결과 반환
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
