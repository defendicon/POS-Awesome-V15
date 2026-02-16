import {
	getStoredCustomer,
	getCachedPriceListItems,
} from "../../../../offline/index";

declare const frappe: any;

export async function fetch_customer_details(context: any) {
	try {
		const customer =
			typeof context.customer === "string"
				? context.customer.trim()
				: "";
		if (!customer) return;

		context.customer_info = {};
		const cachedCustomer = await getStoredCustomer(customer);
		if (cachedCustomer) {
			context.customer_info = cachedCustomer;
		}

		const r = await frappe.call({
			method: "posawesome.posawesome.api.customers.get_customer_info",
			args: { customer },
		});

		if (r?.message) {
			context.customer_info = r.message;
			const resolvedPriceList =
				context.customer_info.customer_price_list ||
				context.customer_info.customer_group_price_list ||
				context.pos_profile?.selling_price_list ||
				"";
			if (
				resolvedPriceList &&
				context.selected_price_list !== resolvedPriceList
			) {
				context.selected_price_list = resolvedPriceList;
			}
			if (context.customer_info.price_list_currency) {
				context.price_list_currency =
					context.customer_info.price_list_currency;
			} else if (resolvedPriceList) {
				context.price_list_currency =
					context.price_list_currency || context.pos_profile.currency;
			} else {
				context.price_list_currency = context.pos_profile.currency;
			}

			// If we have items with default rates (rate=0 or rate not set), re-apply price list
			// Or if we need to enforce customer price list
			if (context.items.length > 0) {
				if (context.update_items_details)
					await context.update_items_details(context.items);
			}
		}
	} catch (error) {
		console.error("Error fetching customer details:", error);
	}
}

export function get_effective_price_list(context: any) {
	if (context.selected_price_list) return context.selected_price_list;
	if (context.customer_info?.customer_price_list)
		return context.customer_info.customer_price_list;
	return context.pos_profile?.selling_price_list;
}

export function get_price_list(context: any) {
	return get_effective_price_list(context);
}

export async function update_price_list(context: any) {
	if (context.items.length && context.apply_cached_price_list) {
		context.apply_cached_price_list(get_price_list(context));
	}
	// Trigger re-pricing/server sync
	if (context.schedulePricingRuleApplication)
		context.schedulePricingRuleApplication(true);
}

export function sync_invoice_customer_details(
	context: any,
	details: any = null,
) {
	if (!details) {
		details = context.customer_info;
	}
	if (!details) return;

	if (context.invoice_doc) {
		if (details.customer_address)
			context.invoice_doc.customer_address = details.customer_address;
		if (details.territory)
			context.invoice_doc.territory = details.territory;
		if (details.contact_person)
			context.invoice_doc.contact_person = details.contact_person;
		if (details.shipping_address)
			context.invoice_doc.shipping_address_name =
				details.shipping_address;
	}
}

export function _applyPriceListRate(
	context: any,
	item: any,
	newRate: number,
	priceCurrency: string,
) {
	if (!item) return;

	if (context._computePriceConversion) {
		const { price_list_rate, base_price_list_rate } =
			context._computePriceConversion(newRate, priceCurrency);

		item.price_list_rate = price_list_rate;
		item.base_price_list_rate = base_price_list_rate;
	} else {
		// Fallback if _computePriceConversion is missing (should verify imports)
		item.price_list_rate = newRate;
		// Logic for base rate conversion if missing would duplicate _computePriceConversion
		// Assuming dependencies are met by context
	}
}

export function _computePriceConversion(
	context: any,
	rate: number,
	priceCurrency: string,
) {
	const companyCurrency =
		(context.company && context.company.default_currency) ||
		context.pos_profile.currency;
	const selectedCurrency = context.selected_currency || companyCurrency;
	const priceListCurrency = context.price_list_currency || companyCurrency;

	let sourceToCompanyRate = 1;
	if (priceCurrency === companyCurrency) {
		sourceToCompanyRate = 1;
	} else if (priceCurrency === selectedCurrency) {
		sourceToCompanyRate = context.conversion_rate || 1;
	} else if (priceCurrency === priceListCurrency) {
		sourceToCompanyRate = context._getPlcConversionRate
			? context._getPlcConversionRate()
			: 1;
	}

	const base_price_list_rate = rate * sourceToCompanyRate;
	const price_list_rate =
		selectedCurrency === companyCurrency
			? base_price_list_rate
			: base_price_list_rate / (context.conversion_rate || 1);

	return {
		price_list_rate,
		base_price_list_rate: base_price_list_rate,
	};
}

export function apply_cached_price_list(context: any, price_list: string) {
	if (!price_list) return;
	const itemsMap = getCachedPriceListItems(price_list);
	if (!itemsMap) return;

	context.items.forEach((item) => {
		if (!item || !item.item_code) return;
		const rateInfo = itemsMap[item.item_code];
		if (rateInfo) {
			_applyPriceListRate(
				context,
				item,
				rateInfo.price_list_rate,
				rateInfo.currency,
			);
		}
	});
}
