# Tasks: `begin()/commit()/rollback()` scoped (005)

Live-Postgres TDD + pg-mock. Commit after every task. Changed files ≥90%.

## T001 — Privatize the mutating plumbing (src/postgres-client.ts)
- [ ] Rename current `begin`/`commit`/`rollback` bodies into
      `private async startTx()` / `private async commitTx()` / `private async rollbackTx()`,
      preserving exact release-on-error semantics (release once, with the error; null
      client; isTransaction false). `commitTx`/`rollbackTx` drop the outer `if` guard
      (caller guarantees an active tx).
- [ ] Rewire `transaction(cb)` to use `startTx`/`commitTx`/`rollbackTx` (no behavior change).
- [ ] `npm run build` + run `concurrent-transactions.test.ts` (must stay green — proves
      transaction(cb) unchanged). Commit `refactor(tx): privatize the transaction plumbing`.

## T002 — Public begin() returns a scoped handle + guards — TDD
- [ ] Add failing tests (transaction-isolation or a new manual-transaction spec):
      `begin()` returns a handle; `db.isTransaction` stays false; nested `begin()` on the
      handle throws `nested transactions are not supported`; `commit()`/`rollback()` on a
      no-tx instance throws `no active transaction …`.
- [ ] Implement public `begin(): Promise<SupaLitePG<T>>` (nested guard →
      createTransactionScope → startTx → return), and `commit()`/`rollback()` (no-tx guard
      → commitTx/rollbackTx). Update JSDoc (remove @deprecated/"not concurrency-safe").
- [ ] Run tests → green. Commit `feat(tx): begin() returns a connection-scoped handle; commit/rollback guarded`.

## T003 — Rework the release-on-failure unit tests (transaction-isolation.test.ts)
- [ ] Update the BEGIN/COMMIT/ROLLBACK-failure tests to the handle model: drive via
      `begin()` (BEGIN-fail path rejects from `begin()`); for COMMIT/ROLLBACK-fail,
      `const tx = await client.begin(); await expect(tx.commit()).rejects...`; assert the
      mock connection `release` called once with the error, and the handle's private
      `client`/`isTransaction` reset. Keep coverage of the release semantics.
- [ ] Run → green. Commit `test(tx): release-on-failure tests use the handle model`.

## T004 — Concurrency / isolation / leak integration tests (live DB)
- [ ] Add tests (concurrent-transactions.test.ts or manual-transaction.test.ts):
      (a) two concurrent `db.begin()` handles isolated (one rollback, one commit);
      (b) singleton non-tx query during an open handle runs on the pool, unaffected by the
      handle's rollback;
      (c) atomicity — second write fails → rollback → 0 partial writes; commit persists;
      (d) no leak under a `max:1` pool across success/rollback/exception.
- [ ] Run → green. Commit `test(tx): manual begin() concurrency + isolation + no-leak`.

## T005 — query-builder-transaction.test.ts to handle model
- [ ] `const tx = await client.begin(); const result = await tx.from('users').select('*')`;
      assert it routes to the tx client (not the pool). Commit `test(tx): query-builder tx test uses the handle`.

## T006 — Docs + CHANGELOG
- [ ] README.md / README.ko.md: document the safe manual API
      (`const tx = await db.begin(); … await tx.commit()`); remove the deprecated notes;
      point at `transaction(cb)` for auto-managed.
- [ ] CHANGELOG.md `[0.13.0]`: **Breaking** — `begin()` now returns a scoped handle
      (`Promise<SupaLitePG<T>>`); `commit`/`rollback`/nested `begin` guards throw;
      `transaction(cb)` unchanged. Commit `docs: safe manual transaction API + 0.13.0 breaking note`.

## T007 — Verify
- [ ] `npm run build`, `npm run lint`, `npm test` (`--maxWorkers=50%`) all green.
- [ ] `postgres-client.ts` and changed test files ≥90% (jest --coverage).
- [ ] Commit any coverage top-ups.
