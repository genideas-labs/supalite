# Feature Specification: `begin()/commit()/rollback()` → connection-scoped, concurrency-safe

**Feature Branch**: `005-transaction-begin-scoped`
**Created**: 2026-07-13
**Status**: Implemented
**Input**: Follow-up to [#17](https://github.com/genideas-labs/supalite/issues/17) — `transaction(cb)` is already connection-scoped (v0.9.0); this closes the same gap for the **manual** `begin()/commit()/rollback()` API. Breaking change explicitly approved by the maintainer (the manual API is unused downstream).

## User Scenarios & Testing

### Primary User Story

Apps use a **module-global singleton** client (`export const db = new SupaLitePG(...)`).
`transaction(cb)` is already safe on that singleton (isolated scope per call). But
the **manual** control API — `await db.begin(); await db.from(...); await db.commit()` —
mutates the singleton's own fields (`this.client`, `this.isTransaction`), so during
the begin→commit window **every other concurrent query through `db` is routed to the
transaction's single connection** (cross-contamination, unintended serialization, a
rollback affecting unrelated queries). I need manual transaction control (for a tx that
spans multiple functions or has conditional commit points) that is **as safe on a shared
singleton as `transaction(cb)` is**.

The fix: `begin()` returns a **connection-scoped handle** (a thin child client bound to
one borrowed connection). I run my statements on that handle and finalize with
`handle.commit()` / `handle.rollback()`. The shared singleton is never mutated, so
concurrent traffic through it is unaffected.

```ts
const tx = await db.begin();          // borrows one connection, BEGIN; db is untouched
try {
  await tx.from('accounts').update({ balance: 100 }).eq('id', 1);
  await tx.from('ledger').insert({ ... });
  await tx.commit();                  // COMMIT + release the connection
} catch (e) {
  await tx.rollback();                // ROLLBACK + release the connection
  throw e;
}
```

### Acceptance Scenarios

1. **Given** a shared singleton `db`, **When** two `db.begin()` handles run concurrently
   and one calls `rollback()` while the other calls `commit()`, **Then** each handle's
   writes are isolated — the committed one persists, the rolled-back one does not, and
   neither affects the other.
2. **Given** an open `db.begin()` handle, **When** a **non-transactional** query is issued
   directly on the shared `db` during the handle's window, **Then** that query runs on a
   pooled connection (NOT the transaction's connection) and is unaffected by a later
   rollback of the handle.
3. **Given** a handle from `db.begin()`, **When** the callback path succeeds and
   `handle.commit()` is called, **Then** the transaction commits and its connection is
   released to the pool; **When** it fails and `handle.rollback()` is called, **Then** it
   rolls back and the connection is released. In BOTH cases, and on a mid-transaction
   exception, the connection is returned to the pool (no leak).
4. **Given** BEGIN / COMMIT / ROLLBACK itself fails at the driver level, **Then** the
   connection is released **once** with the error passed to `release(err)` (so pg
   discards a possibly-broken connection), and the error propagates.
5. **Given** an instance with **no active transaction**, **When** `commit()` or
   `rollback()` is called on it, **Then** it throws a clear error
   (`no active transaction — call begin() to obtain a transaction handle`) instead of
   silently doing nothing.
6. **Given** an already-open handle `tx`, **When** `tx.begin()` is called (nesting),
   **Then** it throws `nested transactions are not supported` (savepoints are out of
   scope for v1).
7. **Given** `transaction(cb)`, **Then** its behavior is **unchanged** — it still runs
   the callback on an isolated scope, commits on success, rolls back on failure without a
   rollback error masking the original, and releases the connection on every path.

### Edge Cases

- `db.begin()` on the shared singleton NEVER sets `db.isTransaction` — the singleton is
  not mutated (that is the whole point).
- A handle is single-use: after `commit()`/`rollback()` its connection is released and
  `isTransaction` is false; calling `commit()`/`rollback()` again throws (no active tx).
- The scoped handle shares the singleton's pool (`ownsPool=false`) and gets a **shallow
  copy** of the read-mostly metadata caches (seeded from the owner, but writes stay
  isolated so uncommitted-DDL metadata can't survive a rollback into the owner cache); it
  attaches no pool error listener (unchanged from `createTransactionScope`).
- BIGINT type-parser setup is not re-run per handle (the `skipNextTypeParserSetup` guard
  is preserved).

## Requirements

### Functional Requirements

- **FR-001** (scoped begin): `begin()` MUST create a connection-scoped handle (a child
  `SupaLitePG` bound to one connection borrowed from the shared pool), execute `BEGIN` on
  it, and RETURN the handle. It MUST NOT mutate the receiver's `client`/`isTransaction`.
  Return type becomes `Promise<SupaLitePG<T>>` (**breaking**: was `Promise<void>`).
- **FR-002** (scoped finalize): `commit()` / `rollback()` MUST operate on the receiver's
  own transaction connection (valid on a handle from `begin()`), issuing COMMIT/ROLLBACK
  and releasing the connection. They MUST reset the handle's `client`/`isTransaction`.
- **FR-003** (no-tx guard): `commit()` / `rollback()` called on an instance with no
  active transaction MUST throw a clear error (breaking: previously a silent no-op).
- **FR-004** (nested guard): `begin()` called on an instance that already has an active
  transaction MUST throw `nested transactions are not supported`.
- **FR-005** (release semantics preserved): on a BEGIN/COMMIT/ROLLBACK driver failure the
  transaction connection MUST be released exactly once with the error passed to
  `release(err)`; the original error MUST propagate; the handle's `client` MUST be nulled
  and `isTransaction` set false.
- **FR-006** (routing): queries issued on a handle MUST run on the handle's transaction
  connection; queries on the shared singleton MUST run on a pooled connection. (Existing
  `getQueryClient()` routing already keys off per-instance `isTransaction`/`client`; the
  scope makes this correct per handle.)
- **FR-007** (`transaction(cb)` unchanged): the callback API and all its observable
  behavior MUST be unchanged. Internally it MUST use the private plumbing, NOT the public
  `begin()` return shape.
- **FR-008** (internals private): the instance-mutating plumbing (acquire+BEGIN,
  COMMIT+release, ROLLBACK+release) MUST become private methods, only ever invoked on a
  fresh per-transaction scope.
- **FR-009** (docs): README.md / README.ko.md MUST document the now-safe manual API
  (`const tx = await db.begin(); … await tx.commit()`); the `@deprecated`
  "not concurrency-safe" notes on `begin/commit/rollback` MUST be removed/replaced (the
  public methods are now safe). CHANGELOG MUST call out the **breaking** `begin()`
  return-type change under a new **0.13.0** entry.

### Key Entities

- **Transaction handle**: a `SupaLitePG<T>` scope bound to one borrowed connection with
  `isTransaction=true`; the value returned by `begin()`. Finalized by `commit()`/`rollback()`.
- **Private plumbing**: `startTx` / `commitTx` / `rollbackTx` (names TBD) — the mutating
  connection lifecycle, invoked only on a scope.
- **Query router**: `getQueryClient()` → per-instance `isTransaction ? client : pool`.

## Success Criteria

- **SC-001** (concurrency): two concurrent `db.begin()` handles are isolated; one's
  rollback does not affect the other's commit or the singleton.
- **SC-002** (singleton unaffected): a non-tx query on `db` during an open handle runs on
  the pool and survives the handle's rollback.
- **SC-003** (atomicity): a handle whose second write fails and then `rollback()`s leaves
  zero partial writes; a committed handle persists all writes.
- **SC-004** (no leak): connection released on commit, on rollback, and on a mid-tx
  exception — verified under a 1-connection pool (which would deadlock on a leak).
- **SC-005** (guards): `commit()`/`rollback()` with no active tx throws; `begin()` on an
  open handle throws nested-not-supported.
- **SC-006** (release-on-failure): BEGIN/COMMIT/ROLLBACK driver failures release once with
  the error and propagate (preserved from the current implementation).
- **SC-007** (`transaction(cb)`): unchanged — existing concurrent-transactions tests stay
  green.
- **SC-008** (regression/coverage): `npm test`, lint, build pass; changed files ≥90%.

## Assumptions

- Tests run against live Postgres via `DB_CONNECTION` (repo convention) plus the existing
  pg-mock unit tests for the release-on-failure paths.
- The manual `begin/commit/rollback` API is unused downstream (maintainer-confirmed), so
  the breaking return-type change is acceptable in a 0.x minor (0.13.0).

## Out of Scope (v1)

- Savepoints / nested transactions (nesting throws).
- Auto-release / finalizer safety net if the caller forgets `commit()`/`rollback()`
  (manual API ⇒ caller owns the connection lifecycle; `transaction(cb)` remains the
  auto-managed option).
- Any change to `transaction(cb)`'s public shape or behavior.

## Dependencies & References

- Issue #17 (transaction(cb) scoping) + its `createTransactionScope()` machinery, reused
  here.
- `src/postgres-client.ts` (begin/commit/rollback/transaction/getQueryClient),
  `src/query-builder.ts` (`getQueryClient()` routing at ~1233),
  `src/__tests__/{concurrent-transactions,transaction-isolation,query-builder-transaction}.test.ts`.
