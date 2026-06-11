# Offline Pricing Data Foundation

## Scope

Phase 1 makes Item Prices, Pricing Rules, and required Currency Exchange rates
available through explicit offline sync resources and read-only repositories.
It does not switch cart, offer, tax, or invoice price calculation to new logic.

## Goals

- Sync Item Price records independently from item master rows.
- Preserve UOM, currency, customer, validity, and modification metadata.
- Sync complete selling Pricing Rule definitions for the POS company, including
  item-code, item-group, and brand targets, without filtering by the currently
  selected customer.
- Build the currency pair set from all selling price-list currencies, POS
  profile currency, company currency, and payment account currencies.
- Apply disabled/deleted records through delta tombstones.
- Expose storage through repositories so later pricing work does not depend on
  Dexie table details.
- Preserve current ERPNext and POS Awesome pricing behavior in this phase.

## Data Flow

```text
ERPNext master records
  -> offline sync endpoints
  -> resource adapters
  -> normalized IndexedDB tables
  -> read-only repositories
  -> later deterministic pricing engine
```

## Storage Contracts

### Item Prices

Each row is keyed by ERPNext document name and retains:

- `name`
- `price_list`
- `item_code`
- `uom`
- `currency`
- `customer`
- `price_list_rate`
- `valid_from`
- `valid_upto`
- `modified`

Indexes support price-list/item/UOM and customer-aware lookups.

### Pricing Rules

Each normalized target row has a deterministic key composed from rule name,
target type, and target value. The original rule name remains available for
bulk replacement or deletion when the parent rule changes.

### Currency Rates

The existing exchange-rate cache remains the compatibility write target.
Phase 1 expands pair discovery so the sync includes every required conversion
pair instead of only the profile price-list pair.

## Compatibility

- Existing item caches and pricing-rule store snapshots remain operational.
- Existing invoice and cart pricing paths are unchanged.
- Repository APIs are additive and become the migration target for later PRs.
- Schema changes use a new Dexie version and retain existing tables.

## Verification

- Backend unit tests cover complete Item Price and Pricing Rule deltas,
  tombstones, targets, and currency pair discovery.
- Frontend tests cover resource routing, adapter writes/deletes, repository
  queries, UOM/customer-specific Item Prices, and multi-currency pair requests.
- Existing offline sync and pricing tests must remain green.
