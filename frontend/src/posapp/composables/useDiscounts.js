/* global __, flt */

import { toBaseCurrency, toSelectedCurrency } from "../utils/currencyConversion.js";

export function useDiscounts() {
	// Update additional discount amount based on percentage
	const updateDiscountAmount = (context) => {
		let value = flt(context.additional_discount_percentage);
		const usePercentage = Boolean(context.pos_profile?.posa_use_percentage_discount);
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
			context.eventBus.emit("show_message", {
				title: __("Discount limited by POS Profile"),
				message: __("The maximum discount allowed is") + " " + maxDiscount + "%",
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
				const baseTotal = context.isReturnInvoice ? Math.abs(context.Total) : context.Total;

				const percentMagnitude = Math.abs(value);
				let discountAmount = (baseTotal * percentMagnitude) / 100;

				if (value < 0 || context.isReturnInvoice) {
					discountAmount = -Math.abs(discountAmount);
				} else {
					discountAmount = Math.abs(discountAmount);
				}

				context.additional_discount = discountAmount;
			} else {
				const signedTotal = context.isReturnInvoice ? -Math.abs(context.Total) : context.Total;
				context.additional_discount = (signedTotal * value) / 100;
			}
		} else {
			context.additional_discount = 0;
		}
	};

	// Calculate prices and discounts for an item based on field change
	const calcPrices = (item, value, $event, context) => {
		if (!$event?.target?.id || !item) return;

		const fieldId = $event.target.id;
		let newValue = flt(value, context.currency_precision);

		try {
			// Flag to track manual rate changes
			if (["rate", "discount_amount", "discount_percentage"].includes(fieldId)) {
				item._manual_rate_set = true;
				item._manual_rate_set_from_uom = false;
			}

			// Handle negative values
			if (newValue < 0) {
				newValue = 0;
				context.eventBus.emit("show_message", {
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
					item.discount_amount = toSelectedCurrency(context, item.base_discount_amount);

					if (item.base_price_list_rate) {
						item.discount_percentage = context.flt(
							(item.base_discount_amount / item.base_price_list_rate) * 100,
							context.float_precision,
						);
					}
					break;

				case "discount_amount":
					newValue = Math.min(newValue, item.price_list_rate);
					item.discount_amount = newValue;

					item.base_discount_amount = toBaseCurrency(context, item.discount_amount);

					item.base_rate = context.flt(
						item.base_price_list_rate - item.base_discount_amount,
						context.currency_precision,
					);
					item.rate = toSelectedCurrency(context, item.base_rate);

					if (item.base_price_list_rate) {
						item.discount_percentage = context.flt(
							(item.base_discount_amount / item.base_price_list_rate) * 100,
							context.float_precision,
						);
					} else {
						item.discount_percentage = 0;
					}
					break;

				case "discount_percentage":
					newValue = Math.min(newValue, 100);
					item.discount_percentage = context.flt(newValue, context.float_precision);

					item.base_discount_amount = context.flt(
						(item.base_price_list_rate * item.discount_percentage) / 100,
						context.currency_precision,
					);
					item.discount_amount = toSelectedCurrency(context, item.base_discount_amount);

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

			// Update stock calculations and force UI update
			if (context.calc_stock_qty) context.calc_stock_qty(item, item.qty);
			if (context.forceUpdate) context.forceUpdate();
		} catch (error) {
			console.error("Error calculating prices:", error);
			context.eventBus.emit("show_message", {
				title: __("Error calculating prices"),
				color: "error",
			});
		}
	};

	// Calculate item price and discount fields
	const calcItemPrice = (item, context) => {
		// Skip recalculation if called from update_item_rates to avoid double calculations
		if (item._skip_calc) {
			item._skip_calc = false;
			return;
		}

		if (item.locked_price) {
			item.amount = context.flt(item.qty * item.rate, context.currency_precision);
			item.base_amount = toBaseCurrency(context, item.amount);
			if (context.forceUpdate) context.forceUpdate();
			return;
		}

		if (item.posa_offer_applied) {
			item.amount = context.flt(item.qty * item.rate, context.currency_precision);
			item.base_amount = toBaseCurrency(context, item.amount);
			if (context.forceUpdate) context.forceUpdate();
			return;
		}

		if (item.price_list_rate) {
			// Always work with base rates first
			if (!item.base_price_list_rate) {
				item.base_price_list_rate = toBaseCurrency(context, item.price_list_rate);
				item.base_rate = toBaseCurrency(context, item.rate);
			}

			// Convert to selected currency
			item.price_list_rate = toSelectedCurrency(context, item.base_price_list_rate);
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
			item.rate = context.flt(price_list_rate - discount_amount, context.currency_precision);

			// Store base discount amount
			item.base_discount_amount = toBaseCurrency(context, item.discount_amount);
		}

		// Calculate amounts
		item.amount = context.flt(item.qty * item.rate, context.currency_precision);
		item.base_amount = toBaseCurrency(context, item.amount);

		if (context.forceUpdate) context.forceUpdate();
	};

	return {
		updateDiscountAmount,
		calcPrices,
		calcItemPrice,
	};
}
