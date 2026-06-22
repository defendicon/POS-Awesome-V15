# Startup Storage Hydration Design

## Problem

The offline memory initializer opens Dexie and then performs one awaited `get`
per memory key, with a second `keyval` lookup for mapped keys that miss. The
initializer is scheduled through `requestIdleCallback`, but the boot controller
awaits it before declaring the application ready. This makes all cache
hydration part of the startup gate and scales poorly as keys or payloads grow.

## Design

Split storage readiness into two contracts:

- `startupInitPromise` hydrates only small state required by the boot path:
  manual-offline state, bootstrap/build metadata, cache readiness flags, and
  invoice outbox mode. It starts immediately instead of waiting for idle time.
- `initPromise` remains the backward-compatible full-memory readiness contract.
  It hydrates remaining keys during idle time, and existing cache-dependent
  consumers continue awaiting it.

Both contracts use one grouped `bulkGet` per physical Dexie table. Missing
mapped records are fetched from `keyval` in one fallback `bulkGet`, preserving
legacy migrations. `localStorage` remains the final fallback only for unresolved
keys.

Build-cache reconciliation remains owned by the pre-mount `posapp.ts` boot
module. The initial pass defers writing a first-build baseline until full memory
has been inspected. A registered post-hydration task performs the second pass,
preserving legacy detection that depends on non-critical cached values without
putting those large values back on the boot controller's critical path or the
lazy-loaded layout chunk.

## Safety

- Dexie remains authoritative over `localStorage`.
- Existing `initPromise` consumers retain full-hydration semantics.
- POS Profile/opening, queue, item, pricing, stock, payment, print, and customer
  caches are not read before their existing full-readiness guards.
- Writes made while background hydration is running must not be overwritten by
  an older value read from IndexedDB.
- Initialization errors remain non-fatal and leave declared memory defaults in
  place.

## Verification

- Prove startup readiness resolves before the idle full-hydration callback.
- Prove grouped reads replace per-key `get` calls.
- Prove mapped-table, legacy `keyval`, and `localStorage` precedence.
- Prove a concurrent memory write wins over stale background hydration.
- Run focused storage/boot tests, frontend type checking, and the frontend unit
  suite.
