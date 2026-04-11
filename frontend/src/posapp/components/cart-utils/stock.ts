import { parseBooleanSetting } from "../../../utils/stock";
import { useStockUtils } from "../../../composables/pos/shared/useStockUtils";
import { useBatchSerial } from "../../../composables/pos/shared/useBatchSerial";

declare const __: (_text: string, _args?: any[]) => string;
declare const flt: (_value: unknown, _precision?: number) => number;
declare const frappe: any;

let stockUtilsApi: ReturnType<typeof useStockUtils> | null = null;
let batchSerialApi: ReturnType<typeof useBatchSerial> | null = null;

function getStockUtilsApi() {
	if (!stockUtilsApi) {
		stockUtilsApi = useStockUtils();
	}
	return stockUtilsApi;
}

function getBatchSerialApi() {
	if (!batchSerialApi) {
		batchSerialApi = useBatchSerial();
	}
	return batchSerialApi;
}

export function calc_stock_qty(context: any, item: any, value: any) {
	if (!item) return;
	const { calcStockQty } = getStockUtilsApi();

	// Delegate to composable logic
	calcStockQty(item, value);
	// Composable might not handle `this` context specific logic like calling `update_qty_limits` on context
	// In original code:
	// calcStockQty(item, value, this);
	// So if calcStockQty in composable expects context as 3rd arg, we should pass it.
	// Based on imports in invoiceItemMethods.ts: const { calcStockQty } = useStockUtils();
	// It seems it was imported.

	if (context.update_qty_limits) {
		context.update_qty_limits(item);
	}

	const blockSale = Boolean(
		context.pos_profile?.posa_block_sale_beyond_available_qty ||
		context.blockSaleBeyondAvailableQty,
	);
	const allowNegativeStock =
		!blockSale &&
		(parseBooleanSetting(context.stock_settings?.allow_negative_stock) ||
			parseBooleanSetting(item?.allow_negative_stock));
	let clamped = false;
	if (
		blockSale &&
		!allowNegativeStock &&
		item.max_qty !== undefined &&
		flt(item.qty) > item.max_qty
	) {
		context.toastStore.show({
			title: __("Quantity exceeds available stock"),
			text: __(
				"The quantity for {0} has been adjusted to the maximum available stock.",
				[item.item_name],
			),
			color: "warning",
		});
		item.qty = item.max_qty;
		clamped = true;
	}

	if (flt(item.qty) === 0) {
		if (context.remove_item) context.remove_item(item);
		if (context.$forceUpdate) context.$forceUpdate();
		return;
	}

	if (clamped) {
		if (context.calc_item_price) context.calc_item_price(item);
	} else if (!context._applyingPricingRules) {
		if (context.schedulePricingRuleApplication)
			context.schedulePricingRuleApplication();
	}
}

export function update_qty_limits(context: any, item: any) {
	if (item && item.is_stock_item === 0) {
		item.max_qty = undefined;
		item.disable_increment = false;
		return;
	}

	if (item && item._base_actual_qty !== undefined) {
		item.max_qty = flt(
			item._base_actual_qty / (item.conversion_factor || 1),
		);

		// Set increment disable flag based on stock limits
		const blockSale = Boolean(
			context.pos_profile?.posa_block_sale_beyond_available_qty ||
			context.blockSaleBeyondAvailableQty,
		);
		const allowNegativeStock =
			!blockSale &&
			(parseBooleanSetting(
				context.stock_settings?.allow_negative_stock,
			) ||
				parseBooleanSetting(item?.allow_negative_stock));

		if (allowNegativeStock) {
			item.disable_increment = false;
		} else if (blockSale) {
			item.disable_increment = item.qty >= item.max_qty;
		} else {
			item.disable_increment =
				!parseBooleanSetting(
					context.stock_settings?.allow_negative_stock,
				) && item.qty >= item.max_qty;
		}
	}
}

export async function fetch_available_qty(context: any, item: any) {
	if (!item || !item.item_code || !item.warehouse || item.is_stock_item === 0)
		return;

	// Use cache methods from context or import? They were methods on mixin.
	// context._getStockCacheKey etc.
	// We should assume they are available if we didn't extract them to a util module yet.
	// Actually we extracted them to cache.js but haven't decided if mixin exposes them directly.
	// The mixin (invoiceItemMethods) will import * from cache.js and expose them.

	const key = context._getStockCacheKey
		? context._getStockCacheKey(item)
		: null;
	if (key) {
		const cachedQty = context._getCachedStockQty
			? context._getCachedStockQty(key)
			: null;
		if (cachedQty !== null && cachedQty !== undefined) {
			item.available_qty = cachedQty;
			update_qty_limits(context, item);
			return cachedQty;
		}
	}

	const runner = async () => {
		try {
			const response = await frappe.call({
				method: "posawesome.posawesome.api.catalog.get_available_qty",
				args: {
					items: JSON.stringify([
						{
							item_code: item.item_code,
							warehouse: item.warehouse,
							batch_no: item.batch_no,
						},
					]),
				},
			});
			const qty =
				response.message && response.message.length
					? flt(response.message[0].available_qty)
					: 0;

			if (key) {
				if (context._storeStockQty) context._storeStockQty(key, qty);
				// legacy cache support?
				if (context.available_stock_cache) {
					context.available_stock_cache[key] = {
						qty,
						ts: Date.now(),
					};
				}
			}
			item.available_qty = qty;
			update_qty_limits(context, item);
			return qty;
		} catch (error) {
			console.error("Failed to fetch available qty", error);
			throw error;
		}
	};

	if (context.queueItemTask) {
		return context.queueItemTask(item, "fetch_available_qty", runner);
	}
	return runner();
}

export function set_serial_no(context: any, item: any) {
	// legacy delegate
	const { setSerialNo } = getBatchSerialApi();
	return setSerialNo(item, context);
}

export function set_batch_qty(
	context: any,
	item: any,
	value: any,
	update = true,
) {
	// legacy delegate
	const { setBatchQty } = getBatchSerialApi();
	return setBatchQty(item, value, update, context);
}

export function calc_uom(context: any, item: any, value: any) {
	if (!item) return;
	const { calcUom } = getStockUtilsApi();
	console.log("[stock.ts] calc_uom event received", {
		item: item.item_code,
		uom: value,
	});
	const task = () => calcUom(item, value, context);
	if (context.queueItemTask) {
		return context.queueItemTask(item, "calc_uom", task, { force: true });
	}
	return task();
}
