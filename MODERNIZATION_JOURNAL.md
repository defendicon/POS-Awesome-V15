# Modernization Journal: State of the Art POS Application

This document serves as a detailed roadmap and tracking journal for transforming the current POS application into a state-of-the-art, high-performance, and maintainable system.

**Goal:** Create a premium developer experience and user experience by adopting modern Vue 3 ecosystems standards (Router, Pinia, TypeScript, Composition API).

---

## 🏗️ Phase 1: Architectural Foundation (Critical)

_Building the backbone for a scalable Single Page Application (SPA)._

- [ ] **1.1 Implement Vue Router**
    - **Current Status:** `Home.vue` uses `v-bind:is="page"` to switch components manually. `router/index.js` is empty. `Navbar.vue` emits `change-page`.
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

- [ ] **1.2 Explicit Layout System**
    - **Current Status:** Layout logic currently resides mixed inside `Home.vue`.
    - **Action Plan:**
        1.  Create `frontend/src/posapp/layouts/DefaultLayout.vue`.
        2.  Move `<v-app>`, `<Navbar>`, `<AppLoadingOverlay>` from `Home.vue` to `DefaultLayout.vue`.
        3.  `DefaultLayout.vue` should have a `<slot>` or `<router-view>` for the main content to render children.
        4.  Update `App.vue` (or `posapp.js` mount point) to render `<router-view>`.
        5.  Configure Router to use meta fields (e.g., `meta: { layout: 'default' }`) to select the layout.

- [ ] **1.3 Migrate to Composition API (Script Setup)**
    - **Current Status:** `Home.vue` and others use a mix of Options API (`data`, `methods`) and `setup()`.
    - **Issues:** Hard to reuse logic, verbose code, poor TypeScript inference.
    - **Action Plan:**
        1.  Refactor `Home.vue` to `<script setup>`.
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

- [x] **2.1 Remove Event Bus (`mitt`)**
    - **Current Status:** `mitt` is used globally. Key events identified: `show_message`, `freeze/unfreeze`, `add_item`, `pending_invoices_changed`.
    - **Action Plan:**
        1.  **Create `useToastStore` (Pinia)**:
            - Replace `eventBus.emit('show_message', ...)` with `toastStore.show(...)`.
            - Centralize Snackbar logic in `App.vue` or `DefaultLayout.vue` listening to the store.
        2.  **Create `useUIStore` (Pinia)**:
            - Move `freeze`/`unfreeze` logic here. `uiStore.setLoading(true/false)`.
        3.  **Refactor `BarcodePrinting.vue`**:
            - [x] Refactored `ItemsSelector` to emit `@add-item` event.
            - [x] Updated `BarcodePrinting.vue`, `Pos.vue`, and `PurchaseOrders.vue` to listen to the event.
            - Decoupled `add_item` global event from `ItemsSelector`.
        4.  **Refactor `pending_invoices_changed`**:
            - Make `pendingInvoices` a reactive getter in `useInvoiceStore`. Components should watch this store state.

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

- [ ] **3.1 Global Design System (Vuetify Customization)**
    - **Current Status:** heavy reliance on `theme.css` with CSS variables.
    - **Action Plan:**
        1.  **Migrate CSS to JS:** Move `theme.css` variables into `frontend/src/posapp/plugins/vuetify.ts` theme definition.
            ```javascript
            const posTheme = {
            	dark: false,
            	colors: {
            		primary: "#0097a7",
            		background: "#ffffff",
            		surface: "#f8f9fa",
            	},
            };
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

## 📝 Change Log / Progress

| Date       | Item               | Status    | Notes                                                                            |
| ---------- | ------------------ | --------- | -------------------------------------------------------------------------------- |
| 2026-01-25 | Journal Creation   | Completed | Roadmap established.                                                             |
| 2026-01-25 | Phase 2.1 Refactor | Completed | Created `toastStore`, `uiStore`, `socketStore` to replace Event Bus.             |
| 2026-01-25 | Phase 2.2 Refactor | Completed | Created `api.js`, `authService.js`, `invoiceService.js` to centralize API calls. |
