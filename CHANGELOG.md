# Changelog

## [Unreleased]

### Changed (BREAKING → 0.13.0)
- Manual transaction API is now **connection-scoped and safe on a shared singleton** (follow-up to #17). `begin()` no longer mutates the instance — it returns a **connection-scoped handle** (`Promise<SupaLitePG<T>>`, was `Promise<void>`) bound to one borrowed connection; run your statements on the returned handle and finalize with `handle.commit()` / `handle.rollback()`. Calling a shared singleton's `begin()` no longer poisons the query router, so concurrent queries through the singleton are unaffected. **Migration**: `await db.begin(); await db.from(...); await db.commit()` → `const tx = await db.begin(); await tx.from(...); await tx.commit()`.
- `commit()` / `rollback()` now **throw** `no active transaction …` when there is no active transaction (was a silent no-op); a nested `begin()` on an open handle throws `nested transactions are not supported`.
- The `@deprecated "not concurrency-safe"` notes on `begin`/`commit`/`rollback` are removed — they are now the safe manual API. `transaction(cb)` is **unchanged** (already connection-scoped since v0.9.0).

### Tests
- New `manual-transaction.test.ts`: commit persists + singleton untouched, rollback atomicity, two concurrent handles isolated, singleton non-tx query unaffected during an open handle, no-leak under a 1-connection pool (commit/rollback/exception), no-tx `commit()/rollback()` throws, nested `begin()` throws, handle single-use. Release-on-failure and query-routing tests reworked to the handle model.

## [0.12.0] - 2026-07-12

### Added
- `supalite migrate mark-applied --dry-run` (#14): preview a prod adoption before the first write. Probes the tracking table **read-only** (`to_regclass`) and prints the exact versions it would record and the exact SQL it would execute — **writing nothing** (it does not create `schema_migrations` even when absent); already-recorded versions are reported as "already recorded (skip)". The preview SQL is generated from the same builders the executor uses, so preview and execution cannot drift. Exposed programmatically via `migrateMarkApplied({ dryRun: true })` → `result.dryRun` (`{ table, tableExists, sql }`); new `MarkAppliedDryRun` export.

### Fixed
- `migrate up --dry-run` is now **write-free** and prints each pending migration's file path. It previously called `ensureMigrationsTable`, creating the tracking table during a dry-run — violating 003 SC-005 ("up --dry-run … creates nothing"). It now uses the same read-only probe. `migrateUp` dry-run results gain `pendingPaths`.

### Tests
- `migrate mark-applied --dry-run` integration: table-absent preview (write-free), subset already-recorded (no INSERT for skipped, rows unchanged), fidelity (real run records exactly what dry-run predicted), single-version; `up --dry-run` no longer creates the tracking table. CLI: `mark-applied --all --dry-run` preview block, arg-parity, `up --dry-run` path + write-free note.
- `npm test` now runs with `--maxWorkers=50%` to avoid an intermittent spawn/DB-contention flake in the ts-node CLI tests under full parallelism (the `prepublishOnly` gate was flaking on unrelated CLI suites).

### Compatibility
- Backward-compatible: `--dry-run` is additive on `mark-applied`; result-shape additions are optional. The one behavior change (`up --dry-run` no longer creating the tracking table) is a bugfix toward 003 SC-005.

## [0.11.0] - 2026-07-12

### Added
- `supalite migrate` (#7): a migration runner that closes the `db pull → migrate → gen types` toolchain — apply + track migrations without an external tool (dbmate/Flyway). Subcommands `up` / `status` / `new` / `mark-applied` (forward-only; `down` is unsupported in v1). Payment-DB safety: the whole `up` run holds a Postgres advisory lock (`pg_advisory_lock(hashtext('supalite:migrate'))`, no concurrent double-apply); each migration's DDL and its `schema_migrations` version row commit in one transaction (a failure rolls back, is not recorded, and stops the run naming the file); a `-- migrate:up transaction:false` escape runs non-transactional DDL (`CREATE INDEX CONCURRENTLY`, `ALTER TYPE ADD VALUE`). dbmate-compatible `-- migrate:up` / `-- migrate:down` format; version = the leading numeric timestamp; tracking table `public.schema_migrations(version, applied_at)` auto-created (`--migrations-table` to relocate; inserts write only `version`, so an existing dbmate table is compatible). `--db-url` falls back to `DB_CONNECTION` then `DATABASE_URL`; `migrate new` needs no database. Programmatic API: `migrateUp` / `migrateStatus` / `migrateMarkApplied` / `migrateNew`.
- `supalite db pull --format dbmate` (#8): emit the baseline wrapped in `-- migrate:up` / `-- migrate:down` markers so it is a drop-in for both dbmate and `supalite migrate`. Default `--format plain` is byte-for-byte unchanged. Programmatic: `generateBaselineSql({ format: 'dbmate' })`.

### Fixed
- `gen types` casing: the `splitWords` character class was double-escaped (`/[_\\-\\s]+/`), so `--type-case` / `--function-case` split identifiers on the literal letter `s` (and backslash) instead of underscore/hyphen/whitespace — mangling any name containing `s` (e.g. `gen_types_status` → `genTypeStatus`). Corrected to `/[_\-\s]+/`. Default casing is `preserve`, so existing output is unchanged.

### Tests
- `migrate` suite: parser units + live-DB integration (apply/idempotent, dry-run, atomic-failure rollback + stop, `transaction:false` `CREATE INDEX CONCURRENTLY`, `mark-applied`, and a `db pull --format dbmate` baseline applied via `migrate up`); `migrate.ts` 98.85% statements.
- Raised repo coverage: `gen-types.ts` → ~94%, `postgres-client.ts` → ~97% (new live-DB tests); global ≥90%.

### Compatibility
- Backward-compatible: a new subcommand plus an opt-in `db pull --format`; `--format plain` (default) and every existing API/export are unchanged. Replay/apply targets require PostgreSQL 14+.

## [0.10.0] - 2026-07-12

### Added
- `supalite db pull` (#4): introspect an existing Postgres (`--db-url`) and generate a dependency-ordered baseline migration SQL. Idempotent DDL by default (`IF NOT EXISTS` / `CREATE OR REPLACE` / `DO` guards for constraints and constraint triggers — re-applying to the source database is a no-op); extension-owned objects excluded by default (`--include-extension-objects` to include); `--no-if-not-exists` for plain DDL; `--out -` for stdout; default output `supabase/migrations/<UTC ts>_baseline.sql`. Covers schemas, extensions (dependency-ordered), sequences (identity + serial + standalone), enum/domain/composite types (topologically sorted), tables (identity/generated columns, COLLATE, UNLOGGED, row-type topo), constraints (PK/UNIQUE/CHECK/EXCLUDE, FKs after all tables), functions/procedures in three dependency stages, views (options, `WITH NO DATA`, topo), triggers (incl. constraint triggers), and indexes (incl. materialized-view indexes). Unsupported objects (partitioned hierarchies, aggregates, RLS policies) and their dependents are footer-listed — never silently dropped — along with dependencies on objects outside the selected schemas; grants are omitted in v1. Programmatic API: `generateBaselineSql` exported from the package root. Replay target requires PostgreSQL 14+.

### Tests
- `db pull` suite: 29 tests incl. live round-trip (generate → drop → apply → regenerate identical) and idempotent double-apply on PostgreSQL 14; `db-pull.ts` coverage 92% statements; `errors.ts` unit tests added (100%).

## [0.9.0] - 2026-06-08

### Fixed
- `transaction(cb)` now runs on an isolated, connection-bound scope instead of mutating shared instance state. Concurrent transactions and concurrent non-transactional queries on the same client no longer interfere.
- `commit()`/`rollback()` release the pooled connection in `finally`, preventing leaks and error-masking when COMMIT/ROLLBACK fails.
- supalite no longer attaches an error listener to an externally-provided pool (`{ pool }`), preventing listener leaks when many clients share one pool.
- `transaction(cb)` no longer re-runs the process-global `pg.types` BIGINT parser setup when forking its isolated scope, so starting a transaction can't flip BIGINT parsing for another `SupaLitePG` instance in the same process.
- A failed `BEGIN`/`COMMIT`/`ROLLBACK` now passes the error to `release(err)`, so pg discards a possibly-broken pooled connection (reset/timeout) instead of returning it for reuse.

### Deprecated
- Manual `begin()` / `commit()` / `rollback()` mutate the instance and are not concurrency-safe. Use `transaction(cb)`.

### Tests
- Added DB-free regression tests pinning the concurrency guarantees: each `transaction()` acquires its own pooled connection, the parent instance's tx state is never mutated, the connection is released on BEGIN/COMMIT/ROLLBACK failure, and a failing rollback never masks the original error. Added integration tests for rollback isolation between concurrent transactions and for no connection leak under a single-connection pool.

### Compatibility
- Fully backward-compatible: the public API and exported type surface are unchanged, and the runtime `pg` range stays `^8.11.3`. The transaction rework is internal; `begin()`/`commit()`/`rollback()` still work (deprecated).

## [0.8.2] - 2026-02-23

### ✨ Added
- `or()`에서 중첩 `and(...)` / `or(...)` 그룹 파싱을 지원합니다. (PostgREST-style)
- `or()`에서 `in.(...)` 연산자를 지원합니다.
- `or()`에서 `not.*` 연산자(`not.eq`, `not.ilike`, `not.is`, `not.in` 등)를 지원합니다.
- 중첩 `or()` 전용 회귀 테스트 파일을 추가해 복합 케이스를 대폭 확장했습니다.

### 🐞 Fixed
- `or('...,and(...)')` 구문이 `and(created_at`를 컬럼으로 오해해 SQL 에러를 내던 문제를 수정했습니다.
- 괄호/따옴표가 깨진 `or()` 입력에서 명확한 파서 에러를 반환하도록 개선했습니다.

## [0.8.1] - 2026-02-03

### 🐞 Fixed
- insert/update/upsert에서 `undefined` 필드를 제외하도록 수정했습니다.
- multi-row insert에서 누락/undefined 값을 `DEFAULT`로 처리합니다.
- 단일 insert에 정의된 필드가 없으면 `DEFAULT VALUES`를 사용합니다.

## [0.8.0] - 2026-01-19

### ✨ Added
- `bigintTransform: 'number-or-string'` 옵션을 추가했습니다. 안전 범위는 `Number`, 그 외는 문자열을 반환합니다.

### 🔧 Changed
- `bigintTransform` 기본값을 `'number-or-string'`으로 변경했습니다. (Supabase 기본값과의 호환을 높이기 위함)

## [0.7.2] - 2026-01-17

### ✨ Added
- `--no-bigint` 옵션을 추가해 BIGINT를 `number`로 출력할 수 있습니다.

### 🐞 Fixed
- `js-yaml` 의존성을 보안 패치 버전으로 업데이트했습니다. (prototype pollution 대응)

## [0.7.1] - 2026-01-17

### ✨ Added
- `supalite gen types` 기본 출력이 Supabase CLI 포맷과 최대한 동일하도록 정렬/포맷/헬퍼 타입/Constants를 추가했습니다.
- `--format supabase|supalite`, `--bigint-type`, `--json-bigint` 옵션을 추가했습니다.
- Supabase 포맷에서 insertable view에 `Insert`/`Update`를 포함하고, 함수 오버로드 출력 형태를 Supabase와 맞췄습니다.

### 🔧 Changed
- Supabase 포맷 기본값 기준으로 관계/복합 타입/함수 시그니처가 기본 포함됩니다. (legacy 출력은 `--format supalite`)

## [0.7.0] - 2026-01-17

### ✨ Added
- `supalite gen types` CLI to generate TypeScript Database types from PostgreSQL schemas.
- BIGINT columns are emitted as `bigint` in the generated types.
- `--date-as-date` option to map `date`/`timestamp` columns to `Date` in generated types.
- `--include-relationships`, `--include-constraints`, `--include-indexes` options to emit schema metadata.
- `--include-composite-types` and `--include-function-signatures` options for composite types and typed function signatures.
- `--type-case` and `--function-case` options to control enum/composite and function key casing.
- `--dump-functions-sql` option to export `CREATE FUNCTION/PROCEDURE` definitions to a local file.
- Added gen-types seed/cleanup scripts and limitations docs.

## [0.6.1] - 2026-01-16

### ✨ Added
- `count: 'planned' | 'estimated'`가 `EXPLAIN (FORMAT JSON)` 기반 추정치를 반환하도록 추가했습니다.

### 🐞 Fixed
- 트랜잭션 내 쿼리가 트랜잭션 클라이언트로 실행되도록 수정했습니다.
- `in()`에 `null`이 포함될 때 `IS NULL`을 포함하도록 개선했습니다.

## [0.6.0] - 2026-01-16

### ✨ Added
- PostgREST-style embed에 중첩 관계, `!inner`, 관계 테이블 필터(`table.column`) 지원을 추가했습니다.
- `insert()`에 `onConflict`/`ignoreDuplicates` 옵션을 추가했습니다. (`ON CONFLICT DO NOTHING`)
- `upsert()`에 `ignoreDuplicates` 옵션을 추가했습니다. (`ON CONFLICT DO NOTHING`)
- `or()`에서 `now()`를 `NOW()`로 인라인 처리합니다.
- README 영어화 및 `README.ko.md` 추가.
- `or()`에 따옴표 값 파싱을 추가해 `,`/`.` 포함 값을 안전하게 처리합니다.

### 🐞 Fixed
- `single()`/`maybeSingle()`/RPC 내부 PGRST 에러에 `error.code`를 채워 분기 처리를 안정화했습니다.
- RPC가 빈 결과에서 `data: []`를 반환하고, 스칼라 언랩은 스칼라 반환 함수에만 적용합니다.

## [0.5.7] - 2026-01-14

### ✨ Added
- `upsert()`에 `onConflict` 다중 컬럼 지정 지원을 추가했습니다. 이제 콤마 구분 문자열 또는 문자열 배열을 사용할 수 있습니다. (예: `'set_id, name'`, `['set_id', 'name']`)

### 🐞 Fixed
- `select()`의 PostgREST-style embed(`related_table(*)`)가 **양방향 FK**를 지원하도록 개선했습니다. 이제 1:N 관계는 배열(`[]` 기본값), N:1 관계는 객체(또는 `null`)로 반환합니다. (See [docs/changelog/2025-12-17-embed-many-to-one.md](docs/changelog/2025-12-17-embed-many-to-one.md))

## [0.5.5] - 2025-11-26

### ✨ Added
-   `rpc()` 메서드 호출 시 `.single()` 및 `.maybeSingle()` 메서드 체이닝 지원을 추가했습니다. 이를 통해 RPC 결과에 대해 단일 행 제약 조건을 적용할 수 있습니다. (See [docs/changelog/2025-11-26-rpc-single-support.md](docs/changelog/2025-11-26-rpc-single-support.md))

## [0.5.2] - 2025-10-16

### 🐞 Fixed
- `select()` 메서드에서 `count: 'exact'` 옵션 사용 시 `limit()` 또는 `range()`와 함께 호출될 때 전체 개수 대신 페이지네이션된 개수를 반환하는 버그를 수정했습니다. 이제 항상 정확한 전체 개수를 반환합니다.
- `select()` 메서드에서 `count: 'exact'`와 `head: true` 옵션을 함께 사용할 때 `count`가 `null`로 반환되는 버그를 수정했습니다.

## [0.5.1] - 2025-10-16

### 🐞 Fixed
- `select()` 메서드에서 `count: 'exact'` 옵션 사용 시 `limit()` 또는 `range()`와 함께 호출될 때 전체 개수 대신 페이지네이션된 개수를 반환하는 버그를 수정했습니다. 이제 항상 정확한 전체 개수를 반환합니다.

## [0.5.0] - 2025-07-01

### ✨ Added
-   **Join Query Support**: Implemented support for PostgREST-style join queries in the `.select()` method. You can now fetch related data from foreign tables using the syntax `related_table(*)` or `related_table(column1, column2)`. This is achieved by dynamically generating `json_agg` subqueries.

### 🛠 Changed
-   `SupaLitePG` client now includes a `getForeignKey` method to resolve foreign key relationships, with caching for better performance.
-   `QueryBuilder`'s `select` and `buildQuery` methods were enhanced to parse the new syntax and construct the appropriate SQL queries.

## [0.4.0] - 2025-06-10

### ✨ Added
-   **Configurable `BIGINT` Transformation**: Introduced `bigintTransform` option in `SupaLitePG` constructor to allow users to specify how `BIGINT` database types are transformed (to `'bigint'`, `'string'`, or `'number'`). Default is `'bigint'`. This provides flexibility and helps mitigate `JSON.stringify` errors with native `BigInt` objects. (See [docs/changelog/2025-06-10-bigint-handling-enhancement.md](docs/changelog/2025-06-10-bigint-handling-enhancement.md) for details)

### 🛠 Changed
-   The internal `Json` type in `src/types.ts` now explicitly includes `bigint`, with documentation clarifying user responsibility for `JSON.stringify` handling.
-   Improved client initialization logging for `bigintTransform` mode when `verbose` is enabled.

## [0.1.8] - 2025-03-04

### Fixed
- 누락된 `dist` 파일들을 포함하도록 수정

## [0.1.7] - 2025-03-04

### Added
- QueryBuilder에 `match` 메서드 추가
- `match` 메서드 테스트 코드 작성

## [0.1.6] - 2025-03-01

### Added
- corepack 지원 추가 (npm, yarn, pnpm, bun 패키지 관리자 지원)
- 패키지 관리자 중립적인 스크립트 설정 ($npm_execpath 사용)
- 각 패키지 관리자의 lock 파일 생성 (package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lock)
- .npmignore 파일 추가하여 lock 파일들이 npm 배포 패키지에 포함되지 않도록 설정

## [0.1.5] - 2025-02-28

### Security
- 예제 코드에서 민감한 Supabase 연결 문자열 제거
- Git 히스토리에서 민감한 정보 제거

## [0.1.4] - 2025-02-28

### Fixed
- GitHub 저장소에서 직접 설치 시 빌드된 파일이 포함되지 않는 문제 해결
- .gitignore에서 dist 디렉토리 제외하여 빌드된 파일이 GitHub에 포함되도록 수정

## [0.1.3] - 2025-02-27

### Added
- PostgreSQL bigint 타입 지원 추가 (JavaScript BigInt 타입으로 변환)
- bigint 타입 테스트 코드 작성
- Number 및 string 타입 값의 자동 변환 지원 확인 (bigint 컬럼에 Number나 string 값 전달 시 자동 변환)

## [0.1.2] - 2025-02-27

### Added
- DB_CONNECTION URI 형식 지원 추가
- 연결 테스트 메서드 추가
- 연결 문자열 테스트 코드 작성

## [0.1.1] - 2025-02-25

### Added
- 멀티 스키마 데이터베이스 지원
- Supabase 스타일의 타입 시스템 지원
- Json 타입 정의 추가
- Views, Functions, Enums, CompositeTypes 지원

### Changed
- 타입 시스템 개선
- 스키마 인식 타입 유틸리티 업데이트
- 기본 스키마를 'public'으로 설정

## [0.1.0] - 2025-02-25

### Added
- 초기 릴리즈
- PostgreSQL 클라이언트 구현
- 기본적인 CRUD 작업 지원
- 트랜잭션 지원
- 타입 안전성
- 테스트 및 예제 코드
