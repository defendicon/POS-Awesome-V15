# Module Reference

High-level guide to each module. For function-level detail run `yarn docs:generate` and
open `docs/api/`.

---

## Pinia Stores (`src/posapp/stores/`)

Stores hold normalised, shared reactive state. Import through the barrel:

```ts
import { useInvoiceStore, useItemsStore } from "@/posapp/stores";
```

### `useInvoiceStore`

Central store for the active POS invoice.

- Holds items in a `Map<posa_row_id, CartItem>` for O(1) mutation.
- Exposes a derived `items` array (computed) for table rendering.
- Maintains `totalQty`, `grossTotal`, `discountTotal` as O(1) refs updated on every
  mutation — not recalculated on every render.
- Key actions: `addItem`, `removeItem`, `setItems`, `updateItem`, `clearInvoice`,
  `setDeliveryCharges`, `setSelectedDeliveryCharge`.

### `useItemsStore`

Manages the item catalogue loaded into the POS.

- Backed by the offline IndexedDB cache (`src/offline/items.ts`).
- Exposes paginated, filtered, and search-indexed views.
- Sync state is tracked per-resource and surfaced through `offlineSyncStore`.

### `useUIStore`

Thin state store for UI visibility flags (active view, open dialogs, loading overlay,
freeze dialog). Does not hold domain data.

### `usePricingRulesStore`

Holds the offline pricing rule snapshot and exposes `applyRules(items, context)`. Listens
for the `apply_pricing_rules` bus event.

### `useCustomersStore` / `useEmployeeStore`

Customer search results and the current cashier/employee identity for PIN-based auth.

### `useToastStore` / `useUpdateStore` / `useSocketStore`

Infrastructure stores — toasts, app update state, Socket.IO connection.

---

## Composables (`src/posapp/composables/`)

Composables encapsulate reusable business logic and return reactive state + action
functions. They are the preferred place for all non-trivial logic.

### Invoice composables (`pos/invoice/`)

| File | Purpose |
|---|---|
| `useInvoiceItems` | Column management, qty validation, stock enforcement, delivery charges |
| `useInvoiceCurrency` | Exchange rate loading, currency selection |
| `useInvoiceDetails` | Customer, posting date, notes, serial/batch on the invoice header |
| `useInvoiceOffers` | Applying and removing promotional offers |
| `useInvoicePrinting` | Print template rendering and QZ-Tray dispatch |
| `useInvoiceStock` | Real-time stock subscription via Socket.IO |
| `useInvoiceUI` | Dialog visibility flags local to the invoice view |
| `useInvoiceHandlers` | Top-level event handlers wiring the above composables together |

### Item composables (`pos/items/`)

| File | Purpose |
|---|---|
| `useItemAddition` | Add/merge items into the invoice; handles bundles, serials, batches |
| `useItemSearch` | Debounced search against the offline item index |
| `useItemsLoader` | Loads items from IndexedDB into `useItemsStore` on profile open |
| `useItemsTableResponsive` | ResizeObserver-based responsive column configuration |
| `useScannerInput` | Keyboard-scan detection (fast key stream → barcode) |
| `useScanProcessor` | Resolves a scanned barcode string to a cart item |
| `useBarcodeIndexing` | Builds/queries the barcode → item lookup map |

### Payment composables (`pos/payments/`)

| File | Purpose |
|---|---|
| `usePaymentCalculations` | Grand total, change, write-off arithmetic |
| `usePaymentMethods` | Available payment methods filtered by currency and profile |
| `usePaymentSubmission` | Invoice submission (online and offline paths) |
| `usePurchaseOrder` | Customer purchase-order reconciliation flow |
| `useRedemptionLogic` | Loyalty point redemption arithmetic |

### Shared composables (`pos/shared/`)

| File | Purpose |
|---|---|
| `useDiscounts` | `calcPrices`, `calcItemPrice`, `updateDiscountAmount` — item-level price arithmetic |
| `useOffers` | Loading and applying POS Awesome promotional offers |
| `usePosShift` | Opening/closing shift state and reconciliation data |
| `useStockUtils` | `calc_stock_qty` — UOM-adjusted stock quantity helper |
| `useBatchSerial` | Batch/serial selection dialog state |
| `useCustomerDisplayPublisher` | Pushes invoice data to the customer-facing display via broadcast channel |

### Core composables (`core/`)

| File | Purpose |
|---|---|
| `useNetwork` / `useOnlineStatus` | Reactive online/offline state |
| `useDataSync` | Triggers background sync on network resume |
| `useFormatters` | Currency, date, and number formatters using Frappe's `flt()` |
| `useResponsive` | Screen-size breakpoints for layout switching |
| `useRtl` | RTL language detection and Vuetify RTL toggle |
| `useTheme` | Dark/light mode persistence |
| `useLastInvoicePrinting` | Re-print the most recently submitted invoice |

---

## Offline Layer (`src/offline/`)

The offline layer is a plain TypeScript module with no Vue dependency. It uses **Dexie**
(IndexedDB wrapper) as its persistence layer.

### Public API

Always import from the barrel:

```ts
import {
  saveOfflineInvoice,
  getOfflineInvoices,
  saveCustomer,
  getCachedItems,
  getBootstrapSnapshot,
  SyncCoordinator,
} from "@/offline";
```

### Key modules

| Module | Exports |
|---|---|
| `db.ts` | `db`, `memory`, `initPromise` — Dexie instance and in-memory store |
| `cache.ts` | Per-entity typed read/write helpers (`saveOffers`, `getCachedItems`, …) |
| `bootstrapSnapshot.ts` | Snapshot CRUD + `validateBootstrapSnapshot`, `resolveBootstrapRuntimeState` |
| `invoices.ts` | `saveOfflineInvoice`, `getOfflineInvoices`, `removeOfflineInvoice` |
| `customers.ts` | `saveCustomer`, `searchCustomers`, `saveGiftCardSnapshot` |
| `stock.ts` | `fetchItemStockQuantities`, `setStockCacheReady` |
| `sync/SyncCoordinator.ts` | `SyncCoordinator` class — orchestrates all background syncs |
| `sync/resourceRegistry.ts` | Resource definitions (what to sync, priority, triggers) |
| `sync/types.ts` | All sync-layer TypeScript types |

### Sync resources

Resources are synced in priority order:

| Priority | Resources |
|---|---|
| `boot_critical` | `bootstrap_config`, `price_list_meta`, `currency_matrix`, `payment_method_currencies` |
| `warm` | `item_groups`, `offers`, `items`, `item_prices`, `stock`, `customers`, `customer_addresses` |
| `lazy` | `delivery_charges` |

---

## Utilities (`src/posapp/utils/`)

Pure functions — no Vue reactivity, no store access.

| File | Key exports |
|---|---|
| `currencyConversion.ts` | `toBaseCurrency`, `toSelectedCurrency`, `CurrencyContext` |
| `stock.ts` | `parseBooleanSetting`, `formatStockShortageError`, `formatNegativeStockWarning` |
| `bootstrapWarnings.ts` | `formatBootstrapWarning`, `shouldShowBootstrapBanner` |
| `searchUtils.ts` | Offline item search tokenisation and scoring |
| `smartTender.ts` | "Quick cash" denomination suggestions |
| `scaleBarcode.ts` | Weighted-product barcode decoding |
| `currencyConversion.ts` | Multi-currency conversion with precision |
| `errorReporting.ts` | Structured error logging helpers |
| `perf.ts` | Simple performance-mark utilities |

---

## Services (`src/posapp/services/`)

Thin wrappers over `frappe.call()` and axios. All async, all return Promises.

| File | Role |
|---|---|
| `api.ts` | Generic `frappe.call` wrapper (`api.call`, `api.getDoc`, `api.setValue`) |
| `axios.ts` | Configured axios instance with CSRF and base-URL handling |
| `invoiceService.ts` | Invoice save/submit/cancel/return RPC calls |
| `itemService.ts` | Item detail fetching and barcode resolution |
| `authService.ts` | PIN-based cashier authentication |
| `cashMovementService.ts` | POS cash movement CRUD |
| `qzTray.ts` | QZ-Tray printer connection and label printing |

---

## Domain types (`src/posapp/types/models.ts`)

Core TypeScript interfaces used throughout the frontend:

`Item` · `CartItem` · `InvoiceDoc` · `Payment` · `Tax` · `POSProfile` · `Customer` ·
`InvoiceMetadata` · `DeliveryCharge`

These are not exhaustive — all interfaces carry `[key: string]: any` for Frappe-document
compatibility.

---

## Pricing engine (`src/lib/pricingEngine.ts`)

Self-contained offline pricing-rule evaluator. Used by `usePricingRulesStore` to apply
Frappe pricing rules without a network call.

Key exports: `round`, `inDateRange`, `matchParty`, `collectCandidates`, `applyBestRule`.

<!-- TODO: add examples for collectCandidates / applyBestRule once the API stabilises -->
