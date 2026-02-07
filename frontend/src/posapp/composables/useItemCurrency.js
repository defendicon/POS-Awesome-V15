export function useItemCurrency() {
	/**
	 * Calculates the rate from Price List Currency to Company Currency.
	 * @param {Object} item
	 * @param {Object} context - Needs: pos_profile, price_list_currency, exchange_rate, conversion_rate
	 * @returns {number}
	 */
	const getPlcToCompanyRate = (item, context) => {
		const companyCurrency = context.pos_profile.currency;
		const priceListCurrency = context.price_list_currency || companyCurrency;
		// Benchmark note: favor item-level plc_conversion_rate to avoid recomputing PLC->CC.
		return (
			item.plc_conversion_rate ??
			(priceListCurrency === companyCurrency
				? 1
				: (context.exchange_rate || 1) * (context.conversion_rate || 1))
		);
	};

	/**
	 * Applies currency conversion to a single item.
	 * Updates item.rate, item.currency, item.base_rate, item.base_price_list_rate
	 * @param {Object} item
	 * @param {Object} context - Needs: pos_profile, price_list_currency, selected_currency, exchange_rate, currency_precision, flt
	 */
	const applyCurrencyConversionToItem = (item, context) => {
		if (!item) return;
		const base = context.pos_profile.currency;

		if (!item.original_rate) {
			item.original_rate = item.rate;
			item.original_currency = item.currency || base;
		}

		// original_rate is in price list currency
		const price_list_rate = item.original_rate;

		// Determine base rate using available conversion info (Price List -> Company)
		const plc_to_cc_rate = getPlcToCompanyRate(item, context);
		const base_rate = price_list_rate * plc_to_cc_rate;

		item.base_rate = base_rate;
		item.base_price_list_rate = base_rate;

		// Determine selected rate using exchange rate (Price List -> Selected)
		// item.original_currency is the Price List Currency
		const priceListCurrency = context.price_list_currency || base;
		const selectedCurrency = context.selected_currency;

		// Benchmark note: when PLC === SC, keep the displayed rate in PLC to avoid CC bleed-through.
		const converted_rate =
			selectedCurrency === priceListCurrency
				? price_list_rate
				: item.original_currency === selectedCurrency
					? price_list_rate
					: price_list_rate * (context.exchange_rate || 1);

		// context.flt is expected to be available or passed
		const flt = context.flt || ((v, _p) => Number(v));

		item.rate = flt(converted_rate, context.currency_precision);
		item.currency = selectedCurrency;
		item.price_list_rate = item.rate;
	};

	/**
	 * Batch applies conversion to a list of items.
	 * @param {Array} items
	 * @param {Object} context
	 */
	const applyCurrencyConversionToItems = (items, context) => {
		if (!items || !items.length) return;
		items.forEach((it) => applyCurrencyConversionToItem(it, context));
	};

	return {
		getPlcToCompanyRate,
		applyCurrencyConversionToItem,
		applyCurrencyConversionToItems,
	};
}
