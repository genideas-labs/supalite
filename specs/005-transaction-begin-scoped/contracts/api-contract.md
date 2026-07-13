# API Contract: manual transaction (`begin`/`commit`/`rollback`) — 005

## Safe manual transaction (new shape)

```ts
const tx = await db.begin();   // Promise<SupaLitePG<T>> — borrows ONE connection, runs BEGIN
try {
  await tx.from('accounts').update({ balance: 100 }).eq('id', 1);
  await tx.from('ledger').insert({ account_id: 1, delta: 100 });
  await tx.commit();           // COMMIT + release connection
} catch (e) {
  await tx.rollback();         // ROLLBACK + release connection
  throw e;
}
```

- `db` (the shared singleton) is **never mutated**; concurrent queries on `db` during the
  handle window run on pooled connections and are unaffected by the handle's commit/rollback.
- The handle `tx` is a `SupaLitePG<T>` bound to the transaction connection; all query
  methods on it run inside the transaction.

## Contract

| Call | Before (v0.12) | After (v0.13, this feature) |
|------|----------------|-----------------------------|
| `begin()` | `Promise<void>`, mutates the receiver (unsafe on singleton) | `Promise<SupaLitePG<T>>`, returns a scoped handle; receiver untouched |
| `commit()` / `rollback()` | operate on the receiver; silent no-op if no tx | operate on the handle; **throw** if no active tx |
| `begin()` while a tx is open | (n/a on singleton) | **throws** `nested transactions are not supported` |
| `transaction(cb)` | connection-scoped, safe | **unchanged** |

### Errors

- `commit()`/`rollback()` with no active transaction →
  `Error: no active transaction — call begin() to obtain a transaction handle`.
- `begin()` on an instance already in a transaction →
  `Error: nested transactions are not supported`.
- BEGIN/COMMIT/ROLLBACK driver failure → the connection is `release(err)`d once (pg
  discards it) and the original error propagates.

### Lifecycle / release

- The handle's connection is returned to the pool on `commit()`, on `rollback()`, and is
  not held after either. A mid-transaction exception is the caller's responsibility to
  `rollback()` (manual API); `transaction(cb)` remains the auto-release option.

## Migration (breaking)

```diff
- await db.begin();
- await db.from('t').insert(row);
- await db.commit();
+ const tx = await db.begin();
+ await tx.from('t').insert(row);
+ await tx.commit();
```

For fully-managed transactions, prefer `transaction(cb)` (unchanged):
```ts
await db.transaction(async (tx) => {
  await tx.from('t').insert(row);
});
```
