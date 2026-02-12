# POS Awesome V15 - Detailed Improvement Audit

Prepared: 2026-02-12  
Scope: `frontend/` + `posawesome/` with focus on POS boot flow, routing, service worker, offline/IndexedDB architecture, quality gates, and maintainability.

## 1) Executive Summary

This repo has strong functionality coverage, but there are architectural mismatches that can cause intermittent POS startup failures and hard-to-debug offline behavior.

Highest-impact issues found:

1. POS boot can get stuck at `/app/posapp` when the bundle fails to load or stale assets are served.
2. `/app/posapp/pos` does not reliably auto-open when Frappe page boot is bypassed; current loader tries to normalize this, but only if latest loader is actually running.
3. Offline storage layer is split across `offline/db.ts` and `offline/core.ts` with conflicting behavior and APIs.
4. Worker key-table mapping is inconsistent with queue keys (`offline_cash_movements` missing in worker map).
5. Service worker precache references an outdated bundle filename (`posawesome.umd.js`) that is not produced by current Vite build.
6. Health-check contract mismatch (`checkDbHealth`) makes storage safety logic unreliable.

## 2) Why POS Gets Stuck on `/app/posapp`

### What should happen

- Frappe page `posapp` loads and waits for `frappe.PosApp.posapp` class:
  - `posawesome/posawesome/page/posapp/posapp.js:11`
  - `posawesome/posawesome/page/posapp/posapp.js:71`
  - `posawesome/posawesome/page/posapp/posapp.js:84`
- Frontend router base is `/app/posapp`, and route `/` redirects to `/pos`:
  - `frontend/src/posapp/router/index.ts:5`
  - `frontend/src/posapp/router/index.ts:49`

### Why it fails sometimes

1. If bundle import fails (stale chunks/service worker/cache mismatch), `frappe.PosApp.posapp` never becomes available.  
   Then `waitForPosApp()` times out and page stays effectively stuck:
   - `posawesome/posawesome/page/posapp/posapp.js:11`
   - `posawesome/posawesome/page/posapp/posapp.js:23`
   - `posawesome/posawesome/page/posapp/posapp.js:73`

2. Loader normalization (`/app/posapp/anything` -> `/app/posapp`) only works when current loader is running:
   - `frontend/src/loader.ts:12`
   - `frontend/src/loader.ts:22`
   - `frontend/src/loader.ts:28`
   If old/cached loader is active, deep URL behavior can still break.

3. Service worker precache targets `posawesome.umd.js`, but build outputs `posawesome.js`:
   - `posawesome/www/sw.js:8`
   - `frontend/vite.config.js:67`
   - `posawesome/public/dist/js/posawesome.js` (exists)
   This mismatch increases risk of stale/offline boot failures.

## 3) Why Manually Opening `/app/posapp/pos` Sometimes Does Not Start

Short answer: because POS boot is Frappe-page driven, not pure Vue-route driven.

- Frappe page boot entry point is `/app/posapp`; deep path can bypass page init in some scenarios.
- Loader tries to force normalization back to `/app/posapp`:
  - `frontend/src/loader.ts:22`
  - `frontend/src/loader.ts:28`
- If the loader/bundle is stale or fails, manual deep path still won't boot Vue app.

So `/app/posapp/pos` is not the primary reliable entry; `/app/posapp` should initialize first, then router redirects to `/pos`.

## 4) Priority Improvement Backlog

## P0 (Do First - Stability)

### P0.1 Fix service worker precache bundle mismatch

- Problem: SW precaches `/assets/posawesome/dist/js/posawesome.umd.js` which is no longer built.
- Evidence:
  - `posawesome/www/sw.js:8`
  - `frontend/vite.config.js:67`
- Action:
  - Replace precache entry with `/assets/posawesome/dist/js/posawesome.js`.
  - Add a boot-critical asset validation check during SW install and log explicit failure.

### P0.2 Unify offline persistence architecture

- Problem: repo uses both `offline/db.ts` and `offline/core.ts` as persistence authorities.
- Evidence:
  - `frontend/src/offline/index.ts:1` exports `./db`
  - `frontend/src/offline/cache.ts:1` imports from `./db`
  - `frontend/src/offline/items.ts:2` imports from `./core`
  - `frontend/src/offline/coupons.ts:2` imports from `./core`
  - `frontend/src/offline/item_groups.ts:2` imports from `./core`
- Action:
  - Choose one canonical module (`core.ts` recommended because it includes table-map, lock, recovery).
  - Repoint `offline/index.ts` exports and migrate all imports.
  - Keep one `memory`, one `persist`, one `checkDbHealth`.

### P0.3 Align worker and app table mapping keys

- Problem: worker `KEY_TABLE_MAP` lacks `offline_cash_movements`.
- Evidence:
  - Missing in `frontend/src/posapp/workers/itemWorker.js:155`
  - Present in core map: `frontend/src/offline/core.ts:151`
- Impact: queue restore/persist paths can drift.
- Action:
  - Add `offline_cash_movements: "queue"` in worker map.
  - Add a key parity test between worker map and app map.

### P0.4 Fix health-check return contract

- Problem: `checkDbHealth` from `db.ts` returns no boolean.
- Evidence:
  - `frontend/src/offline/db.ts:248`
  - Expected boolean usage: `frontend/src/posapp/composables/pos/items/useItemStorageSafety.ts:27`
- Action:
  - Make `checkDbHealth` return strict boolean in canonical module.
  - Remove `Boolean(await (checkDbHealth() as Promise<unknown>))` casting workaround.

## P1 (High Value - Reliability + Observability)

### P1.1 Remove dead legacy sync path or integrate explicitly

- `frontend/src/offline/sync.ts` appears legacy and disconnected from active imports.
- Evidence:
  - File exists with full duplicate sync logic: `frontend/src/offline/sync.ts:1`
  - No active imports found in frontend sources.
- Action:
  - Either remove file or explicitly route all sync through it.
  - Avoid dual implementations (`invoices.ts`, `payments.ts`, `cash_movements.ts` vs `sync.ts`).

### P1.2 Implement real cache usage estimate

- `getCacheUsageEstimate()` currently returns hardcoded zeros.
- Evidence:
  - `frontend/src/offline/cache.ts:574`
  - UI consumes it in layout: `frontend/src/posapp/layouts/DefaultLayout.vue:523`
- Action:
  - Compute IndexedDB estimate (table counts/size heuristic) and localStorage byte usage.
  - Surface confidence + fallback behavior.

### P1.3 Add POS boot diagnostics

- Current bootstrap failure message is generic.
- Evidence:
  - `posawesome/posawesome/page/posapp/posapp.js:54`
- Action:
  - Show reason buckets: `bundle-load-failed`, `router-mount-failed`, `db-init-failed`, `sw-stale-assets`.
  - Emit structured logs to help support/debugging.

## P2 (Quality/Velocity)

### P2.1 Strengthen CI test gates

- CI currently builds app/site but does not clearly run frontend unit/smoke suites in `ci.yml`.
- Evidence:
  - `.github/workflows/ci.yml:96` ends at build/list apps in shown workflow segment.
- Action:
  - Add `vitest` for critical offline/boot tests.
  - Add minimal e2e smoke for `/app/posapp` boot and route to `/pos`.

### P2.2 Continue TS hardening

- 37 `@ts-ignore/@ts-nocheck` markers.
- Evidence:
  - Count scan on `frontend/src`: 37
  - TS settings still permissive:
    - `frontend/tsconfig.json:17` (`allowJs: true`)
    - `frontend/tsconfig.json:18` (`checkJs: false`)
    - `frontend/tsconfig.json:19` (`noImplicitAny: false`)
- Action:
  - Remove suppressions from P0/P1 paths first (`offline`, boot flow, router).
  - Gradually tighten TS config behind CI thresholds.

## 5) IndexedDB/Offline Refactor Plan (Detailed)

Goal: single source of truth, deterministic persistence, safe migrations.

### Phase A - Canonical contracts

Define one module for:

- `memory` shape
- `persist(key, value?)`
- `checkDbHealth(): Promise<boolean>`
- `initPromise`
- `tableForKey()`, `KEY_TABLE_MAP`

Recommended base: `frontend/src/offline/core.ts` (already has mapping + recovery).

### Phase B - Import convergence

- Update `frontend/src/offline/index.ts` to export canonical module only.
- Move all `offline/*` modules off `./db` or `./core` split usage.
- Keep compatibility shim temporarily if needed to avoid broad breakage.

### Phase C - Worker parity + schema integrity

- Ensure worker map equals app map.
- Ensure queue keys (`offline_invoices`, `offline_customers`, `offline_payments`, `offline_cash_movements`) all mapped consistently.
- Add parity test that fails CI on map drift.

### Phase D - Initialization and recovery consistency

- One init path only.
- Deterministic restore order:
  1. canonical table
  2. `keyval` fallback (if legacy)
  3. localStorage fallback (for non-large keys only)
- Remove divergent behavior where one path reads only `keyval` and another writes mapped tables.

### Phase E - Health checks and fallback mode

- `checkDbHealth()` returns strict boolean.
- If unhealthy:
  - controlled recovery (reopen -> optional recreate)
  - explicit app state transition to online-only mode
  - user-facing actionable message

### Phase F - Tests

Add targeted tests for:

- DB open/reopen/recovery
- map parity (app vs worker)
- queue persist/restore for all queue keys
- migration from legacy stores
- boot path from `/app/posapp` and deep path normalization

## 6) Suggested Work Sequence

1. Fix SW precache bundle mismatch.  
2. Unify offline persistence (`db.ts` vs `core.ts`).  
3. Fix worker key map parity (include `offline_cash_movements`).  
4. Normalize health-check contract + remove casting workaround.  
5. Remove/merge legacy `offline/sync.ts`.  
6. Add tests and CI gates for boot + offline consistency.  

## 7) Effort Estimate

- P0: 2-4 days (high leverage, medium risk due storage migration touchpoints)
- P1: 2-3 days
- P2: 3-7 days (can be incremental)

## 8) Risk Notes

- Any offline schema/persistence refactor can affect existing browser data.
- Use migration-safe approach:
  - keep backward compatibility for one release
  - add one-time migration telemetry/logging
  - provide admin/user recovery command (clear/rebuild cache) as fallback

## 9) Quick Wins You Can Start Immediately

1. Update `sw.js` precache bundle path (`posawesome.umd.js` -> `posawesome.js`).  
2. Add `offline_cash_movements` to worker `KEY_TABLE_MAP`.  
3. Make `checkDbHealth()` return boolean consistently and remove unsafe cast call sites.  
4. Add a boot error code in `posapp.js` timeout handler to speed support triage.  

---

If you approve, next step is implementation in P0 order with small, reviewable commits and tests after each change.
