# 변경 작업 보고서

## [2025-03-04] 누락된 dist 파일들을 포함하도록 수정

### 작업 내용
- 빌드 시 생성되는 dist 디렉토리의 파일들이 이전 커밋에 포함되지 않은 문제를 발견했습니다.
- dist 디렉토리를 삭제하고 다시 빌드하여 누락된 파일들을 생성했습니다.
- package.json 파일의 버전을 0.1.8로 업데이트했습니다.
- CHANGELOG.md 파일에 변경 사항을 기록했습니다.

### 변경된 파일
- dist/*
- package.json
- CHANGELOG.md

### 개발 과정
1. dist 디렉토리 삭제
2. npm run build 명령어 실행
3. git add . 명령어로 변경된 파일 스테이징
4. git commit -m "fix: Include missing files in dist directory" 명령어로 커밋
5. package.json 파일의 버전 업데이트
6. CHANGELOG.md 파일에 변경 사항 기록

### 결론
이번 작업을 통해 누락되었던 dist 파일들을 커밋에 포함시켰습니다.

---

## [2025-03-04] QueryBuilder에 match 메서드 추가

### 작업 내용

1.  **`match` 메서드 구현**:
    - `QueryBuilder` 클래스에 `match` 메서드를 추가했습니다.
    - 이 메서드는 객체를 인자로 받아, 객체의 각 키-값 쌍을 `"${key}" = $${index}` 형태의 조건으로 변환하여 `whereConditions` 배열에 추가합니다.
    - 이를 통해 사용자는 객체 리터럴을 사용하여 간편하게 쿼리 조건을 추가할 수 있습니다.

2.  **테스트용 테이블 생성**:
    - `examples/setup.sql` 파일에 `test_table`을 생성하는 SQL 문을 추가했습니다.
    - 이 테이블은 `match` 메서드의 동작을 테스트하는 데 사용됩니다.

3.  **테스트용 함수 구현**:
    - `src/test-table.ts` 파일에 `test_table`과 상호작용하는 함수를 작성했습니다.
    - `insertIntoTestTable` 함수는 `test_table`에 데이터를 삽입합니다.
    - `getFromTestTable` 함수는 `test_table`에서 데이터를 조회하고, `match` 메서드를 사용하여 조건을 적용합니다.

4.  **테스트 코드 작성**:
    - `examples/tests/query-builder.test.ts` 파일에 `match` 메서드를 테스트하는 코드를 작성했습니다.
    - 이 코드는 `test_table`에 데이터를 삽입하고, `match` 메서드를 사용하여 다양한 조건으로 데이터를 조회합니다.
    - 조회 결과가 예상과 일치하는지 확인합니다.

5.  **테스트 실행**:
    - `bun examples/tests/query-builder.test.ts` 명령어를 사용하여 테스트를 실행했습니다.
    - 모든 테스트가 성공적으로 완료되었습니다.

6.  **문서화**:
     - CHANGELOG.md 파일에 `match` 메서드 추가 사항을 기록했습니다.
     - 버전을 0.1.7로 업데이트했습니다.

### 변경된 파일

1.  `src/query-builder.ts`: `match` 메서드 추가
2.  `examples/setup.sql`: `test_table` 생성 SQL 문 추가
3.  `src/test-table.ts`: `test_table` 관련 함수 구현
4.  `examples/tests/query-builder.test.ts`: `match` 메서드 테스트 코드 작성
5.  `CHANGELOG.md`: 변경 사항 문서화 및 버전 업데이트

### 개발 과정

1.  `feature/add-match-method` 브랜치 생성
2.  `QueryBuilder` 클래스에 `match` 메서드 구현
3.  `examples/setup.sql` 파일에 `test_table` 생성 SQL 문 추가
4.  `src/test-table.ts` 파일에 `test_table` 관련 함수 구현
5.  `examples/tests/query-builder.test.ts` 파일에 `match` 메서드 테스트 코드 작성
6.  테스트 실행 및 결과 확인
7.  문서화 및 버전 업데이트
8.  변경 사항 커밋
9.  main 브랜치로 병합

### 테스트 결과

테스트 결과는 다음과 같습니다:

```
Result 1: [
  {
    id: 1
    name: "test1"
    value: 10
  }
]
Result 2: [
  {
    id: 2
    name: "test2"
    value: 20
  }
]
Result 3: [
  {
    id: 1
    name: "test1"
    value: 10
  }
]
Result 4: null
```

Result1, 2, 3은 예상대로 출력되었고, Result 4는 존재하지 않는 데이터에 대한 결과로 null을 반환했습니다.

### 결론

이번 작업을 통해 `QueryBuilder` 클래스에 `match` 메서드를 추가하여, 사용자가 객체 리터럴을 사용하여 간편하게 쿼리 조건을 추가할 수 있게 되었습니다. 또한, 테스트 코드를 통해 `match` 메서드의 동작을 검증했습니다.

---

# 변경 작업 보고서

## [2025-03-01] corepack을 통한 다중 패키지 관리자 지원 추가

### 작업 내용

... (생략) ...
