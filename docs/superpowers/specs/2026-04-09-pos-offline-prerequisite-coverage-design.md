# POS Offline Prerequisite Coverage Design

## Context

The initial offline bootstrap phase is complete:

- bootstrap snapshot persistence exists
- startup validation exists
- limited mode and mismatch confirmation exist
- opening/profile flows now stamp build and profile metadata

The remaining gap is prerequisite coverage. The current snapshot can validate the
shell and opening/profile ownership, but it still under-represents the real
offline state of the POS app. Several caches and readiness signals already exist
in the codebase, but they are not yet folded into a central bootstrap
recomputation path.

That creates two problems:

- startup warnings can be incomplete or misleading
- profile changes can still leave some offline data stale even when opening and
  core profile metadata are refreshed

## Goals

- Expand bootstrap prerequisite coverage to include all practical POS
  prerequisites already supported by the app.
- Centralize prerequisite readiness derivation so startup decisions are based on
  one normalized source of truth.
- Refresh the snapshot from cache state at major orchestration points rather
  than scattering ad hoc prerequisite logic across the app.
- Improve profile-switch correctness by making the snapshot reflect which caches
  are still reusable and which are incomplete.
- Keep current route architecture and startup flow unchanged.

## Non-Goals

- Full queue/idempotency redesign
- Full standalone route migration
- Immediate UI enforcement for every capability on every screen
- Global cache architecture rewrite

## Current State Assessment

The codebase already has usable offline sources for many prerequisites:

- opening/profile seed and current-user validation
- customer storage and profile-scope isolation
- scoped item storage by profile + warehouse
- pricing snapshot/context
- tax inclusive setting cache
- print template and terms cache
- offers and coupons cache
- item group cache
- stock readiness signal

However, these sources are not centrally recomputed into the bootstrap snapshot.
Some are profile-safe, and some are currently global or only partially isolated.

Practical result today:

- opening/profile ownership is reasonably protected
- customer and item caches are mostly safer on profile change
- offers, tax, stock, print, and related readiness can still remain stale or
  under-reported in the snapshot

## Recommended Approach

Use a central prerequisite collector plus a central snapshot refresh helper.

### Why this approach

- keeps readiness logic in one place
- avoids duplicating prerequisite rules in many write paths
- makes tests straightforward
- lets existing cache modules stay focused on data persistence
- reduces risk of missed edge cases during future offline work

## Prerequisite Model

The bootstrap snapshot will continue to store prerequisite states as:

- `ready`
- `missing`
- `stale`
- `error`

This chunk will primarily use `ready` and `missing`, with `stale/error`
reserved for places where the code already has a concrete signal.

### Prerequisites included in this phase

- `pos_profile`
- `pos_opening_shift`
- `payment_methods`
- `sales_persons`
- `items_cache_ready`
- `customers_cache_ready`
- `item_groups`
- `pricing_rules_snapshot`
- `pricing_rules_context`
- `tax_inclusive`
- `print_template`
- `terms_and_conditions`
- `offers_cache`
- `coupons_cache`
- `stock_cache_ready`

## Ownership Boundaries

### Bootstrap module owns

- prerequisite names
- readiness rules
- capability derivation
- snapshot recomputation

### Cache/storage modules own

- actual cached data
- persistence details
- low-level getters/setters

### Orchestration points own

- deciding when to refresh the snapshot
- calling the central recompute helper after meaningful cache/profile changes

This keeps bootstrap logic centralized and prevents custom readiness logic from
drifting across the codebase.

## Recompute Flow

Two central helpers should exist in `frontend/src/offline/bootstrapSnapshot.ts`
or a tightly related helper file.

### `collectBootstrapPrerequisites()`

Reads the current cached state and returns a normalized prerequisite map.

Expected inputs come from existing offline utilities such as:

- opening/profile cache
- customers loaded state or customer storage count
- item storage count and/or scope-aware cached item presence
- item group cache
- pricing snapshot/context cache
- tax inclusive setting cache
- print template and terms cache
- offers cache
- coupons cache
- stock readiness cache

### `refreshBootstrapSnapshotFromCaches(context)`

Reads the current snapshot, merges current metadata, recomputes prerequisites,
then persists the updated snapshot.

Expected metadata inputs:

- current build version
- current active POS profile
- current active opening shift
- current session user

## Refresh Trigger Points

The snapshot should refresh at major orchestration points, not every tiny setter.

Expected trigger points:

- opening shift registration / restore
- active POS profile refresh
- item sync completion
- customer cache load/sync completion
- item group load/cache save
- pricing snapshot save
- offers fetch/cache save
- coupons fetch/cache save
- tax inclusive refresh
- print template / terms refresh
- stock readiness initialization

This avoids recompute storms while still keeping the snapshot current after
meaningful state changes.

## Capability Mapping

### `canSellOffline`

Hard requirements:

- `pos_profile`
- `pos_opening_shift`
- `payment_methods`
- `items_cache_ready`
- `customers_cache_ready`

### `canApplyPricingOffline`

Hard requirements:

- `pricing_rules_snapshot`
- `pricing_rules_context`
- `tax_inclusive`

### `canPrintOffline`

Hard requirements:

- `print_template`
- `terms_and_conditions`

### `canUseOffersOffline`

Hard requirements:

- `offers_cache`
- `coupons_cache`

### `canUseCustomerDisplayOffline`

Hard requirements:

- `pos_opening_shift`
- `items_cache_ready`

## Warning-Only vs Hard-Blocking Prerequisites

This phase should distinguish between:

- startup-critical prerequisites
- warning-critical prerequisites

### Startup-critical in this phase

- `pos_profile`
- `pos_opening_shift`
- `payment_methods`
- `items_cache_ready`
- `customers_cache_ready`
- pricing requirements for pricing capability
- print requirements for print capability
- offers/coupons requirements for offers capability

### Warning-critical in this phase

- `sales_persons`
- `item_groups`
- `stock_cache_ready`

Reason:

- these are important for correctness and operator confidence
- but they should not immediately hard-block offline selling in this chunk
- many deployments treat them as degraded-mode signals rather than boot blockers

## Profile Change Semantics

This phase should explicitly improve the visibility of profile-switch safety.

Observed behavior today:

- opening restore is user-safe
- customer cache is profile-isolated
- item cache is scope-isolated by profile + warehouse
- some caches remain effectively global or partially isolated

Design implication:

- do not assume a profile change makes all offline caches valid
- recompute the snapshot from actual cache state after profile refresh
- surface missing or reused prerequisites explicitly through the warning model

This means the app can still open when safe enough, but it will no longer imply
that every cache is fully current for the new profile.

## Error Handling

- snapshot refresh failures must not break the original cache write
- errors should log and leave the previous snapshot in place
- startup validation should continue to degrade into limited/warning behavior
  instead of crashing

## Testing Plan

Add focused tests for:

- central prerequisite collection across all covered prerequisites
- capability derivation with expanded rules
- warning-only prerequisites not hard-blocking `canSellOffline`
- profile/build metadata retained during recompute
- recompute helper updating snapshot after major cache changes

Existing green tests must stay green:

- bootstrap snapshot tests
- opening cache tests
- offline key map parity tests
- startup hardening tests

## Risks

- some readiness sources may not be available from pure cache helpers
- current global caches may produce warnings more often than expected
- wiring too many triggers at once can create redundant recompute calls

## Mitigations

- centralize prerequisite reads first
- keep trigger points at orchestration boundaries
- keep warning-only prerequisites non-blocking in this phase
- verify with focused tests before broad UI wiring

## Decision Summary

Approved decisions:

- use central recomputation, not scattered direct prerequisite writes
- include all practical prerequisites in this phase
- keep startup-critical and warning-critical prerequisites separate
- strengthen capability derivation but avoid broad UI disablement in this chunk
- use the recomputed snapshot to make profile-switch safety visible rather than
  pretending all offline caches update perfectly
