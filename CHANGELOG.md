# Changelog

## [0.7.2] - 2026-01-17

### ✨ Added
- `--no-bigint` 옵션을 추가해 BIGINT를 `number`로 출력할 수 있습니다.

### 🐞 Fixed
- `js-yaml` 의존성을 보안 패치 버전으로 업데이트했습니다. (prototype pollution 대응)

## [0.7.1] - 2026-01-17

### ✨ Added
- `supalite gen types` 기본 출력이 Supabase CLI 포맷과 최대한 동일하도록 정렬/포맷/헬퍼 타입/Constants를 추가했습니다.
- `--format supabase|supalite`, `--bigint-type`, `--json-bigint` 옵션을 추가했습니다.
- Supabase 포맷에서 insertable view에 `Insert`/`Update`를 포함하고, 함수 오버로드 출력 형태를 Supabase와 맞췄습니다.

### 🔧 Changed
- Supabase 포맷 기본값 기준으로 관계/복합 타입/함수 시그니처가 기본 포함됩니다. (legacy 출력은 `--format supalite`)

## [0.7.0] - 2026-01-17

### ✨ Added
- `supalite gen types` CLI to generate TypeScript Database types from PostgreSQL schemas.
- BIGINT columns are emitted as `bigint` in the generated types.
- `--date-as-date` option to map `date`/`timestamp` columns to `Date` in generated types.
- `--include-relationships`, `--include-constraints`, `--include-indexes` options to emit schema metadata.
- `--include-composite-types` and `--include-function-signatures` options for composite types and typed function signatures.
- `--type-case` and `--function-case` options to control enum/composite and function key casing.
- `--dump-functions-sql` option to export `CREATE FUNCTION/PROCEDURE` definitions to a local file.
- Added gen-types seed/cleanup scripts and limitations docs.

## [0.6.1] - 2026-01-16

### ✨ Added
- `count: 'planned' | 'estimated'`가 `EXPLAIN (FORMAT JSON)` 기반 추정치를 반환하도록 추가했습니다.

### 🐞 Fixed
- 트랜잭션 내 쿼리가 트랜잭션 클라이언트로 실행되도록 수정했습니다.
- `in()`에 `null`이 포함될 때 `IS NULL`을 포함하도록 개선했습니다.

## [0.6.0] - 2026-01-16

### ✨ Added
- PostgREST-style embed에 중첩 관계, `!inner`, 관계 테이블 필터(`table.column`) 지원을 추가했습니다.
- `insert()`에 `onConflict`/`ignoreDuplicates` 옵션을 추가했습니다. (`ON CONFLICT DO NOTHING`)
- `upsert()`에 `ignoreDuplicates` 옵션을 추가했습니다. (`ON CONFLICT DO NOTHING`)
- `or()`에서 `now()`를 `NOW()`로 인라인 처리합니다.
- README 영어화 및 `README.ko.md` 추가.
- `or()`에 따옴표 값 파싱을 추가해 `,`/`.` 포함 값을 안전하게 처리합니다.

### 🐞 Fixed
- `single()`/`maybeSingle()`/RPC 내부 PGRST 에러에 `error.code`를 채워 분기 처리를 안정화했습니다.
- RPC가 빈 결과에서 `data: []`를 반환하고, 스칼라 언랩은 스칼라 반환 함수에만 적용합니다.

## [0.5.7] - 2026-01-14

### ✨ Added
- `upsert()`에 `onConflict` 다중 컬럼 지정 지원을 추가했습니다. 이제 콤마 구분 문자열 또는 문자열 배열을 사용할 수 있습니다. (예: `'set_id, name'`, `['set_id', 'name']`)

### 🐞 Fixed
- `select()`의 PostgREST-style embed(`related_table(*)`)가 **양방향 FK**를 지원하도록 개선했습니다. 이제 1:N 관계는 배열(`[]` 기본값), N:1 관계는 객체(또는 `null`)로 반환합니다. (See [docs/changelog/2025-12-17-embed-many-to-one.md](docs/changelog/2025-12-17-embed-many-to-one.md))

## [0.5.5] - 2025-11-26

### ✨ Added
-   `rpc()` 메서드 호출 시 `.single()` 및 `.maybeSingle()` 메서드 체이닝 지원을 추가했습니다. 이를 통해 RPC 결과에 대해 단일 행 제약 조건을 적용할 수 있습니다. (See [docs/changelog/2025-11-26-rpc-single-support.md](docs/changelog/2025-11-26-rpc-single-support.md))

## [0.5.2] - 2025-10-16

### 🐞 Fixed
- `select()` 메서드에서 `count: 'exact'` 옵션 사용 시 `limit()` 또는 `range()`와 함께 호출될 때 전체 개수 대신 페이지네이션된 개수를 반환하는 버그를 수정했습니다. 이제 항상 정확한 전체 개수를 반환합니다.
- `select()` 메서드에서 `count: 'exact'`와 `head: true` 옵션을 함께 사용할 때 `count`가 `null`로 반환되는 버그를 수정했습니다.

## [0.5.1] - 2025-10-16

### 🐞 Fixed
- `select()` 메서드에서 `count: 'exact'` 옵션 사용 시 `limit()` 또는 `range()`와 함께 호출될 때 전체 개수 대신 페이지네이션된 개수를 반환하는 버그를 수정했습니다. 이제 항상 정확한 전체 개수를 반환합니다.

## [0.5.0] - 2025-07-01

### ✨ Added
-   **Join Query Support**: Implemented support for PostgREST-style join queries in the `.select()` method. You can now fetch related data from foreign tables using the syntax `related_table(*)` or `related_table(column1, column2)`. This is achieved by dynamically generating `json_agg` subqueries.

### 🛠 Changed
-   `SupaLitePG` client now includes a `getForeignKey` method to resolve foreign key relationships, with caching for better performance.
-   `QueryBuilder`'s `select` and `buildQuery` methods were enhanced to parse the new syntax and construct the appropriate SQL queries.

## [0.4.0] - 2025-06-10

### ✨ Added
-   **Configurable `BIGINT` Transformation**: Introduced `bigintTransform` option in `SupaLitePG` constructor to allow users to specify how `BIGINT` database types are transformed (to `'bigint'`, `'string'`, or `'number'`). Default is `'bigint'`. This provides flexibility and helps mitigate `JSON.stringify` errors with native `BigInt` objects. (See [docs/changelog/2025-06-10-bigint-handling-enhancement.md](docs/changelog/2025-06-10-bigint-handling-enhancement.md) for details)

### 🛠 Changed
-   The internal `Json` type in `src/types.ts` now explicitly includes `bigint`, with documentation clarifying user responsibility for `JSON.stringify` handling.
-   Improved client initialization logging for `bigintTransform` mode when `verbose` is enabled.

## [0.1.8] - 2025-03-04

### Fixed
- 누락된 `dist` 파일들을 포함하도록 수정

## [0.1.7] - 2025-03-04

### Added
- QueryBuilder에 `match` 메서드 추가
- `match` 메서드 테스트 코드 작성

## [0.1.6] - 2025-03-01

### Added
- corepack 지원 추가 (npm, yarn, pnpm, bun 패키지 관리자 지원)
- 패키지 관리자 중립적인 스크립트 설정 ($npm_execpath 사용)
- 각 패키지 관리자의 lock 파일 생성 (package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lock)
- .npmignore 파일 추가하여 lock 파일들이 npm 배포 패키지에 포함되지 않도록 설정

## [0.1.5] - 2025-02-28

### Security
- 예제 코드에서 민감한 Supabase 연결 문자열 제거
- Git 히스토리에서 민감한 정보 제거

## [0.1.4] - 2025-02-28

### Fixed
- GitHub 저장소에서 직접 설치 시 빌드된 파일이 포함되지 않는 문제 해결
- .gitignore에서 dist 디렉토리 제외하여 빌드된 파일이 GitHub에 포함되도록 수정

## [0.1.3] - 2025-02-27

### Added
- PostgreSQL bigint 타입 지원 추가 (JavaScript BigInt 타입으로 변환)
- bigint 타입 테스트 코드 작성
- Number 및 string 타입 값의 자동 변환 지원 확인 (bigint 컬럼에 Number나 string 값 전달 시 자동 변환)

## [0.1.2] - 2025-02-27

### Added
- DB_CONNECTION URI 형식 지원 추가
- 연결 테스트 메서드 추가
- 연결 문자열 테스트 코드 작성

## [0.1.1] - 2025-02-25

### Added
- 멀티 스키마 데이터베이스 지원
- Supabase 스타일의 타입 시스템 지원
- Json 타입 정의 추가
- Views, Functions, Enums, CompositeTypes 지원

### Changed
- 타입 시스템 개선
- 스키마 인식 타입 유틸리티 업데이트
- 기본 스키마를 'public'으로 설정

## [0.1.0] - 2025-02-25

### Added
- 초기 릴리즈
- PostgreSQL 클라이언트 구현
- 기본적인 CRUD 작업 지원
- 트랜잭션 지원
- 타입 안전성
- 테스트 및 예제 코드
