# Architecture

## Overview

```
┌──────────────────────────────────────────────────────┐
│  Browser / Electron shell                            │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Vue 3 SPA  (src/posapp/)                       │ │
│  │  ┌──────────┐  ┌───────────┐  ┌─────────────┐  │ │
│  │  │ Pages /  │  │ Pinia     │  │ Composables │  │ │
│  │  │ Views    │◄─┤ Stores    │◄─┤ (business   │  │ │
│  │  │          │  │           │  │  logic)     │  │ │
│  │  └────┬─────┘  └─────┬─────┘  └──────┬──────┘  │ │
│  │       │              │               │          │ │
│  │       └──────────────┴───────────────┘          │ │
│  │                      │                          │ │
│  │       ┌──────────────▼──────────────┐           │ │
│  │       │  Services (src/posapp/      │           │ │
│  │       │  services/)                 │           │ │
│  │       │  api.ts · axios.ts ·        │           │ │
│  │       │  invoiceService · etc.      │           │ │
│  │       └──────────────┬──────────────┘           │ │
│  └──────────────────────│──────────────────────────┘ │
│                         │                             │
│  ┌──────────────────────▼──────────────────────────┐ │
│  │  Offline layer  (src/offline/)                  │ │
│  │  Dexie IndexedDB ← cache.ts ← bootstrapSnapshot │ │
│  │  SyncCoordinator → resource adapters            │ │
│  └──────────────────────┬──────────────────────────┘ │
└─────────────────────────│────────────────────────────┘
                          │  frappe.call() / axios
                 ┌────────▼────────┐
                 │  ERPNext v15    │
                 │  Frappe backend │
                 └─────────────────┘
```

## Module boundaries

### `src/posapp/`

The main application. Organised by concern:

| Folder | Role |
|---|---|
| `components/` | Vue single-file components — presentation only |
| `composables/` | Business logic and state orchestration via Composition API |
| `stores/` | Pinia stores — normalised, reactive global state |
| `services/` | Frappe API wrappers and axios client |
| `utils/` | Pure functions and stateless helpers |
| `types/` | TypeScript interfaces and ambient declarations |
| `layouts/` | Page-level shells (DefaultLayout with bootstrap/offline banner) |
| `router/` | Vue Router definition |
| `plugins/` | Vuetify, theme, QZ-Tray plugin setup |

### `src/offline/`

Offline-first infrastructure. Completely decoupled from Vue — runs in tests without a DOM.

| File/folder | Role |
|---|---|
| `db.ts` | Dexie database initialisation and raw table accessors |
| `cache.ts` | Typed read/write helpers over the Dexie tables |
| `bootstrapSnapshot.ts` | Snapshot model, validation, and runtime-mode resolution |
| `sync/` | `SyncCoordinator` class + resource adapters — delta/scoped sync |
| `index.ts` | Public barrel — the only import path other modules should use |

### `src/lib/`

Self-contained algorithmic libraries with no Frappe or Vue dependency:

- `pricingEngine.ts` — offline pricing-rule evaluation engine

### `src/features/` (in progress)

Feature-sliced modules (catalog, customers, orders, payments) being extracted from
`posapp/components/` as the modernisation continues.

## Data flow — invoice lifecycle

```
User action (add item)
  → useItemAddition composable
  → invoiceStore.addItem()           (Pinia — normalised Map)
  → invoiceStore.items (computed)    (derived array for the table)
  → CartItemRow.vue renders
  → useInvoiceItems.setFormatedQty() on qty change
  → bus.emit('apply_pricing_rules')  (mitt event bus)
  → usePricingRulesStore.applyRules()
  → invoiceStore totals recomputed
  → ItemsTable.vue / InvoiceTotals.vue update reactively
```

## Offline readiness — bootstrap snapshot

On page load `DefaultLayout.vue` calls `evaluateBootstrapSnapshot()`:

1. Reads the persisted `BootstrapSnapshot` from IndexedDB/localStorage.
2. Compares it against the current session (build version, POS profile, opening-shift user).
3. Calls `validateBootstrapSnapshot()` → produces a `BootstrapValidationResult` with a
   `mode` of `"normal" | "limited" | "confirmation_required" | "invalid"`.
4. `mode = "limited"` is only set when prerequisites from `PREREQUISITES_FOR_OFFLINE_SELL`
   are missing (pos_profile, pos_opening_shift, payment_methods, items, customers).
   Optional prerequisites (offers, delivery charges, currencies, etc.) being absent does
   **not** trigger the warning banner.
5. The banner in `NavbarAppBar.vue` reflects the resolved `limitedMode` flag.

## Event bus

A `mitt` instance (`src/posapp/bus.ts`) is used for cross-component events that cannot
easily flow through Pinia:

| Event | Emitter | Consumers |
|---|---|---|
| `apply_pricing_rules` | `useInvoiceItems` (qty change) | `usePricingRulesStore` |
| `update_customer` | customer forms | invoice header |

Prefer Pinia for all new cross-component communication; use the bus only when a composable
needs to notify an unrelated subtree without creating a circular store dependency.

## Rendering performance

- **Item catalogue**: Virtual scrolling via `vue-virtual-scroller` or Vuetify's
  `v-virtual-scroll`. The offline item cache can hold tens of thousands of items.
- **Invoice table**: `v-data-table-virtual` with a full custom `<tr>` slot
  (`CartItemRow.vue`). Column count must match the header definition exactly — the column
  visibility system (`isColumnVisible`) guards this.
- **Barcode scanning**: OpenCV-based scanner runs in a Web Worker managed by
  `opencvWorkerManager.ts`. The main thread receives decoded results through `postMessage`.
