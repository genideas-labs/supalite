# Postmortem: 001-db-pull — `supalite db pull`

**Date**: 2026-07-12 | **Branch**: `001-db-pull` | **Issue**: [#4](https://github.com/genideas-labs/supalite/issues/4) | **Tracking**: [#5](https://github.com/genideas-labs/supalite/issues/5) (closed, sign-off)

## 산출물

| 산출물 | 내용 |
|--------|------|
| `src/db-pull.ts` (신규, ~1,500줄) | `generateBaselineSql` — 17단계 의존성 순서 baseline 생성기. 서버 deparse 위임, REPEATABLE READ READ ONLY + 빈 search_path 세션, 함수 3단계 스테이징(+인자 기본값 상속), 통합 타입 topo, 추이적 exclusion/diversion 폐쇄, content-safe dollar 태그, 완전 멱등 가드 |
| `src/cli.ts` (수정) | `gen types` \| `db pull` 디스패치, opt-out 기본값 플래그, UTC 기본 경로, stdout 모드, diff 예약 에러 |
| `src/index.ts` (수정) | 패키지 루트 export (`generateBaselineSql`, `DbPullOptions`) |
| `src/__tests__/db-pull.test.ts` (24 tests) | 구조·라운드트립·멱등성·plain 모드·빈 선택·확장 필터 |
| `src/__tests__/db-pull-cli.test.ts` (9 tests) | 자동화 CLI 매트릭스 (help/fallback/stdout/경로/에러/스키마 누적) |
| `scripts/seed-db-pull.sql` (~40 객체) | 전 지원 객체 + 적대적 식별자 + 제외/전환 경로 픽스처 |
| 문서 | README(en/ko) 사용법 섹션, CHANGELOG, spec 아티팩트 8종 |

## 테스트 결과

- 전체 스위트 **184 passed / 28 suites** 반복 그린 (flake 1건 발견 후 격리 수정, 4회 연속 검증)
- **라운드트립** (SC-001): 생성 → DROP SCHEMA → 재적용 → 재생성 → 주석 제외 byte-equal
- **멱등성** (SC-002): 구축된 스키마에 psql 재적용 2회 exit 0 (제약·제약 트리거 포함)
- lint 0 errors (신규 파일 0 warnings), tsc 클린, PG 14.23 라이브 검증

## Auto-Review 결과 (STRICT)

| 단계 | 라운드 | Findings | 처리 |
|------|--------|----------|------|
| 사전(스펙) | 4 (Codex 3 + Claude 1) | **40** | 전부 수정 — CRITICAL 1(함수 의존 표현식 순서) 포함 |
| 사후(구현) | 9 (Codex 8 + Claude 1) | **34** | 33 수정 + 1 유예(공유 테스트 DB — 리포 관례). 수렴: 13→6→4→3→1→1→2→2→1 |

특기: Codex 행 2회 → Claude 단독 fallback으로 라운드 완결. Codex의 footer 순서 지적을 2회 오판 기각 후 r3에서 정정·수용(교훈: 기각 전 코드 라인 직접 확인).

## 핵심 설계 결정

1. **DDL 렌더링은 서버 deparse에 위임** (`pg_get_*`) — 직접 조립은 TABLE/TYPE/SEQUENCE만 (R1)
2. **함수 3단계 스테이징**: 시그니처 타입 의존으로 types→tables→views 사이 배치; `check_function_bodies=off`로 본문 유예; 인자 기본값 의존은 스테이지 상속 + 단계 내 topo (R9, impl r7)
3. **완전 멱등이 기본값** (opt-out): 제약도 `DO $supalite$` pg_constraint/contypid 가드 — "prod 재적용 무해"를 예외 없이 보장 (요청자 확정)
4. **실패할 DDL은 방출하지 않는다**: 제외 객체(파티션/aggregate/확장 소속)의 추이적 폐쇄 — 릴레이션·타입·함수 전환이 라이브 집합 + 지연 술어로 전 렌더러에 전파; footer에 전량 공시 (FR-016)
5. **도메인 v1 지원 승격** — 의존물 실패 클래스 제거가 폐쇄 분석보다 저렴 (리뷰 r2)
6. **세션 고정**: REPEATABLE READ READ ONLY + 빈 search_path → 스냅샷 일관성 + 완전 한정(qualified) 출력 (impl r1)

## 후속 작업

- `--mode diff` (이슈 #4 명시 후속)
- grants/RLS 옵션 (`--include-grants` / `--include-policies`) — 이슈 #4 코멘트로 확정
- 테스트 DB 격리 (병렬 CI용 per-run 스키마/advisory lock) — 유예 항목
- 확장 버전 고정 옵션 검토
- 릴리스: vX.Y.Z annotated tag 관례 (버전 범프는 릴리스 시점)
