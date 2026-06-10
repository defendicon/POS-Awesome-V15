import { isOffline } from "../../../../offline/index";
import { itemPriceRepository } from "../../../../offline/repositories/ItemPriceRepository";
import { toSelectedCurrency } from "../../../utils/currencyConversion.js";
import { getPlcConversionRate } from "../../../utils/erpnextCurrency";
import { useToastStore } from "../../../stores/toastStore.js";
import { resolveItemPrice } from "../../../services/itemPriceResolver";

export function useStockUtils() {
	const toastStore = useToastStore();
	const toNumber = (value: any) => {
		const numeric = Number.parseFloat(String(value ?? 0));
		return Number.isFinite(numeric) ? numeric : 0;
	};
	const roundCurrency = (context: any, value: number) =>
		typeof context?.flt === "function"
			? context.flt(value, context.currency_precision)
			: value;
	const syncLineAmounts = (item: any, context: any) => {
		if (!item) return;
		const qty = toNumber(item?.qty);
		const rate = toNumber(item?.rate);
		const baseRate = toNumber(item?.base_rate ?? item?.rate);
		item.amount = roundCurrency(context, qty * rate);
		item.base_amount = roundCurrency(context, qty * baseRate);
	};
	const refreshInvoiceTotals = (context: any) => {
		const invoiceStore = context?.invoiceStore;
		if (!invoiceStore) return;
		if (invoiceStore.triggerUpdateTotals) {
			invoiceStore.triggerUpdateTotals();
		} else if (invoiceStore.recalculateTotals) {
			invoiceStore.recalculateTotals();
		}
	};

	// Calculate UOM conversion and update item rates
	const calcUom = async (item: any, value: any, context: any) => {
		if (!item || !value) return;
		const fixedOfferUom =
			item?.posa_is_offer && item?._offer_constraints?.fixed_uom
				? String(item._offer_constraints.fixed_uom).trim()
				: "";
		if (fixedOfferUom && String(value).trim() !== fixedOfferUom) {
			item.uom = fixedOfferUom;
			toastStore.show({
				title: __("Offer UOM cannot be changed"),
				detail: __("Allowed UOM is {0}", [fixedOfferUom]),
				color: "error",
			});
			if (context?.forceUpdate) {
				context.forceUpdate();
			}
			return;
		}
		item._uom_calc_token = Number(item._uom_calc_token || 0) + 1;
		const activeUomCalcToken = item._uom_calc_token;
		item.uom = value;

		let new_uom = item.item_uoms.find((element) => element.uom == value);

		// try cached uoms when not found on item
		if (!new_uom && context.getItemUOMs) {
			const cached = context.getItemUOMs(item.item_code);
			if (cached.length) {
				item.item_uoms = cached;
				new_uom = cached.find((u) => u.uom == value);
			}
		}

		// fallback to stock uom
		if (!new_uom && item.stock_uom === value) {
			new_uom = { uom: item.stock_uom, conversion_factor: 1 };
			if (!item.item_uoms) item.item_uoms = [];
			item.item_uoms.push(new_uom);
		}

		if (!new_uom) {
			toastStore.show({
				title: __("UOM not found"),
				color: "error",
			});
			return;
		}

		// Store old conversion factor for ratio calculation
		const old_conversion_factor = item.conversion_factor || 1;
		const oldBaseRateRaw = Number.parseFloat(
			String(item.base_rate ?? item.rate ?? 0),
		);
		const oldBasePriceListRaw = Number.parseFloat(
			String(
				item.base_price_list_rate ??
				item.price_list_rate ??
				oldBaseRateRaw,
			),
		);
		const oldBaseRate = Number.isFinite(oldBaseRateRaw)
			? oldBaseRateRaw
			: 0;
		const oldBasePriceListRate = Number.isFinite(oldBasePriceListRaw)
			? oldBasePriceListRaw
			: oldBaseRate;

		// Keep a stock-unit baseline so repeated UOM switches always recalculate
		// from a stable source, even after a UOM-specific rate was applied.
		const isInvalidBase = (val: any) =>
			val === undefined ||
			val === null ||
			!Number.isFinite(Number.parseFloat(String(val))) ||
			Number.parseFloat(String(val)) === 0;

		if (isInvalidBase(item.original_base_rate) && oldBaseRate !== 0) {
			item.original_base_rate =
				old_conversion_factor !== 0
					? oldBaseRate / old_conversion_factor
					: oldBaseRate;
		}
		if (
			isInvalidBase(item.original_base_price_list_rate) &&
			oldBasePriceListRate !== 0
		) {
			item.original_base_price_list_rate =
				old_conversion_factor !== 0
					? oldBasePriceListRate / old_conversion_factor
					: oldBasePriceListRate;
		}

		// Update conversion factor
		item.conversion_factor = new_uom.conversion_factor;

		// Calculate the ratio of new to old conversion factor
		const conversion_ratio = item.conversion_factor / old_conversion_factor;

		// Try to fetch rate for this UOM from price list
		const priceList = context.get_price_list
			? context.get_price_list()
			: null;
		let uomRate: number | null = null;
		const hasPriceList = priceList !== null && priceList !== undefined;
		const activeCustomer = String(
			context?.customer?.value ??
				context?.customer ??
				context?.selectedCustomer?.value ??
				context?.selectedCustomer ??
				"",
		).trim();
		const priceListCurrency = String(
			context?.price_list_currency ||
				context?.pos_profile?.currency ||
				"",
		).trim();
		const postingDate = String(
			context?.posting_date ||
				context?.invoice_doc?.posting_date ||
				new Date().toISOString().slice(0, 10),
		).slice(0, 10);
		const uomPriceCache: Map<string, number | null> =
			context._uomPriceCache instanceof Map
				? context._uomPriceCache
				: (context._uomPriceCache = new Map());
		const uomPriceCacheKey = [
			hasPriceList ? String(priceList) : "",
			String(item.item_code || ""),
			String(new_uom.uom || ""),
			activeCustomer,
			priceListCurrency,
			postingDate,
		].join("::");

		if (uomPriceCache.has(uomPriceCacheKey)) {
			uomRate = uomPriceCache.get(uomPriceCacheKey) ?? null;
		}

		if (uomRate === null && priceList) {
			try {
				const records = await itemPriceRepository.findForItem(
					String(priceList),
					String(item.item_code || ""),
				);
				const resolution = resolveItemPrice({
					records,
					selectedUom: String(new_uom.uom || value),
					stockUom: String(item.stock_uom || ""),
					conversionFactor: toNumber(item.conversion_factor) || 1,
					customer: activeCustomer || null,
					currency: priceListCurrency || null,
					postingDate,
					fallbackStockUnitRate: null,
				});
				if (resolution) {
					uomRate = resolution.rate;
					uomPriceCache.set(uomPriceCacheKey, uomRate);
				}
			} catch (error) {
				console.error("Failed to resolve cached UOM price", error);
			}
		}

		if (priceList && context.getCachedPriceListItems) {
			const cached = context.getCachedPriceListItems(priceList) || [];
			const match = cached.find(
				(p) => p.item_code === item.item_code && p.uom === new_uom.uom,
			);
			if (uomRate === null && match) {
				uomRate = match.price_list_rate ?? match.rate ?? 0;
				uomPriceCache.set(uomPriceCacheKey, uomRate);
			}
		}
		if (
			uomRate === null &&
			typeof isOffline === "function" &&
			!isOffline()
		) {
			try {
				const r = await frappe.call({
					method: "posawesome.posawesome.api.items.get_price_for_uom",
					args: {
						item_code: item.item_code,
						price_list: priceList,
						uom: new_uom.uom,
					},
				});
				if (r.message) {
					uomRate = parseFloat(r.message);
					uomPriceCache.set(uomPriceCacheKey, uomRate);
				} else {
					uomPriceCache.set(uomPriceCacheKey, null);
				}
			} catch (error) {
				console.error("Failed to fetch UOM price", error);
				uomPriceCache.set(uomPriceCacheKey, null);
			}
		}

		if (activeUomCalcToken !== item._uom_calc_token) {
			return;
		}

		if (uomRate !== null) {
			item._manual_rate_set = true;
			item._manual_rate_set_from_uom = true;

			// Determine if we need to convert from Price List Currency to Company Currency
			const conversionFactor = getPlcConversionRate(context);

			// default rates based on fetched UOM price (converted to Company Currency)
			let base_price = uomRate * conversionFactor;
			let base_rate = uomRate * conversionFactor;
			let base_discount = 0;

			// Reapply offer if present
			if (item.posa_offer_applied) {
				const offer =
					context.posOffers && Array.isArray(context.posOffers)
						? context.posOffers.find((o) => {
							if (!o || !o.items) return false;
							const items =
								typeof o.items === "string"
									? JSON.parse(o.items)
									: o.items;
							return (
								Array.isArray(items) &&
								items.includes(item.posa_row_id)
							);
						})
						: null;

				if (offer) {
					if (offer.discount_type === "Rate") {
						// offer.rate is in Price List Currency, convert to Company Currency
						const offerRate = offer.rate * conversionFactor;
						base_rate = context.flt(
							offerRate * item.conversion_factor,
							context.currency_precision,
						);
						base_price = base_rate;
						item.discount_percentage = 0;
					} else if (offer.discount_type === "Discount Percentage") {
						item.discount_percentage = offer.discount_percentage;
						// uomRate is in Price List Currency, convert to Company Currency using base_price calculated above
						base_discount = context.flt(
							(base_price * offer.discount_percentage) / 100,
							context.currency_precision,
						);
						base_rate = context.flt(
							base_price - base_discount,
							context.currency_precision,
						);
					} else if (offer.discount_type === "Discount Amount") {
						// offer.discount_amount is in Price List Currency, convert to Company Currency
						const offerDiscount =
							offer.discount_amount * conversionFactor;
						item.discount_percentage = 0;
						base_discount = context.flt(
							offerDiscount * item.conversion_factor,
							context.currency_precision,
						);
						base_rate = context.flt(
							base_price - base_discount,
							context.currency_precision,
						);
					}
				}
			}

			item.base_price_list_rate = base_price;
			item.base_rate = base_rate;
			item.base_discount_amount = base_discount;

			// Convert to selected currency for display
			// If selected currency != company currency, we need to convert base values (Company Currency) to Selected Currency.
			item.price_list_rate = toSelectedCurrency(context, base_price);
			item.rate = toSelectedCurrency(context, base_rate);
			item.discount_amount = toSelectedCurrency(context, base_discount);
			syncLineAmounts(item, context);


			if (context.calc_stock_qty) context.calc_stock_qty(item, item.qty);
			refreshInvoiceTotals(context);
			if (context.forceUpdate) context.forceUpdate();

			return;
		}

		// No explicit UOM price found, allow normal recalculation but
		// lock the rate when the user selected a non-stock UOM so the
		// backend refresh (triggered when opening payments) does not
		// revert the displayed rate back to the single-unit price.
		const shouldPreserveManualRate =
			value !== item.stock_uom || item.conversion_factor !== 1;
		item._manual_rate_set = shouldPreserveManualRate;
		item._manual_rate_set_from_uom = shouldPreserveManualRate;

		// Reset discount if not offer
		if (!item.posa_offer_applied) {
			item.discount_amount = 0;
			item.discount_percentage = 0;
		}

		// Store original base rates if not already stored
		if (
			!item.posa_offer_applied &&
			(item.original_base_rate === undefined ||
				item.original_base_rate === null ||
				!Number.isFinite(
					Number.parseFloat(String(item.original_base_rate)),
				))
		) {
			item.original_base_rate = item.base_rate / old_conversion_factor;
			item.original_base_price_list_rate =
				item.base_price_list_rate / old_conversion_factor;
		}

		// Update rates based on new conversion factor
		if (item.posa_offer_applied) {
			// For items with offer, recalculate from original offer rate
			const offer =
				context.posOffers && Array.isArray(context.posOffers)
					? context.posOffers.find((o) => {
						if (!o || !o.items) return false;
						const items =
							typeof o.items === "string"
								? JSON.parse(o.items)
								: o.items;
						return (
							Array.isArray(items) &&
							items.includes(item.posa_row_id)
						);
					})
					: null;

			if (offer && offer.discount_type === "Rate") {
				// Apply offer rate with new conversion factor
				const converted_rate = context.flt(
					offer.rate * item.conversion_factor,
				);

				// Determine original base price for reference
				const base_price = context.flt(
					(item.original_base_price_list_rate ??
						item.base_price_list_rate / old_conversion_factor) *
					item.conversion_factor,
					context.currency_precision,
				);

				// Set base rates and maintain original price list rate
				item.base_rate = converted_rate;
				item.base_price_list_rate = base_price;

				item.rate = toSelectedCurrency(context, converted_rate);
				item.price_list_rate = toSelectedCurrency(context, base_price);
				item.discount_amount = toSelectedCurrency(
					context,
					base_price - converted_rate,
				);

				item.base_discount_amount = context.flt(
					base_price - converted_rate,
					context.currency_precision,
				);
				item.discount_percentage = base_price
					? context.flt(
						(item.base_discount_amount / base_price) * 100,
						context.currency_precision,
					)
					: 0;
			} else if (offer && offer.discount_type === "Discount Percentage") {
				// For percentage discount, recalculate from original price but with new conversion factor
				let updated_base_price: number;
				if (item.original_base_price_list_rate) {
					updated_base_price = context.flt(
						item.original_base_price_list_rate *
						item.conversion_factor,
						context.currency_precision,
					);
				} else {
					updated_base_price = context.flt(
						item.base_price_list_rate * conversion_ratio,
						context.currency_precision,
					);
				}

				// Store updated base price
				item.base_price_list_rate = updated_base_price;

				// Recalculate discount based on percentage
				const base_discount = context.flt(
					(updated_base_price * offer.discount_percentage) / 100,
					context.currency_precision,
				);
				item.base_discount_amount = base_discount;
				item.base_rate = context.flt(
					updated_base_price - base_discount,
					context.currency_precision,
				);

				item.price_list_rate = toSelectedCurrency(context, updated_base_price);
				item.discount_amount = toSelectedCurrency(context, base_discount);
				item.rate = toSelectedCurrency(context, item.base_rate);
			}
		} else {
			// For regular items, use standard conversion
			if (item.batch_price) {
				item.base_rate = item.batch_price * item.conversion_factor;
				item.base_price_list_rate = item.base_rate;
			} else {
				const originalBaseRateRaw = Number.parseFloat(
					String(item.original_base_rate),
				);
				const originalBasePriceListRaw = Number.parseFloat(
					String(item.original_base_price_list_rate),
				);
				const originalBaseRate = Number.isFinite(originalBaseRateRaw)
					? originalBaseRateRaw
					: 0;
				const originalBasePriceListRate = Number.isFinite(
					originalBasePriceListRaw,
				)
					? originalBasePriceListRaw
					: originalBaseRate;

				item.base_rate = originalBaseRate * item.conversion_factor;
				item.base_price_list_rate =
					originalBasePriceListRate * item.conversion_factor;
			}

			item.rate = toSelectedCurrency(context, item.base_rate);
			item.price_list_rate = toSelectedCurrency(
				context,
				item.base_price_list_rate,
			);
		}
		syncLineAmounts(item, context);

		// Update item details
		if (context.calc_stock_qty) context.calc_stock_qty(item, item.qty);
		refreshInvoiceTotals(context);
		if (context.forceUpdate) context.forceUpdate();

	};

	// Calculate stock quantity for an item
	const calcStockQty = (item: any, value: number) => {
		item.stock_qty = item.conversion_factor * value;
	};

	return {
		calcUom,
		calcStockQty,
		calc_stock_qty: calcStockQty,
	};
}
