# Phase 5 Customers And Orders Execution Plan

This plan executes Phase 5 from [STRUCTURE_MIGRATION_MAP.md](/C:/Users/am102/Downloads/POS-Awesome-V15/STRUCTURE_MIGRATION_MAP.md) without leaving customer and order flows split between old `posapp` paths and new feature roots.

## Phase Goal

Group customer and order flows into clean feature roots.

That means:

- live order overlays and order route screens become orders-owned
- live customer selector and address flows become customers-owned
- shell and invoice surfaces consume explicit feature paths
- old competing live paths are removed after the move

## Execution Strategy

Phase 5 should be executed in two bounded slices.

### Slice 5A: Orders

Move the live order screens and overlays first:

- `Drafts.vue`
- `InvoiceManagement.vue`
- `SalesOrders.vue`
- `Returns.vue`
- `PurchaseOrders.vue`

Finish line:

- `Pos.vue` imports order overlays from `features/orders`
- `/orders` route points to `features/orders`
- tests for invoice/order management run against the new live path

### Slice 5B: Customers

Move the live customer surface second:

- `Customer.vue`
- `NewAddress.vue`
- related customer-only helpers/components that are directly owned by those screens

Finish line:

- customer selector/address UI is customer-owned
- invoice/workspace consumers use `features/customers`
- old live customer component paths are removed

## No Partial State Conditions

Stop and keep working if any of these remain true:

- `Pos.vue` mixes old and new order overlay imports
- `/orders` still points to an old `posapp` screen after the new feature path exists
- customer consumers still import the old live component path after the customer feature path exists
- tests only validate helpers while the live screen still uses the old path
