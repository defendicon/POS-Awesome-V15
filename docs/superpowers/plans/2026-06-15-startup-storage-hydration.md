# Startup Storage Hydration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove full offline-cache hydration from the POS boot gate while preserving durable cache correctness and legacy fallbacks.

**Architecture:** Add an immediate critical-key readiness promise and retain the existing full readiness promise for cache-dependent flows. Hydrate keys with table-grouped Dexie `bulkGet` operations, then legacy `keyval` and `localStorage` fallbacks, while protecting concurrent writes from stale hydration.

**Tech Stack:** Vue 3, TypeScript, Dexie 4, Vitest, fake-indexeddb.

---

## Chunk 1: Storage Hydration

### Task 1: Specify readiness and grouped-read behavior

**Files:**
- Create: `frontend/tests/offlineStartupHydration.spec.ts`

- [x] Write a test proving startup readiness does not wait for the idle callback.
- [x] Write a test proving hydration performs one `bulkGet` per table and no serial `get`.
- [x] Write precedence tests for primary Dexie, legacy `keyval`, and `localStorage`.
- [x] Write a race test proving a concurrent persist is not overwritten.
- [x] Run the focused test and confirm the new assertions fail.

### Task 2: Implement split readiness

**Files:**
- Modify: `frontend/src/offline/db.ts`
- Modify: `frontend/src/offline/index.ts`

- [x] Add the boot-critical key list and grouped hydration helper.
- [x] Start critical hydration immediately.
- [x] Schedule remaining full hydration after critical readiness.
- [x] Keep `initPromise` as the full-readiness compatibility contract.
- [x] Track memory writes during hydration and skip stale assignments.
- [x] Run the focused test and confirm it passes.

## Chunk 2: Boot Integration

### Task 3: Use critical readiness at boot

**Files:**
- Modify: `frontend/src/posapp/posapp.ts`
- Modify: `frontend/src/posapp/layouts/DefaultLayout.vue`
- Test: `frontend/tests/bootControllerWorkflow.spec.ts`

- [x] Change `initPosStorage` to await only critical readiness.
- [x] Keep full hydration guarded inside mounted POS data flows.
- [x] Re-run centralized boot-owned build-cache reconciliation after full
  hydration to preserve legacy derived-cache detection.
- [x] Remove duplicate aliases/awaits that no longer add readiness.
- [x] Run focused boot, offline, and build-reconciliation tests.

## Chunk 3: Verification

### Task 4: Validate linked behavior

- [x] Run `yarn test:unit`.
- [x] Run `yarn type-check`.
- [x] Run `yarn build`.
- [x] Review the final diff for unrelated changes.
- [x] Document files changed, linked features, commands, risks, and a suggested
  commit message.
