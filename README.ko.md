# SupaLite

[![npm version](https://img.shields.io/npm/v/supalite.svg)](https://www.npmjs.com/package/supalite)
[![npm downloads](https://img.shields.io/npm/dm/supalite.svg)](https://www.npmjs.com/package/supalite)
[![license](https://img.shields.io/npm/l/supalite.svg)](LICENSE)
[![types](https://img.shields.io/npm/types/supalite.svg)](https://www.npmjs.com/package/supalite)
[![node](https://img.shields.io/node/v/supalite.svg)](https://www.npmjs.com/package/supalite)
[![ci](https://github.com/genideas-labs/supalite/actions/workflows/ci.yml/badge.svg)](https://github.com/genideas-labs/supalite/actions/workflows/ci.yml)

Supabase 쿼리 빌더에 집중한 가벼운 PostgreSQL 클라이언트입니다. 익숙한 API를 유지하면서도 표면적을 줄여 더 작은 풋프린트와 낮은 오버헤드를 목표로 합니다.

한 줄 요약: **SupaLite는 쿼리 빌더 + RPC + 트랜잭션에 집중한 슬림 Supabase 클라이언트입니다.** Auth/Storage/Realtime까지 필요하면 `supabase-js`를 사용하세요.

실서비스 사용: [oqoq.ai](https://oqoq.ai)

호환 범위 요약:
- ✅ 조회/필터/정렬/페이지네이션
- ✅ PostgREST 임베드 (`related_table(*)`, `!inner`)
- ✅ Insert/Update/Delete/Upsert (`ignoreDuplicates` 포함)
- ✅ RPC (`single`/`maybeSingle` 포함)
- ❌ Auth/Storage/Realtime

클라우드 마이그레이션 안내 (GCP/AWS):
Supabase에서 완전히 분리하려면 SupaLite는 **DB 쿼리 계층만** 대체합니다. Auth/Storage/Realtime은 별도 대안이 필요합니다.
- Auth: 관리형 인증(AWS Cognito / Google Identity Platform) 또는 자체 호스팅(GoTrue/Keycloak)
- Storage: 오브젝트 스토리지(S3 / GCS)
- Realtime: 관리형 pub/sub, WebSocket 서비스, 또는 PostgreSQL LISTEN/NOTIFY + 자체 게이트웨이

## 주요 기능

- 🔒 타입 안전성: TypeScript로 작성되어 완벽한 타입 지원
- 🚀 강력한 쿼리 빌더: Supabase 스타일의 직관적이고 체이닝 가능한 API
- 🌍 멀티 스키마: 여러 데이터베이스 스키마 지원
- 🛠 CRUD 작업: 간단하고 명확한 데이터베이스 작업
- 📦 RPC 지원: 저장 프로시저 호출 기능
- ⚡ 성능 최적화: 커넥션 풀링 및 효율적인 쿼리 실행
- 💪 트랜잭션 지원: Supabase에서 지원하지 않는 안전한 데이터베이스 트랜잭션 처리
- 🎯 UPSERT 지원: 삽입/업데이트 동작 제어
- 🔍 고급 필터링: OR 조건, ILIKE 검색 등 지원
- 📚 배열 작업: 다중 레코드 삽입 및 배열 데이터 처리 (JSON/JSONB 필드 포함)
- 🔄 Views, Functions, Enums 지원: Supabase 스타일의 완벽한 타입 지원

## 프로젝트 범위

SupaLite는 Supabase 클라이언트의 **일부 기능(쿼리 빌더, RPC, 트랜잭션)**에 집중합니다. Auth/Storage/Realtime 같은 기능까지 포함하는 전체 호환을 목표로 하지는 않습니다. 지원되는 쿼리 패턴은 아래에 정리되어 있으며, 빠진 패턴이 있으면 이슈로 알려주세요.

## 로드맵 (단기)

- Node/pg 버전별 CI 매트릭스와 통합 테스트
- 벤치마크 및 성능 가이드
- Auth/Storage/Realtime 마이그레이션 가이드 (Cognito/GIP, S3/GCS, Realtime 대안)
- 기여 가이드/이슈 템플릿

## 성능 노트 (서버리스 Supabase vs 클라우드 Postgres)

서버리스 Supabase에서 GCP/AWS의 관리형 Postgres로 이동할 때 일반적으로 기대할 수 있는 차이:
- 네트워크 hop: Supabase는 edge/API/REST 계층이 추가될 수 있고, 동일 VPC 내 직접 접속은 hop이 줄어듭니다.
- 콜드스타트/풀링: 서버리스는 cold start나 aggressive pooling이 있을 수 있어, 전용 풀러(pgBouncer/RDS Proxy)가 tail latency를 낮춥니다.
- 네트워크 경로: 공용망 vs VPC/피어링에 따라 jitter와 p95/p99가 달라집니다.
- 오버헤드: HTTP/PostgREST 계층 직렬화 비용이 추가되며, 직접 SQL 클라이언트는 이를 줄입니다.

벤치마크 수치: **TBD (출처 필요)**. 공개된 벤치마크 링크가 있으면 PR로 공유해 주세요.
필요한 출처:
- 서버리스 Postgres vs 관리형 Postgres 지연/풀링 비교에 대한 공개 자료 링크

## 벤치마크 방법론 (초안)

- 워크로드: 단순 `select`, 필터+정렬 `select`, `insert`, `rpc`
- warm/cold 구분, p50/p95/p99 측정
- 동일 리전/인스턴스 크기, DB 버전/풀 설정 기록
- 가능하면 네트워크/쿼리 시간 분리 측정
- 스크립트/원본 결과 공개

## 설치 방법

```bash
npm install supalite
```

## 타입 시스템

### 데이터베이스 스키마 정의

```typescript
// Supabase CLI의 타입 생성기로 생성된 데이터베이스 타입 정의
// 예: supabase gen types typescript --local > database.types.ts
import { Database } from './types/database';

// 타입이 적용된 클라이언트 생성
const client = new SupaLitePG<Database>({
  user: 'testuser',
  password: 'testpassword',
  host: 'localhost',
  database: 'testdb',
  port: 5432,
  ssl: false,
  // bigintTransform: 'string', // BIGINT 타입을 문자열로 받기 (기본값: 'bigint')
  // verbose: true // 상세 로그 출력
});

// 또는 환경 변수 사용
const client = new SupaLitePG<Database>();

// Database 인터페이스 예시 (Supabase CLI로 생성된 타입과 동일한 구조)
interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: number;
          name: string;
          email: string;
          status: string;
          last_login: string | null;
          created_at: string;
        };
        Insert: {
          name: string;
          email: string;
          status?: string;
          last_login?: string | null;
        };
        Update: {
          name?: string;
          email?: string;
          status?: string;
          last_login?: string | null;
        };
        Relationships: unknown[];
      };
      // 다른 테이블들...
    };
    Views: {
      // 뷰 정의...
    };
    Functions: {
      // 함수 정의...
    };
    Enums: {
      // 열거형 정의...
    };
  };
  // 다른 스키마들...
}
```

## 사용 예시

### 데이터베이스 연결

```typescript
import { SupaLitePG } from 'supalite';
import { Database } from './types/database';

// 타입이 적용된 클라이언트 생성
const client = new SupaLitePG<Database>({
  user: 'testuser',
  password: 'testpassword',
  host: 'localhost',
  database: 'testdb',
  port: 5432,
  ssl: false,
  // bigintTransform: 'string', // BIGINT 타입을 문자열로 받기 (기본값: 'bigint')
  // verbose: true // 상세 로그 출력
});
```

```typescript
import { SupaliteClient } from 'supalite';
import { Database } from './types/database';

// SupaliteClient는 SupaLitePG의 얇은 래퍼입니다.
const client = new SupaliteClient<Database>({
  connectionString: process.env.DB_CONNECTION || 'postgresql://user:pass@localhost:5432/db',
});
```

### 기본 CRUD 작업

```typescript
// 데이터 조회
const { data, error } = await client
  .from('users')
  .select('*')
  .eq('id', 1)
  .single();

// 단일 레코드 삽입
const { data, error } = await client
  .from('users')
  .insert({ 
    name: '홍길동', 
    email: 'hong@example.com' 
  });

// 다중 레코드 삽입
const { data, error } = await client
  .from('users')
  .insert([
    { name: '홍길동', email: 'hong@example.com' },
    { name: '김철수', email: 'kim@example.com' }
  ]);

// 특정 컬럼 선택
const { data } = await client
  .from('profiles')
  .select('user_id, bio, interests')
  .limit(2);

// 다중 정렬
const { data } = await client
  .from('users')
  .select('name, status, last_login')
  .order('status', { ascending: true })
  .order('last_login', { ascending: false });

// 페이지네이션
const page1 = await client
  .from('posts')
  .select('*')
  .limit(2)
  .offset(0);

// Range 쿼리
const { data } = await client
  .from('comments')
  .select('*')
  .range(1, 3);

// 조건부 UPDATE
const { data } = await client
  .from('posts')
  .update({
    views: 10,
    updated_at: new Date().toISOString()
  })
  .eq('user_id', userId)
  .select();

// UPSERT
const { data } = await client
  .from('profiles')
  .upsert({
    user_id: userId,
    bio: '새로운 프로필입니다.',
    interests: ['코딩', '음악'],
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' })
  .select()
  .single();
```

### 고급 기능 사용 예시

```typescript
// 트랜잭션 사용 (Supabase에서 지원하지 않는 기능)
await client.transaction(async (tx) => {
  const { data: user } = await tx
    .from('users')
    .insert({ name: '홍길동' })
    .select()
    .single();

  await tx
    .from('profiles')
    .insert({ user_id: user.id });
});

// OR 조건 필터링
const { data, error } = await client
  .from('users')
  .or('status.eq.active,role.eq.admin');

// 대소문자 구분 없는 검색
const { data, error } = await client
  .from('users')
  .ilike('email', '%@example.com');

// 관계 테이블 조회 (PostgREST-style embed)
// 1:N 관계는 배열로 반환됩니다 (기본값: [])
const { data: authors } = await client
  .from('authors')
  .select('*, books(*)');

// N:1 관계는 객체로 반환됩니다 (또는 null)
const { data: books } = await client
  .from('books')
  .select('*, authors(*)');

// 정확한 카운트와 함께 조회
const { data, count, error } = await client
  .from('users')
  .select('*', { count: 'exact' });

// 배열 데이터 처리
const { data, error } = await client
  .from('posts')
  .insert([
    {
      title: '첫 번째 글',
      tags: ['프로그래밍', '팁'],
      content: '내용...'
    },
    {
      title: '두 번째 글',
      tags: ['여행'],
      content: '내용...'
    }
  ]);

// JSONB 배열/객체 데이터 처리
// JSON/JSONB 컬럼은 배열/객체를 자동 stringify 합니다 (스키마 기반)
const myJsonArray = ['tag1', 2025, { active: true }];
const myJsonObject = { active: true, score: 10 };
const { data: jsonData, error: jsonError } = await client
  .from('your_jsonb_table') // 'your_jsonb_table'을 실제 테이블명으로 변경
  .insert({ 
    metadata_array: myJsonArray,
    metadata_obj: myJsonObject
  })
  .select('metadata_array, metadata_obj')
  .single();

// 네이티브 배열(TEXT[], INTEGER[] 등) 데이터 처리
// 이 경우, JavaScript 배열을 직접 전달하면 pg 드라이버가 올바르게 처리합니다.
const { data: nativeArrayData, error: nativeArrayError } = await client
  .from('your_native_array_table') // 실제 테이블명으로 변경
  .insert({
    tags_column: ['tech', 'event'], // TEXT[] 컬럼 예시
    scores_column: [100, 95, 88]    // INTEGER[] 컬럼 예시
  })
  .select('tags_column, scores_column')
  .single();

// 다른 스키마 사용
const { data, error } = await client
  .from('users', 'other_schema')
  .select('*');
```

## 지원 쿼리 패턴 (테스트 기반 예시)

아래 예시는 `src/__tests__`/`examples/tests`와 실제 구현을 기준으로, 현재 지원되는 쿼리 패턴을 모아둔 것입니다.

### 필터

```typescript
// match: 여러 컬럼 동시 필터
const { data: matched } = await client
  .from('test_table')
  .select('*')
  .match({ name: 'test1', value: 10 });

// 비교/패턴/배열/NULL 필터
await client.from('users').select('*').eq('id', 1);
await client.from('users').select('*').neq('status', 'inactive');
await client.from('users').select('*').gt('age', 18);
await client.from('users').select('*').gte('score', 80);
await client.from('users').select('*').lt('rank', 100);
await client.from('users').select('*').lte('rank', 10);
await client.from('users').select('*').like('email', '%@example.com');
await client.from('users').select('*').ilike('email', '%@example.com');
await client.from('users').select('*').in('id', [1, 2, 3]);
await client.from('users').select('*').in('id', []); // 결과 없음 (WHERE FALSE)
await client.from('posts').select('*').in('user_id', [1, null, 3]); // NULL은 OR IS NULL로 매칭됩니다
await client.from('posts').select('*').in('user_id', [1, 2]).in('views', [50, 100, 150]);
await client.from('posts').select('*').contains('tags', ['travel']);
await client.from('profiles').select('*').is('avatar_url', null);

// NOT (현재는 is null만 지원)
await client.from('users').select('*').not('email', 'is', null);

// OR 조건: '컬럼.연산자.값' 문자열 (지원 연산자: eq/neq/like/ilike/gt/gte/lt/lte/is)
// now()는 WHERE 절에 NOW()로 인라인됩니다.
// 값에 점/쉼표가 포함되면 따옴표로 감싸주세요: name.eq."last, first"
const { data: credits } = await client
  .from('credits')
  .select('*')
  .eq('wallet_id', 123)
  .gt('amount', 0)
  .or('valid_until.is.null,valid_until.gt.now()');
```

### 정렬/페이지네이션

```typescript
await client.from('posts').select('*').order('created_at'); // ASC 기본값
await client.from('posts').select('*').order('created_at', { ascending: false });

await client
  .from('shop_gen_images')
  .select('*')
  .order('is_final', { ascending: true })
  .order('pass_no', { ascending: true, nullsFirst: true })
  .order('created_at', { ascending: true });

await client.from('posts').select('*').limit(10).offset(20);
await client.from('comments').select('*').range(1, 3);

const page = 2;
const pageSize = 10;
await client
  .from('posts')
  .select('*')
  .limit(pageSize)
  .offset((page - 1) * pageSize);
```

### 실전 패턴 예시 (프로덕션 코드 기반)

```typescript
// 다중 정렬 + NULLS FIRST
const { data: genImages } = await client
  .from('shop_gen_images')
  .select('*')
  .eq('request_hash', requestHash)
  .order('is_final', { ascending: true })
  .order('pass_no', { ascending: true, nullsFirst: true })
  .order('created_at', { ascending: true });

// INNER 임베드 + 관계 테이블 필터
const { data: orderableItems } = await client
  .from('cur_menu_item')
  .select('id, name, menu_item_id, ext_menu_item!inner(id, deleted_at)')
  .eq('cur_menu_id', Number(cur_menu_id))
  .is('deleted_at', null)
  .is('ext_menu_item.deleted_at', null);

// 중첩 임베드 (옵션 세트)
const { data: optionSets } = await client
  .from('menu_item_opts_set')
  .select(`
    id,
    created_at,
    menu_item_id,
    schema_id,
    menu_item_opts_set_schema!inner (
      id,
      name,
      desc,
      type,
      mandatory,
      multiple_choices,
      max_choice_count,
      min_choice_count,
      name_i18n,
      desc_i18n,
      translated
    ),
    menu_item_opts (
      id,
      created_at,
      menu_item_opts_schema (
        name,
        add_price,
        price,
        order,
        type,
        name_i18n,
        translated
      ),
      soldout,
      hidden,
      modified_at
    )
  `)
  .eq('menu_item_id', Number(menu_item_id));

// 다중 삽입 + 중복 무시 (ON CONFLICT DO NOTHING)
const { data: inserted } = await client
  .from('menu_section_items')
  .insert(deduplicatedRowList, {
    onConflict: ['section_id', 'menu_item_id'],
    ignoreDuplicates: true,
  })
  .select('*');
```

### Count / Head

```typescript
const { data, count } = await client
  .from('count_test_users')
  .select('*', { count: 'exact' });

const { data: headOnly, count: total } = await client
  .from('count_test_users')
  .select('*', { count: 'exact', head: true });

const { data: limited, count: totalLimited } = await client
  .from('count_test_users')
  .select('*', { count: 'exact' })
  .limit(3);

const { data: ranged, count: totalRanged } = await client
  .from('count_test_users')
  .select('*', { count: 'exact' })
  .range(2, 5);
```

`count: 'exact'` 사용 시 결과 행에는 `exact_count` 컬럼이 포함되지 않습니다. `limit`/`range`를 사용해도 `count`는 전체 개수를 반환합니다. `count: 'planned' | 'estimated'`는 `EXPLAIN (FORMAT JSON)` 기반 추정치이며 정확한 값과 다를 수 있습니다. `head: true`는 `data: []`를 반환합니다(추정치 모드에서는 추정치만 반환).

### single / maybeSingle

```typescript
const { data: user } = await client
  .from('users')
  .select('*')
  .eq('id', 1)
  .single();

const { data: maybeUser } = await client
  .from('users')
  .select('*')
  .eq('id', 999)
  .maybeSingle();

const { data: multiRow, error: multiRowError } = await client
  .from('test_table_for_multi_row')
  .select('*')
  .eq('group_key', 'groupA')
  .single();
```

`single()`은 결과가 0개면 에러(PGRST116), 2개 이상이면 에러(PGRST114)입니다. `maybeSingle()`은 0개면 `data: null` + `error: null`을 반환하며, 2개 이상이면 에러(PGRST114)입니다. 내부 PGRST 에러는 `error.code`에 `PGRST116`/`PGRST114`가 설정됩니다.

### 관계 임베드 (PostgREST-style)

```typescript
// 1:N 관계는 배열, N:1 관계는 객체로 반환
const { data: authors } = await client
  .from('authors')
  .select('*, books(*)');

const { data: books } = await client
  .from('books')
  .select('*, authors(*)')
  .order('id');

const { data: authorNames } = await client
  .from('authors')
  .select('name, books(title)');

const { data: bookAuthors } = await client
  .from('books')
  .select('title, authors(name)')
  .order('id');

// INNER JOIN + 관계 테이블 필터 (table.column)
const { data: orderableItems } = await client
  .from('cur_menu_item')
  .select('id, name, menu_item_id, ext_menu_item!inner(id, deleted_at)')
  .eq('cur_menu_id', 10)
  .is('deleted_at', null)
  .is('ext_menu_item.deleted_at', null);

// 중첩 관계 임베드 (nested)
const { data: optionSets } = await client
  .from('menu_item_opts_set')
  .select(`
    id,
    created_at,
    menu_item_id,
    schema_id,
    menu_item_opts_set_schema!inner (
      id,
      name,
      desc,
      type,
      mandatory,
      multiple_choices,
      max_choice_count,
      min_choice_count,
      name_i18n,
      desc_i18n,
      translated
    ),
    menu_item_opts (
      id,
      created_at,
      menu_item_opts_schema (
        name,
        add_price,
        price,
        order,
        type,
        name_i18n,
        translated
      ),
      soldout,
      hidden,
      modified_at
    )
  `)
  .eq('menu_item_id', 10);
```

### 쓰기 (INSERT/UPDATE/DELETE/UPSERT)

```typescript
// INSERT (단일/다중)
await client.from('users').insert({ name: 'User', email: 'user@example.com' });
await client.from('users').insert([
  { name: 'User A', email: 'a@example.com' },
  { name: 'User B', email: 'b@example.com' }
]).select();

// INSERT with ignoreDuplicates (ON CONFLICT DO NOTHING)
await client
  .from('menu_section_items')
  .insert(
    [
      { section_id: 1, menu_item_id: 2 },
      { section_id: 1, menu_item_id: 3 },
    ],
    { onConflict: ['section_id', 'menu_item_id'], ignoreDuplicates: true }
  )
  .select('*');

// UPDATE + IS NULL
await client
  .from('order_menu_items')
  .update({ order_closed_time: new Date().toISOString(), last_act_member_owner_id: 123 })
  .eq('table_name', 'test_table')
  .eq('menu_id', 456)
  .is('order_closed_time', null)
  .select();

// DELETE
await client.from('posts').delete().eq('user_id', 1).select();

// DELETE + IN
await client
  .from('users')
  .delete()
  .in('email', ['a@example.com', 'b@example.com']);

// UPSERT (onConflict: string/array)
await client
  .from('profiles')
  .upsert({ user_id: 1, bio: 'hello' }, { onConflict: 'user_id' })
  .select();

await client
  .from('menu_item_opts_schema')
  .upsert({ set_id: 1, name: 'Soup' }, { onConflict: 'set_id, name' })
  .select();

await client
  .from('ext_menu_item_section_change')
  .upsert({ ext_menu_id: 10, ext_menu_item_id: 20 }, { onConflict: ['ext_menu_id', 'ext_menu_item_id'] });

// UPSERT (ignoreDuplicates: true -> ON CONFLICT DO NOTHING)
await client
  .from('ai_prompt_snapshots')
  .upsert(
    { prompt_hash: 'hash_1', content: 'hello' },
    { onConflict: 'prompt_hash', ignoreDuplicates: true }
  );
```

빈 배열 `insert([])`는 `Empty array provided for insert` 에러가 발생합니다.

### 데이터 타입 (JSONB/배열/BigInt)

```typescript
// JSONB (배열/객체 자동 stringify)
await client
  .from('jsonb_test_table')
  .insert({ jsonb_data: ['string', 123, { nested: true }], another_json_field: { key: 'value' } })
  .select('jsonb_data, another_json_field')
  .single();

await client
  .from('jsonb_test_table')
  .insert({ jsonb_data: [] })
  .select('jsonb_data')
  .single();

// Native arrays (TEXT[], INTEGER[])
await client
  .from('native_array_test_table')
  .insert({ tags: ['alpha', 'beta'], scores: [10, 20] })
  .select('tags, scores')
  .single();

await client
  .from('native_array_test_table')
  .insert({ tags: [], scores: [] })
  .select('tags, scores')
  .single();

await client
  .from('native_array_test_table')
  .update({ tags: ['updated_tag'] })
  .eq('id', 1)
  .select('tags')
  .single();

await client
  .from('native_array_test_table')
  .select('id')
  .contains('tags', ['initial_tag1'])
  .single();

await client
  .from('native_array_test_table')
  .insert({ tags: null, scores: null })
  .select('tags, scores')
  .single();

// BigInt
await client
  .from('bigint_test_table')
  .insert({ bigint_value: 8000000000000000000n })
  .select()
  .single();

await client
  .from('bigint_test_table')
  .update({ bigint_value: 7000000000000000000n })
  .eq('id', 2)
  .select()
  .single();

await client
  .from('bigint_test_table')
  .insert({ bigint_value: null })
  .select()
  .single();

await client
  .from('bigint_test_table')
  .select('id, bigint_value')
  .eq('bigint_value', 1234567890123456789n)
  .single();
```

### 예약어 컬럼

```typescript
const { data: reserved } = await client
  .from('reserved_keyword_test_table')
  .select('id, order, desc, user, limit, group')
  .eq('order', 100)
  .order('order', { ascending: false });

const { data: insertedReserved } = await client
  .from('reserved_keyword_test_table')
  .insert({ order: 300, desc: 'Description D', user: 'user_d', limit: 30, group: 'group_y' })
  .select()
  .single();

const { data: updatedReserved } = await client
  .from('reserved_keyword_test_table')
  .update({ desc: 'Updated Description A', limit: 15 })
  .eq('order', 100)
  .select()
  .single();

const { data: upsertReserved } = await client
  .from('reserved_keyword_test_table')
  .upsert({ order: 500, desc: 'Upserted', user: 'user_e', limit: 51, group: 'group_z' }, { onConflict: 'order' })
  .select()
  .single();
```

### 뷰 테이블

```typescript
const { data: userPosts } = await client
  .from('user_posts_view')
  .select('*');

const { data: activeUsers } = await client
  .from('active_users_view')
  .select('*')
  .gte('post_count', 2);

const { data: singlePost } = await client
  .from('user_posts_view')
  .select('*')
  .eq('post_id', 1)
  .single();
```

뷰는 읽기 전용이며, Insert/Update는 타입 단계에서 제한됩니다.

### RPC

```typescript
const { data: rows } = await client.rpc('get_users');

const { data: singleUser } = await client
  .rpc('get_user')
  .single();

const { data: maybeUser } = await client
  .rpc('get_user')
  .maybeSingle();

const { data: count } = await client.rpc('get_count'); // 스칼라 반환

const { data: countSingle } = await client
  .rpc('get_count')
  .single();

const { data: tableExists } = await client
  .rpc('check_table_exists', { table_name: 'code_routes' });

const { data: noneRpc, error: noneRpcError } = await client
  .rpc('get_user')
  .single();

const { data: manyRpc, error: manyRpcError } = await client
  .rpc('get_user')
  .maybeSingle();
```

RPC 참고:
- `rpc()`는 set-returning 함수에 대해 배열을 반환합니다(단일 컬럼이어도 배열 유지).
- 스칼라 반환은 스칼라 함수에만 언랩됩니다.
- 결과가 없으면 `[]`를 반환합니다(`null`이 아님).

### 트랜잭션

```typescript
await client.transaction(async (tx) => {
  const { data: user } = await tx
    .from('users')
    .insert({ name: '홍길동', email: 'hong@example.com' })
    .select()
    .single();

  if (!user?.id) {
    throw new Error('Failed to create user');
  }

  await tx
    .from('profiles')
    .insert({ user_id: user.id, bio: '트랜잭션 프로필' });
});
```

### 연결 확인

```typescript
const isConnected = await client.testConnection();
await client.close();
```

## API 문서

### 쿼리 메소드

- `select(columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated', head?: boolean })`: 조회할 컬럼 지정
  - `options.count`: `'exact'`는 `limit`의 영향을 받지 않는 전체 개수, `'planned' | 'estimated'`는 EXPLAIN 기반 추정치
  - `options.head`: `true`면 데이터 없이 `count`만 반환합니다(추정치 모드면 추정치만 반환).
  - PostgREST-style embed: `select('*, related_table(*)')` 또는 `select('col, related_table(col1, col2)')`
- `insert(data: T['Tables'][K]['Insert'] | T['Tables'][K]['Insert'][], options?: { onConflict?: string | string[]; ignoreDuplicates?: boolean })`: 단일/다중 삽입, `ignoreDuplicates: true`면 `ON CONFLICT DO NOTHING`
- `update(data: T['Tables'][K]['Update'])`: 레코드 업데이트
- `delete()`: 레코드 삭제
- `upsert(data: T['Tables'][K]['Insert'], options?: { onConflict?: string | string[]; ignoreDuplicates?: boolean })`: 삽입/업데이트, `ignoreDuplicates: true`면 `ON CONFLICT DO NOTHING`

### 필터 메소드

- `match(conditions)`: 여러 컬럼을 한 번에 eq 처리 (예: `match({ status: 'active', role: 'admin' })`)
- `eq(column, value)`: 같음
- `neq(column, value)`: 같지 않음
- `gt(column, value)`: 보다 큼
- `gte(column, value)`: 크거나 같음
- `lt(column, value)`: 보다 작음
- `lte(column, value)`: 작거나 같음
- `like(column, pattern)`: LIKE 패턴 매칭
- `ilike(column, pattern)`: 대소문자 구분 없는 LIKE
- `in(column, values)`: IN 연산자
- `is(column, value)`: IS 연산자
- `not(column, operator, value)`: 현재는 `not('column', 'is', null)`만 지원 (IS NOT NULL)
- `contains(column, value)`: 배열/JSON 포함 여부
- `or(conditions)`: OR 조건 문자열 (지원 연산자: eq/neq/like/ilike/gt/gte/lt/lte/is, `now()`는 `NOW()`로 인라인). 값에 점/쉼표가 포함되면 따옴표로 감싸세요. (예: `name.eq."last, first"`)

### 기타 메소드

- `order(column, { ascending?: boolean, nullsFirst?: boolean })`: 정렬
- `limit(count: number)`: 결과 개수 제한
- `offset(count: number)`: 결과 시작 위치
- `range(from: number, to: number)`: 범위 지정
- `single()`: 단일 결과 반환 (결과 없을 시 에러)
- `maybeSingle()`: 단일 결과 반환 (결과 없을 시 data: null, error: null)
- `returns<T>()`: 반환 타입 지정

### 트랜잭션 메소드

- `transaction<T>(callback: (client: SupaLitePG) => Promise<T>)`: 트랜잭션 실행
- `begin()`: 트랜잭션 시작
- `commit()`: 트랜잭션 커밋
- `rollback()`: 트랜잭션 롤백

### 클라이언트 메소드

- `testConnection()`: 데이터베이스 연결 확인
- `close()`: 커넥션 풀 종료

## 환경 변수 설정

데이터베이스 연결을 위해 다음 환경 변수를 설정할 수 있습니다:

```env
DB_USER=your_db_user
DB_HOST=your_db_host
DB_NAME=your_db_name
DB_PASS=your_db_password
DB_PORT=5432
DB_SSL=true
# SUPALITE_VERBOSE=true # 상세 로그 출력 활성화
```

### SupaLitePG 생성자 옵션

`SupaLitePG` 생성자는 다음 옵션을 받을 수 있습니다:

- `connectionString?: string`: PostgreSQL 연결 문자열 (예: `postgresql://user:password@host:port/database`). 제공되면 다른 연결 매개변수보다 우선합니다.
- `user?: string`: 데이터베이스 사용자 이름 (환경 변수: `DB_USER`).
- `host?: string`: 데이터베이스 호스트 (환경 변수: `DB_HOST`).
- `database?: string`: 데이터베이스 이름 (환경 변수: `DB_NAME`).
- `password?: string`: 데이터베이스 비밀번호 (환경 변수: `DB_PASS`).
- `port?: number`: 데이터베이스 포트 (기본값: 5432, 환경 변수: `DB_PORT`).
- `ssl?: boolean`: SSL 연결 사용 여부 (기본값: `false`, 환경 변수: `DB_SSL`).
- `schema?: string`: 기본 스키마 (기본값: `'public'`).
- `verbose?: boolean`: 상세 로그 출력 여부 (기본값: `false`, 환경 변수: `SUPALITE_VERBOSE`).
- `bigintTransform?: 'bigint' | 'string' | 'number'`:
    - 데이터베이스의 `BIGINT` 타입을 어떻게 변환할지 지정합니다.
    - `'bigint'` (기본값): JavaScript의 네이티브 `BigInt` 객체로 변환합니다. 이 라이브러리의 `Json` 타입은 `bigint`를 포함할 수 있도록 정의되어 있으나, 표준 `JSON.stringify()` 함수는 `BigInt`를 직접 처리하지 못하므로 `TypeError`가 발생할 수 있습니다. `BigInt` 값을 JSON으로 직렬화하려면 사용자 정의 replacer 함수를 사용하거나 사전에 문자열 등으로 변환해야 합니다.
    - `'string'`: 문자열로 변환합니다. JSON 직렬화에 안전하며, `BigInt`의 전체 정밀도를 유지합니다.
    - `'number'`: JavaScript의 `Number` 타입으로 변환합니다. 값이 `Number.MAX_SAFE_INTEGER` (또는 `Number.MIN_SAFE_INTEGER`)를 초과하면 정밀도 손실이 발생할 수 있습니다. 이 경우 `verbose: true` 설정 시 경고 로그가 출력됩니다. JSON 직렬화에는 안전합니다.

### Json 타입과 BigInt
라이브러리의 내부 `Json` 타입 정의는 `bigint`를 포함하여 TypeScript 코드 내에서 `BigInt` 값을 명시적으로 다룰 수 있도록 합니다. 그러나 `Json` 타입의 데이터를 표준 `JSON.stringify()`로 직렬화할 때, 포함된 `BigInt` 객체는 특별한 처리(예: 사용자 정의 replacer 함수 또는 사전 문자열 변환)가 필요합니다. `bigintTransform` 옵션을 `'string'` 또는 `'number'`로 설정하면 데이터베이스 조회 시점부터 JSON 직렬화에 안전한 형태로 `BIGINT` 값을 받을 수 있습니다.

## 응답 형식

모든 쿼리 메소드는 다음과 같은 형식의 응답을 반환합니다:

```typescript
interface QueryResult<T> {
  data: Array<T>;        // 쿼리 결과 데이터 (없으면 빈 배열)
  error: Error | null;   // 에러 정보
  count: number | null;  // 결과 레코드 수
  status: number;        // HTTP 상태 코드
  statusText: string;    // 상태 메시지
}

interface SingleQueryResult<T> {
  data: T | null;        // 단일 결과 (없으면 null)
  error: Error | null;   // 에러 정보
  count: number | null;  // 결과 레코드 수
  status: number;        // HTTP 상태 코드
  statusText: string;    // 상태 메시지
}
```

- `QueryResult.data`는 항상 배열이며, 결과 없음/에러 시 빈 배열입니다.
- `SingleQueryResult.data`는 결과 없음/에러 시 `null`입니다.

## 개발 환경 설정

### PostgreSQL 설치
PostgreSQL을 로컬에 설치하고 테스트하는 방법은 [examples/README.md](examples/README.md)를 참조하세요.

### 프로젝트 설정

```bash
# 저장소 클론
git clone https://github.com/your-username/supalite.git

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 테스트 실행
npm test

# 빌드
npm run build
```

## 기여하기

이슈와 PR을 환영합니다. 큰 변경은 먼저 이슈로 방향을 맞춰 주세요. 테스트는 로컬 Postgres(또는 `DB_CONNECTION`)가 필요하며, 배포 전 `npm run build`, `npm test`, `npm run lint`를 실행합니다.

## 라이선스

MIT 라이선스로 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

## 저작권

Copyright © 2025 Genideas Inc. and Wondong Shin (wodshin@gmail.com)
