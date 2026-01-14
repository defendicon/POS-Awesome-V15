// Benchmark note: keep conversion helpers lightweight to avoid overhead in hot paths.
export const getCompanyCurrency = (context) => context?.pos_profile?.currency;

export const getBaseCurrency = (context) => context?.price_list_currency || getCompanyCurrency(context);

export const isCompanyCurrencySelected = (context) =>
	context.selected_currency === getCompanyCurrency(context);

export const toBaseCurrency = (context, amount) => {
	if (amount == null || isCompanyCurrencySelected(context)) {
		return amount;
	}
	const conversionRate = context.conversion_rate || 1;
	return context.flt(amount * conversionRate, context.currency_precision);
};

export const toSelectedCurrency = (context, amount) => {
	if (amount == null || isCompanyCurrencySelected(context)) {
		return amount;
	}
	const conversionRate = context.conversion_rate || 1;
	return context.flt(amount / conversionRate, context.currency_precision);
};
