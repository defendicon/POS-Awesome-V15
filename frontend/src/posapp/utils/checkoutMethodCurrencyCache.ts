import {
	getCachedPaymentMethodCurrencyMap,
	savePaymentMethodCurrencyCache,
} from "../../offline/index";

type LoadPaymentMethodCurrencyMapArgs = {
	company: string;
	fetcher: () => Promise<Record<string, string>>;
	offline?: boolean;
};

export async function loadPaymentMethodCurrencyMap({
	company,
	fetcher,
	offline = false,
}: LoadPaymentMethodCurrencyMapArgs) {
	if (!company) {
		return {};
	}

	if (offline) {
		return getCachedPaymentMethodCurrencyMap(company) || {};
	}

	try {
		const result = (await fetcher()) || {};
		savePaymentMethodCurrencyCache(company, result);
		return { ...result };
	} catch (error) {
		console.error("Failed to load payment method currency map", error);
		return getCachedPaymentMethodCurrencyMap(company) || {};
	}
}
