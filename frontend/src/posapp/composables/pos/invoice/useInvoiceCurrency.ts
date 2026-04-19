/**
 * Currency, exchange-rate, and price-list management for the active invoice.
 *
 * **Two exchange rates**
 * The composable tracks two distinct rates that serve different purposes:
 * - `exchange_rate` — price-list currency → selected display currency. Used when
 *   converting item prices for display in the customer's preferred currency.
 * - `conversion_rate` — selected currency → company base currency. Used in
 *   accounting fields (`base_*`) on the invoice document.
 *
 * **Currency and price list data**
 * `fetch_available_currencies` retrieves supported currencies from the server and
 * falls back to `getCachedCurrencyOptions` when offline. Similarly,
 * `fetch_price_lists` uses `getCachedPriceListMeta` as its offline source.
 *
 * **Precision helpers**
 * `flt(value, precision?)` rounds to `currency_precision` by default, while
 * `roundAmount(value)` always uses `currency_precision`. These wrap the shared
 * `format.methods.flt` utility.
 *
 * **Item rate propagation**
 * Calling `update_currency` or `update_item_rates` iterates the current invoice
 * items and recalculates their `rate`, `base_rate`, and `amount` fields using the
 * active exchange and conversion rates. The `bus` event system notifies other
 * composables (e.g. discount recalculation) after each rate change.
 */
import { ref, computed, watch } from "vue";
import { useInvoiceStore } from "../../../stores/invoiceStore";
import { useToastStore } from "../../../stores/toastStore";
import { useUIStore } from "../../../stores/uiStore";
import {
	getCachedCurrencyOptions,
	getCachedExchangeRate,
	getCachedPriceListMeta,
	saveCurrencyOptionsCache,
	saveExchangeRateCache,
	savePriceListMetaCache,
} from "../../../../offline/index";

// @ts-ignore
const __ = window.__ || ((s) => s);
// @ts-ignore
const frappe = window.frappe;

/**
 * useInvoiceCurrency Composable
 * Manages currency conversion, exchange rates, and pricing list logic.
 */
export function useInvoiceCurrency() {
	const invoiceStore = useInvoiceStore();
	const toastStore = useToastStore();
	const uiStore = useUIStore();

	const available_currencies = ref<any[]>([]);
	const selected_currency = ref("");
	const exchange_rate = ref(1);
	const conversion_rate = ref(1);
	const exchange_rate_date = ref(frappe.datetime.nowdate());
	const price_lists = ref<string[]>([]);
	const selected_price_list = ref("");
	const price_list_currency = ref("");

	// Precision settings
	const float_precision = ref(6);
	const currency_precision = ref(6);

	// Get company and pos_profile from UI store
	const pos_profile = computed(() => uiStore.posProfile);
	const company = computed(() => uiStore.companyDoc);

	// Watch for pos_profile changes to update precision
	watch(
		pos_profile,
		(newProfile) => {
			if (newProfile) {
				const prec = parseInt(newProfile.posa_decimal_precision);
				if (!isNaN(prec)) {
					float_precision.value = prec;
					currency_precision.value = prec;
				}
			}
		},
		{ immediate: true },
	);

	const flt = (value: any, precision: number | null = null) => {
		const prec = precision !== null ? precision : float_precision.value;
		const _value = Number(value);
		if (isNaN(_value)) return 0;
		if (Math.abs(_value) < 0.000001) return _value;
		return Number((_value || 0).toFixed(prec));
	};

	const fetch_available_currencies = async () => {
		if (!pos_profile.value) return [];
		const profileName = pos_profile.value.name;
		try {
			const r = await frappe.call({
				method: "posawesome.posawesome.api.invoices.get_available_currencies",
			});

			if (r.message) {
				const baseCurrency = pos_profile.value.currency;
				available_currencies.value = r.message.map((currency: any) => ({
					value: currency.name,
					title: currency.name,
				}));

				available_currencies.value.sort((a, b) => {
					if (a.value === baseCurrency) return -1;
					if (b.value === baseCurrency) return 1;
					return a.value.localeCompare(b.value);
				});

				if (!selected_currency.value) {
					selected_currency.value = baseCurrency;
				}
				saveCurrencyOptionsCache(profileName, available_currencies.value);
				return available_currencies.value;
			}
			return [];
		} catch (error) {
			console.error("Error fetching currencies:", error);
			const cachedCurrencies = getCachedCurrencyOptions(profileName);
			if (Array.isArray(cachedCurrencies) && cachedCurrencies.length) {
				available_currencies.value = cachedCurrencies;
				if (!selected_currency.value) {
					selected_currency.value = pos_profile.value.currency;
				}
				return available_currencies.value;
			}
			const defaultCurrency = pos_profile.value.currency;
			available_currencies.value = [
				{ value: defaultCurrency, title: defaultCurrency },
			];
			selected_currency.value = defaultCurrency;
			return available_currencies.value;
		}
	};

	const update_currency_and_rate = async () => {
		if (!selected_currency.value || !pos_profile.value) return;

		const rateDate =
			(typeof frappe !== "undefined" && frappe.datetime?.get_today?.()) ||
			exchange_rate_date.value ||
			new Date().toISOString().slice(0, 10);
		const companyCurrency =
			(company.value && company.value.default_currency) ||
			pos_profile.value.currency;
		const plCurrency = price_list_currency.value || companyCurrency;

		try {
			// Price list currency to selected currency rate
			if (selected_currency.value === plCurrency) {
				exchange_rate.value = 1;
			} else {
				const r = await frappe.call({
					method: "posawesome.posawesome.api.invoices.fetch_exchange_rate_pair",
					args: {
						from_currency: plCurrency,
						to_currency: selected_currency.value,
					},
				});
				if (r && r.message) {
					exchange_rate.value = r.message.exchange_rate;
					saveExchangeRateCache({
						profileName: pos_profile.value.name,
						company: pos_profile.value.company,
						fromCurrency: plCurrency,
						toCurrency: selected_currency.value,
						date: r.message.date || rateDate,
						exchange_rate: r.message.exchange_rate,
					});
				}
			}

			// Selected currency to company currency rate
			if (selected_currency.value === companyCurrency) {
				conversion_rate.value = 1;
				exchange_rate_date.value = frappe.datetime.get_today();
			} else {
				const r2 = await frappe.call({
					method: "posawesome.posawesome.api.invoices.fetch_exchange_rate_pair",
					args: {
						from_currency: selected_currency.value,
						to_currency: companyCurrency,
					},
				});
				if (r2 && r2.message) {
					conversion_rate.value = r2.message.exchange_rate;
					exchange_rate_date.value = r2.message.date;
					saveExchangeRateCache({
						profileName: pos_profile.value.name,
						company: pos_profile.value.company,
						fromCurrency: selected_currency.value,
						toCurrency: companyCurrency,
						date: r2.message.date || rateDate,
						exchange_rate: r2.message.exchange_rate,
					});
				}
			}
		} catch (error) {
			console.error("Error updating currency:", error);
			const cachedDisplayRate = getCachedExchangeRate({
				profileName: pos_profile.value.name,
				company: pos_profile.value.company,
				fromCurrency: plCurrency,
				toCurrency: selected_currency.value,
				date: rateDate,
			});
			const cachedConversionRate = getCachedExchangeRate({
				profileName: pos_profile.value.name,
				company: pos_profile.value.company,
				fromCurrency: selected_currency.value,
				toCurrency: companyCurrency,
				date: rateDate,
			});
			if (cachedDisplayRate?.exchange_rate) {
				exchange_rate.value = cachedDisplayRate.exchange_rate;
			}
			if (selected_currency.value === companyCurrency) {
				conversion_rate.value = 1;
			} else if (cachedConversionRate?.exchange_rate) {
				conversion_rate.value = cachedConversionRate.exchange_rate;
			}
			if (
				!cachedDisplayRate?.exchange_rate &&
				!(
					selected_currency.value === companyCurrency ||
					cachedConversionRate?.exchange_rate
				)
			) {
				toastStore.show({
					title: __("Error updating currency"),
					color: "error",
				});
			}
		}
	};

	const update_item_rates = async () => {
		console.log(
			"Updating item rates with exchange rate:",
			exchange_rate.value,
		);
		const items = invoiceStore.items;
		const companyCurrency =
			(company.value && company.value.default_currency) ||
			pos_profile.value?.currency;
		const conversionRate = conversion_rate.value || 1;
		const precision = currency_precision.value;

		items.forEach((item: any) => {
			item._skip_calc = true;

			// Ensure base rates exist
			if (!item.base_rate) {
				if (selected_currency.value === companyCurrency) {
					item.base_rate = item.rate;
					item.base_price_list_rate = item.price_list_rate;
					item.base_discount_amount = item.discount_amount || 0;
				} else {
					item.base_rate = item.rate * conversionRate;
					item.base_price_list_rate =
						item.price_list_rate * conversionRate;
					item.base_discount_amount =
						(item.discount_amount || 0) * conversionRate;
				}
			}

			if (selected_currency.value === companyCurrency) {
				item.price_list_rate = item.base_price_list_rate;
				item.rate = item.base_rate;
				item.discount_amount = item.base_discount_amount;
			} else {
				const converted_price = flt(
					item.base_price_list_rate / conversionRate,
					precision,
				);
				const converted_rate = flt(
					item.base_rate / conversionRate,
					precision,
				);
				const converted_discount = flt(
					item.base_discount_amount / conversionRate,
					precision,
				);

				item.price_list_rate =
					converted_price < 0.000001 ? 0 : converted_price;
				item.rate = converted_rate < 0.000001 ? 0 : converted_rate;
				item.discount_amount =
					converted_discount < 0.000001 ? 0 : converted_discount;
			}

			item.amount = flt(item.qty * item.rate, precision);
			item.base_amount = flt(item.qty * item.base_rate, precision);
		});
	};

	const roundAmount = (amount: number) => {
		if (pos_profile.value?.disable_rounded_total) {
			return flt(amount, currency_precision.value);
		}
		const baseCurrency =
			price_list_currency.value || pos_profile.value?.currency;
		if (
			pos_profile.value?.posa_allow_multi_currency &&
			selected_currency.value !== baseCurrency
		) {
			return flt(amount, 2);
		}
		return Math.round(amount);
	};

	const fetch_price_lists = async () => {
		if (!pos_profile.value) return [];
		const profileName = pos_profile.value.name;

		if (pos_profile.value.posa_enable_price_list_dropdown) {
			try {
				const r = await frappe.call({
					method: "posawesome.posawesome.api.utilities.get_selling_price_lists",
				});
				if (r && r.message) {
					price_lists.value = r.message.map((pl: any) => pl.name);
				}
			} catch (error) {
				console.error("Failed fetching price lists", error);
				price_lists.value = [pos_profile.value.selling_price_list];
			}
		} else {
			price_lists.value = [pos_profile.value.selling_price_list];
		}

		if (!selected_price_list.value) {
			selected_price_list.value = pos_profile.value.selling_price_list;
		}

		try {
			const r = await frappe.call({
				method: "posawesome.posawesome.api.invoices.get_price_list_currency",
				args: { price_list: selected_price_list.value },
			});
			if (r && r.message) {
				price_list_currency.value = r.message;
			}
		} catch (error) {
			console.error("Failed fetching price list currency", error);
			const cachedMeta = getCachedPriceListMeta(profileName);
			if (cachedMeta?.price_list_currency) {
				price_list_currency.value = cachedMeta.price_list_currency;
			}
		}

		savePriceListMetaCache(profileName, {
			price_lists: price_lists.value,
			selected_price_list: selected_price_list.value,
			price_list_currency: price_list_currency.value,
		});

		return price_lists.value;
	};

	return {
		available_currencies,
		selected_currency,
		exchange_rate,
		conversion_rate,
		exchange_rate_date,
		price_lists,
		selected_price_list,
		price_list_currency,
		float_precision,
		currency_precision,
		flt,
		fetch_available_currencies,
		update_currency_and_rate,
		update_currency: async (val: string) => {
			if (val) selected_currency.value = val;
			await update_currency_and_rate();
		},
		update_item_rates,
		roundAmount,
		fetch_price_lists,
	};
}
