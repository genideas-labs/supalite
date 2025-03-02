# Changelog

## [0.1.12] - 2025-03-02

### Added
- Views 테이블 조회 기능 추가
- TableOrViewName 타입 추가로 Tables와 Views 모두 지원
- View 테이블 조회 예제 코드 추가
- View 테이블 테스트를 위한 SQL 스크립트 추가

## [0.1.11] - 2025-03-02

### Fixed
- 빌드 결과물 업데이트 및 배포 문제 해결

## [0.1.10] - 2025-03-02

### Fixed
- order 메서드를 수정하여 컬럼 이름만 전달하는 경우에도 기본적으로 오름차순 정렬이 적용되도록 개선
- Supabase와의 호환성 개선 (.order('post_index') 형식 지원)
- order 메서드 사용 예제 추가

## [0.1.9] - 2025-03-02

### Fixed
- from 메서드의 반환 타입을 수정하여 single() 메서드를 호출할 때 SingleQueryResult를 반환하도록 개선
- 타입 단언 없이도 single() 메서드를 사용할 수 있도록 수정
- single() 메서드 사용 예제 추가

## [0.1.8] - 2025-03-02

### Fixed
- from 메서드의 반환 타입을 수정하여 타입 단언 없이도 배열 메서드를 사용할 수 있도록 개선
- await 사용 시 자동으로 QueryResult<Row<T, S, K>>를 반환하도록 수정
- Supabase와의 호환성 개선

## [0.1.7] - 2025-03-02

### Fixed
- QueryResult 타입의 data 필드가 항상 배열을 반환하도록 수정
- 쿼리 결과가 없을 때 null 대신 빈 배열([])을 반환하도록 수정
- 에러 발생 시에도 data 필드가 빈 배열을 반환하도록 수정
- Supabase와의 호환성 개선

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
