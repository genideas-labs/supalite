# Implementation Plan: `begin()/commit()/rollback()` scoped (005)

**Input**: [spec.md](spec.md), [clarify.md](clarify.md), [contracts/api-contract.md](contracts/api-contract.md)
**Approach**: live-Postgres TDD + pg-mock unit tests for release-on-failure. Commit per task. Changed files ≥90%.

## Summary

Repurpose the public manual transaction API so it is connection-scoped and safe on a
shared singleton, keeping the names `begin`/`commit`/`rollback`. The existing
instance-mutating lifecycle becomes private (`startTx`/`commitTx`/`rollbackTx`); public
`begin()` returns a `createTransactionScope()` handle with a started transaction;
`commit()`/`rollback()` finalize the handle and throw when there is no active tx;
`begin()` throws on nesting. `transaction(cb)` is rewired to the private plumbing with no
behavior change. Docs updated; breaking → 0.13.0.

## Design

- **Private plumbing** (rename current bodies, keep exact release semantics):
  - `private async startTx(): Promise<void>` — acquire `this.pool.connect()`, `BEGIN`,
    set `this.client`/`this.isTransaction`; on BEGIN failure `release(err)`, null client,
    rethrow. (= current `begin()` body.)
  - `private async commitTx(): Promise<void>` — `COMMIT`, `release()` (or `release(err)`
    on failure), reset. (= current `commit()` body, minus the outer `if` guard — the
    caller guarantees an active tx.)
  - `private async rollbackTx(): Promise<void>` — `ROLLBACK`, `release()`/`release(err)`,
    reset. (= current `rollback()` body.)
- **Public API**:
  - `async begin(): Promise<SupaLitePG<T>>` — if `this.isTransaction` throw
    `nested transactions are not supported`; else `const tx = this.createTransactionScope();
    await tx.startTx(); return tx;`.
  - `async commit(): Promise<void>` — if `!(this.isTransaction && this.client)` throw
    `no active transaction — call begin() to obtain a transaction handle`; else
    `await this.commitTx()`.
  - `async rollback(): Promise<void>` — symmetric guard + `await this.rollbackTx()`.
- **`transaction(cb)`** — `const tx = this.createTransactionScope(); await tx.startTx();
  try { const r = await cb(tx); await tx.commitTx(); return r; } catch (e) { try { await
  tx.rollbackTx(); } catch (re) { if verbose log } throw e; }`. (No call to public begin/commit/rollback.)
- **Routing** — unchanged (`getQueryClient()` already per-instance). No change to
  `getColumnPgType`/`getForeignKey` inline routing.
- **JSDoc** — drop the `@deprecated`/"not concurrency-safe" notes on the three methods;
  document them as the safe manual API and cross-reference `transaction(cb)`.

## File Structure

- **Modify** `src/postgres-client.ts`: privatize plumbing; repurpose begin/commit/rollback;
  rewire transaction(); update JSDoc.
- **Modify** `src/__tests__/query-builder-transaction.test.ts`: `const tx = await
  client.begin(); await tx.from(...)`.
- **Modify** `src/__tests__/transaction-isolation.test.ts`: BEGIN/COMMIT/ROLLBACK-failure
  tests reworked to the handle model (the released mock connection belongs to the handle;
  assert `release` called once with the error). Assertions on private `client`/`isTransaction`
  target the handle where relevant.
- **Create/extend** tests for: two concurrent manual `begin()` handles isolated; singleton
  non-tx query unaffected during a handle window; release on success/rollback/exception
  (1-connection pool); `commit()`/`rollback()` no-tx throws; nested `begin()` throws.
  (Add to `concurrent-transactions.test.ts` or a new `manual-transaction.test.ts`.)
- **Modify** `README.md`, `README.ko.md`: safe manual API section; remove deprecated notes.
- **Modify** `CHANGELOG.md`: `[0.13.0]` breaking entry.

## Interfaces

```ts
// public
begin(): Promise<SupaLitePG<T>>;            // was Promise<void> (BREAKING)
commit(): Promise<void>;                     // throws if no active tx (BREAKING)
rollback(): Promise<void>;                    // throws if no active tx (BREAKING)
transaction<R>(cb: (tx: SupaLitePG<T>) => Promise<R>): Promise<R>;  // unchanged
// private
private startTx(): Promise<void>;
private commitTx(): Promise<void>;
private rollbackTx(): Promise<void>;
```

## Test Strategy

- **Unit (pg-mock)** — `transaction-isolation.test.ts`: BEGIN/COMMIT/ROLLBACK failure →
  `release` once with the error, handle `client` null, `isTransaction` false; no-tx
  `commit()`/`rollback()` throws; nested `begin()` throws.
- **Integration (live DB)** — concurrency isolation (two handles), singleton non-tx query
  unaffected during a handle window, atomicity (rollback ⇒ 0 partial writes), no leak
  under a 1-connection pool, commit persists. Reuse the `concurrent-transactions.test.ts`
  harness style.
- **Unchanged** — `concurrent-transactions.test.ts` (transaction(cb)) stays green.
- **Regression** — `npm test` (`--maxWorkers=50%`), `npm run lint`, `npm run build`;
  changed files ≥90%.

## Risk / Rollout

- Breaking: `begin()` return type + guard throws. Maintainer-approved (manual API unused
  downstream); not documented in README previously, so external blast radius is minimal.
  Ships as 0.13.0.
- `transaction(cb)` is behavior-identical (private-plumbing rewire), guarded by the
  untouched `concurrent-transactions` suite.
