# Modernization Journal: State of the Art POS Application

This document serves as a detailed roadmap and tracking journal for transforming the current POS application into a state-of-the-art, high-performance, and maintainable system.

**Goal:** Create a premium developer experience and user experience by adopting modern Vue 3 ecosystems standards (Router, Pinia, TypeScript, Composition API).

---

## 🏗️ Phase 1: Architectural Foundation (Critical)

_Building the backbone for a scalable Single Page Application (SPA)._

- [x] **1.1 Implement Vue Router**
    - **Current Status:** `router/index.js` is implemented and functional. `App.vue` uses `<router-view>`.
    - **Action Plan:**
        1.  **Define Routes** in `frontend/src/posapp/router/index.js`:
            ```javascript
            const routes = [
            	{ path: "/", redirect: "/pos" },
            	{
            		path: "/pos",
            		component: () => import("../components/pos/Pos.vue"),
            	},
            	{
            		path: "/orders",
            		component: () =>
            			import("../components/pos/PurchaseOrders.vue"),
            	},
            	{
            		path: "/payments",
            		component: () => import("../components/payments/Pay.vue"),
            	},
            	{
            		path: "/reports",
            		component: () =>
            			import("../components/reports/Reports.vue"),
            	},
            ];
            ```
        2.  **Refactor `Home.vue`**:
            - Remove `<component v-bind:is="page">`.
            - Add `<router-view v-slot="{ Component }">` inside the `v-main` area.
            - Remove `page` data property and `setPage` method.
        3.  **Update `Navbar.vue`**:
            - Remove `handleNavClick` that emits events.
            - Update sidebar items to include `to: '/url'` property.
            - Use `<v-list-item :to="item.to">` for navigation links.

- [x] **1.2 Explicit Layout System**
    - **Current Status:** `Home.vue` logic moved to `layouts/DefaultLayout.vue`. `App.vue` created as root.
    - **Action Plan:**
        1.  Create `frontend/src/posapp/layouts/DefaultLayout.vue`.
        2.  Move `<v-app>`, `<Navbar>`, `<AppLoadingOverlay>` from `Home.vue` to `DefaultLayout.vue`.
        3.  `DefaultLayout.vue` should have a `<slot>` or `<router-view>` for the main content to render children.
        4.  Update `App.vue` (or `posapp.js` mount point) to render `<router-view>`.
        5.  Configure Router to use meta fields (e.g., `meta: { layout: 'default' }`) to select the layout.

- [x] **1.3 Migrate to Composition API (Script Setup)**
    - **Current Status:** `DefaultLayout.vue` refactored to `<script setup>`.
    - **Action Plan:**
        1.  Refactor `DefaultLayout.vue` to `<script setup>`.
        2.  Convert `data()` to `ref/reactive`.
        3.  Convert `methods` to standard functions.
        4.  Convert `mounted` to `onMounted`.
        5.  Remove `this` context references.

- [ ] **1.4 Adopt TypeScript**
    - **Current Status:** Pure JavaScript codebase.
    - **Action Plan:**
        1.  Rename `.js` files to `.ts` and `.vue` scripts to `<script lang="ts">`.
        2.  Add `tsconfig.json` with strict mode enabled.
        3.  Define interfaces for core entities: `Invoice`, `Customer`, `Item`, `POSProfile`.
        4.  Typed Pinia Stores.

- [ ] **1.5 Documentation Update**
    - **Action:** Update `README.md` to mention the new Router-based architecture and requirements.

---

## 🧠 Phase 2: State Management & Logic Clean-up

_Removing "Event Soup" and centralizing business logic._

- [x] **Phase 2.1: Remove Event Bus (View Switching)**
    - **Goal**: Replace `mitt` event bus with Pinia stores for UI state (Views).
    - **Status**: Completed
    - **Details**: Refactored `Pos.vue`, `Navbar.vue`, `Invoice.vue`, `Payments.vue`, `ItemsSelector.vue` to use `uiStore.activeView` active state management.
        - **Action Plan:**
            1.  **Create `useToastStore` (Pinia)**:
                - Replace `eventBus.emit('show_message', ...)` with `toastStore.show(...)`.
                - Centralize Snackbar logic in `App.vue` or `DefaultLayout.vue` listening to the store.
            2.  **Create `useUIStore` (Pinia)**:
                - Move `freeze`/`unfreeze` logic here. `uiStore.setLoading(true/false)`.
            3.  **Refactor `BarcodePrinting.vue`**:
                - [x] `ItemsSelector.vue`: Extract `ItemCard`, `ItemActionToolbar`, `ItemHeader`
                - [x] `ItemsSelector.vue`: Extract `useItemSearch` logic
                - [ ] `Invoice.vue`: Extract `InvoiceItem` component
                - [x] Refactored `ItemsSelector` to emit `@add-item` event.
                - [x] Updated `BarcodePrinting.vue`, `Pos.vue`, and `PurchaseOrders.vue` to listen to the event.
                - Decoupled `add_item` global event from `ItemsSelector`.
            4.  **Refactor `pending_invoices_changed`**:
                - [x] Create `syncStore` (Pinia) to manage pending invoices count.
                - [x] Update `Payments.vue` to update store instead of emitting event.
                - [x] Update `Home.vue` to use store state instead of event listener.

- [x] **2.2 Centralize API Services**
    - **Current Status:** `frappe.call` is scattered. `Invoice.vue` & `invoiceItemMethods.js` contain ~20 raw calls. `customersStore.js` contains mixed API/Store logic.
    - **Action Plan:**
        1.  **Create `frontend/src/posapp/services/api.js`**:
            - Wrapper around `frappe.call` for better typing and error handling.
        2.  **Create `frontend/src/posapp/services/invoiceService.js`**:
            - Move calls from `Invoice.vue`: `submit_invoice`, `validate_items`, `get_invoice_details`.
        3.  **Create `frontend/src/posapp/services/authService.js`**:
            - Extract calls from `customersStore.js`: `get_customer_names`, `get_customers_count`.
        4.  **Create `frontend/src/posapp/services/itemService.js`**:
            - Extract calls from `itemsStore.js`.

- [ ] **2.3 Documentation Update**
    - **Action:** Update `README.md` to document the new Store/Service architecture for contributors.

---

## 🎨 Phase 3: UI/UX & Design System ("The Wow Factor")

_Making it look and feel premium._

- [x] **3.1 Global Design System (Vuetify Customization)**
    - **Current Status:** heavy reliance on `theme.css` with CSS variables.
    - **Action Plan:**
        1.  **Migrate CSS to JS:** Move `theme.css` variables into `frontend/src/posapp/plugins/vuetify.ts` theme definition.
            ```javascript
            import { createVuetify } from "vuetify";
            // ... full theme definition with pos colors
            ```
        2.  **Typography:** Define global font defaults in Vuetify config to remove `@fontsource` manual imports if possible, or standardize them.

- [ ] **3.2 Micro-Interactions & Motion**
    - **Current Status:** `Pos.vue` uses `v-show` for Payment/Items switching. Instant, jarring changes.
    - **Action Plan:**
        1.  **Route Transitions:**
            - In `DefaultLayout.vue` or `App.vue`:
                ```html
                <router-view v-slot="{ Component }">
                	<transition name="fade" mode="out-in">
                		<component :is="Component" />
                	</transition>
                </router-view>
                ```
        2.  **Dialog Transitions:**
            - Update all `v-dialog` to have `transition="dialog-bottom-transition"`.

- [ ] **3.3 Responsive & Modern Layout**
    - **Current Status:** `Pos.vue` has complex `v-show` logic based on screen size/state.
    - **Action Plan:**
        1.  **Grid Cleanup:** Once Routes are active, `Pos.vue` will only show the _Cart_ and _Items_.
        2.  `Payments.vue` will be its own page (on mobile) or a side-drawer (on desktop).
        3.  **Mobile First:** Ensure `v-app-bar` handles navigation on small screens.

- [ ] **3.4 Documentation Update**
    - **Action:** Update `README.md` to highlight "Modern UI/UX" features and specific theme customization guide.

---

## ⚡ Phase 4: Performance & Optimization

_Speed and Offline-First reliability._

- [ ] **4.1 Route Lazy Loading & Chunking**
    - **Current Status:** Manual chunking in `vite.config.js`.
    - **Action Plan:**
        1.  **Remove Manual Chunks:** Delete `manualChunks` configuration in `vite.config.js`. Let Vite split based on dynamic imports in Router.
        2.  **Async Components:** In `router/index.js`, use `component: () => import(...)`.

- [ ] **4.2 Advanced Caching (Service Worker)**
    - **Current Status:** `sw.js` uses `NetworkFirst` for scripts/styles. This causes delays on slow networks.
    - **Action Plan:**
        1.  **Strategy Shift:** Change `assets-cache` strategy to `CacheFirst` (or `StaleWhileRevalidate`). Since hashed filenames change on every build, we can safely cache aggressivey.
        2.  **Offline Indicator:** Ensure `DefaultLayout.vue` shows a global banner when `useNetwork().isOnline` is false.
        3.  **Background Sync:** Use `workbox-background-sync` for failed API requests (if `frappe.call` fails).

- [ ] **4.3 Documentation Update**
    - **Action:** Update `README.md` with "Offline First" capabilities and technical details on caching strategies.

---

## 🧪 Phase 5: Quality Assurance

_Stability and Confidence._

- [ ] **5.1 End-to-End Testing (Playwright)**
    - **Current Status:** No E2E tests. Only 2 unit tests exist.
    - **Action Plan:**
        1.  **Install Playwright:** `yarn create playwright` in `frontend/`.
        2.  **Create Smoke Test:** `tests/e2e/checkout.spec.ts`:
            - Login (mocked).
            - Navigate to `/pos`.
            - Click an item.
            - Verify Cart total updates.
            - Click "Pay" -> "Complete".
        3.  **CI Integration:** Update `.github/workflows/ci.yml` to run playwright tests.

- [ ] **5.2 CI/CD & Quality Gates**
    - **Current Status:** CI only checks backend install/build. `yarn test` is NOT run.
    - **Action Plan:**
        1.  **Update CI:** Modify `.github/workflows/ci.yml`:
            ```yaml
            - name: Run Frontend Tests
            - run: |
                  cd frontend
                  yarn install
                  yarn test
            ```
        2.  **Linting:** Add `yarn run lint` to the CI pipeline to enforce code style.

- [ ] **5.3 Documentation Update**
    - **Action:** Update `README.md` with instructions on how to run E2E tests and contributing guidelines using the new CI flow.

---

# Phase 6: Component Decomposition & Refactoring

_Taming the monoliths. Breaking down massive components for readability and maintainability._

> **Why this first?** `ItemsSelector.vue` (5700+ lines) and `Invoice.vue` (1900+ lines) are too complex to migrate to TypeScript safely in their current state. We must simplify first.

## ✂️ 6.1 `ItemsSelector.vue` (5716 lines)

- [x] **6.1.1 Extract Composables (Logic)**
    - `useItemSearch.js`: Implemented.
    - `useItemSync.js`: Implemented via `itemsStore.js` and `useItemsIntegration.js`.
    - `useKeyboardShortcuts.js`: Pending.

- [x] `6.1.2 Extract Additional Logic (New)`
    - [x] `useScannerInput.js`: Hardware scanner events, keyboard pattern detection, scale barcode parsing.
    - [x] `useItemAvailability.js`: Logic for `stockCoordinator`, `syncItemsWithStockState`, `primeStockState`, `applyReservationToItem`.
    - [x] `useItemDetailFetcher.js`: `update_items_details`, `fetchItemDetails`, `refreshPricesForVisibleItems`.
    - [x] `useItemCurrency.js`: Price conversion, PLC to Company rate logic.
    - [x] `useItemSelection.js`: `select_item`, `click_item_row`, `highlightedIndex` navigation, `fly` animation logic.
    - [x] `useItemSync.js`: `forceReloadItems`, `verifyServerItemCount`, `kickoffBackgroundSync`, `backgroundLoadItems`.
    - [x] `useItemAddition.js` (or `useItemActionHandlers.js`): Consolidate `add_item`, `addScannedItemToInvoice`, `handleVariantItem`, `prepareItemForCart`.
    - [x] `useLastInvoiceRate.js`: Fetching and caching historical rates per customer.
    - [ ] `useItemSelectorLayout.js`: Grid metrics, overflow checking, virtual scroll synchronization, and container resizing.
    - [ ] `useItemStorageSafety.js`: IndexedDB/LocalStorage health checks and `itemWorker` management.
    - [ ] `useBarcodeIndexing.js`: High-performance barcode-to-item lookup index management.
    - [ ] `useItemSearchTriggers.js`: Consolidate Search Keydown, Focus, Blur, and Clear logic (UI bridge).
    - [x] `Bug Fixes`: Resolved `417 Expectation Failed`, `vm is not defined`, and `replaceBarcodeIndex is not defined`.

- [/] **6.1.2 Extract Sub-Components (UI)**
    - [x] `ItemCard.vue`: Extracted.
    - [x] `ItemSearchFilters.vue`: Extracted as `ItemHeader.vue` and `ItemActionToolbar.vue`.
    - [ ] `EditItemDialog.vue`: Pending.
    - [x] `ItemImage.vue`: Integrated into `ItemCard.vue`.

## ✂️ 6.2 `Invoice.vue` (1964 lines)

- [ ] **6.2.1 Extract Composables**
    - `useInvoiceCalculations.js`: Move complex tax/discount/total logic (already partially in `invoiceStore` but UI specific logic remains).
    - [x] `useInvoiceShortcuts.js`: Keyboard shortcuts. (Implemented as `invoiceShortcuts.js`)

- [ ] **6.2.2 Decompose Sections**
    - `InvoiceHeader.vue`: Customer selection, mode toggles.
    - `InvoiceTotals.vue`: The summary section (Subtotal, Tax, Final Amount).
    - `ActiveOffers.vue`: The chip list or display of applied offers.

## ✂️ 6.3 `PurchaseOrders.vue` (1230 lines)

- [ ] **6.3.1 Standardization**
    - Apply same patterns as `Invoice.vue` after refactoring.
    - Reuse `ItemSearchFilters.vue` if possible.

---

# Phase 7: TypeScript Migration

_The ultimate reliability upgrade. A strict, step-by-step path to type safety._

## 📐 7.1 Setup & Infrastructure

> **Goal:** Enable TypeScript in the build pipeline without breaking existing JS files.

- [ ] **7.1.1 Install Dependencies**
    - Run: `yarn add -D typescript vue-tsc @types/node @vue/tsconfig @types/lodash`
    - Verify `vite-plugin-checker` is installed (optional but recommended for dev feedback).

- [ ] **7.1.2 Configure TypeScript**
    - Create `frontend/tsconfig.json`:
      ```json
      {
        "extends": "@vue/tsconfig/tsconfig.dom.json",
        "include": ["env.d.ts", "src/**/*", "src/**/*.vue"],
        "exclude": ["src/**/__tests__/*"],
        "compilerOptions": {
          "composite": true,
          "baseUrl": ".",
          "paths": { "@/*": ["./src/*"] },
          "allowJs": true,           // Critical for mixed codebase
          "checkJs": false,          // Don't error on existing JS yet
          "strict": true,            // Goal: strictly typed new files
          "noImplicitAny": false     // Relaxed for initial migration
        }
      }
      ```
    - Create `frontend/env.d.ts`:
      ```ts
      /// <reference types="vite/client" />
      declare module '*.vue' {
        import type { DefineComponent } from 'vue'
        const component: DefineComponent<{}, {}, any>
        export default component
      }
      declare const frappe: any; // Temporary global
      declare const __: (str: string) => string;
      ```

- [ ] **7.1.3 Update Build Scripts**
    - Update `package.json` scripts:
      ```json
      "type-check": "vue-tsc --noEmit -p tsconfig.json --composite false",
      "build": "run-p type-check \"vite build\""
      ```

---

## 🧱 7.2 Data Layer & Type Definitions

> **Goal:** Define the "Truth" of our data structures.

- [ ] **7.2.1 Create Type Directory**
    - Create `frontend/src/posapp/types/`
    - Create `frontend/src/posapp/types/frappe.d.ts` (Global Frappe types)

- [ ] **7.2.2 Define Core Operations Models (`models.ts`)**
    - **Inventory Item**:
      ```ts
      export interface Item {
        item_code: string;
        item_name: string;
        description?: string;
        stock_qty: number;
        standard_rate: number;
        // ... ad-hoc fields
      }
      ```
    - **Cart Item (POS Item)**: Extension of Item with `qty`, `amount`, `posa_row_id`.
    - **Invoice**: `InvoiceDoc` interface (matching `invoiceStore.invoiceDoc`).

- [ ] **7.2.3 Define API Responses**
    - Create `frontend/src/posapp/types/api.ts` for standardized API return types.

---

## 💾 7.3 State Management & Logic (Pinia First)

> **Goal:** Type the brain of the application. Stores are the highest value targets.

- [ ] **7.3.1 Migrate `toastStore` & `uiStore`** (Low hanging fruit)
    - Rename `.js` to `.ts`.
    - Add return types to actions/getters.

- [ ] **7.3.2 Migrate `invoiceStore`** (Critical)
    - Rename `invoiceStore.js` to `invoiceStore.ts`.
    - Define `InvoiceState` interface.
    - Explicitly type `invoiceDoc` ref: `ref<InvoiceDoc | null>(null)`.
    - Type `itemsData`: `reactive(new Map<string, CartItem>())`.
    - Fix `toNumber` utils validation with types.

- [ ] **7.3.3 Migrate `customersStore`**
    - Define `Customer` interface.
    - Type the `focusCustomerSearch` actions.

---

## 🛠️ 7.4 Services & Utils

- [ ] **7.4.1 Migrate `api.js`**
    - Convert to `api.ts`.
    - Generic wrapper: `call<T>(method: string, args?: any): Promise<T>`.

- [ ] **7.4.2 Migrate `format.js`**
    - Ensure currency formatters accept `number` and return `string`.

---

## 🧩 7.5 Component Migration Strategy

> **Strategy:** Migrate "Leaf" components first (small, no dependencies), then move up to "Container" components.

- [ ] **7.5.1 Primitive UI Components**
    - `PostingDateRow.vue`
    - `DeliveryCharges.vue`
    - `MultiCurrencyRow.vue`
    - **Action:** Add `<script setup lang="ts">`, define `Props` interface using `defineProps<Props>()`.

- [ ] **7.5.2 Complex Components (The Big Ones)**
    - `ItemsTable.vue`:
        - Define `ItemsTableProps`.
        - Type events: `defineEmits<{ (e: 'update:expanded', val: any[]): void }>()`.
    - `Invoice.vue`:
        - **Refactor First**: Move implementation of `invoiceItemMethods` into a composable `useInvoiceLogic.ts` (if heavily used).
        - **Convert**: Switch to `<script setup lang="ts">`.
        - Use `InstanceType<typeof Component>` for template refs (`customerComponent`, `itemsTable`).

---

## ✅ 7.6 Verification & Strictness (Final Polish)

- [ ] **7.6.1 Enable Strict Mode**
    - Change `noImplicitAny: true` in `tsconfig.json`.
    - Resolve all red squiggles.

- [ ] **7.6.2 CI/CD Integration**
    - Ensure `yarn type-check` passes in GitHub Actions.


## 📝 Change Log / Progress

| Date       | Item                                | Status    | Notes                                                                                                                                |
| ---------- | ----------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-01-25 | Journal Creation                    | Completed | Roadmap established.                                                                                                                 |
| 2026-01-25 | Phase 2.1 Refactor                  | Completed | Created `toastStore`, `uiStore`, `socketStore` to replace Event Bus.                                                                 |
| 2026-01-25 | Phase 2.2 Refactor                  | Completed | Created `api.js`, `authService.js`, `invoiceService.js` to centralize API calls.                                                     |
| 2026-01-26 | Refactor `pending_invoices_changed` | Completed | Created `syncStore.js` and updated `Payments.vue` and `Home.vue` to use it.                                                          |
| 2026-01-26 | Phase 2.2 Finalization              | Completed | Implemented `itemService.js` and refactored `itemsStore.js` & `invoiceOfferMethods.js`. cleanup `customer_changed` event assumption. |
| 2026-01-26 | Phase 3.1 Design System             | Completed | Migrated Vuetify theme to `plugins/vuetify.ts` and updated `posapp.js`.                                                              |
| 2026-01-26 | Phase 3.2 Micro-Interactions        | Completed | Added page transitions to `Home.vue` and dialog transitions to `Invoice` and `CancelSaleDialog`.                                     |
| 2026-01-26 | Phase 4 Performance                 | Completed | Verified Route Lazy Loading & Virtual Scrolling. Optimized `Home.vue` imports.                                                       |
| 2026-01-26 | Phase 5.1 Reliability               | Completed | Implemented global error handler in `posapp.js` using `toastStore`.                                                                  |
| 2026-01-26 | Phase 1.2 Explicit Layouts          | Completed | Created `DefaultLayout.vue`, `App.vue`, and updated Router.                                                                          |
| 2026-01-26 | Phase 1.3 Composition API           | Completed | Refactored `DefaultLayout.vue` to `<script setup>` and removed Options API usage.                                                    |
| 2026-01-26 | Phase 2.1 Remove Event Bus          | Completed | RefactoredView switching, Customer Dialogs, Invoice/Order Loading to use Stores.                                                     |
| 2026-01-28 | Phase 2.1 Final Cleanup             | Completed | Removed remaining EventBus usage in `Payments.vue` and `Invoice.vue` (view switching, clearing invoice, posting date).               |
| 2026-01-30 | Phase 6.1 ItemsSelector Refactor    | In Progress | Extracted `useScannerInput.js`, `useItemAvailability.js`, `useItemCurrency.js`, `useItemDetailFetcher.js`, `useItemSelection.js`, `useItemSync.js`. |
| 2026-01-30 | Bug Fixes                           | Completed   | Resolved `417 Expectation Failed`, `vm is not defined`, and `replaceBarcodeIndex is not defined` errors. |
| 2026-01-30 | Phase 6.1 Conclusion                | Updated     | Logic extraction for `ItemsSelector.vue` is ~90% complete. Remaining: `useItemAddition.js`. |
