import { isOffline } from "../../../../offline/index";
import {
	getBaseCurrency,
	getCompanyCurrency,
	toSelectedCurrency,
} from "../../../utils/currencyConversion.js";
import { useToastStore } from "../../../stores/toastStore.js";

export function useStockUtils() {
	const toastStore = useToastStore();
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
		const uomPriceCache: Map<string, number | null> =
			context._uomPriceCache instanceof Map
				? context._uomPriceCache
				: (context._uomPriceCache = new Map());
		const uomPriceCacheKey = `${hasPriceList ? String(priceList) : ""}::${String(item.item_code || "")}::${String(new_uom.uom || "")}`;

		if (uomPriceCache.has(uomPriceCacheKey)) {
			uomRate = uomPriceCache.get(uomPriceCacheKey) ?? null;
		}

		if (priceList && context.getCachedPriceListItems) {
			const cached = context.getCachedPriceListItems(priceList) || [];
			const match = cached.find(
				(p) => p.item_code === item.item_code && p.uom === new_uom.uom,
			);
			if (match) {
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

		console.log("[useStockUtils] calcUom progress", {
			item: item.item_code,
			requestedUom: value,
			foundUom: new_uom?.uom,
			cf: item.conversion_factor,
			uomRate,
			token: activeUomCalcToken
		});

		if (activeUomCalcToken !== item._uom_calc_token) {
			return;
		}

		if (uomRate) {
			item._manual_rate_set = true;
			item._manual_rate_set_from_uom = true;

			// Determine if we need to convert from Price List Currency to Company Currency
			const baseCurrency = getBaseCurrency(context);
			const companyCurrency = getCompanyCurrency(context);
			let conversionFactor = 1;

			if (
				baseCurrency &&
				companyCurrency &&
				baseCurrency !== companyCurrency
			) {
				// uomRate is in Price List Currency. We need it in Company Currency for base_ fields.
				// exchange_rate is Price List -> Selected
				// conversion_rate is Selected -> Company
				// Price List -> Company = (Price List -> Selected) * (Selected -> Company)
				const exchangeRate = context.exchange_rate || 1;
				const conversionRate = context.conversion_rate || 1;
				conversionFactor = exchangeRate * conversionRate;
			}

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
			// exchange_rate is Price List -> Selected.
			// But we are converting from Company -> Selected.
			// conversion_rate is Selected -> Company. So we divide by conversion_rate.

			item.price_list_rate = toSelectedCurrency(context, base_price);
			item.rate = toSelectedCurrency(context, base_rate);
			item.discount_amount = toSelectedCurrency(context, base_discount);


			if (context.calc_stock_qty) context.calc_stock_qty(item, item.qty);
			if (context.forceUpdate) context.forceUpdate();

			console.log("[useStockUtils] calcUom DONE (specific price)", {
				item: item.item_code,
				rate: item.rate,
				price_list_rate: item.price_list_rate,
				base_rate: item.base_rate,
				base_price_list_rate: item.base_price_list_rate,
			});
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

				// Convert to selected currency
				const baseCurrency = getBaseCurrency(context);
				if (context.selected_currency !== baseCurrency) {
					item.rate = context.flt(
						converted_rate / context.exchange_rate,
						context.currency_precision,
					);
					item.price_list_rate = context.flt(
						base_price / context.exchange_rate,
						context.currency_precision,
					);
					item.discount_amount = context.flt(
						(base_price - converted_rate) / context.exchange_rate,
						context.currency_precision,
					);
				} else {
					item.rate = converted_rate;
					item.price_list_rate = base_price;
					item.discount_amount = context.flt(
						base_price - converted_rate,
						context.currency_precision,
					);
				}

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

				// Convert to selected currency if needed
				const baseCurrency = getBaseCurrency(context);
				if (context.selected_currency !== baseCurrency) {
					item.price_list_rate = context.flt(
						updated_base_price / context.exchange_rate,
						context.currency_precision,
					);
					item.discount_amount = context.flt(
						base_discount / context.exchange_rate,
						context.currency_precision,
					);
					item.rate = context.flt(
						item.base_rate / context.exchange_rate,
						context.currency_precision,
					);
				} else {
					item.price_list_rate = updated_base_price;
					item.discount_amount = base_discount;
					item.rate = item.base_rate;
				}
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

			// Convert to selected currency
			const baseCurrency = getBaseCurrency(context);
			if (context.selected_currency !== baseCurrency) {
				item.rate = context.flt(
					item.base_rate / context.exchange_rate,
					context.currency_precision,
				);
				item.price_list_rate = context.flt(
					item.base_price_list_rate / context.exchange_rate,
					context.currency_precision,
				);
			} else {
				item.rate = item.base_rate;
				item.price_list_rate = item.base_price_list_rate;
			}
		}

		// Update item details
		if (context.calc_stock_qty) context.calc_stock_qty(item, item.qty);
		if (context.invoiceStore) {
			context.invoiceStore.touch();
			if (context.invoiceStore.recalculateTotals) {
				context.invoiceStore.recalculateTotals();
			}
		}
		if (context.forceUpdate) context.forceUpdate();

		console.log("[useStockUtils] calcUom DONE (proportionate)", {
			item: item.item_code,
			uom: item.uom,
			cf: item.conversion_factor,
			rate: item.rate,
			price_list_rate: item.price_list_rate,
			orig_base: item.original_base_rate,
			orig_base_pl: item.original_base_price_list_rate,
		});
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
