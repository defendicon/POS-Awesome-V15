# Code Cleanup Tasks

## Completed
- [x] Removed unsafe `v-html` rendering and dead event-bus wiring in `frontend/src/posapp/components/pos/customer/Customer.vue` to reduce XSS risk and eliminate unreachable code.
- [x] Replaced repeated unsafe `v-html` address rendering with escaped text bindings and shared field resolver in `frontend/src/posapp/components/pos/payments/PaymentAdditionalInfo.vue`.
- [x] Hardened M-Pesa callback handling in `posawesome/posawesome/api/m_pesa.py` with POST-only checks, payload normalization, shortcode validation, duplicate transaction guard, input sanitization, and safer payment-method parsing.

## Pending
- [ ] Continue replacing remaining `v-html` hotspots and review print-flow `document.write` usage in `frontend/src/posapp`.
