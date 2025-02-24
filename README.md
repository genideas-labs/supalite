# Supabase Client Clone

PostgreSQL 데이터베이스를 위한 타입스크립트 기반의 강력한 클라이언트 라이브러리입니다.

## 주요 기능

- 🔒 타입 안전성: TypeScript로 작성되어 완벽한 타입 지원
- 🚀 강력한 쿼리 빌더: 직관적이고 체이닝 가능한 API
- 🛠 CRUD 작업: 간단하고 명확한 데이터베이스 작업
- 📦 RPC 지원: 저장 프로시저 호출 기능
- ⚡ 성능 최적화: 커넥션 풀링 및 효율적인 쿼리 실행

## 설치 방법

```bash
npm install supabase-client-clone
```

## 사용 예시

```typescript
// 클라이언트 초기화
const supabase = new SupabaseClient({
  supabaseUrl: 'https://your-project.supabase.co',
  supabaseKey: 'your-api-key'
});

// 데이터 조회
const { data, error } = await supabase
  .from('users')
  .select('*')
  .eq('id', 1)
  .single();

// 데이터 삽입
const { data, error } = await supabase
  .from('users')
  .insert({ 
    name: '홍길동', 
    email: 'hong@example.com' 
  });

// RPC 호출
const { data, error } = await supabase
  .rpc('calculate_total', { x: 1, y: 2 });
```

## API 문서

### 쿼리 메소드

- `select(columns?: string)`: 조회할 컬럼 지정
- `insert(data: object)`: 새 레코드 삽입
- `update(data: object)`: 레코드 업데이트
- `delete()`: 레코드 삭제

### 필터 메소드

- `eq(column, value)`: 같음
- `neq(column, value)`: 같지 않음
- `gt(column, value)`: 보다 큼
- `gte(column, value)`: 크거나 같음
- `lt(column, value)`: 보다 작음
- `lte(column, value)`: 작거나 같음
- `like(column, pattern)`: LIKE 패턴 매칭
- `ilike(column, pattern)`: 대소문자 구분 없는 LIKE

### 기타 메소드

- `order(column, { ascending: boolean })`: 정렬
- `limit(count: number)`: 결과 개수 제한
- `offset(count: number)`: 결과 시작 위치
- `single()`: 단일 결과 반환

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

```bash
# 저장소 클론
git clone https://github.com/your-username/supabase-client-clone.git

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
