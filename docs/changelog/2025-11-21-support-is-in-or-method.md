# 변경 보고서: `or` 메소드 내 `is` 연산자 지원

**날짜:** 2025년 11월 21일

## 변경 유형

- [x] 기능 추가
- [ ] 버그 수정
- [ ] 성능 개선
- [ ] 문서 업데이트
- [ ] 기타

## 변경 내용

### `QueryBuilder`

- **`or` 메소드 개선**: `or` 메소드 내부에서 `is` 연산자를 사용할 수 있도록 지원을 추가했습니다. 이제 `valid_until.is.null`과 같은 표현을 통해 `IS NULL` 조건을 `OR` 절 안에서 사용할 수 있습니다.

  **사용 예시:**

  ```typescript
  const { data } = await client
    .from('credits')
    .select('*')
    .or('valid_until.is.null,valid_until.gt.now()');
  ```

  위 코드는 `SELECT * FROM "public"."credits" WHERE ("valid_until" IS NULL OR "valid_until" > 'now()')` SQL 쿼리를 생성합니다.

## 관련 파일

- `src/query-builder.ts`
- `README.md`
