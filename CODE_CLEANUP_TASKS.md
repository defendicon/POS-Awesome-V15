# Code Cleanup Tasks

## Completed
- [x] Removed unsafe `v-html` rendering and dead event-bus wiring in `frontend/src/posapp/components/pos/customer/Customer.vue` to reduce XSS risk and eliminate unreachable code.
- [x] Replaced repeated unsafe `v-html` address rendering with escaped text bindings and shared field resolver in `frontend/src/posapp/components/pos/payments/PaymentAdditionalInfo.vue`.
- [x] Hardened M-Pesa callback handling in `posawesome/posawesome/api/m_pesa.py` with POST-only checks, payload normalization, shortcode validation, duplicate transaction guard, input sanitization, and safer payment-method parsing.
- [x] Replaced unsafe offer description HTML rendering with escaped multiline text in `frontend/src/posapp/components/pos/offers/PosOffers.vue`.
- [x] Removed unsafe delivery-charge `v-html` bindings in `frontend/src/posapp/components/pos/invoice/DeliveryCharges.vue`.
- [x] Removed unsafe batch option `v-html` rendering and centralized subtitle formatting in `frontend/src/posapp/components/pos/invoice/ItemsTableExpandedRow.vue`.

## Pending
- [ ] Review and harden remaining print-flow `document.write` usage in `frontend/src/posapp`.
