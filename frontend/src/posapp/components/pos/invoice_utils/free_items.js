import { useItemsStore } from "../../../stores/itemsStore.js";

/**
 * Free Items Utils
 * Handles detection and synchronization of auto-added free items (promotions).
 *
 * Context requirements:
 * - context.items (Array)
 * - context.currency_precision
 * - context.float_precision
 * - context.flt (function)
 * - context.invoiceStore
 * - context.get_new_item (method)
 * - context.remove_item (method)
 * - context.calc_stock_qty (method)
 * - context._fromBaseCurrency (method, optional)
 * - context._getItemsStore (method internal or import)
 */

export function _isFreeLine(context, item) {
	if (!item) {
		return false;
	}
	const coerce = (value) => value === true || value === 1 || value === "1";
	if (coerce(item.is_free_item)) {
		return true;
	}
	if (coerce(item.same_item)) {
		return true;
	}
	if (typeof item.auto_free_source === "string" && item.auto_free_source) {
		return true;
	}
	if (typeof item.free_item_source === "string" && item.free_item_source) {
		return true;
	}
	return false;
}

export function _syncAutoFreeLines(context, freebiesMap = new Map()) {
	const expectedKeys = new Set(freebiesMap.keys());
	const existing = new Map();
	const legacyFreeLines = [];

	const resolveRuleName = (line) => {
		if (!line) {
			return "";
		}

		const preferString = (value) => {
			if (!value) {
				return "";
			}
			if (typeof value === "string") {
				return value;
			}
			if (Array.isArray(value)) {
				for (const entry of value) {
					const resolved = preferString(entry);
					if (resolved) {
						return resolved;
					}
				}
				return "";
			}
			if (typeof value === "object") {
				return value.name || value.rule || value.pricing_rule || value.pricingRule || "";
			}
			return "";
		};

		if (line.source_rule) {
			return String(line.source_rule);
		}

		if (line.pricing_rule) {
			return preferString(line.pricing_rule);
		}

		const raw = line.pricing_rules;
		if (typeof raw === "string") {
			const trimmed = raw.trim();
			if (!trimmed) {
				return "";
			}
			if (
				(trimmed.startsWith("[") && trimmed.endsWith("]")) ||
				(trimmed.startsWith("{") && trimmed.endsWith("}"))
			) {
				try {
					const parsed = JSON.parse(trimmed);
					return preferString(parsed);
				} catch (error) {
					console.warn("Failed to parse pricing_rules JSON", error);
					return trimmed;
				}
			}
			return trimmed;
		}

		return preferString(raw);
	};

	context.items.forEach((line, index) => {
		if (line && line.auto_free_source) {
			existing.set(line.auto_free_source, { line, index });
		} else if (line && line.is_free_item) {
			const ruleName = resolveRuleName(line);
			if (ruleName) {
				legacyFreeLines.push({
					line,
					index,
					rule: ruleName,
					used: false,
				});
			}
		}
	});

	const itemsStore = useItemsStore();

	const parseFinite = (value) => {
		const numeric = Number.parseFloat(value);
		return Number.isFinite(numeric) ? numeric : null;
	};

	const currencyPrecision = Number.isFinite(context.currency_precision) ? context.currency_precision : 2;
	const floatPrecision = Number.isFinite(context.float_precision) ? context.float_precision : 2;

	const formatCurrency = (value) => {
		if (!Number.isFinite(value)) {
			return 0;
		}
		return context.flt ? context.flt(value, currencyPrecision) : value;
	};

	const formatPercentage = (value) => {
		if (!Number.isFinite(value)) {
			return 0;
		}
		return context.flt ? context.flt(value, floatPrecision) : value;
	};

	const convertFromBase = (value) => {
		const numeric = parseFinite(value);
		if (numeric === null) {
			return null;
		}
		if (typeof context._fromBaseCurrency === "function") {
			try {
				const converted = context._fromBaseCurrency(numeric);
				if (Number.isFinite(converted)) {
					return formatCurrency(converted);
				}
			} catch (error) {
				console.warn("Failed to convert from base currency", error);
			}
		}
		return formatCurrency(numeric);
	};

	const applyFreeLinePricing = (line, data, qty) => {
		const baseRate = parseFinite(data?.base_rate ?? data?.rate);
		const basePriceListRate = parseFinite(
			data?.base_price_list_rate ?? data?.price_list_rate ?? (baseRate !== null ? baseRate : null),
		);
		let baseDiscount = parseFinite(data?.base_discount_amount ?? data?.discount_amount);
		if (baseDiscount === null && basePriceListRate !== null && baseRate !== null) {
			baseDiscount = Math.max(basePriceListRate - baseRate, 0);
		}

		const resolvedBaseRate = baseRate !== null ? baseRate : 0;
		const resolvedBasePriceListRate = basePriceListRate !== null ? basePriceListRate : resolvedBaseRate;
		const resolvedBaseDiscount =
			baseDiscount !== null
				? Math.max(baseDiscount, 0)
				: Math.max(resolvedBasePriceListRate - resolvedBaseRate, 0);

		const discountPercentageRaw = parseFinite(data?.discount_percentage);
		const resolvedDiscountPercentage =
			discountPercentageRaw !== null
				? Math.max(discountPercentageRaw, 0)
				: resolvedBasePriceListRate
					? Math.max((resolvedBaseDiscount / resolvedBasePriceListRate) * 100, 0)
					: 0;

		const baseAmount = resolvedBaseRate * qty;
		const convertedRate = convertFromBase(resolvedBaseRate);
		const convertedPriceListRate = convertFromBase(resolvedBasePriceListRate);
		const convertedDiscount = convertFromBase(resolvedBaseDiscount);
		const convertedAmount = convertFromBase(baseAmount);

		line.base_rate = resolvedBaseRate;
		line.base_price_list_rate = resolvedBasePriceListRate;
		line.base_discount_amount = resolvedBaseDiscount;
		line.base_amount = baseAmount;

		line.rate = convertedRate !== null ? convertedRate : formatCurrency(resolvedBaseRate);
		line.price_list_rate =
			convertedPriceListRate !== null
				? convertedPriceListRate
				: formatCurrency(resolvedBasePriceListRate);
		line.discount_amount =
			convertedDiscount !== null
				? Math.max(convertedDiscount, 0)
				: formatCurrency(Math.max(resolvedBaseDiscount, 0));
		line.amount = convertedAmount !== null ? convertedAmount : formatCurrency(resolvedBaseRate * qty);
		line.discount_percentage = formatPercentage(resolvedDiscountPercentage);
	};

	const buildFreeBadgeMeta = (data) => {
		const ruleLabel = data?.rule || "";
		const label = `${__("Free")} (${__("Rule")}: ${ruleLabel})`;

		const parsedFreeQty = Number.parseFloat(data?.qty ?? 0);
		const freeQty = Number.isFinite(parsedFreeQty) ? parsedFreeQty : 0;

		const parsedThreshold = Number.parseFloat(data?.threshold_qty ?? data?.min_qty ?? data?.minimum ?? 0);
		const thresholdQty = Number.isFinite(parsedThreshold) ? parsedThreshold : 0;

		const parsedPerThreshold = Number.parseFloat(data?.free_qty_per_threshold ?? data?.free_qty ?? 0);
		const perThreshold = Number.isFinite(parsedPerThreshold) ? parsedPerThreshold : null;

		const parsedMultiplier = Number.parseFloat(data?.multiplier ?? 0);
		const multiplier = Number.isFinite(parsedMultiplier) ? parsedMultiplier : null;

		const parts = [];
		if (data?.apply_per_threshold && thresholdQty > 0 && perThreshold !== null) {
			const perThresholdValue = perThreshold !== null ? perThreshold : freeQty;
			parts.push(`${__("Every")} ${thresholdQty} → ${perThresholdValue} ${__("Free")}`);
			if (multiplier !== null && multiplier >= 0) {
				parts.push(`${__("Qualified")}: ${multiplier}`);
			}
		} else if (thresholdQty > 0) {
			parts.push(`${__("Minimum Qty")}: ${thresholdQty}`);
		}
		parts.push(`${__("Free Qty")}: ${freeQty}`);

		return {
			label,
			tooltip: parts.join("; "),
		};
	};

	const applyFreeLineState = (line, data) => {
		const qty = context.flt ? context.flt(data.qty, context.float_precision) : data.qty;
		const hasUom = data.uom && line.uom !== data.uom;
		if (hasUom) {
			line.uom = data.uom;
		}

		const hasConversion = data.conversion_factor !== undefined && data.conversion_factor !== null;
		if (hasConversion) {
			const parsed = Number.parseFloat(data.conversion_factor);
			if (Number.isFinite(parsed) && parsed > 0) {
				line.conversion_factor = parsed;
			}
		}

		const requiresQtyUpdate = Number.parseFloat(line.qty || 0) !== qty || hasUom || hasConversion;
		const parsedStockQty = Number.parseFloat(data.stock_qty);
		const hasStockQty = Number.isFinite(parsedStockQty);

		if (requiresQtyUpdate) {
			line.qty = qty;
			if (hasStockQty) {
				line.stock_qty = parsedStockQty;
			}
			if (context.calc_stock_qty) {
				context.calc_stock_qty(line, line.qty);
			}
		} else if (hasStockQty) {
			line.stock_qty = parsedStockQty;
		}
		line.is_free_item = 1;
		line.locked_price = true;
		applyFreeLinePricing(line, data, qty);
		line.source_rule = data.rule;
		line.pricing_rule_badge = buildFreeBadgeMeta(data);
	};

	for (const [key, data] of freebiesMap.entries()) {
		const match = existing.get(key);
		if (match) {
			applyFreeLineState(match.line, data);
			continue;
		}

		const normalizedRule = data.rule || "";
		const legacyMatchIndex = legacyFreeLines.findIndex(
			(entry) =>
				!entry.used &&
				entry.line &&
				entry.line.item_code === data.item_code &&
				(!normalizedRule || entry.rule === normalizedRule),
		);

		if (legacyMatchIndex >= 0) {
			const legacyEntry = legacyFreeLines[legacyMatchIndex];
			legacyEntry.used = true;
			legacyEntry.line.auto_free_source = key;
			legacyEntry.line.parent_row_id = data.parentRowId;
			applyFreeLineState(legacyEntry.line, data);
			existing.set(key, { line: legacyEntry.line, index: legacyEntry.index });
			continue;
		}

		const catalogItem = itemsStore?.getItemByCode?.(data.item_code) || null;
		const parentLine = data.parentRowId
			? context.items.find((line) => line && line.posa_row_id === data.parentRowId)
			: null;
		const resolvedUom =
			data.uom ||
			catalogItem?.uom ||
			parentLine?.uom ||
			catalogItem?.stock_uom ||
			parentLine?.stock_uom ||
			null;
		const parsedConversion = Number.parseFloat(data.conversion_factor);
		const resolvedConversion =
			Number.isFinite(parsedConversion) && parsedConversion > 0
				? parsedConversion
				: resolvedUom && parentLine && parentLine.uom === resolvedUom
					? parentLine.conversion_factor
					: resolvedUom && catalogItem && catalogItem.uom === resolvedUom
						? catalogItem.conversion_factor
						: resolvedUom && resolvedUom === (catalogItem?.stock_uom || parentLine?.stock_uom)
							? 1
							: null;
		const quantity = context.flt ? context.flt(data.qty, context.float_precision) : data.qty;

		const template = {
			...(catalogItem || {}),
			item_code: data.item_code,
			item_name: catalogItem?.item_name || data.item_code,
			qty: quantity,
			rate: 0,
			price_list_rate: 0,
			uom: resolvedUom || (catalogItem ? catalogItem.uom : undefined),
		};
		let freeLine = context.get_new_item(template);
		freeLine.qty = quantity;
		if (resolvedUom) {
			freeLine.uom = resolvedUom;
		}
		if (resolvedConversion !== null && resolvedConversion !== undefined) {
			freeLine.conversion_factor = resolvedConversion;
		}
		const parsedStockQty = Number.parseFloat(data.stock_qty);
		if (Number.isFinite(parsedStockQty)) {
			freeLine.stock_qty = parsedStockQty;
		}
		freeLine.is_free_item = 1;
		freeLine.locked_price = true;
		freeLine._manual_rate_set = true;
		freeLine.source_rule = data.rule;
		freeLine.auto_free_source = key;
		freeLine.parent_row_id = data.parentRowId;
		freeLine.pricing_rule_badge = buildFreeBadgeMeta(data);

		applyFreeLinePricing(freeLine, data, quantity);

		const parentIndex = context.items.findIndex((line) => line.posa_row_id === data.parentRowId);
		const insertAt = parentIndex >= 0 ? parentIndex + 1 : context.items.length;
		if (context.invoiceStore) {
			// Use the reactive proxy returned by the store
			const added = context.invoiceStore.addItem(freeLine, insertAt);
			if (added) {
				freeLine = added;
			}
		} else {
			context.items.splice(insertAt, 0, freeLine);
		}
		if (context.calc_stock_qty) {
			context.calc_stock_qty(freeLine, freeLine.qty);
		}
	}

	const removable = [];
	context.items.forEach((line, index) => {
		if (line && line.auto_free_source && !expectedKeys.has(line.auto_free_source)) {
			removable.push(line);
		}
	});

	removable.forEach((line) => {
		context.remove_item(line);
	});
}
