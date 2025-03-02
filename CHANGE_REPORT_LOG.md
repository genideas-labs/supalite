# 변경 사항 상세 보고서

## 날짜: 2025-03-02
## 버전: 0.1.12
## 기능: Views 테이블 조회 기능 추가

### 개요
이번 업데이트에서는 Supabase 데이터베이스 타입 정의에서 Views 테이블도 조회할 수 있도록 기능을 추가했습니다. 이를 통해 사용자는 일반 테이블뿐만 아니라 데이터베이스 뷰도 동일한 방식으로 조회할 수 있게 되었습니다.

### 변경 사항 상세 내용

#### 1. 타입 정의 수정 (`src/types.ts`)
- `ViewName` 타입 추가: 스키마 내의 Views 이름을 참조하는 타입
- `TableOrViewName` 타입 추가: Tables와 Views를 모두 포함하는 통합 타입
- `Row`, `InsertRow`, `UpdateRow` 타입 수정: Views도 처리할 수 있도록 조건부 타입 적용
  - Views는 읽기 전용이므로 `InsertRow`와 `UpdateRow`는 Views에 대해 `never` 타입 반환

```typescript
export type ViewName<
  T extends DatabaseSchema,
  S extends SchemaName<T> = SchemaName<T>
> = keyof NonNullable<T[S]['Views']>;

export type TableOrViewName<
  T extends DatabaseSchema,
  S extends SchemaName<T> = SchemaName<T>
> = TableName<T, S> | ViewName<T, S>;

export type Row<
  T extends DatabaseSchema,
  S extends SchemaName<T>,
  K extends TableOrViewName<T, S>
> = K extends TableName<T, S> 
  ? T[S]['Tables'][K]['Row'] 
  : K extends ViewName<T, S> 
    ? NonNullable<T[S]['Views']>[K]['Row'] 
    : never;
```

#### 2. 쿼리 빌더 수정 (`src/query-builder.ts`)
- `QueryBuilder` 클래스의 제네릭 타입 매개변수를 `TableOrViewName`으로 변경하여 Views도 처리할 수 있도록 수정

```typescript
export class QueryBuilder<
  T extends DatabaseSchema,
  S extends SchemaName<T> = 'public',
  K extends TableOrViewName<T, S> = TableOrViewName<T, S>
> implements Promise<QueryResult<Row<T, S, K>> | SingleQueryResult<Row<T, S, K>>> {
  // ...
}
```

#### 3. PostgreSQL 클라이언트 수정 (`src/postgres-client.ts`)
- `SchemaWithTables` 타입 수정: Views 타입 정의 추가
- `from` 메서드 시그니처 수정: `TableOrViewName` 타입을 사용하도록 변경

```typescript
type SchemaWithTables = {
  Tables: {
    [key: string]: {
      Row: any;
      Insert: any;
      Update: any;
      Relationships: unknown[];
    };
  };
  Views?: {
    [key: string]: {
      Row: any;
    };
  };
  // ...
};

from<K extends TableOrViewName<T, 'public'>>(
  table: K
): QueryBuilder<T, 'public', K> & Promise<QueryResult<Row<T, 'public', K>>> & { single(): Promise<SingleQueryResult<Row<T, 'public', K>>> };
```

#### 4. 예제 데이터베이스 타입 정의 수정 (`examples/types/database.ts`)
- 예제 데이터베이스 타입 정의에 Views 추가
- `user_posts_view`와 `active_users_view` 뷰 정의 추가

```typescript
Views: {
  user_posts_view: {
    Row: {
      user_id: number;
      user_name: string;
      post_id: number;
      post_title: string;
      post_content: string | null;
      post_created_at: string;
    };
  };
  active_users_view: {
    Row: {
      id: number;
      name: string;
      email: string;
      last_login: string | null;
      post_count: number;
    };
  };
}
```

#### 5. 테스트 및 예제 코드 추가
- View 테이블 조회 예제 코드 작성 (`examples/tests/view-table.ts`)
- 테스트용 SQL 스크립트 작성 (`examples/setup-views.sql`)
  - 테이블 생성 및 샘플 데이터 삽입
  - View 생성 (user_posts_view, active_users_view)

### 테스트 결과
- View 테이블 조회 기능이 정상적으로 작동함을 확인
- 일반 테이블과 동일한 방식으로 View 테이블을 조회할 수 있음
- 타입 안전성이 유지됨
- 기존 코드와의 호환성이 유지됨

### 결론
이번 업데이트를 통해 Supalite 라이브러리는 Supabase 데이터베이스의 Views 테이블도 조회할 수 있게 되었습니다. 이로써 사용자는 더 다양한 데이터베이스 객체에 접근할 수 있게 되었으며, Supabase와의 호환성이 더욱 향상되었습니다.
