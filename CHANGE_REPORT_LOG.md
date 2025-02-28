# 변경 작업 보고서

## [2025-03-01] corepack을 통한 다중 패키지 관리자 지원 추가

### 작업 내용

1. **corepack 설정 추가**:
   - package.json에 packageManager 필드를 추가하여 기본 패키지 관리자와 버전을 지정했습니다.
   - engines 필드를 추가하여 지원하는 Node.js 버전을 명시했습니다.
   - corepack enable 명령어를 실행하여 corepack을 활성화했습니다.

2. **패키지 관리자 중립적인 스크립트 설정**:
   - prepare, prepublishOnly 등의 스크립트에서 npm 명령어를 $npm_execpath로 대체하여 패키지 관리자에 중립적인 방식으로 변경했습니다.
   - 이를 통해 어떤 패키지 관리자를 사용하더라도 동일한 스크립트가 작동하도록 했습니다.

3. **각 패키지 관리자의 lock 파일 생성**:
   - npm: package-lock.json (기존 파일 유지)
   - yarn: yarn.lock 생성
   - pnpm: pnpm-lock.yaml 생성
   - bun: bun.lock 생성
   - 각 패키지 관리자로 설치 및 빌드 테스트를 수행하여 정상 작동을 확인했습니다.

4. **npm 배포 패키지 최적화**:
   - .npmignore 파일을 추가하여 lock 파일들이 npm 배포 패키지에 포함되지 않도록 설정했습니다.
   - 이를 통해 패키지 사용자가 자신의 프로젝트에 맞는 의존성 버전을 결정할 수 있도록 했습니다.
   - 소스 파일, 테스트 파일 등 불필요한 파일도 npm 배포 패키지에서 제외하여 패키지 크기를 최적화했습니다.

5. **문서화**:
   - CHANGELOG.md 파일을 업데이트하여 corepack 지원 추가 내용을 문서화했습니다.
   - 버전을 0.1.6으로 업데이트했습니다.

### 변경된 파일

1. `package.json`: packageManager 필드 추가, engines 필드 추가, 스크립트 수정, 버전 업데이트
2. `yarn.lock`: yarn 패키지 관리자 설정 파일 생성
3. `pnpm-lock.yaml`: pnpm 패키지 관리자 설정 파일 생성
4. `bun.lock`: bun 패키지 관리자 설정 파일 생성
5. `.npmignore`: npm 배포 패키지에서 제외할 파일 목록 설정
6. `CHANGELOG.md`: 변경 사항 문서화 및 버전 업데이트
7. `CHANGE_REPORT_LOG.md`: 변경 작업 보고서 추가

### 개발 과정

1. feature/corepack-support 브랜치 생성
2. package.json 파일에 packageManager 및 engines 필드 추가
3. 스크립트를 패키지 관리자에 중립적인 방식으로 수정
4. corepack 활성화
5. 각 패키지 관리자로 설치 및 빌드 테스트
6. 문서화 및 버전 업데이트
7. 변경 사항 커밋
8. main 브랜치로 병합

### 테스트 결과

각 패키지 관리자로 설치 및 빌드 테스트를 수행했습니다:

1. npm:
   - `npm install` 실행
   - `npm run build` 실행
   - 모든 기능이 정상 작동함을 확인

2. yarn:
   - `yarn` 실행
   - `yarn build` 실행
   - 모든 기능이 정상 작동함을 확인

3. pnpm:
   - `pnpm install` 실행
   - `pnpm build` 실행
   - 모든 기능이 정상 작동함을 확인

4. bun:
   - `bun install` 실행
   - `bun run build` 실행
   - 모든 기능이 정상 작동함을 확인

모든 테스트가 성공적으로 완료되었습니다.

### 결론

이번 작업을 통해 Supalite 라이브러리가 corepack을 통해 npm, yarn, pnpm, bun 패키지 관리자를 모두 지원할 수 있게 되었습니다. 사용자는 자신이 선호하는 패키지 관리자를 사용하여 라이브러리를 설치하고 사용할 수 있으며, 프로젝트 내에서는 package.json의 packageManager 필드에 지정된 패키지 관리자가 자동으로 사용됩니다.

## [2025-02-28] 예제 코드에서 민감한 정보 제거 및 Git 히스토리 정리

### 작업 내용

1. **문제 분석**:
   - 예제 코드(examples/tests/connection-string.ts)에 실제 Supabase 연결 문자열이 포함되어 있어 보안 위험이 있었습니다.
   - Git 히스토리에도 이 민감한 정보가 남아 있어 완전히 제거할 필요가 있었습니다.

2. **해결 방법**:
   - 예제 코드에서 실제 Supabase 연결 문자열을 테스트용 더미 문자열로 대체했습니다.
   - Git filter-branch를 사용하여 Git 히스토리에서 해당 파일의 이전 버전을 모두 제거했습니다.
   - 현재 버전의 파일을 다시 추가하여 민감한 정보 없이 예제 코드를 유지했습니다.

3. **보안 강화**:
   - 향후 민감한 정보가 코드에 포함되지 않도록 개발 가이드라인을 강화했습니다.
   - 환경 변수나 별도의 구성 파일을 사용하여 민감한 정보를 관리하도록 권장합니다.

4. **문서화**:
   - CHANGELOG.md 파일을 업데이트하여 보안 관련 수정 사항을 문서화했습니다.
   - 버전을 0.1.5로 업데이트했습니다.

### 변경된 파일

1. `examples/tests/connection-string.ts`: 민감한 연결 문자열 제거
2. `CHANGELOG.md`: 보안 관련 수정 사항 문서화 및 버전 업데이트
3. `CHANGE_REPORT_LOG.md`: 변경 작업 보고서 추가
4. `package.json`: 버전 업데이트

### 개발 과정

1. fix/remove-sensitive-info 브랜치 생성
2. 민감한 정보가 제거된 파일 커밋
3. git filter-branch를 사용하여 Git 히스토리에서 민감한 정보 제거
4. 문서화 및 버전 업데이트
5. 변경 사항 커밋
6. main 브랜치로 병합

### 보안 영향 평가

이번 작업을 통해 다음과 같은 보안 개선이 이루어졌습니다:

1. 민감한 연결 정보가 공개 저장소에 노출되는 위험 제거
2. Git 히스토리에서도 민감한 정보가 완전히 제거되어 과거 커밋을 통한 정보 유출 방지
3. 예제 코드는 테스트용 더미 데이터를 사용하여 기능 테스트는 여전히 가능

### 결론

이번 작업을 통해 코드베이스에서 민감한 정보를 제거하고 보안을 강화했습니다. 향후에는 민감한 정보를 코드에 직접 포함시키지 않도록 개발 프로세스를 개선할 예정입니다.

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
