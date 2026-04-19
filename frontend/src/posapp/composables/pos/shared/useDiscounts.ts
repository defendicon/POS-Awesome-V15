/**
 * Composable providing item-level and invoice-level discount calculation functions.
 *
 * All three returned functions mutate their arguments in-place — they do not return
 * a new object. Callers are responsible for triggering reactivity updates (via
 * `context.forceUpdate()`) after the mutation.
 *
 * The composable uses the Frappe global `flt()` (floating-point precision rounding)
 * and `__()` (translation), which must be present on `window` at runtime.
 */

import {
	toBaseCurrency,
	toSelectedCurrency,
} from "../../../utils/currencyConversion";
import { useToastStore } from "../../../stores/toastStore";

declare const flt: (_value: unknown, _precision?: number) => number;
declare const __: (_text: string, _args?: any[]) => string;

export function useDiscounts() {
	const toastStore = useToastStore();

	/**
	 * Captures a shallow snapshot of all price-related fields from `item`.
	 * Used immediately before a price mutation so that `enforceOfferPriceLimits` can
	 * restore the original state if a constraint is violated.
	 */
	const snapshotPriceState = (item: any) => ({
		rate: item.rate,
		base_rate: item.base_rate,
		discount_amount: item.discount_amount,
		base_discount_amount: item.base_discount_amount,
		discount_percentage: item.discount_percentage,
		_manual_rate_set: item._manual_rate_set,
		_manual_rate_set_from_uom: item._manual_rate_set_from_uom,
	});

	/**
	 * Writes a `snapshotPriceState` snapshot back onto `item`, undoing any price mutations
	 * that were applied after the snapshot was taken.
	 * Called by `enforceOfferPriceLimits` when a constraint violation is detected on a
	 * field other than `"rate"` (for `"rate"`, the floor is applied instead of restoring).
	 */
	const restorePriceState = (item: any, snapshot: any) => {
		item.rate = snapshot.rate;
		item.base_rate = snapshot.base_rate;
		item.discount_amount = snapshot.discount_amount;
		item.base_discount_amount = snapshot.base_discount_amount;
		item.discount_percentage = snapshot.discount_percentage;
		item._manual_rate_set = snapshot._manual_rate_set;
		item._manual_rate_set_from_uom = snapshot._manual_rate_set_from_uom;
	};

	/**
	 * Sets all price fields on `item` to exactly the minimum allowed base rate.
	 * Called when a `"rate"` edit would push the item below the floor imposed by
	 * `item._offer_constraints`. Negative `minBaseRate` values are clamped to `0`.
	 *
	 * Mutates `item` in-place and sets `item._manual_rate_set = true`.
	 *
	 * @param item - Cart item to adjust.
	 * @param context - Calculation context (provides `flt` and `currency_precision`).
	 * @param minBaseRate - The effective minimum base-currency rate to enforce.
	 */
	const applyOfferRateFloor = (item: any, context: any, minBaseRate: number) => {
		const safeMinBaseRate = context.flt(
			Math.max(minBaseRate, 0),
			context.currency_precision,
		);
		const safeBasePriceListRate = context.flt(
			Math.max(Number(item.base_price_list_rate || 0), 0),
			context.currency_precision,
		);
		const safeBaseDiscount = context.flt(
			Math.max(safeBasePriceListRate - safeMinBaseRate, 0),
			context.currency_precision,
		);

		item.base_rate = safeMinBaseRate;
		item.rate = toSelectedCurrency(context, safeMinBaseRate);
		item.base_discount_amount = safeBaseDiscount;
		item.discount_amount = toSelectedCurrency(context, safeBaseDiscount);
		item.discount_percentage = safeBasePriceListRate
			? context.flt(
					(safeBaseDiscount / safeBasePriceListRate) * 100,
					context.float_precision,
				)
			: 0;
		item._manual_rate_set = true;
		item._manual_rate_set_from_uom = false;
	};

	/**
	 * Converts all three constraint dimensions from `item._offer_constraints` into
	 * comparable base-rate floors and returns the most restrictive (highest) one.
	 *
	 * Constraint dimensions:
	 * - `maxDiscountPct` — maximum allowed discount percentage → floor = `plr × (1 − pct/100)`.
	 * - `maxBaseDiscountAmount` — maximum allowed base-currency discount → floor = `plr − amount`.
	 * - `minBaseRate` — explicit minimum base-currency rate.
	 *
	 * Invalid or non-finite constraint values are ignored. Returns `null` when no valid
	 * constraint is present (caller should skip enforcement).
	 *
	 * @param item - Cart item (used only for `base_price_list_rate`).
	 * @param maxDiscountPct - Maximum discount percentage (from `_offer_constraints`).
	 * @param maxBaseDiscountAmount - Maximum base-currency discount amount.
	 * @param minBaseRate - Minimum allowed base-currency rate.
	 * @returns The highest effective minimum base rate, or `null` if no constraint applies.
	 */
	const getEffectiveOfferMinBaseRate = (
		item: any,
		maxDiscountPct: number,
		maxBaseDiscountAmount: number,
		minBaseRate: number,
	) => {
		const candidates: number[] = [];
		const basePriceListRate = Number(item.base_price_list_rate || 0);
		const safeBasePriceListRate = Number.isFinite(basePriceListRate)
			? Math.max(basePriceListRate, 0)
			: 0;

		if (Number.isFinite(minBaseRate) && minBaseRate >= 0) {
			candidates.push(minBaseRate);
		}

		if (
			Number.isFinite(maxBaseDiscountAmount) &&
			maxBaseDiscountAmount >= 0
		) {
			candidates.push(
				Math.max(safeBasePriceListRate - maxBaseDiscountAmount, 0),
			);
		}

		if (Number.isFinite(maxDiscountPct) && maxDiscountPct >= 0) {
			const pctRateFloor =
				safeBasePriceListRate * (1 - Math.min(maxDiscountPct, 100) / 100);
			candidates.push(Math.max(pctRateFloor, 0));
		}

		if (!candidates.length) {
			return null;
		}

		return Math.max(...candidates);
	};

	/**
	 * Checks whether the item's new price violates any constraint in `item._offer_constraints`.
	 * Returns `false` immediately when `_offer_constraints` is absent.
	 *
	 * **Violation handling differs by field:**
	 *
	 * - `fieldId === "rate"`: if `base_rate` is below the effective minimum, `applyOfferRateFloor`
	 *   is called and a warning toast is shown. The previous state is NOT restored — the rate is
	 *   clamped to the floor instead. Returns `false` (caller continues normally after clamping).
	 *
	 * - Any other `fieldId`: if any constraint is exceeded, `restorePriceState` is called to undo
	 *   the mutation, an error toast is shown, and `context.forceUpdate()` is triggered.
	 *   Returns `true` (caller must abort further processing).
	 *
	 * When no violation is found, returns `false`.
	 *
	 * @param item - Cart item whose price fields have already been mutated.
	 * @param fieldId - The HTML input `id` that triggered the change (e.g. `"rate"`, `"discount_percentage"`).
	 * @param context - Calculation context (provides `flt`, precision fields, `forceUpdate`).
	 * @param previousState - Snapshot captured before the mutation via `snapshotPriceState`.
	 * @returns `true` if a violation was detected and the price was restored; `false` otherwise.
	 */
	const enforceOfferPriceLimits = (
		item: any,
		fieldId: string,
		context: any,
		previousState: any,
	) => {
		if (!item?._offer_constraints) {
			return false;
		}

		const limits = item._offer_constraints || {};
		const maxDiscountPct = Number(limits.max_discount_percentage);
		const maxBaseDiscountAmount = Number(limits.max_base_discount_amount);
		const minBaseRate = Number(limits.min_base_rate);
		const epsilon = 0.000001;
		const effectiveMinBaseRate = getEffectiveOfferMinBaseRate(
			item,
			maxDiscountPct,
			maxBaseDiscountAmount,
			minBaseRate,
		);

		let violationMessage = "";

		if (
			fieldId === "rate" &&
			effectiveMinBaseRate != null &&
			Number(item.base_rate || 0) < effectiveMinBaseRate - epsilon
		) {
			applyOfferRateFloor(item, context, effectiveMinBaseRate);
			toastStore.show({
				title: __("Rate adjusted to maximum allowed discount"),
				detail: __(
					"Minimum allowed rate for this offer item is {0}.",
					[
						flt(
							toSelectedCurrency(context, effectiveMinBaseRate),
							context.currency_precision,
						),
					],
				),
				color: "error",
			});
			return false;
		}

		if (
			Number.isFinite(maxDiscountPct) &&
			maxDiscountPct >= 0 &&
			Number(item.discount_percentage || 0) > maxDiscountPct + epsilon
		) {
			violationMessage = __(
				"Maximum discount percentage for this offer item is {0}%.",
				[flt(maxDiscountPct, context.float_precision)],
			);
		} else if (
			Number.isFinite(maxBaseDiscountAmount) &&
			maxBaseDiscountAmount >= 0 &&
			Number(item.base_discount_amount || 0) > maxBaseDiscountAmount + epsilon
		) {
			violationMessage = __(
				"Maximum discount amount for this offer item is {0}.",
				[
					flt(
						toSelectedCurrency(context, maxBaseDiscountAmount),
						context.currency_precision,
					),
				],
			);
		} else if (
			Number.isFinite(minBaseRate) &&
			minBaseRate >= 0 &&
			Number(item.base_rate || 0) < minBaseRate - epsilon
		) {
			violationMessage = __(
				"Minimum allowed rate for this offer item is {0}.",
				[flt(toSelectedCurrency(context, minBaseRate), context.currency_precision)],
			);
		}

		if (!violationMessage) {
			return false;
		}

		restorePriceState(item, previousState);
		toastStore.show({
			title: __("Offer criteria exceeded"),
			detail: violationMessage,
			color: "error",
		});
		if (context.forceUpdate) {
			context.forceUpdate();
		}
		return true;
	};

	/**
	 * Recalculates `context.additional_discount` (the transaction-level discount amount)
	 * from `context.additional_discount_percentage`.
	 *
	 * **Mutates `context` in-place.** No return value.
	 *
	 * Behaviour details:
	 * - If `percentage` is outside `[-100, 100]`, both `additional_discount_percentage`
	 *   and `additional_discount` are reset to `0`.
	 * - If `pos_profile.posa_max_discount_allowed > 0`, the percentage is clamped to that
	 *   ceiling and a warning toast is shown.
	 * - The calculation is gated on `context.Total !== 0`. When `Total` is zero or absent,
	 *   `additional_discount` is set to `0`.
	 *
	 * **Two discount modes** (controlled by `pos_profile.posa_use_percentage_discount`):
	 *
	 * - `usePercentage = true` (percentage mode):
	 *   `discountAmount = |Total| × |percentage| / 100`, then sign-adjusted so that the
	 *   discount is negative on return invoices and positive otherwise. For return invoices
	 *   the percentage itself is also negated if it arrives as positive.
	 *
	 * - `usePercentage = false` (legacy mode):
	 *   `additional_discount = signedTotal × percentage / 100`, where `signedTotal` is
	 *   `-|Total|` on return invoices and `Total` otherwise. The result is always signed
	 *   opposite to the invoice direction.
	 *
	 * @param context - Mutable context object. Expected fields:
	 *   - `additional_discount_percentage` (number) — input; may be modified by clamping.
	 *   - `additional_discount` (number) — output; overwritten by this function.
	 *   - `Total` (number) — net total used as the discount base.
	 *   - `isReturnInvoice` (boolean).
	 *   - `pos_profile` — object with `posa_use_percentage_discount` and `posa_max_discount_allowed`.
	 */
	const updateDiscountAmount = (context: any) => {
		let value = flt(context.additional_discount_percentage);
		const usePercentage = Boolean(
			context.pos_profile?.posa_use_percentage_discount,
		);
		const maxDiscount = flt(context.pos_profile?.posa_max_discount_allowed);

		// If value is too large, reset to 0
		if (value < -100 || value > 100) {
			context.additional_discount_percentage = 0;
			context.additional_discount = 0;
			return;
		}

		if (maxDiscount > 0 && Math.abs(value) > maxDiscount) {
			value = value < 0 ? -maxDiscount : maxDiscount;
			context.additional_discount_percentage = value;
			toastStore.show({
				title: __("Discount limited by POS Profile"),
				detail:
					__("The maximum discount allowed is") +
					" " +
					maxDiscount +
					"%",
				color: "warning",
			});
		}

		// Calculate discount amount based on percentage
		if (context.Total && context.Total !== 0) {
			if (usePercentage && context.isReturnInvoice && value > 0) {
				value = -Math.abs(value);
				context.additional_discount_percentage = value;
			}

			if (usePercentage) {
				const baseTotal = context.isReturnInvoice
					? Math.abs(context.Total)
					: context.Total;

				const percentMagnitude = Math.abs(value);
				let discountAmount = (baseTotal * percentMagnitude) / 100;

				if (value < 0 || context.isReturnInvoice) {
					discountAmount = -Math.abs(discountAmount);
				} else {
					discountAmount = Math.abs(discountAmount);
				}

				context.additional_discount = discountAmount;
			} else {
				const signedTotal = context.isReturnInvoice
					? -Math.abs(context.Total)
					: context.Total;
				context.additional_discount = (signedTotal * value) / 100;
			}
		} else {
			context.additional_discount = 0;
		}
	};

	/**
	 * Handles a user-initiated price/discount edit in the cart row and propagates the
	 * change to all related price fields on the item.
	 *
	 * **Mutates `item` in-place.** No return value.
	 *
	 * The function dispatches on `$event.target.id` — the HTML `id` attribute of the input
	 * element that received the change. Callers must ensure the input element's `id` matches
	 * one of the recognised field names. If `$event.target.id` is absent or `item` is
	 * falsy, the function returns immediately.
	 *
	 * **Recognised field IDs and their calculation paths:**
	 *
	 * - `"rate"` — User entered a new unit rate.
	 *   1. Sets `item.rate` and converts to `item.base_rate`.
	 *   2. Back-calculates `discount_amount` = `base_price_list_rate − base_rate`.
	 *   3. Back-calculates `discount_percentage` from `base_discount_amount / base_price_list_rate`.
	 *
	 * - `"discount_amount"` — User entered a fixed discount amount.
	 *   1. Clamps input to `price_list_rate` (cannot exceed list price).
	 *   2. Converts to `base_discount_amount`.
	 *   3. Derives `base_rate` = `base_price_list_rate − base_discount_amount`, then converts to `rate`.
	 *   4. Derives `discount_percentage`.
	 *
	 * - `"discount_percentage"` — User entered a percentage discount (0–100, clamped).
	 *   1. Derives `base_discount_amount` = `base_price_list_rate × pct / 100`.
	 *   2. Converts to `discount_amount`.
	 *   3. Derives `base_rate` = `base_price_list_rate − base_discount_amount`, then converts to `rate`.
	 *
	 * **Common guards applied after the switch:**
	 * - Negative input values are rejected (set to 0) with a toast.
	 * - If the computed `rate` would go below zero, all fields are set to represent 100 % discount.
	 * - For offer-constrained items (`item._offer_constraints`), `enforceOfferPriceLimits`
	 *   is called. If a constraint is violated, the previous price state is restored and the
	 *   function returns without calling `calc_stock_qty` or `forceUpdate`.
	 * - Sets `item._manual_rate_set = true` and `item._manual_rate_set_from_uom = false` for
	 *   any of the three field IDs above.
	 *
	 * @param item - Cart item to update.
	 * @param value - New raw value entered by the user (will be rounded via `flt`).
	 * @param $event - The DOM input event. `$event.target.id` must be one of the field IDs above.
	 * @param context - Calculation context. Required fields:
	 *   - `currency_precision` (number) — decimal places for currency values.
	 *   - `float_precision` (number) — decimal places for percentage / float values.
	 *   - `flt(value, precision)` — rounding function (typically `frappe.utils.flt`).
	 *   - `conversion_rate` (number) — exchange rate used by `toBaseCurrency`/`toSelectedCurrency`.
	 *   - `calc_stock_qty(item, qty)` — optional; called after price update.
	 *   - `forceUpdate()` — optional; triggers a Vue re-render.
	 */
	const calcPrices = (item: any, value: any, $event: any, context: any) => {
		if (!$event?.target?.id || !item) return;

		const fieldId = $event.target.id;
		let newValue = flt(value, context.currency_precision);
		const previousState = snapshotPriceState(item);

		try {
			// Flag to track manual rate changes
			if (
				["rate", "discount_amount", "discount_percentage"].includes(
					fieldId,
				)
			) {
				item._manual_rate_set = true;
				item._manual_rate_set_from_uom = false;
			}

			// Handle negative values
			if (newValue < 0) {
				newValue = 0;
				toastStore.show({
					title: __("Negative values not allowed"),
					color: "error",
				});
			}

			// Benchmark note: reuse shared conversion helper while avoiding redundant round-trips.
			const basePriceListRate = item.base_price_list_rate;
			const converted_price_list_rate =
				basePriceListRate != null
					? toSelectedCurrency(context, basePriceListRate)
					: item.price_list_rate;

			// Field-wise calculations
			switch (fieldId) {
				case "rate":
					item.rate = newValue;
					item.base_rate = toBaseCurrency(context, newValue);

					item.base_discount_amount = context.flt(
						item.base_price_list_rate - item.base_rate,
						context.currency_precision,
					);
					item.discount_amount = toSelectedCurrency(
						context,
						item.base_discount_amount,
					);

					if (item.base_price_list_rate) {
						item.discount_percentage = context.flt(
							(item.base_discount_amount /
								item.base_price_list_rate) *
								100,
							context.float_precision,
						);
					}
					break;

				case "discount_amount":
					newValue = Math.min(newValue, item.price_list_rate);
					item.discount_amount = newValue;

					item.base_discount_amount = toBaseCurrency(
						context,
						item.discount_amount,
					);

					item.base_rate = context.flt(
						item.base_price_list_rate - item.base_discount_amount,
						context.currency_precision,
					);
					item.rate = toSelectedCurrency(context, item.base_rate);

					if (item.base_price_list_rate) {
						item.discount_percentage = context.flt(
							(item.base_discount_amount /
								item.base_price_list_rate) *
								100,
							context.float_precision,
						);
					} else {
						item.discount_percentage = 0;
					}
					break;

				case "discount_percentage":
					newValue = Math.min(newValue, 100);
					item.discount_percentage = context.flt(
						newValue,
						context.float_precision,
					);

					item.base_discount_amount = context.flt(
						(item.base_price_list_rate * item.discount_percentage) /
							100,
						context.currency_precision,
					);
					item.discount_amount = toSelectedCurrency(
						context,
						item.base_discount_amount,
					);

					item.base_rate = context.flt(
						item.base_price_list_rate - item.base_discount_amount,
						context.currency_precision,
					);
					item.rate = toSelectedCurrency(context, item.base_rate);
					break;
			}

			// Ensure rate doesn't go below zero
			if (item.rate < 0) {
				item.rate = 0;
				item.base_rate = 0;
				item.discount_amount = converted_price_list_rate;
				item.base_discount_amount = item.price_list_rate;
				item.discount_percentage = 100;
			}
			if (
				["rate", "discount_amount", "discount_percentage"].includes(
					fieldId,
				)
			) {
				const blocked = enforceOfferPriceLimits(
					item,
					fieldId,
					context,
					previousState,
				);
				if (blocked) {
					return;
				}
			}

			// Update stock calculations and force UI update
			if (context.calc_stock_qty) context.calc_stock_qty(item, item.qty);
			if (context.forceUpdate) context.forceUpdate();
		} catch (error: unknown) {
			console.error("Error calculating prices:", error);
			toastStore.show({
				title: __("Error calculating prices"),
				color: "error",
			});
		}
	};

	/**
	 * Recalculates an item's price, discount, and amount fields from its current
	 * `price_list_rate`, `discount_percentage`, and quantity.
	 *
	 * This function is called during **invoice load and currency change** — not for
	 * user-initiated field edits (use {@link calcPrices} for those).
	 *
	 * **Mutates `item` in-place.** No return value.
	 *
	 * **Early-return guards** — the function exits early (skipping price recalculation)
	 * in these cases:
	 *
	 * 1. `item._skip_calc === true` — set by `update_item_rates` to prevent a double
	 *    calculation. The flag is cleared (`false`) before returning.
	 *
	 * 2. `item.locked_price === true` — item price is pinned. Only `amount` and
	 *    `base_amount` are recalculated (`qty × rate`); `rate` itself is not touched.
	 *
	 * 3. `item.posa_offer_applied === true` — offer engine has set the rate; same
	 *    treatment as `locked_price` (amount only).
	 *
	 * **Normal calculation path** (none of the guards triggered):
	 *
	 * 1. If `item.price_list_rate` is set: ensures `base_price_list_rate` exists
	 *    (derives it from `price_list_rate` if absent), then converts both
	 *    `price_list_rate` and `rate` to the selected currency.
	 *
	 * 2. If `item.discount_percentage` is non-zero: derives `discount_amount` from
	 *    `price_list_rate × pct / 100` and recalculates `rate` as
	 *    `price_list_rate − discount_amount`. **`discount_percentage` always takes
	 *    precedence** — any `discount_amount` stored on the item before this call is
	 *    overwritten.
	 *
	 * 3. Calculates `amount = qty × rate` and `base_amount` in the base currency.
	 *
	 * @param item - Cart item to update. Expected to have `price_list_rate`, `rate`,
	 *   `qty`, and optionally `discount_percentage`.
	 * @param context - Calculation context. Required fields:
	 *   - `currency_precision` (number).
	 *   - `flt(value, precision)` — rounding function.
	 *   - `conversion_rate` (number) — used by `toBaseCurrency`/`toSelectedCurrency`.
	 *   - `forceUpdate()` — optional; triggers a Vue re-render after mutation.
	 */
	const calcItemPrice = (item: any, context: any) => {
		// Skip recalculation if called from update_item_rates to avoid double calculations
		if (item._skip_calc) {
			item._skip_calc = false;
			return;
		}

		if (item.locked_price) {
			item.amount = context.flt(
				item.qty * item.rate,
				context.currency_precision,
			);
			item.base_amount = toBaseCurrency(context, item.amount);
			if (context.forceUpdate) context.forceUpdate();
			return;
		}

		if (item.posa_offer_applied) {
			item.amount = context.flt(
				item.qty * item.rate,
				context.currency_precision,
			);
			item.base_amount = toBaseCurrency(context, item.amount);
			if (context.forceUpdate) context.forceUpdate();
			return;
		}

		if (item.price_list_rate) {
			// Always work with base rates first
			if (!item.base_price_list_rate) {
				item.base_price_list_rate = toBaseCurrency(
					context,
					item.price_list_rate,
				);
				item.base_rate = toBaseCurrency(context, item.rate);
			}

			// Convert to selected currency
			item.price_list_rate = toSelectedCurrency(
				context,
				item.base_price_list_rate,
			);
			item.rate = toSelectedCurrency(context, item.base_rate);
		}

		// Handle discounts
		if (item.discount_percentage) {
			// Calculate discount in selected currency
			const price_list_rate = item.price_list_rate;
			const discount_amount = context.flt(
				(price_list_rate * item.discount_percentage) / 100,
				context.currency_precision,
			);

			item.discount_amount = discount_amount;
			item.rate = context.flt(
				price_list_rate - discount_amount,
				context.currency_precision,
			);

			// Store base discount amount
			item.base_discount_amount = toBaseCurrency(
				context,
				item.discount_amount,
			);
		}

		// Calculate amounts
		item.amount = context.flt(
			item.qty * item.rate,
			context.currency_precision,
		);
		item.base_amount = toBaseCurrency(context, item.amount);

		if (context.forceUpdate) context.forceUpdate();
	};

	return {
		updateDiscountAmount,
		calcPrices,
		calcItemPrice,
	};
}
