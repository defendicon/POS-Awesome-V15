type CurrencyItem = {
	plc_conversion_rate?: number;
	original_rate?: number;
	original_currency?: string;
	rate?: number;
	currency?: string;
	base_rate?: number;
	base_price_list_rate?: number;
	price_list_rate?: number;
	[key: string]: unknown;
};

type CurrencyContext = {
	pos_profile: { currency: string };
	price_list_currency?: string;
	selected_currency?: string;
	exchange_rate?: number;
	conversion_rate?: number;
	currency_precision?: number;
	flt?: (_value: unknown, _precision?: number) => number;
};

export function useItemCurrency() {
	const asFiniteNumber = (value: unknown): number | null => {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	};

	const resolvePriceListCurrency = (
		item: CurrencyItem,
		context: CurrencyContext,
	): string => {
		const companyCurrency = context.pos_profile.currency;
		return String(
			item.original_currency ||
			item.price_list_currency ||
			context.price_list_currency ||
			companyCurrency,
		);
	};

	/**
	 * Calculates the rate from Price List Currency to Company Currency.
	 * @param {Object} item
	 * @param {Object} context - Needs: pos_profile, price_list_currency, exchange_rate, conversion_rate
	 * @returns {number}
	 */
	const getPlcToCompanyRate = (
		item: CurrencyItem,
		context: CurrencyContext,
	): number => {
		const companyCurrency = context.pos_profile.currency;
		const priceListCurrency = resolvePriceListCurrency(item, context);
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
	const applyCurrencyConversionToItem = (
		item: CurrencyItem | null | undefined,
		context: CurrencyContext,
	) => {
		if (!item) return;
		const base = context.pos_profile.currency;
		const priceListCurrency = resolvePriceListCurrency(item, context);
		const selectedCurrency = context.selected_currency || base;
		const plc_to_cc_rate = getPlcToCompanyRate(item, context);

		if (asFiniteNumber(item.original_rate) === null) {
			const listRate = asFiniteNumber(item.price_list_rate);
			const baseListRate = asFiniteNumber(item.base_price_list_rate);
			const currentRate = asFiniteNumber(item.rate);
			item.original_rate =
				listRate ??
				(baseListRate !== null && plc_to_cc_rate ? baseListRate / plc_to_cc_rate : null) ??
				currentRate ??
				0;
		}
		item.original_currency = priceListCurrency;

		// original_rate is in price list currency
		const price_list_rate = item.original_rate || 0;

		// Determine base rate using available conversion info (Price List -> Company)
		const base_rate = price_list_rate * plc_to_cc_rate;

		item.base_rate = base_rate;
		item.base_price_list_rate = base_rate;

		// Determine selected rate using exchange rate (Price List -> Selected)
		// item.original_currency is the Price List Currency
		const converted_rate =
			selectedCurrency === priceListCurrency
				? price_list_rate
				: price_list_rate * (context.exchange_rate || 1);

		// context.flt is expected to be available or passed
		const flt = context.flt || ((v: unknown) => Number(v));

		item.rate = flt(converted_rate, context.currency_precision);
		item.currency = selectedCurrency;
		item.price_list_rate = item.rate;
	};

	/**
	 * Batch applies conversion to a list of items.
	 * @param {Array} items
	 * @param {Object} context
	 */
	const applyCurrencyConversionToItems = (
		items: CurrencyItem[],
		context: CurrencyContext,
	) => {
		if (!items || !items.length) return;
		items.forEach((it) => applyCurrencyConversionToItem(it, context));
	};

	return {
		getPlcToCompanyRate,
		applyCurrencyConversionToItem,
		applyCurrencyConversionToItems,
	};
}
