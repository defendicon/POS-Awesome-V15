import { isOffline } from "../../../../offline/index";
import { usePricingRulesStore } from "../../../stores/pricingRulesStore.js";
import { useItemsStore } from "../../../stores/itemsStore.js";
import { evaluatePricingRules } from "../../../../lib/pricingEngine";
import { _syncAutoFreeLines } from "./free_items";

declare const __: (_text: string, _args?: any[]) => string;
declare const frappe: any;

/**
 * Pricing Utils
 * Handles pricing rule application, validation and calculation.
 *
 * Context requirements:
 * - context.pricingRulesStore (optional cache)
 * - context.itemsStore (optional cache)
 * - context.pos_profile
 * - context.items (Array)
 * - context.currency_precision
 * - context.float_precision
 * - context.flt (function)
 * - context.invoice_doc
 * - context.customer_info
 * - context.get_price_list (method)
 * - context.selected_price_list
 * - context.selected_currency
 * - context.price_list_currency
 * - context.company
 * - context.isReturnInvoice (getter)
 * - context._applyingPricingRules (state)
 * - context._pendingPricingRules (state)
 * - context._fromBaseCurrency (method)
 * - context._toBaseCurrency (method)
 * - context._updatePricingBadge (method)
 * - context.$forceUpdate (method, optional)
 */

export function _getPricingRulesStore(context: any) {
	if (!context._pricingRulesStore) {
		context._pricingRulesStore = usePricingRulesStore();
	}
	return context._pricingRulesStore;
}

export function _getItemsStore(context: any) {
	if (!context._itemsStore) {
		context._itemsStore = useItemsStore();
	}
	return context._itemsStore;
}

export function _getPricingContext(context: any) {
	const priceList = context.get_price_list
		? context.get_price_list()
		: context.selected_price_list;
	const selectedCurrency =
		context.selected_currency ||
		context.price_list_currency ||
		context.pos_profile?.currency;
	const doc =
		typeof context.get_invoice_doc === "function"
			? context.get_invoice_doc()
			: context.invoice_doc || {};
	const customerInfo = context.customer_info || {};

	return {
		company: context.pos_profile?.company || doc.company || null,
		price_list:
			priceList || context.pos_profile?.selling_price_list || null,
		currency: selectedCurrency || context.pos_profile?.currency || null,
		date:
			context.posting_date ||
			context.posting_date_display ||
			doc.posting_date ||
			new Date().toISOString().slice(0, 10),
		customer:
			context.customer || doc.customer || customerInfo.customer || null,
		customer_group:
			doc.customer_group || customerInfo.customer_group || null,
		territory: doc.territory || customerInfo.territory || null,
	};
}

function syncAutoFreeLines(context: any, freebiesMap: Map<string, any>) {
	if (typeof context._syncAutoFreeLines === "function") {
		return context._syncAutoFreeLines(freebiesMap);
	}
	return _syncAutoFreeLines(context, freebiesMap);
}

export async function _ensurePricingRules(context: any, force = false) {
	const store = _getPricingRulesStore(context);
	const ctx = _getPricingContext(context);
	if (!ctx.company || !ctx.price_list || !ctx.currency) {
		return { store, ctx };
	}
	await store.ensureActiveRules(ctx, { force });
	return { store, ctx };
}

export function _resolveBaseRate(context: any, item: any) {
	if (!item) {
		return 0;
	}
	const candidates = [
		item.base_price_list_rate,
		item.price_list_rate,
		item.base_rate,
		item.rate,
	];
	for (const candidate of candidates) {
		const numeric = Number.parseFloat(String(candidate ?? 0));
		if (Number.isFinite(numeric) && !Number.isNaN(numeric)) {
			return numeric;
		}
	}
	return 0;
}

export function _resolvePricingQty(context: any, item: any) {
	if (!item) {
		return 0;
	}

	const parse = (value) => {
		const numeric = Number.parseFloat(String(value ?? 0));
		return Number.isFinite(numeric) ? numeric : null;
	};

	const direct = [
		item.stock_qty,
		item.base_qty,
		item.base_quantity,
		item.transfer_qty,
	]
		.map(parse)
		.find((value) => value !== null);

	if (direct !== undefined && direct !== null) {
		return direct;
	}

	const qty = parse(item.qty);
	if (qty === null) {
		return 0;
	}

	const factor = [item.conversion_factor, item.uom_conversion_factor]
		.map(parse)
		.find((value) => value !== null && value !== 0 && value !== 1);

	if (factor !== undefined && factor !== null) {
		return qty * factor;
	}

	return qty;
}

export function _updatePricingBadge(
	context: any,
	item: any,
	applied: any[] = [],
) {
	if (!item) {
		return;
	}
	if (!Array.isArray(applied) || !applied.length) {
		delete item.pricing_rule_badge;
		item.pricing_rule_details = [];
		item.pricing_rules = null;
		return;
	}

	const names = applied.map((detail) => detail.name).filter(Boolean);
	const first = names[0];
	const extraCount = names.length > 1 ? names.length - 1 : 0;
	const label = extraCount
		? `${__("Pricing Rule")}: ${first} (+${extraCount})`
		: `${__("Pricing Rule")}: ${first}`;
	const tooltip = applied
		.map((detail) => {
			const typeLabel = detail.type ? ` (${detail.type})` : "";
			return `${detail.name}${typeLabel}`;
		})
		.join("\n");

	item.pricing_rule_badge = {
		label,
		tooltip,
		names,
	};
	item.pricing_rule_details = applied;
	item.pricing_rules = JSON.stringify(names);
}

export function _applyPricingToLine(
	context: any,
	item: any,
	ctx: any,
	indexes: any,
	freebiesMap: Map<string, any>,
) {
	if (!item) {
		return;
	}

	const manualOverride = item._manual_rate_set === true;
	const allowRateUpdate =
		!item.locked_price && !item.posa_offer_applied && !manualOverride;
	const rawDocQty = Number.parseFloat(item.qty || 0);
	const signedDocQty = Number.isFinite(rawDocQty) ? rawDocQty : 0;
	const docQty = Math.abs(signedDocQty);
	const rawPricingQty = _resolvePricingQty(context, item);
	const pricingQty = Number.isFinite(rawPricingQty)
		? rawPricingQty
		: signedDocQty;
	const qty = Math.abs(pricingQty);

	if (docQty === 0 && qty === 0) {
		return;
	}

	const baseRate = _resolveBaseRate(context, item);
	const { pricing, freebies } = evaluatePricingRules({
		item,
		qty,
		docQty,
		baseRate,
		ctx,
		indexes,
	});

	_updatePricingBadge(context, item, pricing.applied);

	if (allowRateUpdate) {
		const proposedRate = Number.isFinite(pricing.rate)
			? pricing.rate
			: baseRate;
		const proposedDiscount = Number.isFinite(pricing.discountPerUnit)
			? pricing.discountPerUnit
			: baseRate - proposedRate;

		let baseDiscountPerUnit = Math.abs(Number(proposedDiscount || 0));
		if (!Number.isFinite(baseDiscountPerUnit)) {
			baseDiscountPerUnit = 0;
		}
		const maxDiscount = Math.max(baseRate, 0);
		if (baseDiscountPerUnit > maxDiscount) {
			baseDiscountPerUnit = maxDiscount;
		}
		const discountedRate = Math.max(baseRate - baseDiscountPerUnit, 0);
		let effectiveBaseRate = Math.min(proposedRate, baseRate);

		if (discountedRate < effectiveBaseRate) {
			effectiveBaseRate = discountedRate;
		}

		const baseAmount = effectiveBaseRate * signedDocQty;
		const convertedRate = context._fromBaseCurrency(effectiveBaseRate);
		const convertedDiscount =
			context._fromBaseCurrency(baseDiscountPerUnit);
		const normalizedBaseDiscount = Math.abs(baseDiscountPerUnit);
		const normalizedDiscount = Math.abs(convertedDiscount);

		item.base_price_list_rate = baseRate;
		item.base_rate = effectiveBaseRate;
		item.base_discount_amount = normalizedBaseDiscount;
		item.price_list_rate = context.flt
			? context.flt(
				context._fromBaseCurrency(baseRate),
				context.currency_precision,
			)
			: context._fromBaseCurrency(baseRate);
		item.rate = context.flt
			? context.flt(convertedRate, context.currency_precision)
			: convertedRate;
		item.discount_amount = context.flt
			? context.flt(normalizedDiscount, context.currency_precision)
			: normalizedDiscount;
		const rawDiscountPercentage = baseRate
			? (normalizedBaseDiscount / baseRate) * 100
			: 0;
		item.discount_percentage = baseRate
			? context.flt(
				Math.abs(rawDiscountPercentage),
				context.float_precision,
			)
			: 0;
		item.amount = context.flt
			? context.flt(item.rate * item.qty, context.currency_precision)
			: item.rate * item.qty;
		item.base_amount = context.flt
			? context.flt(baseAmount, context.currency_precision)
			: baseAmount;
	}

	if (Array.isArray(freebies)) {
		freebies.forEach((entry) => {
			const key = `${entry.rule}::${entry.item_code}::${item.posa_row_id}`;
			const existing = freebiesMap.get(key) || { qty: 0 };
			const parsedEntryQty = Number(entry.qty || 0) || 0;
			const parsedExistingQty = Number(existing.qty || 0) || 0;
			const parsedEntryStock =
				Number(entry.stock_qty || entry.qty || 0) || 0;
			const parsedExistingStock =
				Number(existing.stock_qty || existing.qty || 0) || 0;
			freebiesMap.set(key, {
				...existing,
				...entry,
				qty: parsedEntryQty + parsedExistingQty,
				stock_qty: parsedEntryStock + parsedExistingStock,
				parentRowId: item.posa_row_id,
			});
		});
	}
}

export async function applyPricingRulesForCart(context: any, force = false) {
	if (context.isReturnInvoice) {
		return;
	}
	if (context._applyingPricingRules) {
		context._pendingPricingRules = true;
		return;
	}

	const ctx = context._getPricingContext ? context._getPricingContext() : {};
	const hasServerContext =
		ctx && ctx.company && ctx.price_list && ctx.currency && !isOffline();

	context._applyingPricingRules = true;
	try {
		await _applyLocalPricingRules(context, force);
		if (hasServerContext) {
			await _applyServerPricingRules(context, ctx);
		}
	} catch (error) {
		console.error("Failed to apply pricing rules via server", error);
		await _applyLocalPricingRules(context, force);
	} finally {
		context._applyingPricingRules = false;
		if (context._pendingPricingRules) {
			context._pendingPricingRules = false;
			applyPricingRulesForCart(context, force);
		}
	}
}

export async function _applyLocalPricingRules(context: any, force = false) {
	try {
		const { store, ctx } = await _ensurePricingRules(context, force);
		if (!store) {
			return;
		}
		const indexes = store.getIndexes ? store.getIndexes() : {};
		const freebiesMap = new Map();

		for (const item of context.items) {
			if (!item || item.is_free_item) {
				continue;
			}
			_applyPricingToLine(context, item, ctx, indexes, freebiesMap);
		}

		syncAutoFreeLines(context, freebiesMap);
		if (typeof context.$forceUpdate === "function") {
			context.$forceUpdate();
		}
	} catch (error) {
		console.error("Failed to apply pricing rules locally", error);
	}
}

export async function _applyServerPricingRules(context: any, ctx: any = {}) {
	if (!ctx || !ctx.company || !ctx.price_list || !ctx.currency) {
		return;
	}

	const freebiesMap = new Map();
	const precision = context.currency_precision || 2;
	const toBase = (value, fallback = 0) => {
		const numeric = Number.parseFloat(String(value ?? fallback ?? 0));
		if (!Number.isFinite(numeric)) {
			return 0;
		}
		if (context._toBaseCurrency) {
			return context._toBaseCurrency(numeric);
		}
		return numeric;
	};
	const fromBase = (value) => {
		const numeric = Number.parseFloat(String(value ?? 0)) || 0;
		if (context._fromBaseCurrency) {
			return context._fromBaseCurrency(numeric);
		}
		return numeric;
	};

	const parseServerFloat = (value) => {
		const numeric = Number.parseFloat(String(value ?? 0));
		return Number.isFinite(numeric) ? numeric : null;
	};

	const asServerBool = (value) =>
		value === true || value === 1 || value === "1";

	const sameItemFreeParents = new Map();
	const sameItemFreeCodes = new Set();
	const existingFreebieSnapshots = new Map();

	const registerExistingFreebie = (key, line) => {
		if (!key || !line) {
			return;
		}

		const segments = key.split("::");
		const parentSegment =
			segments.length > 2 ? segments.slice(2).join("::") : null;

		const sameItemFlag =
			asServerBool(line.same_item) ||
			line.same_item === 1 ||
			line.same_item === "1";

		const snapshot = {
			parentRowId: line.parent_row_id || parentSegment || null,
			qty: parseServerFloat(line.qty),
			stock_qty: parseServerFloat(line.stock_qty),
			base_rate: parseServerFloat(line.base_rate ?? line.rate),
			rate: parseServerFloat(line.rate),
			base_price_list_rate: parseServerFloat(
				line.base_price_list_rate ?? line.price_list_rate,
			),
			price_list_rate: parseServerFloat(line.price_list_rate),
			base_discount_amount: parseServerFloat(
				line.base_discount_amount ?? line.discount_amount,
			),
			discount_amount: parseServerFloat(line.discount_amount),
			discount_percentage: parseServerFloat(line.discount_percentage),
			uom: line.uom,
			conversion_factor: parseServerFloat(line.conversion_factor),
			same_item: sameItemFlag ? 1 : 0,
		};

		existingFreebieSnapshots.set(key, snapshot);

		if (segments.length >= 2) {
			const baseKey = `${segments[0]}::${segments[1]}`;
			if (baseKey && !existingFreebieSnapshots.has(baseKey)) {
				existingFreebieSnapshots.set(baseKey, { ...snapshot });
			}
		}
	};

	context.items.forEach((line) => {
		if (line && line.auto_free_source) {
			registerExistingFreebie(line.auto_free_source, line);
		}
	});

	const resolveWithFallback = (
		primary,
		fallback,
		treatZeroAsMissing = false,
	) => {
		const fallbackFinite = Number.isFinite(fallback) ? fallback : null;
		if (!Number.isFinite(primary)) {
			return fallbackFinite;
		}
		if (
			treatZeroAsMissing &&
			primary <= 0 &&
			Number.isFinite(fallback) &&
			fallback > 0
		) {
			return fallback;
		}
		return primary;
	};

	const paidLines = context.items
		.filter((item) => item && !item.is_free_item && !item.auto_free_source)
		.map((item) => {
			const baseRate = Number.isFinite(Number.parseFloat(item.base_rate))
				? Number.parseFloat(item.base_rate)
				: toBase(item.rate);
			const basePriceListRateRaw = Number.parseFloat(
				item.base_price_list_rate,
			);
			const basePriceListRate = Number.isFinite(basePriceListRateRaw)
				? basePriceListRateRaw
				: toBase(item.price_list_rate);
			const baseDiscountRaw = Number.parseFloat(
				item.base_discount_amount,
			);
			const baseDiscount = Number.isFinite(baseDiscountRaw)
				? baseDiscountRaw
				: toBase(item.discount_amount);
			const stockQty = _resolvePricingQty(context, item);
			const conversionFactor = Number.parseFloat(
				item.conversion_factor || 1,
			);

			return {
				posa_row_id: item.posa_row_id,
				item_code: item.item_code,
				qty: item.qty,
				stock_qty: Number.isFinite(stockQty) ? stockQty : undefined,
				base_qty: Number.isFinite(stockQty) ? stockQty : undefined,
				conversion_factor:
					Number.isFinite(conversionFactor) && conversionFactor > 0
						? conversionFactor
						: undefined,
				rate: baseRate || 0,
				price_list_rate: basePriceListRate || 0,
				discount_amount: baseDiscount || 0,
				discount_percentage:
					Number.parseFloat(item.discount_percentage || 0) || 0,
				warehouse: item.warehouse,
				uom: item.uom,
				item_group: item.item_group,
				brand: item.brand,
				pricing_rules: item.pricing_rules || null,
			};
		});

	if (!paidLines.length) {
		syncAutoFreeLines(context, freebiesMap);
		if (typeof context.$forceUpdate === "function") {
			context.$forceUpdate();
		}
		return;
	}

	const freeLines = context.items
		.filter((item) => item && item.auto_free_source)
		.map((item) => ({
			item_code: item.item_code,
			qty: item.qty,
			source_rule: item.source_rule || null,
			posa_row_id: item.posa_row_id,
			uom: item.uom,
			stock_qty: Number.isFinite(Number.parseFloat(item.stock_qty))
				? Number.parseFloat(item.stock_qty)
				: undefined,
			conversion_factor: Number.isFinite(
				Number.parseFloat(item.conversion_factor || 1),
			)
				? Number.parseFloat(item.conversion_factor || 1)
				: undefined,
		}));

	const response = await frappe.call({
		method: "posawesome.posawesome.api.pricing_rules.reconcile_line_prices",
		args: {
			cart_payload: JSON.stringify({
				context: ctx,
				lines: paidLines,
				free_lines: freeLines,
			}),
		},
	});

	const message = response?.message || {};
	const updates = Array.isArray(message.updates) ? message.updates : [];
	const serverFree = Array.isArray(message.free_lines)
		? message.free_lines
		: [];
	const invoiceUpdates = message.invoice_updates || {};

	const hasDiscountUpdate =
		invoiceUpdates &&
		(Object.prototype.hasOwnProperty.call(
			invoiceUpdates,
			"discount_amount",
		) ||
			Object.prototype.hasOwnProperty.call(
				invoiceUpdates,
				"additional_discount_percentage",
			));

	const serverDiscountAmount = Number.parseFloat(
		invoiceUpdates.discount_amount || 0,
	);
	const serverDiscountPercentage = Number.parseFloat(
		invoiceUpdates.additional_discount_percentage || 0,
	);
	const serverRules = invoiceUpdates.pricing_rules;

	if (hasDiscountUpdate) {
		if (context.pos_profile?.posa_use_percentage_discount) {
			if (serverDiscountPercentage > 0) {
				context.additional_discount_percentage =
					serverDiscountPercentage;
			} else if (serverDiscountAmount > 0 && context.Total > 0) {
				context.additional_discount_percentage =
					(serverDiscountAmount / context.Total) * 100;
			} else {
				context.additional_discount_percentage = 0;
			}
			context.update_discount_umount && context.update_discount_umount();
		} else {
			context.additional_discount = serverDiscountAmount;
			context.additional_discount_percentage = serverDiscountPercentage;
			context.discount_amount = context.additional_discount;
		}
	}

	if (serverRules !== undefined) {
		if (context.invoice_doc) {
			context.invoice_doc.pricing_rules = serverRules || null;
		} else {
			context.invoiceStore?.mergeInvoiceDoc({
				pricing_rules: serverRules || null,
			});
		}
	}

	serverFree.forEach((entry) => {
		if (!entry || !entry.item_code) {
			return;
		}
		const ruleName = entry.pricing_rules || entry.source_rule || "";
		const parentRowId =
			entry.parent_row_id ||
			entry.parent_detail_docname ||
			entry.parent_row ||
			entry.parent_docname ||
			null;
		const keyBase = `${ruleName || ""}::${entry.item_code}`;

		const fallbackSnapshot =
			existingFreebieSnapshots.get(
				parentRowId ? `${keyBase}::${parentRowId}` : keyBase,
			) ||
			existingFreebieSnapshots.get(keyBase) ||
			null;

		const normalizedParentRowId =
			parentRowId || fallbackSnapshot?.parentRowId || null;
		const key = normalizedParentRowId
			? `${keyBase}::${normalizedParentRowId}`
			: keyBase;

		const qtyRaw = parseServerFloat(entry.qty);
		const qty =
			resolveWithFallback(qtyRaw, fallbackSnapshot?.qty, false) ?? 0;

		const stockQtyRaw = parseServerFloat(
			entry.stock_qty ?? entry.base_qty ?? entry.qty,
		);
		const stockQty =
			resolveWithFallback(
				stockQtyRaw,
				fallbackSnapshot?.stock_qty ?? fallbackSnapshot?.qty,
				false,
			) ?? qty;

		const conversionFactorRaw = parseServerFloat(
			entry.conversion_factor ?? entry.cf,
		);
		const conversionFactor = resolveWithFallback(
			conversionFactorRaw,
			fallbackSnapshot?.conversion_factor,
			false,
		);

		let baseRate = resolveWithFallback(
			parseServerFloat(entry.base_rate ?? entry.rate),
			fallbackSnapshot?.base_rate ?? fallbackSnapshot?.rate,
			true,
		);
		let displayRate = resolveWithFallback(
			parseServerFloat(entry.rate),
			fallbackSnapshot?.rate,
			true,
		);

		let basePriceListRate = resolveWithFallback(
			parseServerFloat(
				entry.base_price_list_rate ?? entry.price_list_rate,
			),
			fallbackSnapshot?.base_price_list_rate ??
			fallbackSnapshot?.price_list_rate,
			true,
		);
		let displayPriceListRate = resolveWithFallback(
			parseServerFloat(entry.price_list_rate),
			fallbackSnapshot?.price_list_rate,
			true,
		);

		let baseDiscount = resolveWithFallback(
			parseServerFloat(
				entry.base_discount_amount ?? entry.discount_amount,
			),
			fallbackSnapshot?.base_discount_amount ??
			fallbackSnapshot?.discount_amount,
			true,
		);
		let discountAmount = resolveWithFallback(
			parseServerFloat(entry.discount_amount),
			fallbackSnapshot?.discount_amount,
			true,
		);
		let discountPercentage = resolveWithFallback(
			parseServerFloat(entry.discount_percentage),
			fallbackSnapshot?.discount_percentage,
			true,
		);

		if (!Number.isFinite(baseRate) && Number.isFinite(displayRate)) {
			baseRate = displayRate;
		}
		if (!Number.isFinite(displayRate) && Number.isFinite(baseRate)) {
			displayRate = baseRate;
		}

		if (
			!Number.isFinite(basePriceListRate) &&
			Number.isFinite(displayPriceListRate)
		) {
			basePriceListRate = displayPriceListRate;
		}
		if (
			!Number.isFinite(displayPriceListRate) &&
			Number.isFinite(basePriceListRate)
		) {
			displayPriceListRate = basePriceListRate;
		}

		if (!Number.isFinite(baseDiscount) && Number.isFinite(discountAmount)) {
			baseDiscount = discountAmount;
		}
		if (!Number.isFinite(discountAmount) && Number.isFinite(baseDiscount)) {
			discountAmount = baseDiscount;
		}

		if (
			!Number.isFinite(discountPercentage) &&
			Number.isFinite(baseDiscount) &&
			Number.isFinite(basePriceListRate) &&
			basePriceListRate
		) {
			discountPercentage = Math.max(
				(baseDiscount / basePriceListRate) * 100,
				0,
			);
		}

		const sameItem =
			asServerBool(entry.same_item) ||
			(!!fallbackSnapshot &&
				(fallbackSnapshot.same_item === 1 ||
					fallbackSnapshot.same_item === true));

		const uom = entry.uom || fallbackSnapshot?.uom;

		freebiesMap.set(key, {
			rule: ruleName,
			item_code: entry.item_code,
			qty,
			parentRowId: normalizedParentRowId,
			uom,
			stock_qty: stockQty,
			conversion_factor: Number.isFinite(conversionFactor)
				? conversionFactor
				: undefined,
			...(sameItem ? { same_item: 1 } : {}),
			...(Number.isFinite(baseRate) ? { base_rate: baseRate } : {}),
			...(Number.isFinite(displayRate) ? { rate: displayRate } : {}),
			...(Number.isFinite(basePriceListRate)
				? { base_price_list_rate: basePriceListRate }
				: {}),
			...(Number.isFinite(displayPriceListRate)
				? { price_list_rate: displayPriceListRate }
				: {}),
			...(Number.isFinite(baseDiscount)
				? { base_discount_amount: baseDiscount }
				: {}),
			...(Number.isFinite(discountAmount)
				? { discount_amount: discountAmount }
				: {}),
			...(Number.isFinite(discountPercentage)
				? { discount_percentage: discountPercentage }
				: {}),
		});

		if (sameItem) {
			if (normalizedParentRowId) {
				const bucket =
					sameItemFreeParents.get(normalizedParentRowId) || new Set();
				bucket.add(entry.item_code);
				sameItemFreeParents.set(normalizedParentRowId, bucket);
			} else {
				sameItemFreeCodes.add(entry.item_code);
			}
		}
	});

	updates.forEach((update) => {
		const targetId = update.row_id;
		const item = context.items.find(
			(line) =>
				line &&
				!line.is_free_item &&
				(line.posa_row_id === targetId ||
					line.name === targetId ||
					(line.item_code === targetId && !line.auto_free_source)),
		);
		if (!item) {
			return;
		}

		const baseRate =
			Number.parseFloat(update.rate ?? item.base_rate ?? 0) || 0;
		const basePriceListRate =
			Number.parseFloat(
				update.price_list_rate ?? item.base_price_list_rate ?? 0,
			) || 0;
		const baseDiscount =
			Number.parseFloat(
				update.discount_amount ?? item.base_discount_amount ?? 0,
			) || 0;
		const discountPercentage =
			Number.parseFloat(
				update.discount_percentage ?? item.discount_percentage ?? 0,
			) || 0;

		const priceLocked =
			item.locked_price === true ||
			item.locked_price === 1 ||
			item.locked_price === "1";
		const offerApplied =
			item.posa_offer_applied === true ||
			item.posa_offer_applied === 1 ||
			item.posa_offer_applied === "1";
		const lockReturnPricing = Boolean(
			context?.invoice_doc?.is_return &&
				context?.invoice_doc?.return_against,
		);

		let allowServerRateUpdate =
			item._manual_rate_set !== true &&
			!priceLocked &&
			!offerApplied &&
			!lockReturnPricing;

		if (allowServerRateUpdate) {
			const parentKey = item.posa_row_id || item.name || targetId || null;
			const sameItemCodes =
				parentKey && sameItemFreeParents.has(parentKey)
					? sameItemFreeParents.get(parentKey)
					: null;
			let hasSameItemFree =
				sameItemCodes instanceof Set &&
				sameItemCodes.has(item.item_code);
			if (!hasSameItemFree && sameItemFreeCodes.has(item.item_code)) {
				hasSameItemFree = true;
			}
			const originalBaseRate = Number.isFinite(
				Number.parseFloat(item.base_rate),
			)
				? Number.parseFloat(item.base_rate)
				: toBase(item.rate);
			const originalBasePriceList = Number.isFinite(
				Number.parseFloat(item.base_price_list_rate),
			)
				? Number.parseFloat(item.base_price_list_rate)
				: toBase(item.price_list_rate);
			const originalBaseDiscount = Number.isFinite(
				Number.parseFloat(item.base_discount_amount),
			)
				? Number.parseFloat(item.base_discount_amount)
				: toBase(item.discount_amount);
			const epsilon = 1e-6;
			const zeroRateFromServer = basePriceListRate > 0 && baseRate <= 0;
			const zeroPriceListFromServer =
				!Number.isFinite(basePriceListRate) || basePriceListRate <= 0;
			const serverRemovedPriceList =
				zeroPriceListFromServer &&
					Number.isFinite(originalBasePriceList)
					? originalBasePriceList > 0
					: false;
			const serverRemovedDiscount =
				(!Number.isFinite(baseDiscount) || baseDiscount <= 0) &&
					Number.isFinite(originalBaseDiscount)
					? originalBaseDiscount > 0
					: false;
			const serverRemovedPercentage =
				(!Number.isFinite(discountPercentage) ||
					discountPercentage <= 0) &&
					Number.isFinite(originalBaseDiscount) &&
					Number.isFinite(originalBasePriceList) &&
					originalBasePriceList > 0
					? originalBaseDiscount >= originalBasePriceList - epsilon
					: false;
			const serverFullDiscount =
				discountPercentage >= 99.99 ||
				(Number.isFinite(basePriceListRate) &&
					basePriceListRate > 0 &&
					Number.isFinite(baseDiscount) &&
					baseDiscount >= basePriceListRate - epsilon);
			const fallbackFullDiscount =
				Number.isFinite(originalBasePriceList) &&
					originalBasePriceList > 0 &&
					Number.isFinite(originalBaseDiscount)
					? originalBaseDiscount >= originalBasePriceList - epsilon
					: false;

			const serverZeroedValues =
				zeroRateFromServer ||
				serverRemovedPriceList ||
				serverRemovedDiscount ||
				serverRemovedPercentage;

			if (
				hasSameItemFree &&
				originalBaseRate > 0 &&
				(serverZeroedValues ||
					serverFullDiscount ||
					fallbackFullDiscount)
			) {
				allowServerRateUpdate = false;
			}
		}

		if (allowServerRateUpdate) {
			const convertedRate = fromBase(baseRate);
			const convertedPriceListRate = fromBase(basePriceListRate);
			const convertedDiscount = fromBase(baseDiscount);

			item.base_rate = baseRate;
			item.base_price_list_rate = basePriceListRate;
			item.base_discount_amount = baseDiscount;
			item.discount_percentage = discountPercentage;
			item.rate = context.flt
				? context.flt(convertedRate, precision)
				: convertedRate;
			item.price_list_rate = context.flt
				? context.flt(convertedPriceListRate, precision)
				: convertedPriceListRate;
			item.discount_amount = context.flt
				? context.flt(convertedDiscount, precision)
				: convertedDiscount;
			item.amount = context.flt
				? context.flt(item.rate * item.qty, precision)
				: item.rate * item.qty;
			item.base_amount = context.flt
				? context.flt(baseRate * item.qty, precision)
				: baseRate * item.qty;
		}

		const rulesProvided = Object.prototype.hasOwnProperty.call(
			update,
			"pricing_rules",
		);
		const detailsProvided = Object.prototype.hasOwnProperty.call(
			update,
			"pricing_rule_details",
		);

		const appliedRules = rulesProvided
			? Array.isArray(update.pricing_rules)
				? update.pricing_rules.filter((name) => !!name)
				: []
			: Array.isArray(item.pricing_rules)
				? item.pricing_rules.filter((name) => !!name)
				: [];

		let detailed;
		if (detailsProvided && Array.isArray(update.pricing_rule_details)) {
			detailed = update.pricing_rule_details
				.map((detail) => {
					if (!detail) {
						return null;
					}
					if (typeof detail === "string") {
						return { name: detail };
					}
					const name =
						detail.name ||
						detail.pricing_rule ||
						detail.rule ||
						null;
					if (!name) {
						return null;
					}
					const type = detail.type || detail.discount_type || null;
					return type ? { name, type } : { name };
				})
				.filter((detail) => !!detail);
		} else if (!rulesProvided && Array.isArray(item.pricing_rule_details)) {
			detailed = item.pricing_rule_details.map((detail) => ({
				...detail,
			}));
		} else {
			detailed = appliedRules.map((name) => ({ name }));
		}

		_updatePricingBadge(context, item, detailed);
	});

	syncAutoFreeLines(context, freebiesMap);
	if (typeof context.$forceUpdate === "function") {
		context.$forceUpdate();
	}
}
