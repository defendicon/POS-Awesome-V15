[**posawesome-frontend**](../../../../README.md)

***

[posawesome-frontend](../../../../README.md) / posapp/composables/pos/shared/useDiscounts

# posapp/composables/pos/shared/useDiscounts

## Functions

### useDiscounts()

> **useDiscounts**(): `object`

Defined in: [posapp/composables/pos/shared/useDiscounts.ts:21](https://github.com/defendicon/POS-Awesome-V15/blob/6a7577621a096e30d3a54ef94f08df6b4d9cd53b/frontend/src/posapp/composables/pos/shared/useDiscounts.ts#L21)

#### Returns

##### calcItemPrice

> **calcItemPrice**: (`item`, `context`) => `void`

Recalculates an item's price, discount, and amount fields from its current
`price_list_rate`, `discount_percentage`, and quantity.

This function is called during **invoice load and currency change** — not for
user-initiated field edits (use [calcPrices](#usediscounts-2) for those).

**Mutates `item` in-place.** No return value.

**Early-return guards** — the function exits early (skipping price recalculation)
in these cases:

1. `item._skip_calc === true` — set by `update_item_rates` to prevent a double
   calculation. The flag is cleared (`false`) before returning.

2. `item.locked_price === true` — item price is pinned. Only `amount` and
   `base_amount` are recalculated (`qty × rate`); `rate` itself is not touched.

3. `item.posa_offer_applied === true` — offer engine has set the rate; same
   treatment as `locked_price` (amount only).

**Normal calculation path** (none of the guards triggered):

1. If `item.price_list_rate` is set: ensures `base_price_list_rate` exists
   (derives it from `price_list_rate` if absent), then converts both
   `price_list_rate` and `rate` to the selected currency.

2. If `item.discount_percentage` is non-zero: derives `discount_amount` from
   `price_list_rate × pct / 100` and recalculates `rate` as
   `price_list_rate − discount_amount`. **`discount_percentage` always takes
   precedence** — any `discount_amount` stored on the item before this call is
   overwritten.

3. Calculates `amount = qty × rate` and `base_amount` in the base currency.

###### Parameters

###### item

`any`

Cart item to update. Expected to have `price_list_rate`, `rate`,
  `qty`, and optionally `discount_percentage`.

###### context

`any`

Calculation context. Required fields:
  - `currency_precision` (number).
  - `flt(value, precision)` — rounding function.
  - `conversion_rate` (number) — used by `toBaseCurrency`/`toSelectedCurrency`.
  - `forceUpdate()` — optional; triggers a Vue re-render after mutation.

###### Returns

`void`

##### calcPrices

> **calcPrices**: (`item`, `value`, `$event`, `context`) => `void`

Handles a user-initiated price/discount edit in the cart row and propagates the
change to all related price fields on the item.

**Mutates `item` in-place.** No return value.

The function dispatches on `$event.target.id` — the HTML `id` attribute of the input
element that received the change. Callers must ensure the input element's `id` matches
one of the recognised field names. If `$event.target.id` is absent or `item` is
falsy, the function returns immediately.

**Recognised field IDs and their calculation paths:**

- `"rate"` — User entered a new unit rate.
  1. Sets `item.rate` and converts to `item.base_rate`.
  2. Back-calculates `discount_amount` = `base_price_list_rate − base_rate`.
  3. Back-calculates `discount_percentage` from `base_discount_amount / base_price_list_rate`.

- `"discount_amount"` — User entered a fixed discount amount.
  1. Clamps input to `price_list_rate` (cannot exceed list price).
  2. Converts to `base_discount_amount`.
  3. Derives `base_rate` = `base_price_list_rate − base_discount_amount`, then converts to `rate`.
  4. Derives `discount_percentage`.

- `"discount_percentage"` — User entered a percentage discount (0–100, clamped).
  1. Derives `base_discount_amount` = `base_price_list_rate × pct / 100`.
  2. Converts to `discount_amount`.
  3. Derives `base_rate` = `base_price_list_rate − base_discount_amount`, then converts to `rate`.

**Common guards applied after the switch:**
- Negative input values are rejected (set to 0) with a toast.
- If the computed `rate` would go below zero, all fields are set to represent 100 % discount.
- For offer-constrained items (`item._offer_constraints`), `enforceOfferPriceLimits`
  is called. If a constraint is violated, the previous price state is restored and the
  function returns without calling `calc_stock_qty` or `forceUpdate`.
- Sets `item._manual_rate_set = true` and `item._manual_rate_set_from_uom = false` for
  any of the three field IDs above.

###### Parameters

###### item

`any`

Cart item to update.

###### value

`any`

New raw value entered by the user (will be rounded via `flt`).

###### $event

`any`

The DOM input event. `$event.target.id` must be one of the field IDs above.

###### context

`any`

Calculation context. Required fields:
  - `currency_precision` (number) — decimal places for currency values.
  - `float_precision` (number) — decimal places for percentage / float values.
  - `flt(value, precision)` — rounding function (typically `frappe.utils.flt`).
  - `conversion_rate` (number) — exchange rate used by `toBaseCurrency`/`toSelectedCurrency`.
  - `calc_stock_qty(item, qty)` — optional; called after price update.
  - `forceUpdate()` — optional; triggers a Vue re-render.

###### Returns

`void`

##### updateDiscountAmount

> **updateDiscountAmount**: (`context`) => `void`

Recalculates `context.additional_discount` (the transaction-level discount amount)
from `context.additional_discount_percentage`.

**Mutates `context` in-place.** No return value.

Behaviour details:
- If `percentage` is outside `[-100, 100]`, both `additional_discount_percentage`
  and `additional_discount` are reset to `0`.
- If `pos_profile.posa_max_discount_allowed > 0`, the percentage is clamped to that
  ceiling and a warning toast is shown.
- The calculation is gated on `context.Total !== 0`. When `Total` is zero or absent,
  `additional_discount` is set to `0`.

**Two discount modes** (controlled by `pos_profile.posa_use_percentage_discount`):

- `usePercentage = true` (percentage mode):
  `discountAmount = |Total| × |percentage| / 100`, then sign-adjusted so that the
  discount is negative on return invoices and positive otherwise. For return invoices
  the percentage itself is also negated if it arrives as positive.

- `usePercentage = false` (legacy mode):
  `additional_discount = signedTotal × percentage / 100`, where `signedTotal` is
  `-|Total|` on return invoices and `Total` otherwise. The result is always signed
  opposite to the invoice direction.

###### Parameters

###### context

`any`

Mutable context object. Expected fields:
  - `additional_discount_percentage` (number) — input; may be modified by clamping.
  - `additional_discount` (number) — output; overwritten by this function.
  - `Total` (number) — net total used as the discount base.
  - `isReturnInvoice` (boolean).
  - `pos_profile` — object with `posa_use_percentage_discount` and `posa_max_discount_allowed`.

###### Returns

`void`
