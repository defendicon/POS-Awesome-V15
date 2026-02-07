import { ref, computed, reactive } from "vue";
import { getItemsTableHeaders } from "../utils/itemsTableHeaders.js";

/**
 * useItemDisplay
 *
 * Manages item display logic, including formatting, currency symbols,
 * precision settings, and table headers.
 */
export function useItemDisplay() {
	const formatCache = new Map();
	const ctxSource = ref(null);

	const fallbackCtx = reactive({
		pos_profile: null,
		context: "pos",
		float_precision: 2,
		currency_precision: 2,
		exchange_rate: 1,
		formatCurrencyPlain: (v, _p) => v,
		formatFloatPlain: (v, _p) => v,
	});

	function registerContext(context) {
		ctxSource.value = context;
	}

	const getCtx = (key) => {
		if (ctxSource.value && ctxSource.value[key] !== undefined) {
			return ctxSource.value[key];
		}
		return fallbackCtx[key];
	};

	const currencySymbol = (currency) => {
		return get_currency_symbol(currency);
	};

	const format_currency = (value, currency, precision) => {
		const prec = typeof precision === "number" ? precision : getCtx("currency_precision");
		const formatter = getCtx("formatCurrencyPlain");
		return typeof formatter === "function" ? formatter(value, prec) : value;
	};

	const ratePrecision = (value) => {
		const numericValue = typeof value === "string" ? parseFloat(value) : value;
		return Number.isInteger(numericValue) ? 0 : getCtx("currency_precision");
	};

	const format_number = (value, precision) => {
		const prec = typeof precision === "number" ? precision : getCtx("float_precision");
		const formatter = getCtx("formatFloatPlain");
		return typeof formatter === "function" ? formatter(value, prec) : value;
	};

	const hasDecimalPrecision = (value) => {
		const exchangeRate = getCtx("exchange_rate");
		if (exchangeRate && exchangeRate !== 1) {
			let convertedValue = value * exchangeRate;
			return !Number.isInteger(convertedValue);
		}
		return !Number.isInteger(value);
	};

	const memoizedFormatCurrency = computed(() => {
		return (value, currency, precision) => {
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
		return (value, precision) => {
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
		return getItemsTableHeaders(getCtx("context"), getCtx("pos_profile") || {});
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
