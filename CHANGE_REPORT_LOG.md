# 변경 작업 보고서

## [2025-02-27] PostgreSQL bigint 타입 지원 추가

### 작업 내용

1. **bigint 타입 지원 추가**:
   - pg 타입 파서를 등록하여 PostgreSQL의 bigint 타입을 JavaScript의 BigInt로 변환하도록 구현했습니다.
   - Json 타입 정의에 bigint 타입을 추가하여 타입 안전성을 개선했습니다.

2. **자동 변환 지원 확인**:
   - 테스트 결과, 현재 구현에서도 Number와 string 타입의 값을 bigint 컬럼에 전달할 때 자동으로 변환이 이루어지고 있음을 확인했습니다.
   - PostgreSQL 드라이버(pg)는 JavaScript의 Number나 string 값을 PostgreSQL의 bigint 타입으로 자동 변환합니다.

3. **타입 정의 개선**:
   - bigint 컬럼에 대한 타입 정의를 `bigint | number | string`으로 업데이트하여 타입 캐스팅 없이도 Number와 string 값을 전달할 수 있도록 개선했습니다.
   - 이를 통해 타입 안전성을 유지하면서도 사용자 편의성을 높였습니다.

4. **테스트 코드 작성**:
   - BigInt, Number, string 타입의 값을 사용하여 bigint 컬럼에 데이터를 삽입하고 업데이트하는 테스트 코드를 작성했습니다.
   - 모든 테스트가 성공적으로 완료되었습니다.

5. **문서화**:
   - CHANGELOG.md 파일을 업데이트하여 bigint 지원 기능을 문서화했습니다.
   - 버전을 0.1.3으로 업데이트했습니다.

### 변경된 파일

1. `src/postgres-client.ts`: bigint 타입 파서 등록 코드 추가
2. `src/types.ts`: Json 타입 정의에 bigint 타입 추가
3. `examples/types/database.ts`: bigint 컬럼 타입 정의 개선
4. `examples/tests/bigint.ts`: bigint 타입 테스트 코드 작성
5. `CHANGELOG.md`: 변경 사항 문서화
6. `package.json`: 버전 업데이트

### 개발 과정

1. feature/support-bigint 브랜치 생성
2. bigint 타입 파서 등록 및 타입 정의 수정
3. 테스트 코드 작성 및 실행
4. 테스트 결과 분석 및 타입 정의 개선
5. 문서화 및 버전 업데이트
6. main 브랜치로 병합

### 테스트 결과

모든 테스트가 성공적으로 완료되었습니다. 특히 다음 사항을 확인했습니다:

1. PostgreSQL의 bigint 값이 JavaScript의 BigInt로 정확히 변환됩니다.
2. JavaScript의 BigInt 값이 PostgreSQL의 bigint로 정확히 저장됩니다.
3. JavaScript의 Number 값이 PostgreSQL의 bigint로 자동 변환됩니다.
4. JavaScript의 string 값이 PostgreSQL의 bigint로 자동 변환됩니다.
5. 큰 정수 값(Number.MAX_SAFE_INTEGER 초과)도 정확히 처리됩니다.

### 결론

이번 작업을 통해 Supalite 라이브러리에서 PostgreSQL의 bigint 타입을 완벽하게 지원할 수 있게 되었습니다. 사용자는 BigInt, Number, string 타입의 값을 자유롭게 사용할 수 있으며, 타입 안전성도 유지됩니다.
