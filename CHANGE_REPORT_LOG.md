# 변경 사항 보고서 (2025-03-02)

## 버전 0.1.12 배포 완료

### 1. 코드 변경 사항

#### 타입 정의 수정 (`src/types.ts`)
- `ViewName` 타입 추가: 스키마 내의 Views 이름을 참조하는 타입
- `TableOrViewName` 타입 추가: Tables와 Views를 모두 포함하는 통합 타입
- `Row`, `InsertRow`, `UpdateRow` 타입 수정: Views도 처리할 수 있도록 조건부 타입 적용

#### 쿼리 빌더 수정 (`src/query-builder.ts`)
- `QueryBuilder` 클래스의 제네릭 타입 매개변수를 `TableOrViewName`으로 변경

#### PostgreSQL 클라이언트 수정 (`src/postgres-client.ts`)
- `SchemaWithTables` 타입 수정: Views 타입 정의 추가
- `from` 메서드 시그니처 수정: `TableOrViewName` 타입을 사용하도록 변경

### 2. 예제 및 테스트 코드 추가

#### 예제 데이터베이스 타입 정의 수정 (`examples/types/database.ts`)
- 예제 데이터베이스 타입 정의에 Views 추가
- `user_posts_view`와 `active_users_view` 뷰 정의 추가

#### 테스트 및 예제 코드 추가
- View 테이블 조회 예제 코드 작성 (`examples/tests/view-table.ts`)
- 테스트용 SQL 스크립트 작성 (`examples/setup-views.sql`)
- 모의 데이터를 사용한 테스트 코드 작성 (`examples/tests/mock-view-table.ts`)
- 타입 안전성 테스트 코드 작성 (`examples/tests/view-table-test.ts`)
- PostgreSQL 테스트 환경 설정 스크립트 작성 (`setup-postgres-test.sql`)

### 3. 테스트 결과

#### 타입 검증
- TypeScript 컴파일러를 통한 타입 검증 완료
- View 테이블 타입이 올바르게 추론됨
- 타입 안전성 유지 (존재하지 않는 컬럼/테이블 접근 시 컴파일 오류 발생)
- Views는 읽기 전용이므로 Insert/Update 시도 시 컴파일 오류 발생

#### 모의 데이터 테스트
- 모의 데이터를 사용한 View 테이블 조회 예제 실행 성공
- 일반 테이블과 동일한 방식으로 View 테이블 조회 가능
- 조건 적용, 정렬, 단일 결과 조회 등 다양한 쿼리 기능 정상 작동

#### 실제 PostgreSQL 데이터베이스 테스트
- PostgreSQL 테스트 환경 설정 및 테스트 데이터 생성 성공
- 실제 데이터베이스에서 View 테이블 조회 기능 정상 작동 확인
- 연결 문자열을 사용하여 인증 문제 해결

### 4. 배포 과정

#### 브랜치 관리
- 브랜치 `feature/view-table-support` 생성
- 변경 사항 커밋: "feat: Views 테이블 조회 기능 추가"
- 테스트 코드 커밋: "test: View 테이블 조회 기능 테스트 코드 추가"
- PostgreSQL 테스트 환경 설정 스크립트 커밋: "test: PostgreSQL 테스트 환경 설정 스크립트 추가"

#### 머지 및 배포
- `feature/view-table-support` 브랜치를 `main` 브랜치에 머지
- 버전 0.1.12로 업데이트
- npm에 배포 완료

### 5. 결론

이제 Supalite 라이브러리는 Supabase 데이터베이스의 Views 테이블도 조회할 수 있게 되었습니다. 사용자는 일반 테이블과 동일한 방식으로 View 테이블을 조회할 수 있으며, 타입 안전성과 기존 코드와의 호환성이 유지됩니다. 실제 PostgreSQL 데이터베이스에서도 정상적으로 작동함을 확인했습니다.
