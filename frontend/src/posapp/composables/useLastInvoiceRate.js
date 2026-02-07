import { ref, reactive, watch, onUnmounted } from "vue";
import _ from "lodash";
import { isOffline } from "../../offline/index.js";

/**
 * Manages fetching and caching of last invoice rates for items per customer.
 */
export function useLastInvoiceRate(context = {}) {
	const {
		pos_profile, // reactive ref or object
		customer, // reactive ref or getter
		displayedItems, // reactive ref or getter
		show_last_invoice_rate, // reactive ref
	} = context;

	// State
	const lastInvoiceRates = ref({});
	const lastInvoiceRateCache = new Map();
	const lastInvoiceRateLoading = ref(false);

	let lastInvoiceRateScheduler = null;

	const fetchLastInvoiceRates = async (itemCodes = []) => {
		// Unwrap values if refs are passed
		const showRate =
			typeof show_last_invoice_rate === "function"
				? show_last_invoice_rate()
				: (show_last_invoice_rate?.value ?? show_last_invoice_rate);
		if (!showRate) {
			lastInvoiceRates.value = {};
			return lastInvoiceRates.value;
		}

		const cust = typeof customer === "function" ? customer() : (customer?.value ?? customer);
		// Handle selectedCustomer ref if passed
		const activeCustomer = cust?.value || cust;

		if (!activeCustomer) {
			lastInvoiceRates.value = {};
			return {};
		}

		const normalizedCodes = Array.from(new Set(itemCodes.filter(Boolean)));
		const cachedForCustomer = lastInvoiceRateCache.get(activeCustomer) || new Map();

		// Initialize from cache
		// We avoid replacing the entire reference of lastInvoiceRates.value if possible,
		// but for simplicity we can just assign a new object.
		lastInvoiceRates.value = Object.fromEntries(cachedForCustomer);

		const missingCodes = normalizedCodes.filter((code) => !cachedForCustomer.has(code));
		if (!missingCodes.length) {
			return lastInvoiceRates.value;
		}

		if (typeof isOffline === "function" && isOffline()) {
			return lastInvoiceRates.value;
		}

		lastInvoiceRateLoading.value = true;
		try {
			const company = pos_profile?.company || pos_profile?.value?.company;
			const res = await frappe.call({
				method: "posawesome.posawesome.api.invoices.get_last_invoice_rates",
				args: {
					customer: activeCustomer,
					item_codes: missingCodes,
					company: company,
				},
			});

			const rows = (res && res.message) || [];
			const updatedCache = new Map(cachedForCustomer);
			rows.forEach((row) => {
				if (row && row.item_code) {
					updatedCache.set(row.item_code, {
						rate: row.rate,
						currency: row.currency,
						invoice: row.invoice,
						uom: row.uom,
						posting_date: row.posting_date,
					});
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
		}
	};

	const refreshLastInvoiceRatesForVisibleItems = async () => {
		const showRate =
			typeof show_last_invoice_rate === "function"
				? show_last_invoice_rate()
				: (show_last_invoice_rate?.value ?? show_last_invoice_rate);

		if (!showRate) {
			lastInvoiceRates.value = {};
			return lastInvoiceRates.value;
		}

		const items =
			typeof displayedItems === "function"
				? displayedItems()
				: (displayedItems?.value ?? displayedItems);

		if (!items || !items.length) {
			lastInvoiceRates.value = {};
			return lastInvoiceRates.value;
		}

		const itemCodes = items.map((it) => it.item_code).filter(Boolean);
		return fetchLastInvoiceRates(itemCodes);
	};

	const scheduleLastInvoiceRateRefresh = () => {
		const showRate =
			typeof show_last_invoice_rate === "function"
				? show_last_invoice_rate()
				: (show_last_invoice_rate?.value ?? show_last_invoice_rate);

		if (!showRate) {
			lastInvoiceRates.value = {};
			return;
		}

		if (!lastInvoiceRateScheduler) {
			lastInvoiceRateScheduler = _.debounce(() => {
				refreshLastInvoiceRatesForVisibleItems();
			}, 200);
		}

		lastInvoiceRateScheduler();
	};

	const getLastInvoiceRate = (item) => {
		const showRate =
			typeof show_last_invoice_rate === "function"
				? show_last_invoice_rate()
				: (show_last_invoice_rate?.value ?? show_last_invoice_rate);

		if (!showRate) {
			return null;
		}

		if (!item || !item.item_code) {
			return null;
		}

		return lastInvoiceRates.value[item.item_code] || null;
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
			() => (typeof displayedItems === "function" ? displayedItems() : displayedItems?.value),
			() => {
				scheduleLastInvoiceRateRefresh();
			},
		);
		watch(
			() => (typeof customer === "function" ? customer() : customer?.value),
			() => {
				scheduleLastInvoiceRateRefresh();
			},
		);
	}

	return {
		lastInvoiceRates,
		lastInvoiceRateLoading,
		fetchLastInvoiceRates,
		refreshLastInvoiceRatesForVisibleItems,
		scheduleLastInvoiceRateRefresh,
		getLastInvoiceRate,
		clearLastInvoiceRateCache,
	};
}
