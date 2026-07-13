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
- **[P2] shared metadata caches — DEFERRED (pre-existing, out of scope).** Scopes share
  `schemaCache`/`foreignKeyCache` with the singleton (since v0.9.0's `createTransactionScope`;
  `transaction(cb)` has the same property). Uncommitted-DDL metadata read inside a tx can
  survive rollback and be reused. Narrow (DDL-in-tx + query-in-tx + rollback + name reuse).
  Not introduced by this feature → tracked as a **follow-up** (see below), not fixed here.
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

- **Follow-up issue (cache isolation)**: don't let transaction-populated `schemaCache`/
  `foreignKeyCache` entries contaminate the singleton after rollback (copy-on-write per
  scope, or invalidate/merge only after commit). Pre-existing since v0.9.0; low severity.
- Ship in 0.13.0 (breaking): version bump + CHANGELOG rename + dist rebuild + tag; maintainer
  runs `npm publish`.
