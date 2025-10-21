/* global __, flt */

const truthyFlag = (value) => {
        if (typeof value === "boolean") {
                return value;
        }
        if (typeof value === "number") {
                return value !== 0;
        }
        if (typeof value === "string") {
                const normalized = value.trim().toLowerCase();
                if (!normalized.length) {
                        return false;
                }
                return !["0", "false", "no"].includes(normalized);
        }
        return Boolean(value);
};

const readMaybeFunction = (value) => {
        if (typeof value === "function") {
                try {
                        return value();
                } catch (error) {
                        console.warn("Failed to evaluate function-based value while resolving discounts", error);
                        return undefined;
                }
        }
        return value;
};

const resolveFlt = (context) => {
        if (context && typeof context.flt === "function") {
                return context.flt.bind(context);
        }
        if (typeof flt === "function") {
                return flt;
        }
        return (value) => {
                const parsed = parseFloat(value);
                return Number.isFinite(parsed) ? parsed : 0;
        };
};

const toNumber = (context, value) => {
        if (value === null || value === undefined || value === "") {
                return null;
        }
        if (typeof value === "number") {
                return Number.isFinite(value) ? value : null;
        }
        if (typeof value === "string") {
                const fltFn = resolveFlt(context);
                const parsed = fltFn(value);
                return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
};

const adjustReturnSign = (value, isReturn) => {
        if (!Number.isFinite(value) || value === 0) {
                return value;
        }
        if (isReturn && value > 0) {
                return -value;
        }
        return value;
};

const resolveIsReturn = (context, overrides, doc) => {
        if (overrides && Object.prototype.hasOwnProperty.call(overrides, "isReturn")) {
                return Boolean(overrides.isReturn);
        }
        if (doc && Object.prototype.hasOwnProperty.call(doc, "is_return")) {
                return truthyFlag(doc.is_return);
        }
        if (context && context.invoice_doc && Object.prototype.hasOwnProperty.call(context.invoice_doc, "is_return")) {
                return truthyFlag(context.invoice_doc.is_return);
        }
        if (context && typeof context.isReturnInvoice === "boolean") {
                return context.isReturnInvoice;
        }
        if (context && typeof context.isReturnInvoice === "function") {
                try {
                        return Boolean(context.isReturnInvoice());
                } catch (error) {
                        console.warn("Failed to evaluate isReturnInvoice while resolving discounts", error);
                }
        }
        if (context && context.invoiceType === "Return") {
                return true;
        }
        return false;
};

export function resolveAdditionalDiscountBase(context, overrides = {}) {
        if (!context) {
                return 0;
        }

        const doc = overrides.invoiceDoc ?? context.invoice_doc ?? null;
        const isReturn = resolveIsReturn(context, overrides, doc);

        const candidateNetSources = [];

        if (Object.prototype.hasOwnProperty.call(overrides, "netTotal")) {
                candidateNetSources.push(toNumber(context, overrides.netTotal));
        }

        if (doc && Object.prototype.hasOwnProperty.call(doc, "net_total")) {
                candidateNetSources.push(toNumber(context, doc.net_total));
        }

        if (context && Object.prototype.hasOwnProperty.call(context, "net_total")) {
                candidateNetSources.push(toNumber(context, context.net_total));
        }

        const netCandidate = candidateNetSources.find((val) => val !== null && val !== undefined);
        if (netCandidate !== undefined) {
                return adjustReturnSign(netCandidate, isReturn);
        }

        const grossCandidates = [];

        if (Object.prototype.hasOwnProperty.call(overrides, "total")) {
                grossCandidates.push(toNumber(context, readMaybeFunction(overrides.total)));
        }

        if (doc && Object.prototype.hasOwnProperty.call(doc, "total")) {
                grossCandidates.push(toNumber(context, doc.total));
        }

        if (doc && Object.prototype.hasOwnProperty.call(doc, "grand_total")) {
                grossCandidates.push(toNumber(context, doc.grand_total));
        }

        const contextTotal = readMaybeFunction(context?.Total);
        if (contextTotal !== undefined) {
                grossCandidates.push(toNumber(context, contextTotal));
        }

        if (context && Object.prototype.hasOwnProperty.call(context, "subtotal")) {
                grossCandidates.push(toNumber(context, readMaybeFunction(context.subtotal)));
        }

        let gross = grossCandidates.find((val) => val !== null && val !== undefined);
        if (gross === undefined) {
                gross = 0;
        }

        const taxesSource =
                overrides.taxes ??
                (doc && Array.isArray(doc.taxes) ? doc.taxes : undefined) ??
                (Array.isArray(context?.taxes) ? context.taxes : undefined);

        if (Array.isArray(taxesSource) && taxesSource.length && Number.isFinite(gross) && gross !== 0) {
                let inclusiveTaxTotal = 0;
                taxesSource.forEach((tax) => {
                        if (!tax) {
                                return;
                        }
                        if (!truthyFlag(tax.included_in_print_rate)) {
                                return;
                        }
                        const taxAmount = toNumber(context, tax.tax_amount);
                        if (taxAmount !== null && taxAmount !== undefined) {
                                inclusiveTaxTotal += taxAmount;
                        }
                });

                if (inclusiveTaxTotal) {
                        const netFromTaxes = gross - inclusiveTaxTotal;
                        if (Number.isFinite(netFromTaxes)) {
                                return adjustReturnSign(netFromTaxes, isReturn);
                        }
                }
        }

        return adjustReturnSign(Number.isFinite(gross) ? gross : 0, isReturn);
}

export function applyAdditionalDiscountFromDoc(target, doc, overrides = {}) {
        if (!target || !doc) {
                        return;
        }

        const fltFn = resolveFlt(target);
        const currencyPrecision = overrides.currencyPrecision ?? target?.currency_precision;
        const percentPrecision = overrides.percentPrecision ?? target?.float_precision;

        const overrideContext = { ...overrides, invoiceDoc: doc };
        if (!Object.prototype.hasOwnProperty.call(overrideContext, "total")) {
                overrideContext.total = doc.total ?? doc.grand_total ?? overrideContext.total;
        }
        if (!Object.prototype.hasOwnProperty.call(overrideContext, "netTotal") && Object.prototype.hasOwnProperty.call(doc, "net_total")) {
                overrideContext.netTotal = doc.net_total;
        }
        if (!Object.prototype.hasOwnProperty.call(overrideContext, "taxes") && Array.isArray(doc.taxes)) {
                overrideContext.taxes = doc.taxes;
        }

        let amount = toNumber(target, doc.discount_amount ?? doc.additional_discount ?? 0);
        if (amount === null || amount === undefined) {
                amount = 0;
        }
        amount = currencyPrecision !== undefined ? fltFn(amount, currencyPrecision) : fltFn(amount);

        const base = resolveAdditionalDiscountBase(target, overrideContext);

        let percentage = toNumber(target, doc.additional_discount_percentage);
        if ((percentage === null || percentage === undefined) && Number.isFinite(base) && base !== 0 && amount) {
                percentage = (amount / base) * 100;
        }
        if (percentage === null || percentage === undefined) {
                percentage = 0;
        }
        percentage = percentPrecision !== undefined ? fltFn(percentage, percentPrecision) : fltFn(percentage);

        if (Number.isFinite(base) && base !== 0) {
                const recomputedAmount = (base * percentage) / 100;
                amount = currencyPrecision !== undefined ? fltFn(recomputedAmount, currencyPrecision) : fltFn(recomputedAmount);
        }

        target.additional_discount = amount;
        if (Object.prototype.hasOwnProperty.call(target, "discount_amount")) {
                target.discount_amount = amount;
        }
        target.additional_discount_percentage = percentage;
}

export function useDiscounts() {
        // Update additional discount amount based on percentage
        const updateDiscountAmount = (context) => {
                const fltFn = resolveFlt(context);
                const value = fltFn(context.additional_discount_percentage);
                // If value is too large, reset to 0
                if (value < -100 || value > 100) {
                        context.additional_discount_percentage = 0;
                        context.additional_discount = 0;
                        return;
                }

                const base = resolveAdditionalDiscountBase(context);
                if (!Number.isFinite(base) || base === 0) {
                        context.additional_discount = 0;
                        return;
                }

                const amount = (base * value) / 100;
                const precision = context?.currency_precision;
                context.additional_discount = precision !== undefined ? fltFn(amount, precision) : fltFn(amount);
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
	};
}
