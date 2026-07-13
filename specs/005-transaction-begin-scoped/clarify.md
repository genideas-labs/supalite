# Clarifications: `begin()/commit()/rollback()` scoped (005)

Session 2026-07-13 — decisions confirmed to the recommended option.

| # | Question | Decision |
|---|----------|----------|
| 1 | `begin()` return type | **`Promise<SupaLitePG<T>>`** — return the `SupaLitePG<T>` scope that `createTransactionScope()` already produces. `tx.from()/.rpc()` work identically to `transaction(cb)`'s callback arg; no new type; minimal implementation. (Nesting is prevented at runtime by the guard below, not by the type.) |
| 2 | Guards (misuse) | **Throw, explicitly.** `commit()`/`rollback()` with no active transaction throw `no active transaction — call begin() to obtain a transaction handle`. `begin()` on an instance that already has an active transaction throws `nested transactions are not supported`. Breaking (was a silent no-op / would have created a nested scope), maintainer-approved; surfaces mistakes immediately. |
| 3 | Method naming | Keep public names **`begin` / `commit` / `rollback`** (maintainer requirement). The instance-mutating plumbing moves to **private** methods (`private async startTx/commitTx/rollbackTx`), invoked only on a fresh scope. `private` keyword (not `#`) for consistency with the codebase (`private createTransactionScope`) and so existing `privateOf(...)` test introspection still works. |
| 4 | `transaction(cb)` | **Unchanged behavior.** Internally rewired to call the private plumbing (`startTx`/`commitTx`/`rollbackTx`) on its scope instead of the now-repurposed public `begin()`. Rollback-failure-never-masks-original-error preserved. |
| 5 | Versioning | **Breaking → 0.13.0.** `begin()` return type changes `Promise<void>` → `Promise<SupaLitePG<T>>`; `commit/rollback/begin` guards now throw. Manual API confirmed unused downstream. |

Result: `const tx = await db.begin(); … await tx.commit()` is safe on a shared
singleton; the singleton is never mutated. `@deprecated "not concurrency-safe"`
notes on the three methods are removed (they are now the safe manual API).
