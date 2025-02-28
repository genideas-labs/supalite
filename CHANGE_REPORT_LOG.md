# 변경 작업 보고서

## [2025-02-28] GitHub 저장소에서 직접 설치 시 빌드된 파일 포함 문제 해결

### 작업 내용

1. **문제 분석**:
   - GitHub 저장소에서 직접 패키지를 설치할 때(`git+ssh://git@github.com:genideas-labs/supalite.git`) 빌드된 파일이 포함되지 않는 문제를 발견했습니다.
   - 이로 인해 외부 프로젝트에서 0.1.3 버전을 설치했을 때 connectionString, testConnection 등의 기능이 보이지 않는 문제가 발생했습니다.
   - 원인은 `.gitignore` 파일에 `dist` 디렉토리가 포함되어 있어 빌드된 파일들이 GitHub 저장소에 포함되지 않기 때문이었습니다.

2. **해결 방법**:
   - `.gitignore` 파일에서 `dist` 디렉토리를 제외하여 빌드된 파일들이 GitHub 저장소에 포함되도록 수정했습니다.
   - 이를 통해 GitHub에서 직접 패키지를 설치할 때도 빌드된 파일들이 포함되도록 했습니다.

3. **문서화**:
   - CHANGELOG.md 파일을 업데이트하여 변경 사항을 문서화했습니다.
   - 버전을 0.1.4로 업데이트했습니다.

### 변경된 파일

1. `.gitignore`: `dist` 디렉토리를 제외하도록 수정
2. `CHANGELOG.md`: 변경 사항 문서화 및 버전 업데이트
3. `CHANGE_REPORT_LOG.md`: 변경 작업 보고서 추가
4. `package.json`: 버전 업데이트

### 개발 과정

1. fix/include-dist-in-git 브랜치 생성
2. `.gitignore` 파일에서 `dist` 디렉토리를 제외하도록 수정
3. 문서화 및 버전 업데이트
4. 변경 사항 커밋
5. main 브랜치로 병합

### 테스트 결과

GitHub 저장소에서 직접 패키지를 설치하는 테스트를 수행했습니다:

1. 외부 프로젝트에서 `package.json`에 `"supalite": "git+ssh://git@github.com:genideas-labs/supalite.git"`를 추가하고 `npm install`을 실행했습니다.
2. 설치된 패키지에 빌드된 파일들이 포함되어 있는지 확인했습니다.
3. connectionString, testConnection 등의 기능이 정상적으로 사용 가능한지 확인했습니다.

모든 테스트가 성공적으로 완료되었습니다.

### 결론

이번 작업을 통해 GitHub 저장소에서 직접 패키지를 설치할 때 빌드된 파일이 포함되지 않는 문제를 해결했습니다. 이제 외부 프로젝트에서 GitHub 저장소를 통해 패키지를 설치해도 모든 기능을 정상적으로 사용할 수 있습니다.

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
