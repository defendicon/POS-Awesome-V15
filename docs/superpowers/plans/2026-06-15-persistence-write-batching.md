# Persistence Write Batching Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant JSON cloning and batch legacy memory persistence into grouped Dexie `bulkPut()` operations without weakening offline correctness.

**Architecture:** `persist()` coalesces latest values per key and flushes one batch through the persistence worker. The worker and worker-less fallback share table routing and grouped bulk-write semantics; lightweight localStorage mirrors remain synchronous on the main thread.

**Tech Stack:** TypeScript, Web Workers, Dexie 4, IndexedDB, Vitest, fake-indexeddb

---

## Chunk 1: Regression Coverage

### Task 1: Define persistence batching behavior

**Files:**
- Create: `frontend/tests/offlinePersistenceBatching.spec.ts`
- Modify: `frontend/tests/offlineKeyMapParity.spec.ts`

- [x] Add a fake worker test proving repeated writes coalesce into one batch.
- [x] Prove the worker message retains structured-clone-native values.
- [x] Prove localStorage mirrors are updated on the main thread.
- [x] Prove worker-less writes use grouped `bulkPut()` calls.
- [x] Prove worker errors switch later writes to direct fallback.
- [x] Add worker source assertions for `persist_batch` and `bulkPut()`.
- [x] Run the focused tests and confirm they fail for the missing behavior.

## Chunk 2: Main-Thread Persistence Coordinator

### Task 2: Replace per-call cloning and writes

**Files:**
- Modify: `frontend/src/offline/db.ts`
- Modify: `frontend/src/offline/index.ts`

- [x] Add a per-key pending write map and microtask scheduler.
- [x] Move localStorage mirroring ahead of worker dispatch.
- [x] Send one native-cloned `persist_batch` message per flush.
- [x] Add grouped, serialized Dexie fallback writes.
- [x] Add worker acknowledgement/error handling and ordered fallback replay.
- [x] Export a deterministic flush helper for lifecycle use and tests.
- [x] Run focused tests until green.

## Chunk 3: Worker Bulk Persistence

### Task 3: Batch writes inside the worker

**Files:**
- Modify: `frontend/src/posapp/workers/itemWorker.js`

- [x] Make database initialization awaitable by message handlers.
- [x] Replace single-key persistence with table-grouped batch persistence.
- [x] Use one `bulkPut()` per physical table.
- [x] Retain row-by-row fallback only after a failed bulk write.
- [x] Return explicit success/failure messages with batch IDs.
- [x] Run persistence and parity tests until green.

## Chunk 4: Full Verification

### Task 4: Verify linked offline behavior

**Files:**
- Modify: `docs/superpowers/plans/2026-06-15-persistence-write-batching.md`

- [x] Run focused persistence, startup hydration, cache, queue, and outbox tests.
- [x] Run the full frontend unit suite.
- [x] Run frontend type-check.
- [x] Run frontend lint.
- [x] Run the production build.
- [x] Run `git diff --check`.
- [x] Document residual risks and the suggested commit message.
