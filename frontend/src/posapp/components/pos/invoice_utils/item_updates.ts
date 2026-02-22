import stockCoordinator from "../../../utils/stockCoordinator";
import { isOffline } from "../../../../offline/index";

declare const __: (_text: string, _args?: any[]) => string;
declare const frappe: any;

export async function update_items_details(context: any, items: any[]) {
	if (!items?.length) return;
	if (!context.pos_profile) return;

	const currentDoc = context.get_invoice_doc
		? context.get_invoice_doc()
		: context.invoice_doc;
	const lockReturnPricing = Boolean(
		currentDoc?.is_return && currentDoc?.return_against,
	);

	try {
		const response = await frappe.call({
			method: "posawesome.posawesome.api.items.get_items_details",
			args: {
				pos_profile: JSON.stringify(context.pos_profile),
				items_data: JSON.stringify(items),
				price_list: context.get_price_list
					? context.get_price_list()
					: null,
			},
		});

		if (response?.message) {
			const detailMap = new Map();
			response.message.forEach((detail) => {
				if (!detail) return;
				const key = detail.posa_row_id || detail.item_code;
				if (key) detailMap.set(key, detail);
			});

			items.forEach((item) => {
				if (!item) return;

				const key = item.posa_row_id || item.item_code;
				const updated_item = key ? detailMap.get(key) : null;
				if (!updated_item) return;

				item.actual_qty = updated_item.actual_qty;
				item.item_uoms = updated_item.item_uoms;
				item.has_batch_no = updated_item.has_batch_no;
				item.has_serial_no = updated_item.has_serial_no;
				item.allow_negative_stock = updated_item.allow_negative_stock;
				item.batch_no_data = updated_item.batch_no_data;
				item.serial_no_data = updated_item.serial_no_data;

				if (
					item.has_batch_no &&
					context.pos_profile?.posa_auto_set_batch &&
					!item.batch_no &&
					Array.isArray(item.batch_no_data) &&
					item.batch_no_data.length > 0
				) {
					if (context.set_batch_qty)
						context.set_batch_qty(item, null, false);
				}

				if (updated_item.price_list_currency) {
					item.price_list_currency = updated_item.price_list_currency;
				}

				if (
					updated_item.rate !== undefined ||
					updated_item.price_list_rate !== undefined
				) {
					const force =
						context.pos_profile
							?.posa_force_price_from_customer_price_list !==
						false;
					const price =
						updated_item.price_list_rate ?? updated_item.rate ?? 0;
					const priceCurrency =
						updated_item.currency ||
						updated_item.price_list_currency ||
						item.price_list_currency ||
						context.selected_currency;
					const manualLocked =
						item._manual_rate_set === true;
					const shouldOverrideRate =
						!lockReturnPricing &&
						!item.locked_price &&
						!item.posa_offer_applied &&
						!manualLocked;

					if (shouldOverrideRate) {
						if (force || price) {
							if (context._applyPriceListRate)
								context._applyPriceListRate(
									item,
									price,
									priceCurrency,
								);
						}
					} else if (
						!lockReturnPricing &&
						!item.price_list_rate &&
						(force || price)
					) {
						if (context._computePriceConversion) {
							const converted = context._computePriceConversion(
								price,
								priceCurrency,
							);
							if (converted.base_price_list_rate !== undefined) {
								item.base_price_list_rate =
									converted.base_price_list_rate;
							}
							item.price_list_rate = converted.price_list_rate;
						}
					}
				}

				const resolvedCurrency =
					context.selected_currency || updated_item.currency;
				if (resolvedCurrency) {
					item.currency = resolvedCurrency;
				}
			});
		}
	} catch (error) {
		console.error("Error updating items:", error);
		context.toastStore.show({
			title: __("Error updating item details"),
			color: "error",
		});
	}
}

export async function update_item_detail(
	context: any,
	item: any,
	force_update = false,
) {
	if (context.queueItemTask) {
		return context.queueItemTask(
			item,
			"update_item_detail",
			() => _performItemDetailUpdate(context, item, force_update),
			{ force: force_update },
		);
	}
	return _performItemDetailUpdate(context, item, force_update);
}

export async function _performItemDetailUpdate(
	context: any,
	item: any,
	force_update = false,
) {
	if (!item || !item.item_code) return;

	if (item._manual_rate_set && !force_update) return;

	if (force_update) item._detailSynced = false;

	if (!force_update && item._detailSynced) return;

	const cacheKey = context._getItemDetailCacheKey
		? context._getItemDetailCacheKey(item)
		: null;
	if (!force_update && cacheKey) {
		const cachedPayload = context._getCachedItemDetail
			? context._getCachedItemDetail(cacheKey)
			: null;
		if (cachedPayload) {
			_applyItemDetailPayload(context, item, cachedPayload, {
				forceUpdate: force_update,
				fromCache: true,
			});
			item._detailSynced = true;
			return;
		}
	}

	if (item._detailInFlight) return;

	item._detailInFlight = true;

	try {
		const currentDoc = context.get_invoice_doc
			? context.get_invoice_doc()
			: {};
		const response = await frappe.call({
			method: "posawesome.posawesome.api.items.get_item_detail",
			args: {
				warehouse: item.warehouse || context.pos_profile.warehouse,
				doc: currentDoc,
				price_list: context.get_price_list
					? context.get_price_list()
					: null,
				item: {
					item_code: item.item_code,
					customer: context.customer,
					doctype: currentDoc.doctype,
					name: currentDoc.name || `New ${currentDoc.doctype} 1`,
					company: context.pos_profile.company,
					conversion_rate: 1,
					currency: context.pos_profile.currency,
					qty: item.qty,
					price_list_rate:
						item.base_price_list_rate ?? item.price_list_rate ?? 0,
					child_docname: `New ${currentDoc.doctype} Item 1`,
					cost_center: context.pos_profile.cost_center,
					pos_profile: context.pos_profile.name,
					uom: item.uom,
					tax_category: "",
					transaction_type: "selling",
					update_stock: context.pos_profile.update_stock,
					price_list: context.get_price_list
						? context.get_price_list()
						: null,
					has_batch_no: item.has_batch_no,
					has_serial_no: item.has_serial_no,
					serial_no: item.serial_no,
					batch_no: item.batch_no,
					is_stock_item: item.is_stock_item,
				},
			},
		});

		const data = response?.message;
		if (!data) return;

		_applyItemDetailPayload(context, item, data, {
			forceUpdate: force_update,
			fromCache: false,
		});
		if (cacheKey && context._storeItemDetailCache)
			context._storeItemDetailCache(cacheKey, data);
		item._detailSynced = true;
		if (context.$forceUpdate) context.$forceUpdate();
	} catch (error) {
		console.error("Error updating item detail:", error);
		context.toastStore.show({
			title: __("Error updating item details"),
			color: "error",
		});
	} finally {
		item._detailInFlight = false;
	}
}

export function _applyItemDetailPayload(
	context: any,
	item: any,
	data: any,
	options: any = {},
) {
	const { forceUpdate = false } = options;
	const currentDoc = context.get_invoice_doc
		? context.get_invoice_doc()
		: context.invoice_doc;
	const lockReturnPricing = Boolean(
		currentDoc?.is_return && currentDoc?.return_against,
	);
	const preserveLockedPrice = item?.locked_price === true || lockReturnPricing;

	if (!item.warehouse) {
		item.warehouse = context.pos_profile.warehouse;
	}
	if (data.price_list_currency) {
		context.price_list_currency = data.price_list_currency;
	}

	if (data.uom) {
		item.stock_uom = data.stock_uom;
		item.uom = data.uom;
	}
	if (data.conversion_factor) {
		item.conversion_factor = data.conversion_factor;
	}

	item.item_uoms = data.item_uoms || [];

	if (Array.isArray(item.item_uoms) && item.item_uoms.length) {
		const existingIndex = item.item_uoms.findIndex(
			(uom) => uom.uom === item.uom,
		);
		if (existingIndex === -1) {
			item.item_uoms.push({
				uom: item.uom,
				conversion_factor: item.conversion_factor || 1,
			});
		}
	}

	if (data.uom) {
		item.uom = data.uom;
	}

	item.allow_change_warehouse = data.allow_change_warehouse;
	item.locked_price = preserveLockedPrice
		? true
		: data.locked_price === true ||
			data.locked_price === 1 ||
			data.locked_price === "1";
	item.description = data.description;
	item.item_tax_template = data.item_tax_template;
	if (!lockReturnPricing) {
		item.discount_percentage = data.discount_percentage;
	}
	item.warehouse = data.warehouse || item.warehouse;
	item.has_batch_no = data.has_batch_no;
	item.has_serial_no = data.has_serial_no;
	item.allow_negative_stock = data.allow_negative_stock;
	if (data.serial_no !== undefined && data.serial_no !== null) {
		item.serial_no = data.serial_no;
	}
	item.batch_no = data.batch_no;
	item.is_stock_item = data.is_stock_item;
	item.is_fixed_asset = data.is_fixed_asset;
	item.allow_alternative_item = data.allow_alternative_item;

	item.actual_qty = data.actual_qty;
	item.available_qty = data.actual_qty;

	const hasCode =
		item && item.item_code !== undefined && item.item_code !== null;
	const baseActualQty = Number(data.actual_qty);
	if (hasCode && Number.isFinite(baseActualQty)) {
		item._base_actual_qty = baseActualQty;
		item._base_available_qty = baseActualQty;
		stockCoordinator.updateBaseQuantities(
			[
				{
					item_code: item.item_code,
					actual_qty: baseActualQty,
				},
			],
			{ source: "invoice" },
		);
	}

	if (hasCode) {
		stockCoordinator.applyAvailabilityToItem(item, {
			updateBaseAvailable: false,
		});
	}

	if (context.update_qty_limits) {
		context.update_qty_limits(item);
	}

	if (data.barcode) item.barcode = data.barcode;
	if (data.brand) item.brand = data.brand;
	if (data.batch_no) item.batch_no = data.batch_no;
	if (data.serial_no_data) item.serial_no_data = data.serial_no_data;
	if (data.batch_no_data) item.batch_no_data = data.batch_no_data;

	if (Array.isArray(item.serial_no_selected) && item.serial_no_selected.length) {
		// Preserve explicit serial selections even when server response omits `serial_no`.
		item.serial_no = item.serial_no_selected.join("\n");
		item.serial_no_selected_count = item.serial_no_selected.length;
	}

	if (
		item.has_batch_no &&
		context.pos_profile.posa_auto_set_batch &&
		!item.batch_no &&
		Array.isArray(data.batch_no_data) &&
		data.batch_no_data.length > 0
	) {
		item.batch_no_data = data.batch_no_data;
		if (context.set_batch_qty) context.set_batch_qty(item, null, false);
	}

	if (!item.locked_price) {
		if (forceUpdate || !item.base_rate) {
			const plcConversionRate = context._getPlcConversionRate
				? context._getPlcConversionRate()
				: 1;
			if (data.price_list_rate !== 0 || !item.base_price_list_rate) {
				item.base_price_list_rate =
					data.price_list_rate * plcConversionRate;
			}
			if (context._applyPriceListRate) {
				const priceCurrency =
					data.currency ||
					data.price_list_currency ||
					item.price_list_currency ||
					context.selected_currency;
				context._applyPriceListRate(
					item,
					data.price_list_rate,
					priceCurrency,
				);
			}
		}
	}

	const incomingDiscountPct = Number.parseFloat(
		String(data.discount_percentage ?? 0),
	);
	const currentDiscount = Number.parseFloat(
		String(item.discount_amount ?? 0),
	);
	const currentBaseDiscount = Number.parseFloat(
		String(item.base_discount_amount ?? 0),
	);
	const hasExistingDiscount =
		(Number.isFinite(currentDiscount) && currentDiscount > 0) ||
		(Number.isFinite(currentBaseDiscount) && currentBaseDiscount > 0);

	// Preserve existing discounts, but apply server percentage when no explicit discount is present.
	if (
		!item.locked_price &&
		!hasExistingDiscount &&
		Number.isFinite(incomingDiscountPct) &&
		incomingDiscountPct > 0
	) {
		const basePriceListRate = Number.parseFloat(
			String(item.base_price_list_rate ?? data.price_list_rate ?? 0),
		);
		if (Number.isFinite(basePriceListRate) && basePriceListRate > 0) {
			const baseDiscountAmount =
				(basePriceListRate * incomingDiscountPct) / 100;
			const baseRate = Math.max(basePriceListRate - baseDiscountAmount, 0);
			const toDisplay = (value: number) =>
				typeof context._fromBaseCurrency === "function"
					? context._fromBaseCurrency(value)
					: value;
			const fmt = (value: number) =>
				context.flt
					? context.flt(value, context.currency_precision)
					: value;

			item.base_discount_amount = baseDiscountAmount;
			item.base_rate = baseRate;
			item.discount_amount = fmt(toDisplay(baseDiscountAmount));
			item.rate = fmt(toDisplay(baseRate));
			item.base_amount = fmt(baseRate * (Number(item.qty) || 0));
			item.amount = fmt(item.rate * (Number(item.qty) || 0));
		}
	}
}

export function _collectManualRateOverrides(context: any, items: any[]) {
	if (!Array.isArray(items) || !items.length) return [];

	return items
		.filter((item) => item && item._manual_rate_set)
		.map((item) => {
			const keys: any = {
				name: item.name || null,
				posa_row_id: item.posa_row_id || null,
				item_code: item.item_code || null,
				idx:
					item.idx !== undefined && item.idx !== null
						? Number(item.idx)
						: null,
				batch_no: item.batch_no || null,
				serial_no: item.serial_no || null,
			};

			const determineFreeLine = () => {
				if (typeof context._isFreeLine === "function") {
					return context._isFreeLine(item);
				}
				const coerce = (value) =>
					value === true || value === 1 || value === "1";
				return (
					coerce(item?.is_free_item) ||
					coerce(item?.same_item) ||
					(typeof item?.auto_free_source === "string" &&
						item.auto_free_source) ||
					(typeof item?.free_item_source === "string" &&
						item.free_item_source)
				);
			};

			if (determineFreeLine()) {
				keys.is_free_item = 1;
				if (item.auto_free_source)
					keys.auto_free_source = item.auto_free_source;
				if (item.parent_row_id) keys.parent_row_id = item.parent_row_id;
				const rawRule = Array.isArray(item.pricing_rules)
					? item.pricing_rules.find((rule) => !!rule)
					: item.pricing_rules;
				const normalizedRule =
					rawRule || item.source_rule || item.pricing_rule || null;
				if (normalizedRule) keys.source_rule = normalizedRule;
			}

			return {
				keys,
				values: {
					rate: item.rate,
					base_rate: item.base_rate,
					price_list_rate: item.price_list_rate,
					base_price_list_rate: item.base_price_list_rate,
					discount_amount: item.discount_amount,
					base_discount_amount: item.base_discount_amount,
					discount_percentage: item.discount_percentage,
					amount: item.amount,
					base_amount: item.base_amount,
					conversion_factor: item.conversion_factor,
					uom: item.uom,
				},
			};
		});
}

export function _doesManualOverrideMatchItem(
	context: any,
	override: any,
	item: any,
) {
	if (!override?.keys || !item) return false;

	const {
		name,
		posa_row_id,
		item_code,
		idx,
		batch_no,
		serial_no,
		auto_free_source,
		parent_row_id,
		source_rule,
		is_free_item,
	} = override.keys;

	if (name && item.name && name === item.name) return true;
	if (posa_row_id && item.posa_row_id && posa_row_id === item.posa_row_id)
		return true;

	const coerce = (value) => value === true || value === 1 || value === "1";

	if (is_free_item !== undefined && is_free_item !== null) {
		const expectsFree = coerce(is_free_item);
		const itemIsFree =
			(typeof context._isFreeLine === "function" &&
				context._isFreeLine(item)) ||
			coerce(item.is_free_item) ||
			coerce(item.same_item) ||
			Boolean(
				(typeof item.auto_free_source === "string" &&
					item.auto_free_source) ||
				(typeof item.free_item_source === "string" &&
					item.free_item_source),
			);

		if (expectsFree !== itemIsFree) return false;
	}

	if (auto_free_source) {
		const itemSource =
			typeof item.auto_free_source === "string" && item.auto_free_source
				? item.auto_free_source
				: typeof item.free_item_source === "string" &&
					item.free_item_source
					? item.free_item_source
					: null;
		if (itemSource && itemSource !== auto_free_source) return false;
	}

	if (parent_row_id) {
		const itemParent = item.parent_row_id || null;
		if (itemParent && itemParent !== parent_row_id) return false;
	}

	if (source_rule) {
		const rawRule = Array.isArray(item.pricing_rules)
			? item.pricing_rules.find((rule) => !!rule)
			: item.pricing_rules;
		const itemRule =
			rawRule || item.source_rule || item.pricing_rule || null;
		if (itemRule && itemRule !== source_rule) return false;
	}

	if (item_code && item.item_code === item_code) {
		if (idx !== null && idx !== undefined) {
			const itemIdx =
				item.idx !== undefined && item.idx !== null
					? Number(item.idx)
					: null;
			if (itemIdx !== null && itemIdx === idx) return true;
		}

		const batchMatch = (batch_no || null) === (item.batch_no || null);
		const serialMatch = (serial_no || null) === (item.serial_no || null);

		if (batchMatch && serialMatch) return true;
	}

	return false;
}

export function _assignManualOverrideValues(
	context: any,
	item: any,
	values: any = {},
) {
	if (!item || !values) return;

	item._manual_rate_set = true;
	item._manual_rate_set_from_uom = false;

	if (values.uom) item.uom = values.uom;
	if (
		values.conversion_factor !== undefined &&
		values.conversion_factor !== null
	) {
		item.conversion_factor = values.conversion_factor;
	}

	if (values.price_list_rate !== undefined)
		item.price_list_rate = values.price_list_rate;
	if (values.base_price_list_rate !== undefined)
		item.base_price_list_rate = values.base_price_list_rate;
	if (values.rate !== undefined) item.rate = values.rate;
	if (values.base_rate !== undefined) item.base_rate = values.base_rate;
	if (values.discount_amount !== undefined)
		item.discount_amount = values.discount_amount;
	if (values.base_discount_amount !== undefined)
		item.base_discount_amount = values.base_discount_amount;
	if (values.discount_percentage !== undefined)
		item.discount_percentage = values.discount_percentage;

	if (values.amount !== undefined) {
		item.amount = values.amount;
	} else if (typeof item.qty === "number" && typeof item.rate === "number") {
		item.amount = context.flt
			? context.flt(item.qty * item.rate, context.currency_precision)
			: item.qty * item.rate;
	}

	if (values.base_amount !== undefined) {
		item.base_amount = values.base_amount;
	} else if (
		typeof item.qty === "number" &&
		typeof item.base_rate === "number"
	) {
		item.base_amount = context.flt
			? context.flt(item.qty * item.base_rate, context.currency_precision)
			: item.qty * item.base_rate;
	}
}

export function _applyManualRateOverridesToDoc(
	context: any,
	doc: any,
	overrides: any[],
) {
	if (
		!doc ||
		!Array.isArray(doc.items) ||
		!Array.isArray(overrides) ||
		!overrides.length
	)
		return;

	const remaining = [...overrides];

	doc.items.forEach((item) => {
		if (!item || !remaining.length) return;

		const index = remaining.findIndex((entry) =>
			_doesManualOverrideMatchItem(context, entry, item),
		);
		if (index === -1) return;

		const override = remaining.splice(index, 1)[0];
		_assignManualOverrideValues(context, item, override.values);
	});
}

export function _buildManualOverrideKeyFromItem(context: any, item: any) {
	if (!item) return null;

	const idx =
		item.idx !== undefined &&
			item.idx !== null &&
			!Number.isNaN(Number(item.idx))
			? Number(item.idx)
			: null;

	if (!item.name && !item.posa_row_id && !item.item_code) return null;

	return {
		name: item.name || null,
		posa_row_id: item.posa_row_id || null,
		item_code: item.item_code || null,
		idx,
		batch_no: item.batch_no || null,
		serial_no: item.serial_no || null,
	};
}

export function _snapshotManualValuesFromDocItems(context: any, items: any[]) {
	if (!Array.isArray(items) || !items.length) return [];

	const EPSILON = 0.000001;

	return items
		.map((item) => {
			const keys = _buildManualOverrideKeyFromItem(context, item);
			if (!keys) return null;

			const rate = Number(item?.rate ?? 0);
			const priceListRate = Number(item?.price_list_rate ?? rate);
			const baseRate = Number(item?.base_rate ?? 0);
			const basePriceListRate = Number(
				item?.base_price_list_rate ?? baseRate,
			);
			const discountAmount = Number(item?.discount_amount ?? 0);
			const baseDiscountAmount = Number(item?.base_discount_amount ?? 0);
			const discountPercentage = Number(item?.discount_percentage ?? 0);

			const preserveRate =
				item?._manual_rate_set === true ||
				Math.abs(rate - priceListRate) > EPSILON ||
				Math.abs(baseRate - basePriceListRate) > EPSILON ||
				Math.abs(discountAmount) > EPSILON ||
				Math.abs(baseDiscountAmount) > EPSILON ||
				Math.abs(discountPercentage) > EPSILON;

			const preserveUom = Boolean(item?.uom);

			return {
				keys,
				preserveRate,
				preserveUom,
				values: {
					rate: item.rate,
					base_rate: item.base_rate,
					price_list_rate: item.price_list_rate,
					base_price_list_rate: item.base_price_list_rate,
					discount_amount: item.discount_amount,
					base_discount_amount: item.base_discount_amount,
					discount_percentage: item.discount_percentage,
					amount: item.amount,
					base_amount: item.base_amount,
					conversion_factor: item.conversion_factor,
					uom: item.uom,
				},
			};
		})
		.filter((entry) => entry !== null);
}

export function _restoreManualSnapshots(
	context: any,
	items: any[],
	snapshots: any[],
) {
	if (!Array.isArray(items) || !Array.isArray(snapshots) || !snapshots.length)
		return;

	const remaining = [...snapshots];

	items.forEach((item) => {
		if (!item || !remaining.length) return;

		const index = remaining.findIndex((snapshot) =>
			_doesManualOverrideMatchItem(
				context,
				{ keys: snapshot.keys },
				item,
			),
		);

		if (index === -1) return;

		const snapshot = remaining.splice(index, 1)[0];
		const values = snapshot.values || {};

		if (snapshot.preserveRate) {
			_assignManualOverrideValues(context, item, values);
		} else if (snapshot.preserveUom) {
			if (values.uom !== undefined) {
				item.uom = values.uom;
			}
			if (
				values.conversion_factor !== undefined &&
				values.conversion_factor !== null
			) {
				item.conversion_factor = values.conversion_factor;
			}

			if (values.amount !== undefined) {
				item.amount = values.amount;
			} else if (
				typeof item.qty === "number" &&
				typeof item.rate === "number"
			) {
				item.amount = context.flt
					? context.flt(
						item.qty * item.rate,
						context.currency_precision,
					)
					: item.qty * item.rate;
			}

			if (values.base_amount !== undefined) {
				item.base_amount = values.base_amount;
			} else if (
				typeof item.qty === "number" &&
				typeof item.base_rate === "number"
			) {
				item.base_amount = context.flt
					? context.flt(
						item.qty * item.base_rate,
						context.currency_precision,
					)
					: item.qty * item.base_rate;
			}
		}
	});
}

export async function flushBackgroundUpdates(context: any) {
	if (isOffline()) return;

	const itemsToUpdate: any[] = [];
	const items = context.invoiceStore
		? context.invoiceStore.items.value
		: context.items;

	if (!Array.isArray(items)) return;

	items.forEach((item) => {
		if (!item) return;
		if (item._needs_update || item._detailSynced === false) {
			itemsToUpdate.push(item);
		}
	});

	if (itemsToUpdate.length === 0) return;

	try {
		if (context.update_items_details)
			await context.update_items_details(itemsToUpdate);

		itemsToUpdate.forEach((item) => {
			item._needs_update = false;
			item._detailSynced = true;
		});

		if (context.schedulePricingRuleApplication)
			context.schedulePricingRuleApplication();
	} catch (e) {
		console.error("Background flush failed", e);
	}
}

export function _normalizeReturnDocTotals(context: any, doc: any) {
	if (!doc || !doc.is_return) return doc;

	const negate = (val) => (val > 0 ? -Math.abs(val) : val);

	if (doc.grand_total > 0) doc.grand_total = negate(doc.grand_total);
	if (doc.rounded_total > 0) doc.rounded_total = negate(doc.rounded_total);
	if (doc.total > 0) doc.total = negate(doc.total);
	if (doc.base_grand_total > 0)
		doc.base_grand_total = negate(doc.base_grand_total);
	if (doc.base_rounded_total > 0)
		doc.base_rounded_total = negate(doc.base_rounded_total);
	if (doc.base_total > 0) doc.base_total = negate(doc.base_total);
	if (doc.discount_amount > 0)
		doc.discount_amount = negate(doc.discount_amount);
	if (doc.base_discount_amount > 0)
		doc.base_discount_amount = negate(doc.base_discount_amount);

	if (Array.isArray(doc.items)) {
		doc.items.forEach((item) => {
			if (item.qty > 0) item.qty = negate(item.qty);
			if (item.stock_qty > 0) item.stock_qty = negate(item.stock_qty);
			if (item.amount > 0) item.amount = negate(item.amount);
			if (item.base_amount > 0)
				item.base_amount = negate(item.base_amount);
		});
	}

	if (Array.isArray(doc.payments)) {
		doc.payments.forEach((payment) => {
			if (payment.amount > 0) payment.amount = negate(payment.amount);
			if (payment.base_amount > 0)
				payment.base_amount = negate(payment.base_amount);
		});
	}

	return doc;
}

export function applyReturnDiscountProration(context: any) {
	if (
		!context ||
		!context.isReturnInvoice ||
		context.pos_profile?.posa_use_percentage_discount ||
		!context.return_doc ||
		typeof context.return_doc !== "object"
	) {
		return;
	}

	const returnDoc = context.return_doc;
	const originalDiscount = Math.abs(
		Number(context.return_discount_base_amount || returnDoc.discount_amount || 0),
	);
	const originalTotal = Math.abs(
		Number(
			context.return_discount_base_total ??
				returnDoc.total ??
				returnDoc.net_total ??
				returnDoc.grand_total ??
				0,
		),
	);
	const returnTotal = Math.abs(Number(context.Total || 0));

	if (!originalDiscount || !originalTotal || !returnTotal) {
		return;
	}

	const ratio = Math.min(1, returnTotal / originalTotal);
	const prorated = -Math.abs(originalDiscount * ratio);
	const current = Number(context.additional_discount || 0);
	if (Math.abs(current - prorated) > 0.0001) {
		console.log("[POSA][Returns] Hook auto-prorate discount", {
			originalDiscount,
			originalTotal,
			returnTotal,
			ratio,
			prorated,
		});
		context.additional_discount = prorated;
		context.discount_amount = prorated;
		context.additional_discount_percentage = 0;
	}
}
