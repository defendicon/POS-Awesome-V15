import { getCachedExchangeRate } from "../../offline/index";

export type PaymentCurrencyRates = Record<string, number>;

type CurrencyDoc = {
	currency?: string;
	conversion_rate?: number;
	posting_date?: string;
};

type CurrencyProfile = {
	currency?: string;
	company?: string;
	name?: string;
};

type PaymentLike = {
	account_currency?: string;
	payment_currency?: string;
	currency?: string;
	mode_of_payment?: string;
	amount?: number;
	base_amount?: number;
};

const toNumber = (value: unknown, fallback = 0): number => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

export const resolveCompanyCurrency = (
	doc?: CurrencyDoc | null,
	profile?: CurrencyProfile | null,
): string => {
	return (
		(doc as any)?.company_currency ||
		(profile as any)?.company_currency ||
		profile?.currency ||
		doc?.currency ||
		""
	);
};

export const resolveTransactionCurrency = (
	doc?: CurrencyDoc | null,
	profile?: CurrencyProfile | null,
): string => doc?.currency || profile?.currency || "";

export const resolvePaymentAccountCurrency = (
	payment?: PaymentLike | null,
	doc?: CurrencyDoc | null,
	profile?: CurrencyProfile | null,
): string =>
	payment?.account_currency ||
	payment?.payment_currency ||
	payment?.currency ||
	resolveTransactionCurrency(doc, profile);

export const getTransactionToCompanyRate = (
	doc?: CurrencyDoc | null,
	profile?: CurrencyProfile | null,
): number => {
	const transactionCurrency = resolveTransactionCurrency(doc, profile);
	const companyCurrency = resolveCompanyCurrency(doc, profile);
	if (!transactionCurrency || transactionCurrency === companyCurrency) {
		return 1;
	}
	return toNumber(doc?.conversion_rate, 1) || 1;
};

export const getCurrencyToCompanyRate = (
	currency: string,
	doc?: CurrencyDoc | null,
	profile?: CurrencyProfile | null,
	rates: PaymentCurrencyRates = {},
): number => {
	const companyCurrency = resolveCompanyCurrency(doc, profile);
	const transactionCurrency = resolveTransactionCurrency(doc, profile);
	if (!currency || currency === companyCurrency) return 1;
	if (currency === transactionCurrency) {
		return getTransactionToCompanyRate(doc, profile);
	}
	const explicitRate = toNumber(rates[currency]);
	if (explicitRate > 0) return explicitRate;

	const cached = getCachedExchangeRate({
		profileName: profile?.name,
		company: profile?.company,
		fromCurrency: currency,
		toCurrency: companyCurrency,
		date: doc?.posting_date,
	});
	if (cached?.exchange_rate) {
		return toNumber(cached.exchange_rate, 1) || 1;
	}

	const inverseCached = getCachedExchangeRate({
		profileName: profile?.name,
		company: profile?.company,
		fromCurrency: companyCurrency,
		toCurrency: currency,
		date: doc?.posting_date,
	});
	if (inverseCached?.exchange_rate) {
		const inverse = toNumber(inverseCached.exchange_rate);
		if (inverse > 0) return 1 / inverse;
	}

	return 1;
};

export const transactionToPaymentCurrency = (
	amount: number,
	payment?: PaymentLike | null,
	doc?: CurrencyDoc | null,
	profile?: CurrencyProfile | null,
	rates: PaymentCurrencyRates = {},
): number => {
	const paymentCurrency = resolvePaymentAccountCurrency(payment, doc, profile);
	const transactionRate = getTransactionToCompanyRate(doc, profile);
	const paymentRate = getCurrencyToCompanyRate(paymentCurrency, doc, profile, rates);
	return paymentRate ? (toNumber(amount) * transactionRate) / paymentRate : toNumber(amount);
};

export const paymentCurrencyToTransaction = (
	amount: number,
	payment?: PaymentLike | null,
	doc?: CurrencyDoc | null,
	profile?: CurrencyProfile | null,
	rates: PaymentCurrencyRates = {},
): number => {
	const paymentCurrency = resolvePaymentAccountCurrency(payment, doc, profile);
	const transactionRate = getTransactionToCompanyRate(doc, profile);
	const paymentRate = getCurrencyToCompanyRate(paymentCurrency, doc, profile, rates);
	return transactionRate ? (toNumber(amount) * paymentRate) / transactionRate : toNumber(amount);
};

export const syncPaymentBaseAmount = (
	payment: PaymentLike,
	doc?: CurrencyDoc | null,
	profile?: CurrencyProfile | null,
	precision = 2,
): void => {
	const factor = Math.pow(10, Math.max(precision, 0));
	const amount = toNumber(payment?.amount);
	const base = amount * getTransactionToCompanyRate(doc, profile);
	payment.base_amount = Math.round((base + Number.EPSILON) * factor) / factor;
};
