# Findings

## Current app strengths
- POS Awesome already exposes strong offline and sync behavior, split payments, loyalty/coupons, multi-currency, sales orders, weighted barcodes, customer display, and cash movement.
- Mobile POS shell already has a compact bottom dock and active-sale summary.
- Items flow already supports camera scanning, background sync visibility, and quick item operations.
- Invoice management and drafts already exist, but they are presented more as dialogs/management views than as a high-speed parked-order workflow.

## Gaps vs modern POS products
- No clear local evidence of QR self-order, kiosk mode, or line-busting flows.
- No clear local evidence of kitchen/preparation display, prep-stage timers, or customer pickup status screens.
- No clear local evidence of restaurant floor/table management, reservations, takeout/delivery presets, or tip-first hospitality workflows.
- No clear local evidence of stored-value features like gift cards or wallet/e-wallet.
- No clear local evidence of employee PIN/badge switching for shared terminals.

## Duplicate-avoidance audit
- `Parked orders` should evolve from the existing draft stack, not replace it with a parallel persistence model. Relevant surfaces already exist in `frontend/src/posapp/components/pos/flows/Drafts.vue` and `frontend/src/posapp/components/pos/flows/InvoiceManagement.vue`.
- `Stored value` should extend the current customer-credit and cashback paths before introducing any new wallet abstraction. Relevant logic already exists in `frontend/src/posapp/composables/pos/payments/useRedemptionLogic.ts` plus `POS Profile-use_customer_credit` and `POS Profile-use_cashback`.
- `Employee switching` should complete or extend the existing unavailable shortcut placeholders for profile switching and POS lock in `frontend/src/posapp/components/pos/invoice/invoiceShortcuts.ts`, rather than inventing a separate lock concept disconnected from current cashier workflow.
- `Kitchen routing` has no true preparation domain today, but `posawesome/posawesome/doctype/pos_awesome_print_format_rule/` is worth checking before inventing a separate printer-assignment system. It looks print-format oriented, not kitchen-ticket oriented.
- `Restaurant mode` and `self-order` do not show meaningful near-equivalent features in the current repo; these remain net-new domains.

## Web research notes
- Odoo 19 POS documentation surfaces preparation display, self-ordering, product combos, restaurant features, discount tags, loyalty programs, QR code payments, and multi-employee management.
- Odoo self-ordering supports QR menu and kiosk flows.
- Odoo preparation display supports category routing, stages, alert timers, ready/completed states, and customer-facing order status.
- Open Source POS publicly lists gift cards, rewards, restaurant tables, and SMS messaging.
- uniCenta highlights customer account/store card, employee access controls, and hospitality-oriented features.

## File references reviewed
- README.md
- frontend/src/posapp/components/pos/shell/Pos.vue
- frontend/src/posapp/components/pos/items/ItemsSelector.vue
- frontend/src/posapp/components/pos/invoice/InvoiceSummary.vue
- frontend/src/posapp/components/pos/invoice/InvoiceActionButtons.vue
- frontend/src/posapp/components/pos/flows/InvoiceManagement.vue
- frontend/src/posapp/components/pos/customer/Customer.vue
- frontend/src/posapp/components/pos/payments/PaymentMethods.vue
- frontend/src/posapp/styles/theme.css
