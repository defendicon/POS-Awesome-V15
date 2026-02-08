import { ref, computed, reactive } from "vue";
import { getItemsTableHeaders } from "../../../utils/itemsTableHeaders.js";

declare const get_currency_symbol: (_currency: string) => string;

type DisplayContext = {
	pos_profile: unknown;
	context: string;
	float_precision: number;
	currency_precision: number;
	exchange_rate: number;
	formatCurrencyPlain: (_value: unknown, _precision: number) => unknown;
	formatFloatPlain: (_value: unknown, _precision: number) => unknown;
};

/**
 * useItemDisplay
 *
 * Manages item display logic, including formatting, currency symbols,
 * precision settings, and table headers.
 */
export function useItemDisplay() {
	const formatCache = new Map<string, unknown>();
	const ctxSource = ref<Partial<DisplayContext> | null>(null);

	const fallbackCtx = reactive<DisplayContext>({
		pos_profile: null,
		context: "pos",
		float_precision: 2,
		currency_precision: 2,
		exchange_rate: 1,
		formatCurrencyPlain: (v: unknown, _p: number) => v,
		formatFloatPlain: (v: unknown, _p: number) => v,
	});

	function registerContext(context: Partial<DisplayContext>) {
		ctxSource.value = context;
	}

	const getCtx = <K extends keyof DisplayContext>(
		key: K,
	): DisplayContext[K] => {
		if (ctxSource.value && ctxSource.value[key] !== undefined) {
			return ctxSource.value[key] as DisplayContext[K];
		}
		return fallbackCtx[key] as DisplayContext[K];
	};

	const currencySymbol = (currency: string) => {
		return get_currency_symbol(currency);
	};

	const format_currency = (
		value: unknown,
		currency: string,
		precision?: number,
	): string => {
		const prec =
			typeof precision === "number"
				? precision
				: getCtx("currency_precision");
		const formatter = getCtx("formatCurrencyPlain");
		const result =
			typeof formatter === "function" ? formatter(value, prec) : value;
		return String(result ?? "");
	};

	const ratePrecision = (value: string | number) => {
		const numericValue =
			typeof value === "string" ? parseFloat(value) : value;
		return Number.isInteger(numericValue)
			? 0
			: getCtx("currency_precision");
	};

	const format_number = (value: unknown, precision?: number): string => {
		const prec =
			typeof precision === "number"
				? precision
				: getCtx("float_precision");
		const formatter = getCtx("formatFloatPlain");
		const result =
			typeof formatter === "function" ? formatter(value, prec) : value;
		return String(result ?? "");
	};

	const hasDecimalPrecision = (value: number) => {
		const exchangeRate = getCtx("exchange_rate");
		if (exchangeRate && exchangeRate !== 1) {
			let convertedValue = value * exchangeRate;
			return !Number.isInteger(convertedValue);
		}
		return !Number.isInteger(value);
	};

	const memoizedFormatCurrency = computed(() => {
		return (value: unknown, currency: string, precision?: number) => {
			const prec = precision ?? getCtx("currency_precision") ?? 2;
			const safeValue = value ?? 0;
			const key = `c_${safeValue}_${currency}_${prec}`;
			if (formatCache.has(key)) return formatCache.get(key);
			const result = format_currency(value, currency, precision);
			formatCache.set(key, result);
			if (formatCache.size > 2000) formatCache.clear();
			return result;
		};
	});

	const memoizedFormatNumber = computed(() => {
		return (value: unknown, precision?: number) => {
			const prec = precision ?? getCtx("float_precision") ?? 2;
			const safeValue = value ?? 0;
			const key = `n_${safeValue}_${prec}`;
			if (formatCache.has(key)) return formatCache.get(key);
			const result = format_number(value, precision);
			formatCache.set(key, result);
			if (formatCache.size > 2000) formatCache.clear();
			return result;
		};
	});

	const headers = computed(() => {
		return getItemsTableHeaders(
			getCtx("context"),
			getCtx("pos_profile") || {},
		);
	});

	function clearFormatCache() {
		formatCache.clear();
	}

	return {
		registerContext,
		currencySymbol,
		format_currency,
		ratePrecision,
		format_number,
		hasDecimalPrecision,
		memoizedFormatCurrency,
		memoizedFormatNumber,
		headers,
		clearFormatCache,
	};
}
