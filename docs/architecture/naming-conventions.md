# POS Awesome — Naming Conventions

This document defines the naming standards for files, folders, and code entities across the POS Awesome codebase. The goal is **domain-first naming** — making it immediately clear what business domain a file belongs to.

## Domain Vocabulary

| Domain Term | Covers | Old Term(s) |
|-------------|--------|-------------|
| **terminal** | The main POS screen, session lifecycle, opening/barcode printing | `pos`, `shell` |
| **cart** | Current sale: line items, totals, discounts, parked orders | `invoice`, `invoice_utils` |
| **checkout** | Payment flow: method selection, submission, confirmation | `payments`, `pay`, `pos_pay` |
| **catalog** | Item browsing, search, scanning, item details | `items` |
| **shifts** | Opening/closing shift, reconciliation, shift overview | `closing`, `shift` |
| **customer** | Customer selection, creation, insights | `customer` (kept) |
| **offers** | Pricing rules, coupons, promotions | `offers` (kept) |
| **cash** | Cash movement: expenses, deposits | `cash` (kept) |
| **wallet** | Gift cards, stored value | `wallet` (kept) |

---

## File Naming Rules

### Components (`.vue`)

**PascalCase** with the **domain prefix** and a **UI role suffix**.

| Suffix | When to Use | Example |
|--------|-------------|---------|
| `Screen` | Full-page route targets | `TerminalScreen.vue` |
| `Panel` | Significant content area within a page | `CartSummaryPanel.vue` |
| `Dialog` | Modal / overlay dialog | `ShiftOpeningDialog.vue` |
| `Section` | Smaller section within a panel | `CheckoutGiftCardSection.vue` |
| `Row` | A single row in a table/list | `CartItemRow.vue` |
| `Table` | Table/list container | `CartItemsTable.vue` |
| (none) | Small leaf components, cards, indicators | `CatalogItemCard.vue` |

```
✅  CatalogBrowser.vue
✅  CheckoutMethodsPanel.vue
✅  ShiftClosingHeader.vue
❌  ItemsSelector.vue         (no domain prefix)
❌  PaymentMethods.vue         (ambiguous domain)
```

### Stores (`.ts`)

**camelCase** file name ending in `Store`.  
Exported function: `use` + PascalCase store name.

```
File:   cartStore.ts
Export: useCartStore
```

### Composables (`.ts`)

**camelCase** file name: `use` + Domain + Action.

```
✅  useCartCurrency.ts
✅  useCheckoutSubmission.ts
✅  useCatalogSearch.ts
❌  useInvoiceCurrency.ts      (old domain name)
❌  usePaymentMethods.ts       (ambiguous domain)
```

### Services (`.ts`)

**camelCase** file name: domain + `ApiService` (for backend-calling services) or domain + `Service` (for local services).

```
✅  cartApiService.ts
✅  catalogApiService.ts
✅  cashMovementService.ts
❌  invoiceService.ts          (old domain name)
```

### Types (`.ts`)

Entity-based names for interfaces/types. Domain-scoped files use `domain.types.ts` pattern.

```
✅  CartItem (interface in models.ts)
✅  checkout.types.ts
❌  models.ts alone — acceptable as shared, but domain-specific types get their own files
```

### Utils (`.ts`)

**camelCase** with descriptive domain prefix.

```
✅  catalogHighlight.ts
✅  checkoutInitialization.ts
❌  itemHighlight.ts           (old domain name)
```

### Backend Python Modules (`.py`)

**snake_case** with domain prefix. Subpackages for complex processing.

```
✅  catalog.py, catalog_processing/
✅  cart.py, cart_processing/
✅  checkout.py, checkout_processing/
❌  items.py, item_processing/     (old names)
```

---

## Folder Structure

```
frontend/src/posapp/
├── components/
│   ├── terminal/        # Session lifecycle, main POS screen
│   ├── cart/             # Line items, totals, parked orders
│   ├── cart-utils/       # Cart document processing utilities
│   ├── checkout/         # Payment method selection & submission
│   ├── checkout-pay/     # Bulk payment / pay-against-invoices view
│   ├── catalog/          # Item browsing, search, scanning
│   ├── shifts/           # Opening & closing shifts
│   ├── customer/         # Customer management
│   ├── offers/           # Coupons, promotions
│   ├── cash/             # Cash movement
│   ├── wallet/           # Gift cards
│   ├── employee/         # Employee switch
│   ├── purchase/         # Purchase orders
│   ├── navbar/           # Top navigation bar
│   ├── ui/               # Shared UI primitives
│   ├── customer_display/ # Secondary display
│   └── reports/          # Dashboard & reports
├── composables/
│   ├── core/             # Cross-cutting: theme, network, formatters
│   └── pos/
│       ├── cart/          # Cart business logic
│       ├── catalog/       # Catalog business logic
│       ├── checkout/      # Checkout business logic
│       ├── shifts/        # Shift business logic
│       ├── cash/          # Cash movement logic
│       └── shared/        # Cross-domain composables
├── stores/               # Pinia stores (flat)
├── services/             # Backend API call wrappers
├── types/                # TypeScript type definitions
├── utils/                # Pure utility functions
├── router/               # Vue Router config
├── layouts/              # Page layout wrappers
├── plugins/              # Vue plugins (Vuetify, print, theme)
├── workers/              # Web Workers
├── styles/               # Global CSS
└── config/               # App configuration
```

---

## Separation of Concerns

| Layer | Responsibility | Example |
|-------|---------------|---------|
| **Components** | Render UI, emit events, call composables | `CartSummaryPanel.vue` |
| **Stores** | Reactive state management | `cartStore.ts` |
| **Composables** | Business logic, workflow orchestration | `useCartCurrency.ts` |
| **Services** | Backend API calls (frappe.call wrappers) | `cartApiService.ts` |
| **Utils** | Pure functions, helpers | `catalogHighlight.ts` |
| **Types** | TypeScript interfaces & type definitions | `models.ts` |

**Rules:**
1. Components **must not** call `frappe.call()` directly — use services.
2. Stores **must not** contain business logic — only state + simple getters.
3. Composables **may** use stores and services.
4. Services **must not** import stores or components.
