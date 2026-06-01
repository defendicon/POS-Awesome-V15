# POS Local Snapshot Boot Architecture

Date: 2026-06-01

This document describes the implemented local-first POS boot architecture. It is not a future design note; it matches the code in this branch.

## Authority

`frontend/src/posapp/stores/bootReadinessStore.ts` is the single frontend authority for true sell-ready state.

It owns:

- boot phase
- local snapshot manifest state
- boot-critical resource matrix
- blocking resource detection
- sell-ready source
- local/fresh sell-ready timestamps
- background refresh state
- `pos.boot.sell_ready` completion

`frontend/src/posapp/posapp.ts` no longer emits `pos.boot.sell_ready` from router readiness. It only emits `pos.boot.shell_visible` after the shell mounts.

## Sell-Ready Definition

The terminal is sell-ready only when all required resources are usable:

- POS profile exists.
- Payment methods exist on the active profile.
- Transaction currency exists.
- Multi-currency tenders have cached exchange-rate readiness.
- Local item lookup data exists for the active profile/warehouse scope.
- Cart pricing prerequisites, especially selling price list, are available.

Customers, offers, and pricing rules are tracked in the resource matrix but are non-blocking for sell-ready. This prevents huge customer datasets from delaying basic selling when a walk-in/customer-less flow is supported by the current app.

## State Model

The readiness store uses these phases:

- `initialising`
- `reading_local_snapshot`
- `local_snapshot_valid`
- `local_snapshot_missing`
- `local_snapshot_invalid`
- `local_sell_ready`
- `refreshing_remote`
- `fresh_sell_ready`
- `degraded_sell_ready`
- `blocked_no_valid_snapshot`
- `recovery_required`
- `failed`

Sell-ready source is one of:

- `local_valid_snapshot`
- `online_minimum_bootstrap`
- `degraded_cached_snapshot`

## Snapshot Manifest

The versioned manifest is implemented in `frontend/src/offline/localSnapshotManifest.ts` and persisted as `local_snapshot_manifest` in the existing Dexie `settings` store.

Manifest fields include:

- schema version
- compatibility signature
- POS profile/company/warehouse/price list identifiers
- base and transaction currency
- tender currencies
- generation ID
- created/updated/validated timestamps
- validity and stale policy
- feature flags
- per-resource readiness state

The compatibility signature includes build version, POS profile, profile modified timestamp, company, warehouse, price list, and currency. A mismatch invalidates the manifest for the current terminal context.

## Atomic Commit

`commitLocalSnapshotManifestAtomic()` writes the manifest through a Dexie transaction against the `settings` table. The manifest generation is only advanced in memory after the transaction succeeds.

This commit path does not touch:

- invoice outbox
- generic write queue
- offline invoices
- offline payments
- offline customers
- cash movement queue

Pending offline financial mutations are therefore isolated from snapshot rebuild/recovery.

## Local-First Boot Flow

1. `posapp.ts` mounts the minimal shell and emits `pos.boot.shell_visible`.
2. `DefaultLayout.vue` opens offline storage and queue state.
3. `bootReadinessStore.initialiseBoot()` reads the current manifest and local storage state.
4. Cached register/opening data is applied if present.
5. The store builds and validates a runtime manifest from current local data.
6. If the manifest is usable, the app emits `pos.boot.sell_ready` from the readiness store.
7. Background remote refresh starts without blocking the cashier.

## Cold Online Boot

If no valid local snapshot exists but the app is online and has an active POS profile, `DefaultLayout.vue` calls `refreshBootCriticalData()` with `blockUntilReady: true`.

That refresh uses existing sync infrastructure:

- boot-critical resource sync
- user-action warm resource sync when minimum bootstrap is required
- pricing rule refresh
- bootstrap snapshot re-evaluation

Sell-ready is only emitted after the readiness store sees the required local resources become usable.

## Offline Boot

When offline:

- a valid local snapshot can produce sell-ready,
- a stale but policy-usable snapshot produces degraded sell-ready,
- missing or incompatible critical resources produce `blocked_no_valid_snapshot`,
- no remote API is treated as a substitute for missing local data.

The UI and diagnostics can inspect the blocking resource and manifest status.

## Multi-Currency Policy

Single-currency selling requires the profile currency and payment methods.

Mixed-currency/multi-currency selling additionally requires cached exchange-rate readiness when any tender currency differs from the profile currency. Without that cache, `exchange_rates` becomes a blocking resource and the terminal is not marked sell-ready.

The existing payment conversion code remains unchanged. This architecture only prevents the boot system from claiming readiness before the cached currency prerequisites exist.

## Background Reconciliation

Remote refresh runs through existing sync adapters and then asks the readiness store to rebuild and atomically commit the manifest.

If a refresh fails:

- the previous valid local snapshot remains usable,
- the manifest is not advanced by a failed atomic commit,
- diagnostics show `remoteRefreshState: failure`,
- sell-ready remains true only if a previous local snapshot was already usable.

## Diagnostics

`frontend/src/posapp/components/performance/PerformanceDiagnostics.vue` now displays:

- true sell-ready state
- sell-ready source
- readiness phase
- blocking resource
- resource readiness matrix
- snapshot validity and generation
- local/fresh ready timestamps
- remote refresh state
- existing metric percentiles and latest events

The view remains gated by performance capture, developer mode, or `System Manager`.

## Metrics

The implementation adds or corrects:

- `pos.boot.shell_visible`
- `pos.boot.manifest_read`
- `pos.boot.manifest_validate`
- `pos.boot.snapshot_hydrate`
- `pos.boot.snapshot_rebuild`
- `pos.boot.local_sell_ready`
- `pos.boot.sell_ready`
- `pos.boot.remote_refresh_start`
- `pos.boot.remote_refresh_complete`
- `pos.boot.fresh_sell_ready`
- `pos.boot.degraded_sell_ready`
- `pos.boot.blocked_no_valid_snapshot`
- `pos.boot.critical_resource_wait`
- `pos.boot.index_hydrate`
- `pos.boot.index_rebuild`
- `pos.boot.reconciliation_apply`
- `pos.boot.snapshot_atomic_commit`

`pos.boot.sell_ready` is now owned by the readiness store and is no longer route-ready.
