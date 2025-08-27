# 변경 보고서: `not` 메소드 추가

**날짜:** 2025년 8월 28일

## 변경 유형

- [x] 기능 추가
- [ ] 버그 수정
- [ ] 성능 개선
- [ ] 문서 업데이트
- [ ] 기타

## 변경 내용

### `QueryBuilder`

- **`not` 메소드 추가**: `is` 연산자와 함께 사용하여 `IS NOT NULL` 조건을 생성할 수 있는 `not` 메소드를 추가했습니다.

  **사용 예시:**

  ```typescript
  const { data } = await client
    .from('users')
    .select('id, name')
    .not('email', 'is', null);
  ```

  위 코드는 `SELECT "id", "name" FROM "public"."users" WHERE "email" IS NOT NULL` SQL 쿼리를 생성합니다.

## 관련 파일

- `src/query-builder.ts`
- `README.md`
