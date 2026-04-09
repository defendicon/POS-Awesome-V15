# POS Unified Offline Sync And Action Surfaces Design

**Date:** 2026-04-09

**Goal:** Define a scalable offline data sync architecture for POS Awesome and a cleaner action-surface model so offline, sync, cache, and maintenance controls do not overload the main menu.

## Problem

POS Awesome now has enough offline behavior that ad hoc cache fetches and one-off menu actions are no longer sufficient.

Current issues:

- offline prerequisite data is growing across multiple domains
- cache refresh behavior is fetch-on-use and inconsistent across datasets
- the main menu is already responsible for too many unrelated actions
- future sync and maintenance actions would make the menu harder to understand
- "offline sales sync" and "offline data refresh" are conceptually different but would look similar if both lived in the same menu

## Scope

This design covers:

- a unified frontend sync architecture for offline-capable datasets
- dataset classification for full delta sync, scoped sync, and on-demand cache
- backend delta API contract requirements
- offline/sync/cache information architecture for menu, status, and settings surfaces
- stale policy, error handling, diagnostics, and testing expectations

This design does **not** yet cover:

- invoice/payment queue protocol redesign
- server-side idempotency for every offline write path
- command palette implementation
- final UI implementation details for each new screen

## Design Summary

POS Awesome should adopt a **hybrid offline architecture**:

- canonical business data should background-sync with delta updates
- derived/runtime data should remain on-demand, but use durable cached fallbacks
- the main menu should stay focused on frequent cashier actions
- sync, stale state, cache repair, and diagnostics should move into a dedicated offline/status surface

This gives better offline reliability without turning app boot or the cashier menu into a bottleneck.

## Sync Architecture

### Coordinator

Introduce a `SyncCoordinator` as the single runtime orchestrator for offline data refresh.

Responsibilities:

- react to app boot, online resume, tab focus, profile change, and manual refresh triggers
- schedule resources by priority
- dedupe concurrent sync runs
- apply retry/backoff
- maintain per-resource sync state
- feed bootstrap readiness and stale warnings

The coordinator should orchestrate work, not contain domain-specific fetch logic.

### Resource Registry

Each syncable dataset should register metadata in a central registry.

Each resource definition should include:

- `id`
- `scope`
- `mode`: `delta`, `scoped`, or `on_demand`
- `priority`: `boot_critical`, `warm`, or `lazy`
- `trigger`: boot, online resume, timer, profile change, user action
- `storage_key` or IndexedDB target
- `watermark_type`
- `ttl`
- `full_resync_supported`

The registry becomes the single source of truth for how a dataset is fetched and refreshed.

### Resource Adapters

Each resource should implement a small adapter with:

- `loadSyncState`
- `fetchDelta` or `fetchScoped`
- `mergeChanges`
- `applyDeletes`
- `writeCache`
- `reportReadiness`

This keeps resource behavior isolated and testable.

### Sync State

Per-resource sync state should be stored locally with fields such as:

- `last_synced_at`
- `watermark`
- `last_success_hash`
- `last_error`
- `consecutive_failures`
- `scope_signature`
- `schema_version`

This state should be separate from the business data itself.

## Dataset Classification

### 1. Boot-Critical Delta Sync

These datasets should support background delta sync and directly affect stable offline boot:

- POS profile and profile flags
- company defaults relevant to POS
- payment methods and payment method currency mappings
- taxes and templates required by the active profile
- price list metadata
- available currencies
- active exchange-rate matrix
- item groups
- offers/coupons if bounded to profile/company
- print template and receipt terms/settings

Missing data here should produce limited-mode warnings, not a frozen app shell.

### 2. Operational Delta Sync

These datasets should also delta-sync, but they are not all boot-blocking:

- items
- item prices
- stock
- customers
- sales persons
- warehouse-scoped operational settings

These resources may sync in larger chunked batches after first paint.

### 3. Scoped Sync

These datasets should sync only for the relevant scope instead of the whole universe:

- active company payment-account maps
- active profile exchange-rate pairs
- recent or active customer address data
- recent customer snapshots where business policy allows local durability

The rule is: sync the subset the POS actually uses.

### 4. On-Demand Derived Cache

These should **not** be globally pre-synced because they are server-derived or highly contextual:

- applicable delivery charges for a customer/profile/context
- customer-specific outstanding/unallocated balances
- gift-card live balances
- stored-value live balances
- heavily rule-driven per-customer runtime calculations

For these datasets:

- fetch when needed
- persist the result with scope + TTL
- use cached fallback when offline
- refresh on next online access

## Backend Delta API Contract

Each canonical syncable resource should expose a dedicated sync endpoint instead of reusing transactional APIs.

### Request

The client should send:

- `scope`
- `watermark`
- `limit`
- `schema_version`
- optional capability flags

### Response

The server should return:

- `changes`
- `deleted`
- `next_watermark`
- `has_more`
- optional `server_version`
- optional `full_resync_required`

### Watermark Strategy

Preferred order:

1. monotonic change sequence
2. modified timestamp plus deterministic tie-breaker id

Timestamp-only sync without delete support is insufficient for a reliable offline system.

### Delete Handling

Every delta endpoint must support deletions through tombstones or deleted ids. Otherwise stale local data will accumulate indefinitely.

## Runtime Flow

### Phase 0: Boot Gate

- validate current bootstrap snapshot
- open app immediately if boot-critical data is sufficiently available
- do not block first paint on large background syncs

### Phase 1: Warm Sync

Immediately after boot, sync small critical resources:

- bootstrap config
- payment method currencies
- currencies and exchange-rate scope
- price list metadata
- offers/coupons

### Phase 2: Heavy Delta Sync

Then chunk larger resources:

- items
- item prices
- stock
- customers

These should run with limited concurrency and batch sizes.

### Phase 3: Event-Driven Sync

Coordinator triggers should include:

- browser online
- tab focus/resume
- POS profile/company change
- opening shift start
- successful manual refresh
- scheduled background interval

### Phase 4: On-Demand Enrichment

Specific contextual fetches remain user-flow-driven:

- customer address lookup
- applicable delivery charges
- dynamic payment account mappings if stale
- exchange-rate path recalculation when selected currency changes

## Performance Constraints

The system should avoid slowing POS startup or interaction.

Required guardrails:

- first paint must not wait for full sync
- low concurrency for background resource runs
- chunked writes for large datasets
- duplicate trigger deduplication
- cooldown windows for heavy resources
- pause or deprioritize heavy sync when tab is hidden
- exponential backoff on repeated failures

If these constraints are followed, the unified sync system should improve reliability without making the POS feel heavy.

## Action Surface Information Architecture

The current menu should not keep absorbing more system and maintenance actions.

### Main Menu

The main menu should remain a **cashier launcher**, not a storage room for all controls.

It should contain only frequent, operator-facing actions such as:

- Switch Cashier
- Lock Screen
- Sync Offline Sales
- Close Shift
- Settings

### Status / Offline Panel

Offline and sync controls should move behind the status indicator into a dedicated panel.

This panel should own:

- offline data freshness summary
- stale resource warnings
- last sync timestamps
- Refresh Offline Data
- Rebuild Offline Data
- diagnostics entry point

This prevents confusion between:

- `Sync Offline Sales`
- `Refresh Offline Data`

### Settings / Tools Surface

Low-frequency maintenance actions should live in settings/tools, not the main menu:

- Clear Cache
- QZ Tray setup
- language
- theme
- terminal maintenance

### Supervisor Surface

Restricted controls should stay separated from cashier actions and remain grouped by supervisor intent.

### Future Growth Rule

New actions should be placed according to usage pattern:

- repeated cashier action -> main menu or inline action
- sync/cache/health action -> status panel
- contextual task action -> relevant screen
- maintenance/repair action -> settings/tools
- rare expert action -> future command palette or supervisor tools

## Error Handling And Staleness

Every resource should maintain a visible state:

- `idle`
- `syncing`
- `fresh`
- `stale`
- `error`
- `limited`

Stale policy should be per-resource, not global.

Important distinction:

- `usable stale`: warn but continue
- `unsafe stale`: limited mode or feature restriction

Boot-critical gaps should degrade gracefully with warning-based limited mode rather than blank-screen failure.

## Diagnostics And Repair

The offline/status system should eventually expose:

- per-resource last sync time
- stale/error state
- counts stored locally
- current profile/company scope
- build/schema version
- pending offline queue counts

Manual repair actions should include:

- Refresh Offline Data
- Rebuild Offline Data
- Clear Cache
- View Sync Diagnostics

## Testing Strategy

### Unit

- adapter merge logic
- delete/tombstone handling
- watermark advancement
- TTL and stale-state evaluation

### Integration

- online delta update refreshes local storage
- delete events remove local rows
- profile/company change invalidates mismatched scoped resources
- limited mode remains usable when non-fatal prerequisites are stale

### Browser / Smoke

- warm cache -> offline boot works
- backend change -> online resume refreshes local cache
- same browser session without hard cache clear
- weak network and partial sync behavior

### Migration

- old cache shape to new schema/resource state
- incompatible resource schema triggers full resync

## Rollout

Recommended rollout order:

1. add SyncCoordinator skeleton and resource registry
2. migrate existing prerequisite caches into resource adapters
3. add status/offline panel and move sync/cache actions there
4. implement backend delta endpoints for boot-critical resources
5. extend heavy operational datasets
6. add diagnostics and repair tooling

## Success Criteria

The design is successful when:

- POS boots reliably from cached shell and prerequisites
- backend canonical data updates can flow into local storage without hard refreshes
- sync and cache actions are understandable and not confused with offline sales submission
- the main menu remains compact and cashier-focused
- future offline resources can be added through registry/adapters instead of one-off code paths
