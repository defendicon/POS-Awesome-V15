# Phase 2 UOM Pricing and Refresh UX Design

## Goal

Make UOM price selection deterministic online and offline, while making startup
offline-data refresh visible and non-blocking when the server is available.

## Scope

This phase adds:

- A shared item-price resolver backed by the normalized Item Price repository.
- Exact selected-UOM Item Price selection.
- Stock-UOM conversion fallback when no exact selected-UOM price exists.
- Customer-specific Item Price preference over generic Item Price records.
- Validity-date and currency-aware record selection.
- A visible `Refreshing...` navbar state for startup and manual offline-data sync.
- Non-blocking startup refresh after server connectivity is confirmed.
- `Limited` only after connectivity failure or incomplete required offline data,
  not while a refresh is actively running.

This phase does not replace the complete pricing-rule, offer, tax-inclusive, or
invoice pricing pipeline. Those existing calculations remain in place and
consume the resolved list rate.

## Pricing Resolution Contract

The resolver accepts:

- price list
- item code
- selected UOM
- stock UOM
- selected-UOM conversion factor
- customer, when available
- source/price-list currency
- posting date
- stock-unit fallback rate

Candidate Item Price records must match the selected price list, item code,
posting-date validity window, and expected source currency when the record
declares a currency.

Selection priority is:

1. Customer-specific exact-UOM Item Price.
2. Generic exact-UOM Item Price.
3. Customer-specific stock-UOM Item Price multiplied by the selected-UOM
   conversion factor.
4. Generic stock-UOM Item Price multiplied by the selected-UOM conversion
   factor.
5. Existing stable stock-unit baseline multiplied by the selected-UOM
   conversion factor.

An explicit selected-UOM Item Price is already the final price for that UOM and
must not be multiplied by the conversion factor again.

When multiple records have equal specificity, the most recent applicable
`valid_from`, then `modified`, then stable record name order wins. This makes
online and offline selection deterministic.

## Repository and Online Behavior

The normalized IndexedDB `ItemPriceRepository` is the primary source online and
offline. The resolver must not require the Item Price to have been used in an
online transaction before.

The existing online `get_price_for_uom` method remains a compatibility fallback
only when the normalized repository has no applicable data. A successful online
fallback may be used for the current calculation, but this phase does not create
an authoritative synthetic Item Price record from that response.

## Cart and UOM Data Flow

```text
Operator selects UOM
  -> resolve UOM conversion factor
  -> ItemPriceResolver queries normalized Item Prices
  -> exact UOM rate OR converted stock-unit fallback
  -> convert price-list currency to company/base currency
  -> apply existing offer/discount behavior
  -> convert base values to selected invoice currency
  -> update stock quantity, line amount, cart totals, and invoice payload fields
```

The current race token in `calcUom` remains authoritative so a slower earlier
request cannot overwrite a newer UOM selection.

## Startup Refresh UX

When the app has a POS Profile, is not in manual-offline mode, and server
connectivity is confirmed:

1. POS remains usable immediately.
2. A complete background offline-data refresh starts through the existing sync
   runtime/coordinator.
3. The offline sync store exposes an active refresh state derived from syncing
   resources and startup refresh lifecycle.
4. The navbar displays a spinning refresh icon, `Refreshing...`, and a short
   offline-data subtitle.
5. Bootstrap warnings are not presented as `Limited` merely because the initial
   background refresh is still running.
6. After completion, the navbar returns to `Online`.
7. If refresh fails or required offline prerequisites remain incomplete,
   existing warning evaluation may display `Limited`.

Manual `Refresh Offline Data` uses the same visible refresh state.

## Error Handling

- Repository read failure logs an actionable error and allows the existing
  online compatibility fallback when online.
- Missing exact-UOM price is not an error; it activates conversion fallback.
- Missing or invalid conversion factor falls back to `1` and preserves the
  current stable rate behavior.
- Background refresh failure does not block POS usage.
- Refresh state must clear in `finally` paths to avoid a permanently spinning
  navbar indicator.

## Linked Features

The implementation must preserve:

- POS Profile and customer price-list priority.
- Multi-currency display and base amounts.
- Customer-specific Item Price behavior.
- Existing offers and discounts.
- Stock quantity conversion.
- Cart and payment totals.
- Sales Invoice `uom`, `conversion_factor`, `price_list_rate`, and base fields.
- Offline invoice creation and sync.
- Printed rates and totals, which consume final invoice values.

## Tests

Add regression coverage for:

- Exact alternate-UOM Item Price wins without extra multiplication.
- Customer-specific exact-UOM price wins over generic price.
- Expired/future Item Price records are ignored.
- Missing alternate-UOM price uses stock-UOM price times conversion factor.
- Missing repository record preserves existing online fallback.
- Offline UOM change uses repository data without a Frappe call.
- UOM change updates line amounts, stock quantity, and cart totals.
- Startup online refresh is non-blocking.
- Navbar shows `Refreshing...` with a spinning refresh icon during sync.
- `Limited` is not shown while an eligible refresh is active.
- Refresh state clears on success and failure.

