import { ref, watch, onUnmounted } from "vue";
import { debounce } from "lodash";
import { isOffline } from "../../../../offline/index";

type MaybeRefLike<T> = T | { value: T } | (() => T);

type LastInvoiceRow = {
	item_code: string;
	rate?: number;
	currency?: string;
	invoice?: string;
	uom?: string;
	posting_date?: string;
};

type LastInvoiceRate = {
	rate?: number;
	currency?: string;
	invoice?: string;
	uom?: string;
	posting_date?: string;
};

type LastInvoiceRatesMap = Record<string, LastInvoiceRate>;

interface UseLastInvoiceRateContext {
	pos_profile?: MaybeRefLike<{ company?: string } | null>;
	customer?: MaybeRefLike<any>;
	displayedItems?: MaybeRefLike<Array<{ item_code?: string }>>;
	show_last_invoice_rate?: MaybeRefLike<boolean>;
	autoRefresh?: boolean;
}

const unwrapValue = <T>(source: MaybeRefLike<T> | undefined): T | undefined => {
	if (typeof source === "function") {
		return (source as () => T)();
	}
	if (source && typeof source === "object" && "value" in source) {
		return (source as { value: T }).value;
	}
	return source as T | undefined;
};

/**
 * Manages fetching and caching of last invoice rates for items per customer.
 */
export function useLastInvoiceRate(context: UseLastInvoiceRateContext = {}) {
	const {
		pos_profile, // reactive ref or object
		customer, // reactive ref or getter
		displayedItems, // reactive ref or getter
		show_last_invoice_rate, // reactive ref
	} = context;

	// State
	const lastInvoiceRates = ref<LastInvoiceRatesMap>({});
	const lastInvoiceRateCache = new Map<any, Map<string, LastInvoiceRate>>();
	const lastInvoiceRateLoading = ref(false);
	const lastInvoiceRateLoadingItems = ref<Set<string>>(new Set());

	let lastInvoiceRateScheduler: ReturnType<typeof debounce> | null = null;

	const fetchLastInvoiceRates = async (itemCodes: string[] = []) => {
		// Unwrap values if refs are passed
		const showRate = Boolean(unwrapValue(show_last_invoice_rate));
		if (!showRate) {
			lastInvoiceRates.value = {};
			return lastInvoiceRates.value;
		}

		const cust = unwrapValue(customer);
		// Handle selectedCustomer ref if passed
		const activeCustomer = (cust as any)?.value || cust;

		if (!activeCustomer) {
			lastInvoiceRates.value = {};
			return {};
		}

		const normalizedCodes = Array.from(new Set(itemCodes.filter(Boolean)));
		const cachedForCustomer =
			lastInvoiceRateCache.get(activeCustomer) || new Map();

		// Initialize from cache
		// We avoid replacing the entire reference of lastInvoiceRates.value if possible,
		// but for simplicity we can just assign a new object.
		lastInvoiceRates.value = Object.fromEntries(cachedForCustomer);

		const missingCodes = normalizedCodes.filter(
			(code) => !cachedForCustomer.has(code),
		);
		if (!missingCodes.length) {
			return lastInvoiceRates.value;
		}

		if (typeof isOffline === "function" && isOffline()) {
			return lastInvoiceRates.value;
		}

		lastInvoiceRateLoading.value = true;
		lastInvoiceRateLoadingItems.value = new Set([
			...lastInvoiceRateLoadingItems.value,
			...missingCodes,
		]);
		try {
			const profile = unwrapValue(pos_profile);
			const company = profile?.company;
			const res = await frappe.call({
				method: "posawesome.posawesome.api.invoices.get_last_invoice_rates",
				args: {
					customer: activeCustomer,
					item_codes: missingCodes,
					company: company,
				},
				freeze: false,
			});

			const rows: LastInvoiceRow[] = (res && res.message) || [];
			const updatedCache = new Map(cachedForCustomer);
			const returnedCodes = new Set<string>();
			rows.forEach((row: LastInvoiceRow) => {
				if (row && row.item_code) {
					returnedCodes.add(row.item_code);
					updatedCache.set(row.item_code, {
						rate: row.rate,
						currency: row.currency,
						invoice: row.invoice,
						uom: row.uom,
						posting_date: row.posting_date,
					});
				}
			});
			missingCodes.forEach((code) => {
				if (!returnedCodes.has(code)) {
					updatedCache.set(code, {});
				}
			});

			lastInvoiceRateCache.set(activeCustomer, updatedCache);
			lastInvoiceRates.value = Object.fromEntries(updatedCache);
			return lastInvoiceRates.value;
		} catch (error) {
			console.error("Failed to fetch last invoice rates", error);
			// Fallback to cache even on error
			lastInvoiceRates.value = Object.fromEntries(cachedForCustomer);
			return lastInvoiceRates.value;
		} finally {
			lastInvoiceRateLoading.value = false;
			const nextLoading = new Set(lastInvoiceRateLoadingItems.value);
			missingCodes.forEach((code) => nextLoading.delete(code));
			lastInvoiceRateLoadingItems.value = nextLoading;
		}
	};

	const refreshLastInvoiceRatesForVisibleItems = async () => {
		const showRate = Boolean(unwrapValue(show_last_invoice_rate));

		if (!showRate) {
			lastInvoiceRates.value = {};
			return lastInvoiceRates.value;
		}

		const items = unwrapValue(displayedItems) || [];

		if (!items || !items.length) {
			lastInvoiceRates.value = {};
			return lastInvoiceRates.value;
		}

		const itemCodes = items
			.map((it) => it?.item_code)
			.filter(Boolean) as string[];
		return fetchLastInvoiceRates(itemCodes);
	};

	const fetchLastInvoiceRateForItem = async (
		item: { item_code?: string } | null | undefined,
	) => {
		const itemCode =
			typeof item?.item_code === "string" ? item.item_code.trim() : "";
		if (!itemCode) {
			return lastInvoiceRates.value;
		}
		return fetchLastInvoiceRates([itemCode]);
	};

	const scheduleLastInvoiceRateRefresh = () => {
		const showRate = Boolean(unwrapValue(show_last_invoice_rate));

		if (!showRate) {
			lastInvoiceRates.value = {};
			return;
		}

		if (!lastInvoiceRateScheduler) {
			lastInvoiceRateScheduler = debounce(() => {
				refreshLastInvoiceRatesForVisibleItems();
			}, 200);
		}

		lastInvoiceRateScheduler();
	};

	const getLastInvoiceRate = (
		item: { item_code?: string } | null | undefined,
	) => {
		const showRate = Boolean(unwrapValue(show_last_invoice_rate));

		if (!showRate) {
			return null;
		}

		if (!item || !item.item_code) {
			return null;
		}

		return lastInvoiceRates.value[item.item_code] || null;
	};

	const isLastInvoiceRateLoading = (
		item: { item_code?: string } | null | undefined,
	) => {
		const itemCode =
			typeof item?.item_code === "string" ? item.item_code.trim() : "";
		return Boolean(itemCode && lastInvoiceRateLoadingItems.value.has(itemCode));
	};

	const clearLastInvoiceRateCache = () => {
		lastInvoiceRateCache.clear();
		lastInvoiceRates.value = {};
	};

	onUnmounted(() => {
		if (lastInvoiceRateScheduler && lastInvoiceRateScheduler.cancel) {
			lastInvoiceRateScheduler.cancel();
		}
		clearLastInvoiceRateCache();
	});

	// Auto-schedule refresh when displayed items change, if configured in context
	if (context.autoRefresh) {
		watch(
			() => unwrapValue(displayedItems),
			() => {
				scheduleLastInvoiceRateRefresh();
			},
		);
		watch(
			() => unwrapValue(customer),
			() => {
				scheduleLastInvoiceRateRefresh();
			},
		);
	}

	return {
		lastInvoiceRates,
		lastInvoiceRateLoading,
		lastInvoiceRateLoadingItems,
		fetchLastInvoiceRates,
		fetchLastInvoiceRateForItem,
		refreshLastInvoiceRatesForVisibleItems,
		scheduleLastInvoiceRateRefresh,
		getLastInvoiceRate,
		isLastInvoiceRateLoading,
		clearLastInvoiceRateCache,
	};
}
