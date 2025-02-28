# Changelog

## [0.1.6] - 2025-03-01

### Added
- corepack 지원 추가 (npm, yarn, pnpm, bun 패키지 관리자 지원)
- 패키지 관리자 중립적인 스크립트 설정 ($npm_execpath 사용)
- 각 패키지 관리자의 lock 파일 생성 (package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb)

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
