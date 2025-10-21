/* global __, flt */

const unwrap = (input) => {
        if (input === null || input === undefined) {
                return input;
        }

        if (typeof input === "function") {
                try {
                        return unwrap(input());
                } catch (error) {
                        console.warn("Failed to unwrap function value for discount base", error);
                        return null;
                }
        }

        if (typeof input === "object" && "value" in input) {
                return unwrap(input.value);
        }

        return input;
};

const toFiniteNumber = (value) => {
        const unwrapped = unwrap(value);
        if (unwrapped === null || unwrapped === undefined || unwrapped === "") {
                return null;
        }

        if (typeof unwrapped === "number") {
                        return Number.isFinite(unwrapped) ? unwrapped : null;
        }

        const parsed = Number.parseFloat(unwrapped);
        return Number.isFinite(parsed) ? parsed : null;
};

const isReturnInvoiceContext = (context) => {
        if (!context) return false;

        try {
                if (typeof context.isReturnInvoice === "function" && context.isReturnInvoice()) {
                        return true;
                }
        } catch (error) {
                console.warn("Error evaluating isReturnInvoice", error);
        }

        if (context.invoiceType === "Return") {
                return true;
        }

        const doc = context.invoice_doc;
        if (!doc) {
                return false;
        }

        const isReturnRaw = unwrap(doc.is_return);
        if (typeof isReturnRaw === "string") {
                return ["1", "true", "yes"].includes(isReturnRaw.trim().toLowerCase());
        }

        return Boolean(isReturnRaw);
};

const pickFirstNumber = (candidates, makePositive) => {
        for (const candidate of candidates) {
                const number = toFiniteNumber(candidate);
                if (number === null) {
                        continue;
                }

                return {
                        value: makePositive ? Math.abs(number) : number,
                        found: true,
                };
        }

        return {
                value: 0,
                found: false,
        };
};

const normalizePrecision = (context, value, precision) => {
        if (!Number.isFinite(value)) {
                return 0;
        }

        if (typeof context?.flt === "function") {
                return context.flt(value, precision);
        }

        if (typeof flt === "function") {
                return flt(value, precision);
        }

        if (typeof precision === "number" && Number.isFinite(precision)) {
                const factor = 10 ** precision;
                return Math.round(value * factor) / factor;
        }

        return value;
};

const computeNetFromTaxes = (context, grossBase, makePositive) => {
        if (!context?.invoice_doc?.taxes?.length) {
                return null;
        }

        let inclusiveSum = 0;
        let foundInclusive = false;

        context.invoice_doc.taxes.forEach((tax) => {
                const includedRaw = unwrap(tax?.included_in_print_rate);
                let isIncluded = false;

                if (typeof includedRaw === "string") {
                        const normalized = includedRaw.trim().toLowerCase();
                        isIncluded = ["1", "true", "yes"].includes(normalized);
                } else {
                        isIncluded = Boolean(includedRaw);
                }

                if (!isIncluded) {
                        return;
                }

                const amount = toFiniteNumber(tax?.tax_amount);
                if (amount === null) {
                        return;
                }

                inclusiveSum += makePositive ? Math.abs(amount) : amount;
                foundInclusive = true;
        });

        if (!foundInclusive) {
                return null;
        }

        const candidate = makePositive ? Math.abs(grossBase - inclusiveSum) : grossBase - inclusiveSum;
        return Number.isFinite(candidate) ? candidate : null;
};

const computeNetFromItems = (context, makePositive) => {
        const items = context?.items || context?.invoice_doc?.items;
        if (!Array.isArray(items) || !items.length) {
                return null;
        }

        let sum = 0;
        let found = false;

        items.forEach((item) => {
                if (!item) return;

                const netAmount = toFiniteNumber(item.net_amount);
                if (netAmount !== null) {
                        sum += makePositive ? Math.abs(netAmount) : netAmount;
                        found = true;
                        return;
                }

                const amount = toFiniteNumber(item.amount);
                if (amount !== null) {
                        sum += makePositive ? Math.abs(amount) : amount;
                        found = true;
                }
        });

        if (!found) {
                        return null;
        }

        return sum;
};

export const getDiscountBaseAmount = (context) => {
        const doc = context?.invoice_doc || {};
        const preferenceRaw = unwrap(doc.apply_discount_on) || unwrap(context?.pos_profile?.apply_discount_on) || "";
        const preference = typeof preferenceRaw === "string" ? preferenceRaw.trim().toLowerCase() : "";
        const preferNet = preference === "net total";

        const makePositive = isReturnInvoiceContext(context);

        const grossResult = pickFirstNumber(
                [
                        context?.Total,
                        doc.total,
                        doc.grand_total,
                        doc.base_total && context?.exchange_rate
                                ? doc.base_total / context.exchange_rate
                                : null,
                ],
                makePositive,
        );

        const grossBase = grossResult.value;

        if (!preferNet) {
                return grossBase;
        }

        const netResult = pickFirstNumber(
                [
                        doc.net_total,
                        doc.base_net_total && context?.exchange_rate
                                ? doc.base_net_total / context.exchange_rate
                                : null,
                ],
                makePositive,
        );

        if (netResult.found) {
                return netResult.value;
        }

        const netFromItems = computeNetFromItems(context, makePositive);
        if (Number.isFinite(netFromItems)) {
                return netFromItems;
        }

        const derivedNet = computeNetFromTaxes(context, grossBase, makePositive);
        if (Number.isFinite(derivedNet)) {
                return derivedNet;
        }

        return grossBase;
};

export const computeAdditionalDiscountAmount = (context, percentage) => {
        const base = getDiscountBaseAmount(context);
        const percentNumber = toFiniteNumber(percentage) ?? 0;

        if (!Number.isFinite(base) || Math.abs(base) < Number.EPSILON) {
                return 0;
        }

        const amount = (base * percentNumber) / 100;
        return normalizePrecision(context, amount, context?.currency_precision);
};

export const computeAdditionalDiscountPercentage = (context, amount) => {
        const base = getDiscountBaseAmount(context);

        if (!Number.isFinite(base) || Math.abs(base) < Number.EPSILON) {
                return 0;
        }

        const discount = toFiniteNumber(amount) ?? 0;
        const percentage = (discount / base) * 100;
        return normalizePrecision(context, percentage, context?.float_precision);
};

export function useDiscounts() {
        // Update additional discount amount based on percentage
        const updateDiscountAmount = (context) => {
                const value = flt(context.additional_discount_percentage);
                // If value is too large, reset to 0
                if (value < -100 || value > 100) {
                        context.additional_discount_percentage = 0;
                        context.additional_discount = 0;
                        return;
                }

                context.additional_discount = computeAdditionalDiscountAmount(context, value);
        };

	// Calculate prices and discounts for an item based on field change
	const calcPrices = (item, value, $event, context) => {
		if (!$event?.target?.id || !item) return;

		const fieldId = $event.target.id;
		let newValue = flt(value, context.currency_precision);

		try {
			// Flag to track manual rate changes
			if (fieldId === "rate") {
				item._manual_rate_set = true;
			}

			// Handle negative values
			if (newValue < 0) {
				newValue = 0;
				context.eventBus.emit("show_message", {
					title: __("Negative values not allowed"),
					color: "error",
				});
			}

			// Convert price_list_rate to current currency for calculations
			const baseCurrency = context.price_list_currency || context.pos_profile.currency;
			const converted_price_list_rate =
				context.selected_currency !== baseCurrency
					? context.flt(item.price_list_rate / context.exchange_rate, context.currency_precision)
					: item.price_list_rate;

			// Field-wise calculations
			switch (fieldId) {
				case "rate":
					// Store base rate and convert to selected currency
					item.base_rate = context.flt(
						newValue / context.exchange_rate,
						context.currency_precision,
					);
					item.rate = newValue;

					// Calculate discount amount in selected currency
					item.discount_amount = context.flt(
						converted_price_list_rate - item.rate,
						context.currency_precision,
					);
					item.base_discount_amount = context.flt(
						item.price_list_rate - item.base_rate,
						context.currency_precision,
					);

					// Calculate percentage based on converted values
					if (converted_price_list_rate) {
						item.discount_percentage = context.flt(
							(item.discount_amount / converted_price_list_rate) * 100,
							context.float_precision,
						);
					}
					break;

				case "discount_amount":
					// Ensure discount amount doesn't exceed price list rate
					newValue = Math.min(newValue, converted_price_list_rate);

					// Store base discount and convert to selected currency
					item.base_discount_amount = context.flt(
						newValue / context.exchange_rate,
						context.currency_precision,
					);
					item.discount_amount = newValue;

					// Update rate based on discount
					item.rate = context.flt(
						converted_price_list_rate - item.discount_amount,
						context.currency_precision,
					);
					item.base_rate = context.flt(
						item.price_list_rate - item.base_discount_amount,
						context.currency_precision,
					);

					// Calculate percentage
					if (converted_price_list_rate) {
						item.discount_percentage = context.flt(
							(item.discount_amount / converted_price_list_rate) * 100,
							context.float_precision,
						);
					} else {
						item.discount_percentage = 0;
					}
					break;

				case "discount_percentage":
					// Ensure percentage doesn't exceed 100%
					newValue = Math.min(newValue, 100);
					item.discount_percentage = context.flt(newValue, context.float_precision);

					// Calculate discount amount in selected currency
					item.discount_amount = context.flt(
						(converted_price_list_rate * item.discount_percentage) / 100,
						context.currency_precision,
					);
					item.base_discount_amount = context.flt(
						(item.price_list_rate * item.discount_percentage) / 100,
						context.currency_precision,
					);

					// Update rates
					item.rate = context.flt(
						converted_price_list_rate - item.discount_amount,
						context.currency_precision,
					);
					item.base_rate = context.flt(
						item.price_list_rate - item.base_discount_amount,
						context.currency_precision,
					);
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
			const baseCurrency = context.price_list_currency || context.pos_profile.currency;
			if (context.selected_currency !== baseCurrency) {
				item.base_amount = context.flt(
					item.amount / context.exchange_rate,
					context.currency_precision,
				);
			} else {
				item.base_amount = item.amount;
			}
			if (context.forceUpdate) context.forceUpdate();
			return;
		}

		if (item.posa_offer_applied) {
			item.amount = context.flt(item.qty * item.rate, context.currency_precision);
			const baseCurrency = context.price_list_currency || context.pos_profile.currency;
			if (context.selected_currency !== baseCurrency) {
				item.base_amount = context.flt(
					item.amount / context.exchange_rate,
					context.currency_precision,
				);
			} else {
				item.base_amount = item.amount;
			}
			if (context.forceUpdate) context.forceUpdate();
			return;
		}

		if (item.price_list_rate) {
			// Always work with base rates first
			if (!item.base_price_list_rate) {
				item.base_price_list_rate = item.price_list_rate;
				item.base_rate = item.rate;
			}

			// Convert to selected currency
			const baseCurrency = context.price_list_currency || context.pos_profile.currency;
			if (context.selected_currency !== baseCurrency) {
				item.price_list_rate = context.flt(
					item.base_price_list_rate / context.exchange_rate,
					context.currency_precision,
				);
				item.rate = context.flt(item.base_rate / context.exchange_rate, context.currency_precision);
			} else {
				item.price_list_rate = item.base_price_list_rate;
				item.rate = item.base_rate;
			}
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
			const baseCurrency = context.price_list_currency || context.pos_profile.currency;
			if (context.selected_currency !== baseCurrency) {
				item.base_discount_amount = context.flt(
					discount_amount / context.exchange_rate,
					context.currency_precision,
				);
			} else {
				item.base_discount_amount = item.discount_amount;
			}
		}

		// Calculate amounts
		item.amount = context.flt(item.qty * item.rate, context.currency_precision);
		const baseCurrency = context.price_list_currency || context.pos_profile.currency;
		if (context.selected_currency !== baseCurrency) {
			item.base_amount = context.flt(item.amount / context.exchange_rate, context.currency_precision);
		} else {
			item.base_amount = item.amount;
		}

		if (context.forceUpdate) context.forceUpdate();
	};

        return {
                updateDiscountAmount,
                calcPrices,
                calcItemPrice,
                getDiscountBaseAmount,
                computeAdditionalDiscountAmount,
                computeAdditionalDiscountPercentage,
        };
}
