# Architecture Notes

This project is based on ERPNext / Frappe / POS Awesome.

The POS system contains linked frontend and backend flows. Frontend UI changes often affect invoice payloads, pricing, discounts, stock, offline cache, sync, and printing.

## Main Principles

1. Business logic should be centralized.
2. UI components should not contain duplicated business calculations.
3. Backend payloads must match ERPNext expectations.
4. Offline data must stay compatible with online API data.
5. Printing must reflect the final submitted invoice.
6. Performance matters because POS may handle many items and large carts.
7. Responsive layout must work on desktop, tablet, and POS screens.
8. Existing ERPNext/POS Awesome behavior should be preserved unless explicitly changed.

## Important Linked Areas

- POS item search
- Cart
- Pricing
- Discounts
- UOM
- Stock
- Customer
- Payments
- Offline cache
- Sync
- Printing
- Reports

## POS Profile as Central Configuration

POS Profile is one of the most important configuration sources in this project.

Many POS flows depend on POS Profile, including:

- Default company
- Default warehouse
- Default customer
- Selling price list
- Currency
- Payment methods
- Taxes and charges
- Stock behavior
- Print format
- Sales Invoice defaults
- Opening and closing shift behavior
- Offline data loading

When making changes, avoid hardcoding values that should come from POS Profile.

Frontend and backend logic must respect POS Profile settings consistently.

If a feature behaves differently based on POS Profile, Codex must trace that configuration before changing code.

## Preferred Architecture

Prefer:

- Shared services
- Shared composables
- Central stores
- Utility helpers
- Typed data contracts where available
- Clear separation between UI and business logic

Avoid:

- Duplicating pricing logic in multiple components
- Duplicating discount logic in item row, cart summary, and payment screen
- Directly changing invoice totals in UI without syncing payload logic
- Creating fixes that only work online but break offline mode
- Creating fixes that only work in browser print but break QZ Tray print

## Offline Pricing Data Layers

Offline pricing data follows this ownership path:

1. Backend offline-sync endpoints expose paginated, versioned master records.
2. The sync coordinator owns scheduling, watermarks, retries, and scope changes.
3. Sync adapters write normalized records through repository APIs.
4. Legacy caches remain compatibility outputs for existing UI flows.
5. Cart and invoice pricing continue using the existing flow until the
   deterministic pricing-engine phase is verified.

Normalized repositories currently cover:

- Item Prices, including UOM, currency, customer, and validity
- Pricing Rules and their item, item-group, and brand targets
- Dated Currency Exchange records for required multi-currency pairs

The IndexedDB schema and persistence worker must always declare the same latest
Dexie version.

## UOM Price Resolution

UOM rate selection is owned by the shared item-price resolver:

1. Query normalized Item Price records for the active price list and item.
2. Prefer an applicable customer-specific exact-UOM price.
3. Otherwise use an applicable generic exact-UOM price.
4. If no exact-UOM price exists, multiply the stock-UOM Item Price by the
   selected UOM conversion factor.
5. Use the existing stable stock-unit baseline only when no applicable Item
   Price record exists.

An explicit alternate-UOM Item Price is already the final rate for that UOM and
must never be multiplied by the conversion factor again.

## Startup Offline Refresh

After server connectivity is confirmed, the full offline-data refresh runs in
the background without blocking POS use. The navbar displays `Refreshing...`
while the refresh lifecycle or any registered resource sync is active.
`Limited` is reserved for a failed connection or incomplete required data after
refresh evaluation, not for a refresh that is still in progress.
