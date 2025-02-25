# Supalite 예제

이 디렉토리에는 Supalite 라이브러리의 다양한 기능을 보여주는 예제들이 포함되어 있습니다.

## 설정

1. 데이터베이스 설정:
```bash
# PostgreSQL에 접속하여 테스트 데이터베이스와 테이블 생성
psql -U postgres
CREATE DATABASE testdb;
\c testdb
\i setup.sql
```

2. 환경 변수 설정:
```bash
# .env.example 파일을 .env로 복사
cp .env.example .env

# .env 파일을 편집하여 데이터베이스 연결 정보 입력
# DB_USER=postgres
# DB_HOST=localhost
# DB_NAME=testdb
# DB_PASS=postgres
# DB_PORT=5432
# DB_SSL=false
```

## 예제 실행

각 예제는 특정 기능을 테스트합니다:

1. SELECT 쿼리 테스트:
```bash
npx ts-node examples/tests/select.ts
```
- 기본 SELECT
- 특정 컬럼 선택
- COUNT 쿼리
- 정렬과 페이징

2. WHERE 조건 테스트:
```bash
npx ts-node examples/tests/where.ts
```
- eq, neq, is
- in, contains (배열)
- ilike (패턴 매칭)
- gte/lte (날짜 범위)
- OR 조건

3. 데이터 변경 테스트:
```bash
npx ts-node examples/tests/mutation.ts
```
- INSERT (단일/다중)
- UPDATE (조건부)
- DELETE
- UPSERT

4. 트랜잭션 테스트:
```bash
npx ts-node examples/tests/transaction.ts
```
- 성공 케이스
- 롤백 케이스
- 중첩 트랜잭션

5. 특수 케이스 테스트:
```bash
npx ts-node examples/tests/special.ts
```
- single() 메서드
- 복잡한 조인 쿼리
- 에러 처리
- 서브쿼리
- 집계 함수

## 타입 시스템

`examples/types/database.ts` 파일에는 테스트 데이터베이스의 타입 정의가 포함되어 있습니다. 이는 실제 프로젝트에서 Supabase의 타입 생성기를 사용하는 것과 유사한 방식으로 타입 안전성을 보여주기 위한 예시입니다.
