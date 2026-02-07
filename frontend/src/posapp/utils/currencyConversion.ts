// Benchmark note: keep conversion helpers lightweight to avoid overhead in hot paths.

/**
 * Interface for the context required by currency conversion functions.
 */
export interface CurrencyContext {
	pos_profile?: {
		currency?: string;
	};
	price_list_currency?: string;
	selected_currency?: string;
	conversion_rate?: number;
	currency_precision?: number;
	flt: (_value: number, _precision?: number) => number;
}

/**
 * Gets the company currency from the context.
 */
export const getCompanyCurrency = (
	context: CurrencyContext,
): string | undefined => context?.pos_profile?.currency;

/**
 * Gets the base currency from the context.
 */
export const getBaseCurrency = (context: CurrencyContext): string | undefined =>
	context?.price_list_currency || getCompanyCurrency(context);

/**
 * Checks if the company currency is currently selected.
 */
export const isCompanyCurrencySelected = (context: CurrencyContext): boolean =>
	context.selected_currency === getCompanyCurrency(context);

/**
 * Converts an amount to the base currency.
 */
export const toBaseCurrency = (
	context: CurrencyContext,
	amount: number | null | undefined,
): number | null | undefined => {
	if (amount == null || isCompanyCurrencySelected(context)) {
		return amount;
	}
	const conversionRate = context.conversion_rate || 1;
	return context.flt(amount * conversionRate, context.currency_precision);
};

/**
 * Converts an amount to the selected currency.
 */
export const toSelectedCurrency = (
	context: CurrencyContext,
	amount: number | null | undefined,
): number | null | undefined => {
	if (amount == null || isCompanyCurrencySelected(context)) {
		return amount;
	}
	const conversionRate = context.conversion_rate || 1;
	return context.flt(amount / conversionRate, context.currency_precision);
};
