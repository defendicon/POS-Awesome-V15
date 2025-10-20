/* global __, flt */

const normalizeNumber = (value) => {
        if (value == null || value === "") {
                return 0;
        }

        const numeric = typeof value === "number" ? value : flt(value);
        if (!Number.isFinite(numeric)) {
                return 0;
        }

        return numeric;
};

const normalizePositive = (value) => {
        const numeric = normalizeNumber(value);
        if (!numeric) {
                return 0;
        }

        return numeric < 0 ? Math.abs(numeric) : numeric;
};

const deriveNetFromItems = (items) => {
        if (!Array.isArray(items) || !items.length) {
                return 0;
        }

        let sum = 0;
        let hasNetValues = false;

        items.forEach((item) => {
                if (!item) {
                        return;
                }

                if (item.net_amount != null && item.net_amount !== "") {
                        sum += normalizePositive(item.net_amount);
                        hasNetValues = true;
                        return;
                }

                if (item.net_rate != null && item.net_rate !== "" && item.qty != null) {
                        const netRate = normalizePositive(item.net_rate);
                        const qty = normalizePositive(item.qty);
                        if (netRate && qty) {
                                sum += netRate * qty;
                                hasNetValues = true;
                        }
                }
        });

        return hasNetValues ? sum : 0;
};

const deriveInclusiveTaxTotal = (taxes, doc) => {
        if (!Array.isArray(taxes) || !taxes.length) {
                return 0;
        }

        const conversionRate = doc?.conversion_rate || 1;

        return taxes.reduce((total, tax) => {
                if (!tax) {
                        return total;
                }

                const included = tax.included_in_print_rate === 1 || tax.included_in_print_rate === true;
                if (!included) {
                        return total;
                }

                if (tax.tax_amount != null && tax.tax_amount !== "") {
                        return total + normalizePositive(tax.tax_amount);
                }

                if (tax.base_tax_amount != null && tax.base_tax_amount !== "") {
                        const converted = normalizePositive(tax.base_tax_amount) / conversionRate;
                        return total + converted;
                }

                return total;
        }, 0);
};

const collectCandidateDocs = (context) => {
        const docs = [];

        if (context?.invoice_doc) {
                docs.push(context.invoice_doc);
        }

        if (context?.return_doc && context.return_doc !== context.invoice_doc) {
                docs.push(context.return_doc);
        }

        const storeDocRef = context?.invoiceStore?.invoiceDoc;
        if (storeDocRef) {
                const storeDoc = storeDocRef.value ?? storeDocRef;
                if (storeDoc && storeDoc !== context.invoice_doc && storeDoc !== context.return_doc) {
                        docs.push(storeDoc);
                }
        }

        return docs;
};

const resolveApplyDiscountOn = (context, docs) => {
        for (const doc of docs) {
                if (doc?.apply_discount_on) {
                        return String(doc.apply_discount_on).trim().toLowerCase();
                }
        }

        if (context?.pos_profile?.apply_discount_on) {
                return String(context.pos_profile.apply_discount_on).trim().toLowerCase();
        }

        if (context?.apply_discount_on) {
                return String(context.apply_discount_on).trim().toLowerCase();
        }

        return "";
};

export const getDiscountBase = (context) => {
        if (!context) {
                return 0;
        }

        const docs = collectCandidateDocs(context);
        const applyOn = resolveApplyDiscountOn(context, docs);
        const prefersNet = applyOn === "net total";

        const totalCandidates = [context?.Total, docs[0]?.total, docs[0]?.grand_total];
        const fallbackTotal = totalCandidates
                .map((value) => normalizePositive(value))
                .find((value) => value > 0);

        if (!prefersNet) {
                return fallbackTotal || 0;
        }

        const isTaxInclusiveProfile = Boolean(
                context?.pos_profile?.posa_tax_inclusive ||
                        docs.find((doc) => doc?.posa_tax_inclusive)
        );

        const candidates = docs.length ? docs : [context];

        for (const doc of candidates) {
                if (!doc) {
                        continue;
                }

                const docNetCandidates = [
                        doc.net_total,
                        doc.net_total_after_discount,
                        doc.base_net_total && doc.conversion_rate
                                ? doc.base_net_total / (doc.conversion_rate || 1)
                                : null,
                ];

                for (const candidate of docNetCandidates) {
                        const normalized = normalizePositive(candidate);
                        if (normalized) {
                                return normalized;
                        }
                }

                const netFromItems = deriveNetFromItems(doc.items);
                if (netFromItems) {
                        return netFromItems;
                }

                const docTotal = normalizePositive(doc.total ?? doc.grand_total ?? fallbackTotal);
                if (!docTotal) {
                        continue;
                }

                let inclusiveTax = deriveInclusiveTaxTotal(doc.taxes, doc);

                if (!inclusiveTax && isTaxInclusiveProfile) {
                        inclusiveTax = normalizePositive(doc.total_taxes_and_charges);
                }

                if (inclusiveTax && inclusiveTax < docTotal) {
                        return docTotal - inclusiveTax;
                }
        }

        const netFromContextItems = deriveNetFromItems(context.items);
        if (netFromContextItems) {
                return netFromContextItems;
        }

        return fallbackTotal || 0;
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

                const base = getDiscountBase(context);
                if (base) {
                        context.additional_discount = (base * value) / 100;
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
