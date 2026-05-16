# frappe.db.commit() Audit

## Summary

The backend audit found eight `frappe.db.commit()` calls under `posawesome/`.

Classifications preserved from the completed audit:

- `intentional partial persistence`
- `unsafe/unnecessary`
- `no background job/enqueue required commits found`

Most commits are intentional partial persistence points around uninstall cleanup, migration cleanup, webhook acknowledgement, payment gateway redirect, or purchase order draft preservation. Two whitelisted API commits are unsafe/unnecessary because normal Frappe request transaction handling should own the commit boundary.

## Files Changed

Completed audit comments were added to document intentional commits in:

- `posawesome/uninstall.py`
- `posawesome/patches/recreate_pos_awesome_workspace.py`
- `posawesome/posawesome/api/purchase_orders.py`
- `posawesome/posawesome/api/m_pesa.py`
- `posawesome/posawesome/api/payments.py`

This documentation update adds:

- `docs/audits/frappe-db-commit-audit.md`

No Python or frontend application code is changed by this documentation update.

## Commit Audit

| Location | Classification | Notes |
| --- | --- | --- |
| `posawesome/uninstall.py:49` | `intentional partial persistence` | Persists custom field/property setter uninstall cleanup before the next cleanup phase. |
| `posawesome/uninstall.py:57` | `intentional partial persistence` | Persists optional delivery-charges custom field cleanup during uninstall. |
| `posawesome/patches/recreate_pos_awesome_workspace.py:14` | `intentional partial persistence` | Persists workspace deletion so fixture import/migration can recreate the workspace cleanly. |
| `posawesome/posawesome/api/utilities.py:850` | `unsafe/unnecessary` | `set_user_language` is a whitelisted request handler; Frappe request transaction handling should commit successful writes. Explicit commit widens the partial-persistence surface. |
| `posawesome/posawesome/api/purchase_orders.py:717` | `intentional partial persistence` | Intentionally saves the draft Purchase Order before submit/receipt/invoice/payment flow so the operator does not lose the draft if downstream work fails. |
| `posawesome/posawesome/api/m_pesa.py:40` | `intentional partial persistence` | Persists the M-Pesa webhook receipt before acknowledging the external callback. |
| `posawesome/posawesome/api/item_processing/price.py:38` | `unsafe/unnecessary` | `update_price_list_rate` is a whitelisted request handler; normal Frappe transaction handling should commit the Item Price write. |
| `posawesome/posawesome/api/payments.py:192` | `intentional partial persistence` | Persists the Payment Request before redirecting the browser to the payment gateway URL. |

No background job/enqueue required commits found.

## Validation

Recommended validation for the completed audit:

```bash
python -m py_compile posawesome/uninstall.py
python -m py_compile posawesome/patches/recreate_pos_awesome_workspace.py
python -m py_compile posawesome/posawesome/api/utilities.py
python -m py_compile posawesome/posawesome/api/purchase_orders.py
python -m py_compile posawesome/posawesome/api/m_pesa.py
python -m py_compile posawesome/posawesome/api/item_processing/price.py
python -m py_compile posawesome/posawesome/api/payments.py
```

Suggested behavior checks before changing commit behavior:

- Run uninstall/patch flow in a disposable site.
- Create a Purchase Order with downstream submit/receipt/invoice/payment failure injected and confirm the draft remains recoverable.
- Submit an M-Pesa callback and confirm acknowledgement only happens after the receipt row is persisted.
- Create a Shopping Cart payment request and confirm redirect still has a persisted request.
- Exercise user language update and item price update after removing explicit commits in a future PR.

## Recommended Follow-Up PRs

1. Remove the `unsafe/unnecessary` commit from `posawesome/posawesome/api/utilities.py` and verify language changes still persist through normal request transaction handling.
2. Remove the `unsafe/unnecessary` commit from `posawesome/posawesome/api/item_processing/price.py` and verify Item Price create/update still persists through normal request transaction handling.
3. Add focused tests or integration checks around Purchase Order draft persistence before considering any future transaction-boundary change there.
4. Keep the M-Pesa webhook and payment gateway redirect commits unless a broader transaction design replaces them with an equally reliable acknowledgement/redirect persistence guarantee.
