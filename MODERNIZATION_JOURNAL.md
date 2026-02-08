# Modernization Journal: State of the Art POS Application

This document serves as a detailed roadmap and tracking journal for transforming the current POS application into a state-of-the-art, high-performance, and maintainable system.

**Goal:** Create a premium developer experience and user experience by adopting modern Vue 3 ecosystems standards (Router, Pinia, TypeScript, Composition API).

---

## 🛡️ Refactoring Protocol (Safety First)

To prevent regressions and maintain stability during modernization, every refactor must follow these rules:

1.  **Incremental Changes**: Avoid large, sweeping refactors. Break down tasks into the smallest possible functional units.
2.  **Continuous Verification**: Reverity logic after _every_ change. Do not stack multiple changes without testing.
3.  **Deep Inspection Checklist**: After each modification, specifically inspect and validate:
    - **Proxies & Context**: Ensure `this` or `vm` references are correctly delegated.
    - **Events**: Verify event emissions (`emit`) and listeners (`on`) are correctly mapped.
    - **Methods & Props**: Check that naming conventions (snake_case vs camelCase) are handled.
    - **Reactivity**: Ensure `ref`, `reactive`, and `computed` properties trigger updates as expected.
    - **Stores**: Validate that Pinia store mutations and actions are correctly integrated.
    - **Lifecycle**: Ensure hooks like `onMounted` or `onUnmounted` are utilized correctly.
    - **Domain Logic**: Pay special attention to **Multi-Currency**, **Pricing**, and **Calculations**.

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
    - **Current Status:** 56 components fully migrated to `<script setup>`. 20 components are in a "Hybrid" state (using `setup()` with Options API).
    - **Fully Migrated components (56):**
        - [x] `App.vue`, `OfflineInvoices.vue`, `DefaultLayout.vue`
        - [x] `NavbarDrawer.vue`, `NotificationBell.vue`, `StatusIndicator.vue`
        - [x] `AboutDialog.vue`, `CacheUsageMeter.vue`, `CpuGadget.vue`, `DatabaseUsageGadget.vue`, `NavbarInfoGadgets.vue`, `ServerUsageGadget.vue`
        - [x] `CameraScanner.vue`, `CancelSaleDialog.vue`, `CartItemRow.vue`, `DeliveryCharges.vue`, `InvoiceActionButtons.vue`, `InvoiceCustomerSection.vue`, `InvoiceItemsActionToolbar.vue`, `InvoiceSummary.vue`, `InvoiceTotals.vue`, `ItemActionToolbar.vue`, `ItemCard.vue`, `ItemHeader.vue`, `ItemSettingsDialog.vue`, `ItemsSelector.vue`, `ItemsSelectorCards.vue`, `ItemsSelectorTable.vue`, `ItemsTableExpandedRow.vue`, `LoadingOverlay.vue`, `Mpesa-Payments.vue`, `MultiCurrencyRow.vue`, `NewItemDialog.vue`, `OpeningDialog.vue`, `PackedItemsDialog.vue`, `PaymentActionButtons.vue`, `PaymentAdditionalInfo.vue`, `PaymentConfirmationDialog.vue`, `PaymentCustomerCreditDetails.vue`, `PaymentDialogs.vue`, `PaymentMethods.vue`, `PaymentOptions.vue`, `PaymentPurchaseOrder.vue`, `PaymentRedemption.vue`, `PaymentSelectionFields.vue`, `PaymentSummary.vue`, `PostingDateRow.vue`, `PurchasePaymentDialog.vue`, `ScanErrorDialog.vue`
        - [x] `ClosingHeader.vue`, `PaymentReconciliation.vue`, `ShiftOverview.vue`
        - [x] `Reports.vue`, `ui/LoadingOverlay.vue`, `ui/Skeleton.vue`, `ui/UpdatePrompt.vue`
    - **Hybrid components (20) - Remaining for Full Migration:**
        - [/] [Navbar.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/Navbar.vue)
        - [/] [NavbarAppBar.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/navbar/NavbarAppBar.vue)
        - [/] [NavbarMenu.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/navbar/NavbarMenu.vue)
        - [/] [Pay.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/payments/Pay.vue)
        - [/] [BarcodePrinting.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/BarcodePrinting.vue)
        - [/] [ClosingDialog.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/ClosingDialog.vue)
        - [/] [Customer.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/Customer.vue)
        - [/] [Drafts.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/Drafts.vue)
        - [/] [Invoice.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/Invoice.vue)
        - [/] [ItemsTable.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/ItemsTable.vue)
        - [/] [NewAddress.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/NewAddress.vue)
        - [/] [Payments.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/Payments.vue)
        - [/] [Pos.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/Pos.vue)
        - [/] [PosCoupons.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/PosCoupons.vue)
        - [/] [PosOffers.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/PosOffers.vue)
        - [/] [PurchaseOrders.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/PurchaseOrders.vue)
        - [/] [Returns.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/Returns.vue)
        - [/] [SalesOrders.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/SalesOrders.vue)
        - [/] [UpdateCustomer.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/UpdateCustomer.vue)
        - [/] [Variants.vue](file:///c:/Users/am102/Downloads/POS-Awesome-V15/frontend/src/posapp/components/pos/Variants.vue)

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
                - [x] Refactored `ItemsSelector` to emit `@add-item` event.
                - [x] Updated `BarcodePrinting.vue`, `Pos.vue`, and `PurchaseOrders.vue` to listen to the event.
                - Decoupled `add_item` global event from `ItemsSelector`.
    - **Phase 2.2: Component Decomposition**
        - [x] Extract layout logic to `useItemSelectorLayout.js`
        - [x] Extract last invoice rate logic to `useLastInvoiceRate.js`
        - [x] Extract storage safety logic to `useItemStorageSafety.js` 4. **Refactor `pending_invoices_changed`**: - [x] Create `syncStore` (Pinia) to manage pending invoices count. - [x] Update `Payments.vue` to update store instead of emitting event. - [x] Update `Home.vue` to use store state instead of event listener.

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

# Phase 6: Component Decomposition & Modularization (Priority)

_Taming the monoliths. Breaking down massive components into smaller sub-components and composables before full migration._

> [!IMPORTANT]
> **Modularization-First Strategy**: For files over 1000 lines, we must complete decomposition (Phase 6) _before_ attempting full Composition API migration (Phase 1.3). This ensures logic is cleanly separated and easier to test during the migration.

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
    - [x] `useItemAddition.js`: Consolidated `addItem`, `removeItem`, `groupAndAddItem` and merge logic.
    - [x] `useLastInvoiceRate.js`: Fetching and caching historical rates per customer.
    - [x] `useItemSelectorLayout.js`: Grid metrics, overflow checking, virtual scroll synchronization, and container resizing.
    - [x] `useItemStorageSafety.js`: IndexedDB/LocalStorage health checks and `itemWorker` management.
    - [x] `useBarcodeIndexing.js`: High-performance barcode-to-item lookup index management.
    - [ ] `useScanProcessor.js`: Consolidate `processScannedItem` and `addScannedItemToInvoice` (Scan Policy & Business Logic).
    - [ ] `useItemSearchTriggers.js`: Consolidate Search Keydown, Focus, Blur, and Clear logic (UI bridge).
    - [x] `Bug Fixes`: Resolved `417 Expectation Failed`, `vm is not defined`, `replaceBarcodeIndex is not defined`, `get_invoice_doc TypeError`, and `playScanTone TypeError`.

    - [/] **6.1.3 Extract Sub-Components (UI)**
        - [x] `ItemCard.vue`: Extracted.
        - [x] `ItemSearchFilters.vue`: Extracted as `ItemHeader.vue` and `ItemActionToolbar.vue`.
        - [x] `ItemsSelectorCards.vue` & `ItemsSelectorTable.vue`: Extracted.
        - [ ] `EditItemDialog.vue`: Pending.
        - [x] `ItemImage.vue`: Integrated into `ItemCard.vue`.
        - [x] **Payments.vue**: Decomposed into `PaymentSummary`, `PaymentMethods`, `InvoiceTotals`.

    - [/] **6.1.4 Legacy Component Migration (Options API to Script Setup)**
        - [x] `CameraScanner.vue` (680 lines): Refactored to `<script setup>`. Logic preserved.
        - [x] `NewItemDialog.vue` (200 lines): Refactored to `<script setup>`. API calls moved to `itemService.js`.
        - [ ] `ItemsSelector.vue`: Partially migrated (hybrid). Logic in composables, but still uses Mixins.

## ✂️ 6.2 `Invoice.vue` (1964 lines)

- [x] **Analysis:** Identified component structure and dependencies.
- [x] **Decomposition:**
    - [x] `InvoiceItemsActionToolbar.vue`: Extracted search and column selector.
    - [x] `PackedItemsDialog.vue`: Extracted packing list dialog.
    - [x] `InvoiceCustomerSection.vue`: Extracted to handle customer and invoice type selection.
    - [x] `InvoiceActionButtons.vue`: Extracted from `InvoiceSummary.vue` to separate action button logic and presentation.
    - [x] `PaymentSummary.vue`: Extracted from `Payments.vue` (Phase 1).
    - [x] `InvoiceTotals.vue`: Extracted from `Payments.vue` (Phase 1).
    - [x] `PaymentActionButtons.vue`: Extracted from `Payments.vue` (Phase 1).
    - [x] `PaymentMethods.vue`: Extracted loop logic, amounts, and denominations (Phase 2).
    - [x] `DeliveryCharges.vue`: Extracted.
    - [x] `PostingDateRow.vue`: Extracted.
- [ ] **Store Integration:** Ensure `invoiceStore` handles business logic.
- [ ] **Composition API Migration:** Component uses `setup()` but still relies on Mixins (`format`).

- [ ] **6.2.2 Decompose Sections**
    - [x] `InvoiceHeader.vue`: Partially covered by `InvoiceCustomerSection`.
    - [x] `InvoiceTotals.vue`: The summary section (Subtotal, Tax, Final Amount).
    - [ ] `ActiveOffers.vue`: The chip list or display of applied offers.
    - [ ] **Extract `useInvoiceData.ts`**: Centralize fetching and validation logic.

## ✂️ 6.3 `Payments.vue` (1,690 lines)

- [x] **6.3.1 Decomposition Logic**: Completed decomposition into `PaymentMethods`, `PaymentSummary`, `InvoiceTotals`.
- [ ] **6.3.2 Logic Extraction**: Extract remaining complex logic from `Payments.vue` into `usePayments.js` or `usePaymentBusinessLogic.js`.

## ✂️ 6.4 `PurchaseOrders.vue` (1,292 lines)

- [ ] **6.4.1 Analysis**: Map out existing internal components and logic blocks.
- [ ] **6.4.2 Decomposition**: Extract UI into `PurchaseOrderSummary.vue`, `PurchaseOrderItems.vue`, etc.
- [ ] **6.4.3 Shared Logic**: Identify and reuse logic from `Invoice.vue` modularization.

## ✂️ 6.5 `Pay.vue` (1,754 lines)

- [ ] **6.5.1 Extract Sub-Components**
    - `PaymentInvoices.vue`: The left panel showing outstanding invoices.
    - `PayMethodsTable.vue`: The "Make New Payment" and "Payments" table section.
    - `MpesaPanel.vue`: The specific Mpesa reconciliation logic.
    - `PaymentTotals.vue`: The totals summary sidebar.

## ✂️ 6.6 `NavbarAppBar.vue` & `NavbarMenu.vue` (~1,100 lines each)

- [ ] **6.6.1 Decomposition**: Break down into smaller functional nav components.
- [ ] **6.6.2 Logic Extraction**: Extract menu state and permission checks into a composable.

## ✂️ 6.5 `ClosingDialog.vue` (1950 lines)

- [x] **6.5.1 Extract Sub-Components**
    - [x] `ShiftOverview.vue`: The top cards (Insights).
    - [x] `PaymentReconciliation.vue`: The reconciliation table.
    - [x] `ClosingHeader.vue`: The header section.
    - [x] **Composables**: Extracted `useClosingShift.js` and `useClosingSummary.js` for clean logic separation.

## ✂️ 6.6 Store Refactoring

- [ ] **6.6.1 decompose `itemsStore.js` (1522 lines)**
    - Separate concerns:
        - `useItemSearch` (already partially composable, move store logic there).
        - `useItemSync` (Background sync logic).
        - `useItemCache` (IndexedDB / Memory cache management).

---

# Phase 7: TypeScript Migration

_The ultimate reliability upgrade. A strict, step-by-step path to type safety._

## 📐 7.1 Setup & Infrastructure

> **Goal:** Enable TypeScript in the build pipeline without breaking existing JS files.

- [x] **7.1.1 Install Dependencies**
    - Run: `yarn add -D typescript vue-tsc @types/node @vue/tsconfig @types/lodash`
    - Verify `vite-plugin-checker` is installed (optional but recommended for dev feedback).

- [x] **7.1.2 Configure TypeScript**
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
        		"allowJs": true, // Critical for mixed codebase
        		"checkJs": false, // Don't error on existing JS yet
        		"strict": true, // Goal: strictly typed new files
        		"noImplicitAny": false // Relaxed for initial migration
        	}
        }
        ```
    - Create `frontend/env.d.ts`:
        ```ts
        /// <reference types="vite/client" />
        declare module "*.vue" {
        	import type { DefineComponent } from "vue";
        	const component: DefineComponent<{}, {}, any>;
        	export default component;
        }
        declare const frappe: any; // Temporary global
        declare const __: (str: string) => string;
        ```

- [x] **7.1.3 Update Build Scripts**
    - Update `package.json` scripts:
        ```json
        "type-check": "vue-tsc --noEmit -p tsconfig.json --composite false",
        "build": "run-p type-check \"vite build\""
        ```

---

## 🧱 7.2 Data Layer & Type Definitions

> **Goal:** Define the "Truth" of our data structures.

- [x] **7.2.1 Create Type Directory**
    - Create `frontend/src/posapp/types/`
    - Create `frontend/src/posapp/types/frappe.d.ts` (Global Frappe types)

- [x] **7.2.2 Define Core Operations Models (`models.ts`)**
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

- [x] **7.2.3 Define API Responses**
    - Create `frontend/src/posapp/types/api.ts` for standardized API return types.

---

## 💾 7.3 State Management & Logic (Pinia First)

> **Goal:** Type the brain of the application. Stores are the highest value targets.

- [x] **7.3.1 Migrate `toastStore` & `uiStore`** (Low hanging fruit)
    - Rename `.js` to `.ts`.
    - Add return types to actions/getters.

- [x] **7.3.2 Migrate `invoiceStore`** (Critical)
    - Rename `invoiceStore.js` to `invoiceStore.ts`.
    - Define `InvoiceState` interface.
    - Explicitly type `invoiceDoc` ref: `ref<InvoiceDoc | null>(null)`.
    - Type `itemsData`: `reactive(new Map<string, CartItem>())`.
    - Fix `toNumber` utils validation with types.

- [x] **7.3.3- **Phase 2: Logic Extraction (In Progress)\*\*:
    - [x] `usePaymentCalculations.js`: Extracted totals, differences, change due, and auto-apply credit logic.
    - [x] `usePaymentSubmission.js`: Extracted `submit`, `submitInvoice`, and validation logic.
    - [ ] `useRedemptionLogic.js`: Pending extraction of fetching/validating points and credit.

- [x] **7.3.3 Migrate `customersStore`**
    - Define `Customer` interface.
    - Type the `focusCustomerSearch` actions.

---

## 🛠️ 7.4 Services & Utils

- [x] **7.4.1 Migrate `api.js`**
    - Convert to `api.ts`.
    - Generic wrapper: `call<T>(method: string, args?: any): Promise<T>`.

- [ ] **7.4.2 Migrate `format.js`**
    - Ensure currency formatters accept `number` and return `string`.

---

## 🧩 7.5 Component Migration Strategy

> **Strategy:** Migrate "Leaf" components first (small, no dependencies), then move up to "Container" components.

- [ ] **7.5 Pre-TS Refactoring (Decomposition)**
    - **Goal:** Break down large files (`ItemsTable.vue`, `Invoice.vue`) into smaller components and composables BEFORE migrating to TypeScript.
    - **ItemsTable.vue Refactoring:**
        - [ ] Extract `ItemsTableExpandedRow.vue` (The large expand panel).
        - [ ] Extract `useItemsTableSearch.ts` (Search & Filter logic).
        - [ ] Extract `useItemsTableDragDrop.ts` (Drag & Drop logic).
    - **Invoice.vue Refactoring:**
        - [ ] Extract `PaymentConfirmationDialog.vue`.
        - [ ] Extract `useInvoiceActions.ts` (Payment & Save logic).

- [ ] **7.6 Primitive UI Components (Migrated)**
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

| Date       | Item                                 | Status      | Notes                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-01-25 | Journal Creation                     | Completed   | Roadmap established.                                                                                                                                                                                                                        |
| 2026-01-25 | Phase 2.1 Refactor                   | Completed   | Created `toastStore`, `uiStore`, `socketStore` to replace Event Bus.                                                                                                                                                                        |
| 2026-01-25 | Phase 2.2 Refactor                   | Completed   | Created `api.js`, `authService.js`, `invoiceService.js` to centralize API calls.                                                                                                                                                            |
| 2026-01-26 | Refactor `pending_invoices_changed`  | Completed   | Created `syncStore.js` and updated `Payments.vue` and `Home.vue` to use it.                                                                                                                                                                 |
| 2026-01-26 | Phase 2.2 Finalization               | Completed   | Implemented `itemService.js` and refactored `itemsStore.js` & `invoiceOfferMethods.js`. cleanup `customer_changed` event assumption.                                                                                                        |
| 2026-01-26 | Phase 3.1 Design System              | Completed   | Migrated Vuetify theme to `plugins/vuetify.ts` and updated `posapp.js`.                                                                                                                                                                     |
| 2026-01-26 | Phase 3.2 Micro-Interactions         | Completed   | Added page transitions to `Home.vue` and dialog transitions to `Invoice` and `CancelSaleDialog`.                                                                                                                                            |
| 2026-01-26 | Phase 4 Performance                  | Completed   | Verified Route Lazy Loading & Virtual Scrolling. Optimized `Home.vue` imports.                                                                                                                                                              |
| 2026-01-26 | Phase 5.1 Reliability                | Completed   | Implemented global error handler in `posapp.js` using `toastStore`.                                                                                                                                                                         |
| 2026-01-26 | Phase 1.2 Explicit Layouts           | Completed   | Created `DefaultLayout.vue`, `App.vue`, and updated Router.                                                                                                                                                                                 |
| 2026-01-26 | Phase 1.3 Composition API            | Completed   | Refactored `DefaultLayout.vue` to `<script setup>` and removed Options API usage.                                                                                                                                                           |
| 2026-01-26 | Phase 2.1 Remove Event Bus           | Completed   | RefactoredView switching, Customer Dialogs, Invoice/Order Loading to use Stores.                                                                                                                                                            |
| 2026-01-28 | Phase 2.1 Final Cleanup              | Completed   | Removed remaining EventBus usage in `Payments.vue` and `Invoice.vue` (view switching, clearing invoice, posting date).                                                                                                                      |
| 2026-01-30 | Phase 6.1 ItemsSelector Refactor     | In Progress | Extracted `useScannerInput.js`, `useItemAvailability.js`, `useItemCurrency.js`, `useItemDetailFetcher.js`, `useItemSelection.js`, `useItemSync.js`.                                                                                         |
| 2026-01-30 | Bug Fixes                            | Completed   | Resolved multiple runtime errors including `vm is not defined` and `playScanTone`.                                                                                                                                                          |
| 2026-02-01 | Phase 6.1 Logic Consolidation        | Completed   | Extracted `useBarcodeIndexing`, `useItemStorageSafety`, `useItemSelectorLayout`. Consolidated `useItemAddition`.                                                                                                                            |
| 2026-02-01 | Scan & Addition Debugging            | Completed   | Fixed item merge issues, scan handler registration, and adding items via Proxy wrapper.                                                                                                                                                     |
| 2026-02-01 | Phase 6.2 Payments Refactoring       | Completed   | Decomposed `Payments.vue` into `PaymentMethods`, `PaymentSummary`, `InvoiceTotals`. Migrated logic to `usePayments.js` & `<script setup>`.                                                                                                  |
| 2026-02-01 | Phase 6.5 ClosingDialog Refactor     | Completed   | Decomposed into `ShiftOverview`, `PaymentReconciliation`, `ClosingHeader`. Stable and theme-aware.                                                                                                                                          |
| 2026-02-01 | Stabilization & Fixes                | Completed   | Fixed ClosingDialog Dark Mode, Shifts Submission Event flow, and Items Table toggle visibility.                                                                                                                                             |
| 2026-02-01 | Phase 7 initialization               | In Progress | Verified `tsconfig.json` and dependencies.                                                                                                                                                                                                  |
| 2026-02-02 | Bug Fixes: Payment & Offers          | Completed   | Fixed `mode_of_payment` TypeError and Item Selector Offer reactivity via synchronous stock updates.                                                                                                                                         |
| 2026-02-02 | ItemsTable.vue Decomposition         | In Progress | Extracted Search, DragDrop, and ExpandedRow. Planning extraction of Responsive and Merge logic.                                                                                                                                             |
| 2026-02-02 | Phase 7: TypeScript Migration        | In Progress | Migrated `useOnlineStatus.ts`, `api.ts`, `invoiceStore.ts`, and `customersStore.ts`.                                                                                                                                                        |
| 2026-02-02 | Style Fixes: ItemsTable & Expanded   | Completed   | Restored missing `items-table-styles.css` import, matched original responsive dimensions, and fixed `:deep()` selectors by using global CSS targeting. Cleaned up redundant child styles.                                                   |
| 2026-02-08 | POS Component Folder Reorg (Batch 1) | Completed   | Started feature-first organization under `components/pos/flows/` by moving `Drafts.vue`, `SalesOrders.vue`, and `Returns.vue`; updated imports in moved files and `Pos.vue`; validated with ESLint, TypeScript, and build.                  |
| 2026-02-08 | POS Component Folder Reorg (Batch 2) | Completed   | Moved payment stack to `components/pos/payments/` (`Payment*`, `InvoiceTotals`, `Mpesa-Payments`), updated `Payments.vue` and `Invoice.vue` imports, and validated with ESLint, type-check, and build.                                      |
| 2026-02-08 | POS Component Folder Reorg (Batch 3) | Completed   | Moved invoice stack to `components/pos/invoice/` (`ItemsTable*`, `InvoiceSummary`, `DeliveryCharges`, `PostingDateRow`, `invoice*` helpers, dialog files) and aligned all relative imports.                                                 |
| 2026-02-08 | POS Component Folder Reorg (Batch 4) | Completed   | Moved item-selector stack to `components/pos/items/` (`ItemsSelector*`, `Item*`, scanner/new-item dialogs), updated cross-module consumers (`Pos`, `BarcodePrinting`, `PurchaseOrders`).                                                    |
| 2026-02-08 | POS Component Folder Reorg (Batch 5) | Completed   | Moved shell entry components to `components/pos/shell/` (`Pos`, `PayView`, `BarcodePrinting`, `ClosingDialog`) and created domain dialogs under `components/pos/dialogs/{customer,purchase}/`; router/layout paths updated.                 |
| 2026-02-08 | POS Composables Reorg (Batch 6)      | Completed   | Reorganized composables into domain folders under `composables/pos/{items,invoice,payments,closing}` and updated all impacted imports in POS components and invoice utilities.                                                              |
| 2026-02-08 | POS Composables Reorg (Batch 7)      | Completed   | Added `composables/pos/shared/` (`usePosShift`, `useOffers`, `useStockUtils`, `useDiscounts`, `useBatchSerial`), migrated legacy `composables/invoice/*` to `composables/pos/invoice/*`, and removed stale wrapper `useInvoicePrinting.ts`. |
| 2026-02-08 | POS Composables Reorg (Batch 8)      | Completed   | Migrated legacy helper subfolders `composables/items/*` and `composables/item_addition/*` into `composables/pos/items/{store,addition}/`, updated `itemsStore` and item-addition wiring, and validated with lint, type-check, and build.    |
