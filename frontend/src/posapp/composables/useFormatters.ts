import { computed, reactive } from "vue";

/**
 * Composable for memoized formatting of floats, currency, and quantities.
 * Prevents redundant formatting calculations during high-frequency renders (like virtual scrolling).
 *
 * @param props - Object containing base formatting functions
 */
export function useFormatters(props: {
	formatFloat: (_value: number, _precision?: number | string) => string;
	formatCurrency: (_value: number, _precision?: number | string) => string;
}) {
	const formatCache = reactive(new Map<string, string>());
	const qtyLengthCache = reactive(new Map<number, number>());

	/**
	 * Memoized version of formatFloat.
	 * Caches results up to 5000 entries.
	 */
	const memoizedFormatFloat = computed(() => {
		return (
			value: number | null | undefined,
			precision?: number | string,
		) => {
			if (value === null || value === undefined) return "";
			const key = `f_${value}_${precision ?? "def"}`;
			const cached = formatCache.get(key);
			if (cached !== undefined) return cached;

			const result = props.formatFloat(value, precision);
			formatCache.set(key, result);

			if (formatCache.size > 5000) formatCache.clear();
			return result;
		};
	});

	/**
	 * Memoized version of formatCurrency.
	 * Caches results up to 5000 entries.
	 */
	const memoizedFormatCurrency = computed(() => {
		return (
			value: number | null | undefined,
			precision?: number | string,
		) => {
			if (value === null || value === undefined) return "";
			const key = `c_${value}_${precision ?? "def"}`;
			const cached = formatCache.get(key);
			if (cached !== undefined) return cached;

			const result = props.formatCurrency(value, precision);
			formatCache.set(key, result);

			if (formatCache.size > 5000) formatCache.clear();
			return result;
		};
	});

	/**
	 * Memoized calculation of quantity display length.
	 * Used to adjust font sizes or spacing in tables.
	 */
	const memoizedQtyLength = computed(() => {
		return (qty: number) => {
			const cached = qtyLengthCache.get(qty);
			if (cached !== undefined) return cached;

			const length = String(Math.abs(qty || 0)).replace(".", "").length;
			qtyLengthCache.set(qty, length);

			// Limit cache size to prevent memory leaks
			if (qtyLengthCache.size > 1000) {
				const firstKey = qtyLengthCache.keys().next().value;
				if (firstKey !== undefined) qtyLengthCache.delete(firstKey);
			}

			return length;
		};
	});

	/**
	 * Clears all formatting caches.
	 * Useful when global settings (like currency or precision) change.
	 */
	const clearFormatCache = () => {
		formatCache.clear();
		qtyLengthCache.clear();
	};

	return {
		memoizedFormatFloat,
		memoizedFormatCurrency,
		memoizedQtyLength,
		clearFormatCache,
		formatCache,
	};
}

export default useFormatters;
