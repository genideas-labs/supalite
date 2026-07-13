# Postmortem: `begin()/commit()/rollback()` scoped (005)

**Status**: Implemented ✅  **Follow-up to**: [#17](https://github.com/genideas-labs/supalite/issues/17)  **Date**: 2026-07-13

## 산출물

The manual transaction API is now **connection-scoped and safe on a shared singleton**.
`begin()` returns a connection-scoped handle (a child `SupaLitePG` bound to one borrowed
connection) instead of mutating the instance; `commit()`/`rollback()` finalize the handle;
the shared singleton is never mutated, so concurrent queries through it are unaffected.
Breaking → **0.13.0** (`begin()` return type; guards now throw). `transaction(cb)` is
unchanged.

## 파일 구조

| File | Change |
|------|--------|
| `src/postgres-client.ts` | Privatize the mutating plumbing → `startTx/commitTx/rollbackTx`; public `begin(): Promise<SupaLitePG<T>>` returns a scope; `commit()/rollback()` guard-then-finalize; nested `begin()` + no-tx `commit/rollback` throw; `transaction(cb)` rewired to the private plumbing; finalization made **atomic** (capture client + clear state before the await). JSDoc rewritten (deprecated notes removed). |
| `src/__tests__/manual-transaction.test.ts` | NEW — commit/rollback, singleton-untouched, two concurrent handles isolated, singleton non-tx query unaffected, no-leak (max:1), guards, single-use, **concurrent commit()+rollback() double-release**. |
| `src/__tests__/transaction-isolation.test.ts` | Release-on-failure tests reworked to the handle model. |
| `src/__tests__/query-builder-transaction.test.ts` | Uses the `begin()` handle. |
| `README.md`, `README.ko.md`, `CHANGELOG.md` | Safe manual API section; `[Unreleased]` breaking (→0.13.0) note. |

## 테스트 결과

- Full suite: **272 passed / 33 suites** (`--maxWorkers=50%`).
- Coverage: `postgres-client.ts` **97.53% stmts / 98.28% lines / 100% funcs**.
- `lint` 0 errors; `tsc` clean.

## auto-review 결과 (Codex, high)

- **[P1] racy finalization — FIXED.** Concurrent `commit()`+`rollback()` on one handle both
  passed the guard before state cleared → double `release()` (pool corruption) / null-deref.
  Fix: capture the client and clear `client`/`isTransaction` **synchronously before the
  await** in `commitTx`/`rollbackTx`, so a racing finalizer sees no active tx and throws.
  Covered by a new concurrent-finalize test.
- **[P2] shared metadata caches — FIXED.** Scopes shared `schemaCache`/`foreignKeyCache`
  with the singleton by reference (since v0.9.0), so uncommitted-DDL metadata read inside a
  tx could survive rollback and pollute the owner. Fixed: `createTransactionScope()` now
  seeds the scope with a **shallow copy** (`new Map(...)`) — known tables still hit the copy
  (no cold information_schema lookup), but writes inside the tx land only in the scope's copy
  and are discarded when it ends. Covered by a new isolation test (scope write not visible on
  the owner) and the reworked "seeds a scope with a COPY" unit test.
- **[P2] overclaiming test name — FIXED.** The mid-tx-exception test was renamed to
  "caller-handled mid-tx exception" — the manual API relies on the caller to `rollback()`;
  only `transaction(cb)` guarantees cleanup on an unhandled throw.

## 핵심 설계 결정

1. **Keep names, return a handle** (maintainer requirement + breaking approved): `begin()`
   returns the `SupaLitePG<T>` scope `createTransactionScope()` already builds — no new type.
2. **Guards throw** (clarify Q2): no-tx `commit/rollback` and nested `begin()` throw, surfacing
   misuse immediately.
3. **Atomic finalization** (Codex P1): synchronous capture-and-clear before the await is what
   makes the manual API safe under concurrent finalization, not just concurrent `begin()`.
4. **`transaction(cb)` untouched**: rewired to the private plumbing; the existing
   `concurrent-transactions` suite stays green as the regression guard.

## 후속 작업

- Optional perf: a committed transaction's newly-discovered table metadata no longer
  back-propagates to the owner cache (the shallow-copy trade-off), so a table only ever
  queried inside transactions re-reads information_schema each time. Negligible for typical
  apps; a merge-on-commit optimization could restore it if it ever matters.
- Ship in 0.13.0 (breaking): version bump + CHANGELOG rename + dist rebuild + tag; maintainer
  runs `npm publish`.
