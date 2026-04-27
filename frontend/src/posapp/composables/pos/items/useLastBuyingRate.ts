import { ref } from "vue";
import { debounce } from "lodash";

type LastBuyingRate = {
	rate?: number;
	currency?: string;
	uom?: string;
	source?: string;
	invoice?: string;
	posting_date?: string;
	supplier?: string;
};

type LastBuyingRatesMap = Record<string, LastBuyingRate>;

type MaybeRefLike<T> = T | { value: T } | (() => T);

declare const frappe: any;

const unwrapValue = <T>(source: MaybeRefLike<T> | undefined): T | undefined => {
	if (typeof source === "function") {
		return (source as () => T)();
	}
	if (source && typeof source === "object" && "value" in source) {
		return (source as { value: T }).value;
	}
	return source as T | undefined;
};

interface UseLastBuyingRateContext {
	pos_profile?: MaybeRefLike<{ company?: string } | null>;
	supplier?: MaybeRefLike<any>;
	displayedItems?: MaybeRefLike<Array<{ item_code?: string }>>;
	show_last_buying_rate?: MaybeRefLike<boolean>;
}

export function useLastBuyingRate(context: UseLastBuyingRateContext = {}) {
	const { pos_profile, supplier, displayedItems, show_last_buying_rate } = context;

	const lastBuyingRates = ref<LastBuyingRatesMap>({});
	const lastBuyingRateCache = new Map<string, LastBuyingRatesMap>();
	const lastBuyingRateLoading = ref(false);

	const scheduler = debounce(() => {
		fetchLastBuyingRates();
	}, 500);

	const getLastBuyingRate = (item: any): LastBuyingRate | null => {
		if (!unwrapValue(show_last_buying_rate)) return null;
		if (!item?.item_code) return null;
		return lastBuyingRates.value[item.item_code] || null;
	};

	const fetchLastBuyingRates = async () => {
		if (!unwrapValue(show_last_buying_rate)) {
			lastBuyingRates.value = {};
			return;
		}

		const supplierVal = unwrapValue(supplier);
		const itemsVal = unwrapValue(displayedItems);
		if (!itemsVal || itemsVal.length === 0) {
			lastBuyingRates.value = {};
			return;
		}

		const itemCodes = itemsVal
			.map((i: any) => i.item_code)
			.filter(Boolean);

		if (itemCodes.length === 0) return;

		const cacheKey = supplierVal ? `supplier:${supplierVal}` : "supplier:__all__";
		const cached = lastBuyingRateCache.get(cacheKey);
		if (cached) {
			const missingCodes = itemCodes.filter(
				(code: string) => !(code in cached),
			);
			if (missingCodes.length === 0) {
				lastBuyingRates.value = cached;
				return;
			}
		}

		lastBuyingRateLoading.value = true;
		try {
			const profile = unwrapValue(pos_profile);
			const { message } = await frappe.call({
				method: "posawesome.posawesome.api.purchase_orders.get_last_buying_rate",
				args: {
					supplier: supplierVal || null,
					item_codes: JSON.stringify(itemCodes),
					company: profile?.company || null,
				},
			});

			const merged = { ...(cached || {}), ...(message || {}) };
			lastBuyingRateCache.set(cacheKey, merged);
			lastBuyingRates.value = merged;
		} catch (e) {
			console.error("Failed to fetch last buying rates", e);
		} finally {
			lastBuyingRateLoading.value = false;
		}
	};

	const scheduleLastBuyingRateRefresh = () => {
		if (!unwrapValue(show_last_buying_rate)) {
			lastBuyingRates.value = {};
			return;
		}
		scheduler();
	};

	const clearLastBuyingRateCache = () => {
		lastBuyingRateCache.clear();
		lastBuyingRates.value = {};
	};

	return {
		lastBuyingRates,
		lastBuyingRateLoading,
		getLastBuyingRate,
		fetchLastBuyingRates,
		scheduleLastBuyingRateRefresh,
		clearLastBuyingRateCache,
	};
}
