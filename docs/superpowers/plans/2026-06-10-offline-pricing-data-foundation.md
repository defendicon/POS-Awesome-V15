# Offline Pricing Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Independently synchronize complete Item Price, Pricing Rule, and required multi-currency rate data into normalized offline storage without changing current cart pricing behavior.

**Architecture:** Add delta endpoints for Item Price and Pricing Rule masters, route them through dedicated frontend adapters, and expose read-only repository APIs over Dexie. Expand currency sync pair discovery from POS Profile, company, selling price lists, and payment methods while preserving existing cache consumers.

**Tech Stack:** Python/Frappe, TypeScript, Dexie 4, Vitest, unittest

---

## Chunk 1: Backend Sync Contracts

### Task 1: Item Price Delta Endpoint

**Files:**
- Create: `posawesome/posawesome/api/offline_sync/item_prices.py`
- Create: `posawesome/posawesome/api/test_offline_sync_item_prices.py`

- [x] Write failing tests for complete rows, pagination, and disabled/deleted tombstones.
- [x] Run the focused Python test and confirm the missing endpoint failure.
- [x] Implement the minimal scoped delta endpoint.
- [x] Run the focused Python test and confirm it passes.

### Task 2: Pricing Rule Delta Endpoint

**Files:**
- Create: `posawesome/posawesome/api/offline_sync/pricing_rules.py`
- Create: `posawesome/posawesome/api/test_offline_sync_pricing_rules.py`
- Modify: `posawesome/posawesome/api/pricing_rules.py`

- [x] Write failing tests for unfiltered customer/group rules, targets, and deletes.
- [x] Run the focused Python test and confirm failure.
- [x] Reuse shared normalization and implement the minimal delta endpoint.
- [x] Run pricing-rule tests and confirm they pass.

### Task 3: Multi-Currency Pair Discovery

**Files:**
- Modify: `posawesome/posawesome/api/offline_sync/currencies.py`
- Modify: `posawesome/posawesome/api/test_offline_sync_currencies.py`

- [x] Write failing tests for profile, company, price-list, and payment currencies.
- [x] Run the focused test and confirm the incomplete pair result.
- [x] Implement deterministic pair discovery and deduplication.
- [x] Run currency tests and confirm they pass.

## Chunk 2: Frontend Storage and Sync

### Task 4: Normalized Dexie Schema and Repositories

**Files:**
- Modify: `frontend/src/offline/db.ts`
- Create: `frontend/src/offline/repositories/ItemPriceRepository.ts`
- Create: `frontend/src/offline/repositories/PricingRuleRepository.ts`
- Create: `frontend/src/offline/repositories/index.ts`
- Create: `frontend/tests/offlinePricingRepositories.spec.ts`

- [x] Write failing repository tests for UOM/customer Item Prices and rule targets.
- [x] Run Vitest and confirm missing repository failures.
- [x] Add the versioned schema and minimal repository query APIs.
- [x] Run repository tests and confirm they pass.

### Task 5: Dedicated Sync Adapters

**Files:**
- Create: `frontend/src/offline/sync/adapters/itemPrices.ts`
- Create: `frontend/src/offline/sync/adapters/pricingRules.ts`
- Modify: `frontend/src/offline/sync/adapters/index.ts`
- Create: `frontend/tests/offlinePricingSyncAdapters.spec.ts`

- [x] Write failing tests for change upserts, tombstones, and full-resync status.
- [x] Run Vitest and confirm missing adapter failures.
- [x] Implement adapter transactions and sync-state persistence.
- [x] Run adapter tests and confirm they pass.

### Task 6: Resource Registration and Routing

**Files:**
- Modify: `frontend/src/offline/sync/types.ts`
- Modify: `frontend/src/offline/sync/resourceRegistry.ts`
- Modify: `frontend/src/offline/sync/resourceRunner.ts`
- Modify: `frontend/tests/offlineSyncResourceRunner.spec.ts`

- [x] Replace the mirrored Item Price test with failing independent routing tests.
- [x] Add a failing Pricing Rule routing test.
- [x] Implement resource registration and endpoint routing.
- [x] Run runner tests and confirm they pass.

### Task 7: Currency Pair Request Context

**Files:**
- Modify: `frontend/src/offline/sync/resourceRunner.ts`
- Modify: `frontend/src/offline/sync/adapters/currencyMatrix.ts`
- Modify: `frontend/tests/offlineSyncResourceRunner.spec.ts`

- [x] Write a failing test proving the full profile currency context is passed.
- [x] Add the minimal profile fields and request payload.
- [x] Run the focused frontend test and confirm it passes.

## Chunk 3: Regression Verification

### Task 8: Focused and Existing Suites

- [x] Run all new backend offline-sync tests.
- [x] Run all new frontend tests.
- [x] Run existing offline sync, pricing-rule store, pricing engine, and currency tests.
- [x] Run frontend type-check.
- [x] Review the diff for accidental cart/invoice behavior changes.
