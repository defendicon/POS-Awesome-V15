# Code Cleanup Tasks

## Completed
- [x] Removed unsafe `v-html` rendering and dead event-bus wiring in `frontend/src/posapp/components/pos/customer/Customer.vue` to reduce XSS risk and eliminate unreachable code.
- [x] Replaced repeated unsafe `v-html` address rendering with escaped text bindings and shared field resolver in `frontend/src/posapp/components/pos/payments/PaymentAdditionalInfo.vue`.
- [x] Hardened M-Pesa callback handling in `posawesome/posawesome/api/m_pesa.py` with POST-only checks, payload normalization, shortcode validation, duplicate transaction guard, input sanitization, and safer payment-method parsing.
- [x] Replaced unsafe offer description HTML rendering with escaped multiline text in `frontend/src/posapp/components/pos/offers/PosOffers.vue`.
- [x] Removed unsafe delivery-charge `v-html` bindings in `frontend/src/posapp/components/pos/invoice/DeliveryCharges.vue`.
- [x] Removed unsafe batch option `v-html` rendering and centralized subtitle formatting in `frontend/src/posapp/components/pos/invoice/ItemsTableExpandedRow.vue`.
- [x] Refactored print rendering into guarded helpers and removed duplicated window-write logic in `frontend/src/posapp/plugins/print.ts`.
- [x] Reused centralized print helper for offline invoice preview/print flows in `frontend/src/posapp/composables/pos/payments/usePaymentPrinting.ts`.
- [x] Reused centralized print helper for barcode print/PDF windows in `frontend/src/posapp/components/pos/shell/BarcodePrinting.vue`.
- [x] Hardened app branch/root lookup logic and batch helper wiring in `posawesome/posawesome/api/utilities.py`.
- [x] Added shift-user/profile authorization and stricter opening-voucher input validation in `posawesome/posawesome/api/shifts.py`.
- [x] Fixed POS profile trust boundary by resolving and authorizing purchase profile data server-side in `posawesome/posawesome/api/purchase_orders.py`.
- [x] Added authorized POS profile resolution and stricter customer/address update guards in `posawesome/posawesome/api/customers.py`.
- [x] Added doctype validation guard in `posawesome/posawesome/api/print_formats.py`.
- [x] Added POS profile access enforcement for sales order create/update/submit flows in `posawesome/posawesome/api/sales_orders.py`.
- [x] Added POS profile access enforcement for quotation create/update/submit flows in `posawesome/posawesome/api/quotations.py`.
- [x] Hardened invoice deletion endpoints with explicit draft/access checks in `posawesome/posawesome/api/invoices.py`.
- [x] Added company-level access checks to sales order search endpoint in `posawesome/posawesome/api/sales_orders.py`.
- [x] Added shift/profile access checks for draft invoice fetch and order-to-invoice conversion in `posawesome/posawesome/api/invoices.py`.
- [x] Restricted sensitive server/build/database usage endpoints to System Manager in `posawesome/posawesome/api/utilities.py`.
- [x] Fixed POS profile trust boundary and cross-user profile lookup controls in `posawesome/posawesome/api/utils.py`.
- [x] Added strict payload validation for bundle component lookups in `posawesome/posawesome/api/bundles.py`.
- [x] Added authorization gates for item price updates in `posawesome/posawesome/api/item_processing/price.py`.
- [x] Added POS profile authorization and safer doctype/payload guards in invoice update/submit flows in `posawesome/posawesome/api/invoice_processing/creation.py`.
- [x] Added company access checks and input limits to last-invoice-rate lookup in `posawesome/posawesome/api/invoice_processing/data.py`.
- [x] Added company/profile authorization checks for payment data and POS profile listing endpoints in `posawesome/posawesome/api/payment_processing/data.py`.
- [x] Removed client-trusted profile flags and enforced profile/shift authorization in POS payment processor in `posawesome/posawesome/api/payment_processing/processor.py`.
- [x] Added payload validation and server-side permission checks for payment-request creation and credit lookup in `posawesome/posawesome/api/payments.py`.
- [x] Added company authorization and strict mode-of-payment payload validation in `posawesome/posawesome/api/payment_processing/utils.py`.
- [x] Added explicit company/profile authorization and profile-company consistency checks in `posawesome/posawesome/api/payment_processing/reconciliation.py`.
- [x] Removed noisy dead debug logging and validated journal payment amount inputs in `posawesome/posawesome/api/payment_processing/journal_entry.py`.
- [x] Restricted QZ certificate/signing endpoints to authorized POS users and added sign-payload validation in `posawesome/posawesome/api/qz.py`.
- [x] Fixed unreachable tax-inclusive logic by correcting control flow in `posawesome/posawesome/api/invoice.py`.

## Pending
- [ ] Continue broader backend API audit for permission boundaries and input validation across remaining modules.
