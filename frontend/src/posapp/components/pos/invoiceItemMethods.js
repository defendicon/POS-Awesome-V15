/* global __, frappe, flt */
import { debounce } from "lodash";
import {
	isOffline,
	saveCustomerBalance,
	getCachedCustomerBalance,
	getCachedPriceListItems,
	getCustomerStorage,
	getOfflineCustomers,
	getTaxTemplate,
	getTaxInclusiveSetting,
} from "../../../offline/index.js";

// Import composables
import { useBatchSerial } from "../../composables/useBatchSerial.js";
import { useDiscounts } from "../../composables/useDiscounts.js";
import { useItemAddition } from "../../composables/useItemAddition.js";
import { useStockUtils } from "../../composables/useStockUtils.js";
import { parseBooleanSetting } from "../../utils/stock.js";
import stockCoordinator from "../../utils/stockCoordinator.js";
import { useItemsStore } from "../../stores/itemsStore.js";
import { usePricingRulesStore } from "../../stores/pricingRulesStore.js";
import { evaluatePricingRules } from "../../../lib/pricingEngine.js";

const ITEM_DETAIL_CACHE_TTL = 5000;
const STOCK_CACHE_TTL = 5000;

const { setSerialNo, setBatchQty } = useBatchSerial();
const { updateDiscountAmount, calcPrices, calcItemPrice } = useDiscounts();
const { removeItem, addItem, getNewItem, clearInvoice } = useItemAddition();
const { calcUom, calcStockQty } = useStockUtils();

export default {
	_ensureTaskBucket(rowId) {
		if (!rowId) {
			return null;
		}
		if (!this._itemTaskCache) {
			this._itemTaskCache = new Map();
		}
		if (!this._itemTaskCache.has(rowId)) {
			this._itemTaskCache.set(rowId, {});
		}
		return this._itemTaskCache.get(rowId);
	},
	_getItemTaskPromise(rowId, taskName) {
		if (!rowId || !this._itemTaskCache) {
			return null;
		}
		const bucket = this._itemTaskCache.get(rowId);
		return bucket ? bucket[taskName] || null : null;
	},
	_setItemTaskPromise(rowId, taskName, promise) {
		if (!rowId || !promise) {
			return promise;
		}
		const bucket = this._ensureTaskBucket(rowId);
		const trackedPromise = Promise.resolve(promise).finally(() => {
			const activeBucket = this._itemTaskCache ? this._itemTaskCache.get(rowId) : null;
			if (activeBucket) {
				delete activeBucket[taskName];
				if (!Object.keys(activeBucket).length) {
					this._itemTaskCache.delete(rowId);
				}
			}
		});
		bucket[taskName] = trackedPromise;
		return trackedPromise;
	},
	_getPricingRulesStore() {
		if (!this._pricingRulesStore) {
			this._pricingRulesStore = usePricingRulesStore();
		}
		return this._pricingRulesStore;
	},
	_getItemsStore() {
		if (!this._itemsStore) {
			this._itemsStore = useItemsStore();
		}
		return this._itemsStore;
	},
	_getPricingContext() {
		const priceList = this.get_price_list ? this.get_price_list() : this.selected_price_list;
		const selectedCurrency =
			this.selected_currency || this.price_list_currency || this.pos_profile?.currency;
		const doc =
			typeof this.get_invoice_doc === "function" ? this.get_invoice_doc() : this.invoice_doc || {};
		const customerInfo = this.customer_info || {};

		return {
			company: this.pos_profile?.company || doc.company || null,
			price_list: priceList || this.pos_profile?.selling_price_list || null,
			currency: selectedCurrency || this.pos_profile?.currency || null,
			date:
				this.posting_date ||
				this.posting_date_display ||
				doc.posting_date ||
				new Date().toISOString().slice(0, 10),
			customer: this.customer || doc.customer || customerInfo.customer || null,
			customer_group: doc.customer_group || customerInfo.customer_group || null,
			territory: doc.territory || customerInfo.territory || null,
		};
	},
	async _ensurePricingRules(force = false) {
		const store = this._getPricingRulesStore();
		const ctx = this._getPricingContext();
		if (!ctx.company || !ctx.price_list || !ctx.currency) {
			return { store, ctx };
		}
		await store.ensureActiveRules(ctx, { force });
		return { store, ctx };
	},
	_toBaseCurrency(value) {
		const rate = Number.parseFloat(this.exchange_rate || 1) || 1;
		if (!rate || rate === 0) {
			return Number.parseFloat(value || 0) || 0;
		}
		return Number.parseFloat(value || 0) / rate;
	},
	_fromBaseCurrency(value) {
		const rate = Number.parseFloat(this.exchange_rate || 1) || 1;
		const numeric = Number.parseFloat(value || 0) || 0;
		return rate ? numeric * rate : numeric;
	},
	_isFreeLine(item) {
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
	},
	_resolveBaseRate(item) {
		if (!item) {
			return 0;
		}
		const candidates = [item.base_price_list_rate, item.price_list_rate, item.base_rate, item.rate];
		for (const candidate of candidates) {
			const numeric = Number.parseFloat(candidate);
			if (Number.isFinite(numeric) && !Number.isNaN(numeric)) {
				return numeric;
			}
		}
		return 0;
	},
	_resolvePricingQty(item) {
		if (!item) {
			return 0;
		}

		const parse = (value) => {
			const numeric = Number.parseFloat(value);
			return Number.isFinite(numeric) ? numeric : null;
		};

		const direct = [item.stock_qty, item.base_qty, item.base_quantity, item.transfer_qty]
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
	},
	_updatePricingBadge(item, applied = []) {
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
	},
	_applyPricingToLine(item, ctx, indexes, freebiesMap) {
		if (!item) {
			return;
		}

		const manualFromUom = item._manual_rate_set_from_uom === true;
		const manualOverride = item._manual_rate_set === true && !manualFromUom;
		const allowRateUpdate = !item.locked_price && !item.posa_offer_applied && !manualOverride;
		const rawDocQty = Number.parseFloat(item.qty || 0);
		const signedDocQty = Number.isFinite(rawDocQty) ? rawDocQty : 0;
		const docQty = Math.abs(signedDocQty);
		const rawPricingQty = this._resolvePricingQty(item);
		const pricingQty = Number.isFinite(rawPricingQty) ? rawPricingQty : signedDocQty;
		const qty = Math.abs(pricingQty);

		if (docQty === 0 && qty === 0) {
			return;
		}

		const baseRate = this._resolveBaseRate(item);
		const { pricing, freebies } = evaluatePricingRules({
			item,
			qty,
			docQty,
			baseRate,
			ctx,
			indexes,
		});

		this._updatePricingBadge(item, pricing.applied);

		if (allowRateUpdate) {
			const proposedRate = Number.isFinite(pricing.rate) ? pricing.rate : baseRate;
			const proposedDiscount = Number.isFinite(pricing.discountPerUnit)
				? pricing.discountPerUnit
				: baseRate - proposedRate;

			let baseDiscountPerUnit = Math.abs(Number.parseFloat(proposedDiscount || 0));
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
			const convertedRate = this._fromBaseCurrency(effectiveBaseRate);
			const convertedDiscount = this._fromBaseCurrency(baseDiscountPerUnit);
			const normalizedBaseDiscount = Math.abs(baseDiscountPerUnit);
			const normalizedDiscount = Math.abs(convertedDiscount);

			item.base_price_list_rate = baseRate;
			item.base_rate = effectiveBaseRate;
			item.base_discount_amount = normalizedBaseDiscount;
			item.price_list_rate = this.flt
				? this.flt(this._fromBaseCurrency(baseRate), this.currency_precision)
				: this._fromBaseCurrency(baseRate);
			item.rate = this.flt ? this.flt(convertedRate, this.currency_precision) : convertedRate;
			item.discount_amount = this.flt
				? this.flt(normalizedDiscount, this.currency_precision)
				: normalizedDiscount;
			const rawDiscountPercentage = baseRate ? (normalizedBaseDiscount / baseRate) * 100 : 0;
			item.discount_percentage = baseRate
				? this.flt(Math.abs(rawDiscountPercentage), this.float_precision)
				: 0;
			item.amount = this.flt
				? this.flt(item.rate * item.qty, this.currency_precision)
				: item.rate * item.qty;
			item.base_amount = this.flt ? this.flt(baseAmount, this.currency_precision) : baseAmount;
		}

		if (Array.isArray(freebies)) {
			freebies.forEach((entry) => {
				const key = `${entry.rule}::${entry.item_code}::${item.posa_row_id}`;
				const existing = freebiesMap.get(key) || { qty: 0 };
				const parsedEntryQty = Number.parseFloat(entry.qty || 0) || 0;
				const parsedExistingQty = Number.parseFloat(existing.qty || 0) || 0;
				const parsedEntryStock = Number.parseFloat(entry.stock_qty || entry.qty || 0) || 0;
				const parsedExistingStock = Number.parseFloat(existing.stock_qty || existing.qty || 0) || 0;
				freebiesMap.set(key, {
					...existing,
					...entry,
					qty: parsedEntryQty + parsedExistingQty,
					stock_qty: parsedEntryStock + parsedExistingStock,
					parentRowId: item.posa_row_id,
				});
			});
		}
	},
	_syncAutoFreeLines(freebiesMap = new Map()) {
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

		this.items.forEach((line, index) => {
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

		const itemsStore = this._getItemsStore();

		const parseFinite = (value) => {
			const numeric = Number.parseFloat(value);
			return Number.isFinite(numeric) ? numeric : null;
		};

		const currencyPrecision = Number.isFinite(this.currency_precision) ? this.currency_precision : 2;
		const floatPrecision = Number.isFinite(this.float_precision) ? this.float_precision : 2;

		const formatCurrency = (value) => {
			if (!Number.isFinite(value)) {
				return 0;
			}
			return this.flt ? this.flt(value, currencyPrecision) : value;
		};

		const formatPercentage = (value) => {
			if (!Number.isFinite(value)) {
				return 0;
			}
			return this.flt ? this.flt(value, floatPrecision) : value;
		};

		const convertFromBase = (value) => {
			const numeric = parseFinite(value);
			if (numeric === null) {
				return null;
			}
			if (typeof this._fromBaseCurrency === "function") {
				try {
					const converted = this._fromBaseCurrency(numeric);
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
			const resolvedBasePriceListRate =
				basePriceListRate !== null ? basePriceListRate : resolvedBaseRate;
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

			const parsedThreshold = Number.parseFloat(
				data?.threshold_qty ?? data?.min_qty ?? data?.minimum ?? 0,
			);
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
			const qty = this.flt ? this.flt(data.qty, this.float_precision) : data.qty;
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
				if (this.calc_stock_qty) {
					this.calc_stock_qty(line, line.qty);
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
				? this.items.find((line) => line && line.posa_row_id === data.parentRowId)
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
			const quantity = this.flt ? this.flt(data.qty, this.float_precision) : data.qty;

			const template = {
				...(catalogItem || {}),
				item_code: data.item_code,
				item_name: catalogItem?.item_name || data.item_code,
				qty: quantity,
				rate: 0,
				price_list_rate: 0,
				uom: resolvedUom || (catalogItem ? catalogItem.uom : undefined),
			};
			const freeLine = this.get_new_item(template);
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

			const parentIndex = this.items.findIndex((line) => line.posa_row_id === data.parentRowId);
			const insertAt = parentIndex >= 0 ? parentIndex + 1 : this.items.length;
			this.items.splice(insertAt, 0, freeLine);
			if (this.calc_stock_qty) {
				this.calc_stock_qty(freeLine, freeLine.qty);
			}
		}

		const removable = [];
		this.items.forEach((line, index) => {
			if (line && line.auto_free_source && !expectedKeys.has(line.auto_free_source)) {
				removable.push(index);
			}
		});

		removable.reverse().forEach((idx) => {
			const [line] = this.items.splice(idx, 1);
			if (line && line.bundle_id) {
				this.packed_items = this.packed_items.filter((packed) => packed.bundle_id !== line.bundle_id);
			}
		});
	},
	async applyPricingRulesForCart(force = false) {
		if (this.isReturnInvoice) {
			return;
		}
		if (this._applyingPricingRules) {
			this._pendingPricingRules = true;
			return;
		}

		const ctx = this._getPricingContext ? this._getPricingContext() : {};
		const hasServerContext = ctx && ctx.company && ctx.price_list && ctx.currency && !isOffline();

		this._applyingPricingRules = true;
		try {
			await this._applyLocalPricingRules(force);
			if (hasServerContext) {
				await this._applyServerPricingRules(ctx);
			}
		} catch (error) {
			console.error("Failed to apply pricing rules via server", error);
			await this._applyLocalPricingRules(force);
		} finally {
			this._applyingPricingRules = false;
			if (this._pendingPricingRules) {
				this._pendingPricingRules = false;
				this.applyPricingRulesForCart(force);
			}
		}
	},
	async _applyLocalPricingRules(force = false) {
		try {
			const { store, ctx } = await this._ensurePricingRules(force);
			if (!store) {
				return;
			}
			const indexes = store.getIndexes ? store.getIndexes() : {};
			const freebiesMap = new Map();

			for (const item of this.items) {
				if (!item || item.is_free_item) {
					continue;
				}
				this._applyPricingToLine(item, ctx, indexes, freebiesMap);
			}

			this._syncAutoFreeLines(freebiesMap);
			if (typeof this.$forceUpdate === "function") {
				this.$forceUpdate();
			}
		} catch (error) {
			console.error("Failed to apply pricing rules locally", error);
		}
	},
	async _applyServerPricingRules(ctx = {}) {
		if (!ctx || !ctx.company || !ctx.price_list || !ctx.currency) {
			return;
		}

		const freebiesMap = new Map();
		const precision = this.currency_precision || 2;
		const toBase = (value, fallback = 0) => {
			const numeric = Number.parseFloat(value ?? fallback ?? 0);
			if (!Number.isFinite(numeric)) {
				return 0;
			}
			if (this._toBaseCurrency) {
				return this._toBaseCurrency(numeric);
			}
			return numeric;
		};
		const fromBase = (value) => {
			const numeric = Number.parseFloat(value ?? 0) || 0;
			if (this._fromBaseCurrency) {
				return this._fromBaseCurrency(numeric);
			}
			return numeric;
		};

		const parseServerFloat = (value) => {
			const numeric = Number.parseFloat(value);
			return Number.isFinite(numeric) ? numeric : null;
		};

		const asServerBool = (value) => value === true || value === 1 || value === "1";

		const sameItemFreeParents = new Map();
		const sameItemFreeCodes = new Set();

		const existingFreebieSnapshots = new Map();

		const registerExistingFreebie = (key, line) => {
			if (!key || !line) {
				return;
			}

			const segments = key.split("::");
			const parentSegment = segments.length > 2 ? segments.slice(2).join("::") : null;

			const sameItemFlag =
				asServerBool(line.same_item) || line.same_item === 1 || line.same_item === "1";

			const snapshot = {
				parentRowId: line.parent_row_id || parentSegment || null,
				qty: parseServerFloat(line.qty),
				stock_qty: parseServerFloat(line.stock_qty),
				base_rate: parseServerFloat(line.base_rate ?? line.rate),
				rate: parseServerFloat(line.rate),
				base_price_list_rate: parseServerFloat(line.base_price_list_rate ?? line.price_list_rate),
				price_list_rate: parseServerFloat(line.price_list_rate),
				base_discount_amount: parseServerFloat(line.base_discount_amount ?? line.discount_amount),
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

		this.items.forEach((line) => {
			if (line && line.auto_free_source) {
				registerExistingFreebie(line.auto_free_source, line);
			}
		});

		const resolveWithFallback = (primary, fallback, treatZeroAsMissing = false) => {
			const fallbackFinite = Number.isFinite(fallback) ? fallback : null;
			if (!Number.isFinite(primary)) {
				return fallbackFinite;
			}
			if (treatZeroAsMissing && primary <= 0 && Number.isFinite(fallback) && fallback > 0) {
				return fallback;
			}
			return primary;
		};

		const paidLines = this.items
			.filter((item) => item && !item.is_free_item && !item.auto_free_source)
			.map((item) => {
				const baseRate = Number.isFinite(Number.parseFloat(item.base_rate))
					? Number.parseFloat(item.base_rate)
					: toBase(item.rate);
				const basePriceListRateRaw = Number.parseFloat(item.base_price_list_rate);
				const basePriceListRate = Number.isFinite(basePriceListRateRaw)
					? basePriceListRateRaw
					: toBase(item.price_list_rate);
				const baseDiscountRaw = Number.parseFloat(item.base_discount_amount);
				const baseDiscount = Number.isFinite(baseDiscountRaw)
					? baseDiscountRaw
					: toBase(item.discount_amount);
				const stockQty = this._resolvePricingQty(item);
				const conversionFactor = Number.parseFloat(item.conversion_factor || 1);

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
					discount_percentage: Number.parseFloat(item.discount_percentage || 0) || 0,
					warehouse: item.warehouse,
					uom: item.uom,
					item_group: item.item_group,
					brand: item.brand,
					pricing_rules: item.pricing_rules || null,
				};
			});

		if (!paidLines.length) {
			this._syncAutoFreeLines(freebiesMap);
			if (typeof this.$forceUpdate === "function") {
				this.$forceUpdate();
			}
			return;
		}

		const freeLines = this.items
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
				conversion_factor: Number.isFinite(Number.parseFloat(item.conversion_factor || 1))
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
		const serverFree = Array.isArray(message.free_lines) ? message.free_lines : [];
		const invoiceUpdates = message.invoice_updates || {};

		const hasDiscountUpdate =
			invoiceUpdates &&
			(Object.prototype.hasOwnProperty.call(invoiceUpdates, "discount_amount") ||
				Object.prototype.hasOwnProperty.call(invoiceUpdates, "additional_discount_percentage"));

		const serverDiscountAmount = Number.parseFloat(invoiceUpdates.discount_amount || 0);
		const serverDiscountPercentage = Number.parseFloat(
			invoiceUpdates.additional_discount_percentage || 0,
		);
		const serverRules = invoiceUpdates.pricing_rules;

		if (hasDiscountUpdate) {
			if (this.pos_profile?.posa_use_percentage_discount) {
				if (serverDiscountPercentage > 0) {
					this.additional_discount_percentage = serverDiscountPercentage;
				} else if (serverDiscountAmount > 0 && this.Total > 0) {
					this.additional_discount_percentage = (serverDiscountAmount / this.Total) * 100;
				} else {
					this.additional_discount_percentage = 0;
				}
				this.update_discount_umount();
			} else {
				this.additional_discount = serverDiscountAmount;
				this.additional_discount_percentage = serverDiscountPercentage;
				this.discount_amount = this.additional_discount;
			}
		}

		if (serverRules !== undefined) {
			if (this.invoice_doc) {
				this.invoice_doc.pricing_rules = serverRules || null;
			} else {
				this.invoiceStore.mergeInvoiceDoc({ pricing_rules: serverRules || null });
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
				existingFreebieSnapshots.get(parentRowId ? `${keyBase}::${parentRowId}` : keyBase) ||
				existingFreebieSnapshots.get(keyBase) ||
				null;

			const normalizedParentRowId = parentRowId || fallbackSnapshot?.parentRowId || null;
			const key = normalizedParentRowId ? `${keyBase}::${normalizedParentRowId}` : keyBase;

			const qtyRaw = parseServerFloat(entry.qty);
			const qty = resolveWithFallback(qtyRaw, fallbackSnapshot?.qty, false) ?? 0;

			const stockQtyRaw = parseServerFloat(entry.stock_qty ?? entry.base_qty ?? entry.qty);
			const stockQty =
				resolveWithFallback(
					stockQtyRaw,
					fallbackSnapshot?.stock_qty ?? fallbackSnapshot?.qty,
					false,
				) ?? qty;

			const conversionFactorRaw = parseServerFloat(entry.conversion_factor ?? entry.cf);
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
			let displayRate = resolveWithFallback(parseServerFloat(entry.rate), fallbackSnapshot?.rate, true);

			let basePriceListRate = resolveWithFallback(
				parseServerFloat(entry.base_price_list_rate ?? entry.price_list_rate),
				fallbackSnapshot?.base_price_list_rate ?? fallbackSnapshot?.price_list_rate,
				true,
			);
			let displayPriceListRate = resolveWithFallback(
				parseServerFloat(entry.price_list_rate),
				fallbackSnapshot?.price_list_rate,
				true,
			);

			let baseDiscount = resolveWithFallback(
				parseServerFloat(entry.base_discount_amount ?? entry.discount_amount),
				fallbackSnapshot?.base_discount_amount ?? fallbackSnapshot?.discount_amount,
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

			if (!Number.isFinite(basePriceListRate) && Number.isFinite(displayPriceListRate)) {
				basePriceListRate = displayPriceListRate;
			}
			if (!Number.isFinite(displayPriceListRate) && Number.isFinite(basePriceListRate)) {
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
				discountPercentage = Math.max((baseDiscount / basePriceListRate) * 100, 0);
			}

			const sameItem =
				asServerBool(entry.same_item) ||
				(!!fallbackSnapshot &&
					(fallbackSnapshot.same_item === 1 || fallbackSnapshot.same_item === true));

			const uom = entry.uom || fallbackSnapshot?.uom;

			freebiesMap.set(key, {
				rule: ruleName,
				item_code: entry.item_code,
				qty,
				parentRowId: normalizedParentRowId,
				uom,
				stock_qty: stockQty,
				conversion_factor: Number.isFinite(conversionFactor) ? conversionFactor : undefined,
				...(sameItem ? { same_item: 1 } : {}),
				...(Number.isFinite(baseRate) ? { base_rate: baseRate } : {}),
				...(Number.isFinite(displayRate) ? { rate: displayRate } : {}),
				...(Number.isFinite(basePriceListRate) ? { base_price_list_rate: basePriceListRate } : {}),
				...(Number.isFinite(displayPriceListRate) ? { price_list_rate: displayPriceListRate } : {}),
				...(Number.isFinite(baseDiscount) ? { base_discount_amount: baseDiscount } : {}),
				...(Number.isFinite(discountAmount) ? { discount_amount: discountAmount } : {}),
				...(Number.isFinite(discountPercentage) ? { discount_percentage: discountPercentage } : {}),
			});

			if (sameItem) {
				if (normalizedParentRowId) {
					const bucket = sameItemFreeParents.get(normalizedParentRowId) || new Set();
					bucket.add(entry.item_code);
					sameItemFreeParents.set(normalizedParentRowId, bucket);
				} else {
					sameItemFreeCodes.add(entry.item_code);
				}
			}
		});

		updates.forEach((update) => {
			const targetId = update.row_id;
			const item = this.items.find(
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

			const baseRate = Number.parseFloat(update.rate ?? item.base_rate ?? 0) || 0;
			const basePriceListRate =
				Number.parseFloat(update.price_list_rate ?? item.base_price_list_rate ?? 0) || 0;
			const baseDiscount =
				Number.parseFloat(update.discount_amount ?? item.base_discount_amount ?? 0) || 0;
			const discountPercentage =
				Number.parseFloat(update.discount_percentage ?? item.discount_percentage ?? 0) || 0;

			const manualFromUom = item._manual_rate_set_from_uom === true;
			const manualOverride = item._manual_rate_set === true && !manualFromUom;
			const priceLocked = item.locked_price === true;
			const offerApplied =
				item.posa_offer_applied === true ||
				item.posa_offer_applied === 1 ||
				item.posa_offer_applied === "1";

			let allowServerRateUpdate = !manualOverride && !priceLocked && !offerApplied;

			if (allowServerRateUpdate) {
				const parentKey = item.posa_row_id || item.name || targetId || null;
				const sameItemCodes =
					parentKey && sameItemFreeParents.has(parentKey)
						? sameItemFreeParents.get(parentKey)
						: null;
				let hasSameItemFree = sameItemCodes instanceof Set && sameItemCodes.has(item.item_code);
				if (!hasSameItemFree && sameItemFreeCodes.has(item.item_code)) {
					hasSameItemFree = true;
				}
				const originalBaseRate = Number.isFinite(Number.parseFloat(item.base_rate))
					? Number.parseFloat(item.base_rate)
					: toBase(item.rate);
				const originalBasePriceList = Number.isFinite(Number.parseFloat(item.base_price_list_rate))
					? Number.parseFloat(item.base_price_list_rate)
					: toBase(item.price_list_rate);
				const originalBaseDiscount = Number.isFinite(Number.parseFloat(item.base_discount_amount))
					? Number.parseFloat(item.base_discount_amount)
					: toBase(item.discount_amount);
				const epsilon = 1e-6;
				const zeroRateFromServer = basePriceListRate > 0 && baseRate <= 0;
				const zeroPriceListFromServer = !Number.isFinite(basePriceListRate) || basePriceListRate <= 0;
				const serverRemovedPriceList =
					zeroPriceListFromServer && Number.isFinite(originalBasePriceList)
						? originalBasePriceList > 0
						: false;
				const serverRemovedDiscount =
					(!Number.isFinite(baseDiscount) || baseDiscount <= 0) &&
					Number.isFinite(originalBaseDiscount)
						? originalBaseDiscount > 0
						: false;
				const serverRemovedPercentage =
					(!Number.isFinite(discountPercentage) || discountPercentage <= 0) &&
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
					(serverZeroedValues || serverFullDiscount || fallbackFullDiscount)
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
				item.rate = this.flt ? this.flt(convertedRate, precision) : convertedRate;
				item.price_list_rate = this.flt
					? this.flt(convertedPriceListRate, precision)
					: convertedPriceListRate;
				item.discount_amount = this.flt ? this.flt(convertedDiscount, precision) : convertedDiscount;
				item.amount = this.flt ? this.flt(item.rate * item.qty, precision) : item.rate * item.qty;
				item.base_amount = this.flt ? this.flt(baseRate * item.qty, precision) : baseRate * item.qty;
			}

			const rulesProvided = Object.prototype.hasOwnProperty.call(update, "pricing_rules");
			const detailsProvided = Object.prototype.hasOwnProperty.call(update, "pricing_rule_details");

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
						const name = detail.name || detail.pricing_rule || detail.rule || null;
						if (!name) {
							return null;
						}
						const type = detail.type || detail.discount_type || null;
						return type ? { name, type } : { name };
					})
					.filter((detail) => !!detail);
			} else if (!rulesProvided && Array.isArray(item.pricing_rule_details)) {
				detailed = item.pricing_rule_details.map((detail) => ({ ...detail }));
			} else {
				detailed = appliedRules.map((name) => ({ name }));
			}

			this._updatePricingBadge(item, detailed);
		});

		this._syncAutoFreeLines(freebiesMap);
		if (typeof this.$forceUpdate === "function") {
			this.$forceUpdate();
		}
	},
	resetItemTaskCache(rowId, taskName = null) {
		if (!this._itemTaskCache) {
			return;
		}
		if (!rowId) {
			this._itemTaskCache = new Map();
			return;
		}
		if (taskName === null) {
			this._itemTaskCache.delete(rowId);
			return;
		}
		const bucket = this._itemTaskCache.get(rowId);
		if (!bucket) {
			return;
		}
		delete bucket[taskName];
		if (!Object.keys(bucket).length) {
			this._itemTaskCache.delete(rowId);
		}
	},
	queueItemTask(itemOrRowId, taskName, taskFn, options = {}) {
		const rowId = typeof itemOrRowId === "string" ? itemOrRowId : itemOrRowId?.posa_row_id;
		const { force = false } = options;
		const executeTask = () => Promise.resolve().then(() => taskFn());

		if (!rowId) {
			return executeTask();
		}

		if (force) {
			this.resetItemTaskCache(rowId, taskName);
		} else {
			const existing = this._getItemTaskPromise(rowId, taskName);
			if (existing) {
				return existing;
			}
		}

		const promise = executeTask();
		return this._setItemTaskPromise(rowId, taskName, promise);
	},
	hasItemTaskPromise(rowId, taskName) {
		return !!this._getItemTaskPromise(rowId, taskName);
	},
	getItemTaskPromise(rowId, taskName) {
		return this._getItemTaskPromise(rowId, taskName);
	},
	_getItemDetailCacheKey(item) {
		const code = item?.item_code;
		const warehouse = item?.warehouse || this.pos_profile?.warehouse;
		if (!code || !warehouse) {
			return null;
		}
		return `${code}::${warehouse}`;
	},
	_getCachedItemDetail(key) {
		if (!key) {
			return null;
		}
		const cache = this.item_detail_cache || {};
		const entry = cache[key];
		if (!entry) {
			return null;
		}
		if (Date.now() - entry.ts > ITEM_DETAIL_CACHE_TTL) {
			delete cache[key];
			return null;
		}
		return entry.data;
	},
	_storeItemDetailCache(key, data) {
		if (!key || !data) {
			return;
		}
		if (!this.item_detail_cache) {
			this.item_detail_cache = {};
		}
		this.item_detail_cache[key] = {
			ts: Date.now(),
			data: JSON.parse(JSON.stringify(data)),
		};
	},
	clearItemDetailCache() {
		this.item_detail_cache = {};
	},
	_getStockCacheKey(item) {
		const code = item?.item_code;
		const warehouse = item?.warehouse || this.pos_profile?.warehouse;
		if (!code || !warehouse) {
			return null;
		}
		return `${code}::${warehouse}`;
	},
	_getCachedStockQty(key) {
		if (!key) {
			return null;
		}
		const cache = this.item_stock_cache || {};
		const entry = cache[key];
		if (!entry) {
			return null;
		}
		if (Date.now() - entry.ts > STOCK_CACHE_TTL) {
			delete cache[key];
			return null;
		}
		return entry.qty;
	},
	_storeStockQty(key, qty) {
		if (!key) {
			return;
		}
		if (!this.item_stock_cache) {
			this.item_stock_cache = {};
		}
		this.item_stock_cache[key] = { ts: Date.now(), qty };
	},
	clearItemStockCache() {
		this.item_stock_cache = {};
	},
	remove_item(item) {
		const result = removeItem(item, this);
		this.schedulePricingRuleApplication();
		return result;
	},

	async add_item(item, options = {}) {
		const res = await addItem(item, this);
		this.schedulePricingRuleApplication();

		const shouldNotify =
			options?.notifyOnSuccess === true && !options?.skipNotification && this.eventBus?.emit;

		if (shouldNotify) {
			const rawQty = typeof item?.qty === "number" ? item.qty : parseFloat(item?.qty);
			const shouldAnnounce = Number.isFinite(rawQty) ? rawQty > 0 : true;

			if (shouldAnnounce) {
				const addedQty = Number.isFinite(rawQty) ? Math.abs(rawQty) : 1;
				const rawPrecision = Number(this.float_precision);
				const precision = Number.isInteger(rawPrecision) ? Math.min(Math.max(rawPrecision, 0), 6) : 2;
				const displayQty = Number.isInteger(addedQty)
					? addedQty
					: Number(addedQty.toFixed(precision));
				const itemName = item?.item_name || item?.item_code || __("Item");
				const detail = __("{0} (Qty: {1})", [itemName, displayQty]);

				this.eventBus.emit("show_message", {
					title: __("Item {0} added to invoice", [itemName]),
					summary: __("Items added to invoice"),
					detail,
					color: "success",
					groupId: "invoice-item-added",
				});
			}
		}

		return res;
	},

	// Create a new item object with default and calculated fields
	get_new_item(item) {
		return getNewItem(item, this);
	},

	// Reset all invoice fields to default/empty values
	clear_invoice() {
		return clearInvoice(this);
	},

	// Fetch customer balance from backend or cache
	async fetch_customer_balance() {
		try {
			if (!this.customer) {
				this.customer_balance = 0;
				return;
			}

			// Check if offline and use cached balance
			if (isOffline()) {
				const cachedBalance = getCachedCustomerBalance(this.customer);
				if (cachedBalance !== null) {
					this.customer_balance = cachedBalance;
					return;
				} else {
					// No cached balance available in offline mode
					this.customer_balance = 0;
					this.eventBus.emit("show_message", {
						title: __("Customer balance unavailable offline"),
						text: __("Balance will be updated when connection is restored"),
						color: "warning",
					});
					return;
				}
			}

			// Online mode: fetch from server and cache the result
			const r = await frappe.call({
				method: "posawesome.posawesome.api.customer.get_customer_balance",
				args: { customer: this.customer },
			});

			const balance = r?.message?.balance || 0;
			this.customer_balance = balance;

			// Cache the balance for offline use
			saveCustomerBalance(this.customer, balance);
		} catch (error) {
			console.error("Error fetching balance:", error);

			// Try to use cached balance as fallback
			const cachedBalance = getCachedCustomerBalance(this.customer);
			if (cachedBalance !== null) {
				this.customer_balance = cachedBalance;
				this.eventBus.emit("show_message", {
					title: __("Using cached customer balance"),
					text: __("Could not fetch latest balance from server"),
					color: "warning",
				});
			} else {
				this.eventBus.emit("show_message", {
					title: __("Error fetching customer balance"),
					color: "error",
				});
				this.customer_balance = 0;
			}
		}
	},

	// Cancel the current invoice, optionally delete from backend
	async cancel_invoice() {
		const doc = this.get_invoice_doc();
		this.invoiceType = this.pos_profile.posa_default_sales_order ? "Order" : "Invoice";
		this.invoiceTypes = ["Invoice", "Order", "Quotation"];
		this.posting_date = frappe.datetime.nowdate();
		var vm = this;
		if (doc.name && this.pos_profile.posa_allow_delete) {
			await frappe.call({
				method: "posawesome.posawesome.api.invoices.delete_invoice",
				args: { invoice: doc.name },
				async: true,
				callback: function (r) {
					if (r.message) {
						vm.eventBus.emit("show_message", {
							text: r.message,
							color: "warning",
						});
					}
				},
			});
		}
		this.clear_invoice();
		this.eventBus.emit("focus_item_search");
		this.cancel_dialog = false;
	},

	// Load an invoice (or return invoice) from data, set all fields accordingly
	async load_invoice(data = {}, options = {}) {
		const { preserveAdditionalDiscountPercentage = false } = options || {};
		const usePercentageDiscount = Boolean(this.pos_profile?.posa_use_percentage_discount);
		const previousDiscountPercentage = usePercentageDiscount
			? flt(this.additional_discount_percentage)
			: null;
		const shouldPreserveDiscountPercentage =
			usePercentageDiscount &&
			preserveAdditionalDiscountPercentage &&
			Number.isFinite(previousDiscountPercentage);

		console.log("load_invoice called with data:", {
			is_return: data.is_return,
			return_against: data.return_against,
			customer: data.customer,
			items_count: data.items ? data.items.length : 0,
		});

		this.clear_invoice();
		if (data?.is_return) {
			this._normalizeReturnDocTotals(data);
		}

		if (data.is_return) {
			console.log("Processing return invoice");
			// For return without invoice case, check if there's a return_against
			// Only set customer readonly if this is a return with reference to an invoice
			if (data.return_against) {
				console.log("Return has reference to invoice:", data.return_against);
				this.eventBus.emit("set_customer_readonly", true);
			} else {
				console.log("Return without invoice reference, customer can be selected");
				// Allow customer selection for returns without invoice
				this.eventBus.emit("set_customer_readonly", false);
			}
			this.invoiceType = "Return";
			this.invoiceTypes = ["Return"];
		} else if (data.doctype === "Quotation") {
			this.invoiceType = "Quotation";
			if (!this.invoiceTypes.includes("Quotation")) {
				this.invoiceTypes = ["Invoice", "Order", "Quotation"];
			}
		} else if (data.doctype === "Sales Order" && this.pos_profile?.posa_create_only_sales_order) {
			this.invoiceType = "Order";
			if (!this.invoiceTypes.includes("Order")) {
				this.invoiceTypes = ["Invoice", "Order", "Quotation"];
			}
		}

		this.invoice_doc = data;
		this.posa_offers = data.posa_offers || [];
		this.items = data.items || [];
		this.packed_items = data.packed_items || [];
		console.log("Items set:", this.items.length, "items");

		if (data.is_return && data.return_against) {
			this.items.forEach((item) => {
				item.locked_price = true;
			});
			this.packed_items.forEach((pi) => {
				pi.locked_price = true;
			});
		}

		if (this.items.length > 0) {
			this.items.forEach((item) => {
				if (!item.posa_row_id) {
					item.posa_row_id = this.makeid(20);
				}
				if (item.batch_no) {
					this.set_batch_qty(item, item.batch_no);
				}
				if (!item.original_item_name) {
					item.original_item_name = item.item_name;
				}
			});

			const manualSnapshots = this._snapshotManualValuesFromDocItems(this.items);

			// await this.update_items_details(this.items);

			if (manualSnapshots.length) {
				this._restoreManualSnapshots(this.items, manualSnapshots);
			}
		} else {
			console.log("Warning: No items in return invoice");
		}

		if (this.packed_items.length > 0) {
			this.update_items_details(this.packed_items);
			this.packed_items.forEach((pi) => {
				if (!pi.posa_row_id) {
					pi.posa_row_id = this.makeid(20);
				}
			});
		}

		this.customer = data.customer;
		await this.set_delivery_charges();

		this.posting_date = this.formatDateForBackend(data.posting_date || frappe.datetime.nowdate());
		if (data.posa_delivery_charges) {
			this.selected_delivery_charge = this.delivery_charges.find(
				(charge) => charge.name === data.posa_delivery_charges,
			);
			this.delivery_charges_rate = data.posa_delivery_charges_rate;
		}
		const docDiscountAmount = flt(data.discount_amount);
		const docDiscountPercentage =
			data.additional_discount_percentage !== undefined && data.additional_discount_percentage !== null
				? flt(data.additional_discount_percentage)
				: 0;
		const docIsReturn = Boolean(data.is_return);

		if (usePercentageDiscount) {
			let resolvedPercentage = 0;

			if (shouldPreserveDiscountPercentage) {
				resolvedPercentage = previousDiscountPercentage;
			} else if (
				data.additional_discount_percentage !== undefined &&
				data.additional_discount_percentage !== null &&
				Number.isFinite(docDiscountPercentage)
			) {
				resolvedPercentage = docDiscountPercentage;
			} else {
				const totalsForPercentage = [];

				if (this.Total) {
					const signedTotal = docIsReturn ? -Math.abs(this.Total) : this.Total;
					if (signedTotal) {
						totalsForPercentage.push(signedTotal);
					}
				}

				if (data.total !== undefined && data.total !== null) {
					const docTotal = flt(data.total);
					const signedDocTotal = docIsReturn ? -Math.abs(docTotal) : docTotal;
					if (signedDocTotal) {
						totalsForPercentage.push(signedDocTotal);
					}
				}

				if (data.net_total !== undefined && data.net_total !== null) {
					const docNetTotal = flt(data.net_total);
					const signedNetTotal = docIsReturn ? -Math.abs(docNetTotal) : docNetTotal;
					if (signedNetTotal) {
						totalsForPercentage.push(signedNetTotal);
					}
				}

				const percentageBase = totalsForPercentage.find((value) => value);

				if (percentageBase) {
					resolvedPercentage = this.flt(
						(docDiscountAmount / percentageBase) * 100,
						this.float_precision,
					);
				} else {
					resolvedPercentage = docDiscountPercentage;
				}
			}

			if (!Number.isFinite(resolvedPercentage)) {
				resolvedPercentage = 0;
			}

			if (docIsReturn) {
				resolvedPercentage = -Math.abs(resolvedPercentage);
			} else {
				resolvedPercentage = Math.abs(resolvedPercentage);
			}

			this.additional_discount_percentage = resolvedPercentage;
			updateDiscountAmount(this);

			// Ensure watchers or rounding adjustments don't overwrite the intended value
			if (typeof this.$nextTick === "function") {
				this.$nextTick(() => {
					if (this.pos_profile?.posa_use_percentage_discount) {
						this.additional_discount_percentage = resolvedPercentage;
					}
				});
			}

			this.additional_discount = this.flt(this.additional_discount, this.currency_precision);
			this.discount_amount = this.additional_discount;
		} else {
			this.discount_amount = docDiscountAmount;
			this.additional_discount_percentage = docDiscountPercentage;
			this.additional_discount = docDiscountAmount;
		}

		if (this.items.length > 0) {
			this.items.forEach((item) => {
				if (item.serial_no) {
					item.serial_no_selected = [];
					const serial_list = item.serial_no.split("\n");
					serial_list.forEach((element) => {
						if (element.length) {
							item.serial_no_selected.push(element);
						}
					});
					item.serial_no_selected_count = item.serial_no_selected.length;
				}
			});
		}

		if (data.is_return) {
			this.return_doc = data;
		} else {
			this.eventBus.emit("set_pos_coupons", data.posa_coupons);
		}

		console.log("load_invoice completed, invoice state:", {
			invoiceType: this.invoiceType,
			is_return: this.invoice_doc.is_return,
			items: this.items.length,
			customer: this.customer,
		});
	},

	// Save and clear the current invoice (draft logic)
	async save_and_clear_invoice() {
		let old_invoice = null;
		const doc = this.get_invoice_doc();

		try {
			if (doc.name) {
				old_invoice = await this.update_invoice(doc);
			} else if (doc.items.length) {
				old_invoice = await this.update_invoice(doc);
			} else {
				this.eventBus.emit("show_message", {
					title: `Nothing to save`,
					color: "error",
				});
			}
		} catch (error) {
			console.error("Error saving and clearing invoice:", error);
		}

		if (!old_invoice) {
			this.eventBus.emit("show_message", {
				title: `Error saving the current invoice`,
				color: "error",
			});
		} else {
			this.clear_invoice();
			this.eventBus.emit("focus_item_search");
			return old_invoice;
		}
	},

	// Start a new order (or return order) with provided data
	async new_order(data = {}) {
		let old_invoice = null;
		this.eventBus.emit("set_customer_readonly", false);
		this.expanded = [];
		this.posa_offers = [];
		this.eventBus.emit("set_pos_coupons", []);
		this.posa_coupons = [];
		this.return_doc = "";
		if (!data.name && !data.is_return) {
			this.items = [];
			this.customer = this.pos_profile.customer;
			this.invoice_doc = "";
			this.discount_amount = 0;
			this.additional_discount_percentage = 0;
			this.invoiceType = "Invoice";
			this.invoiceTypes = ["Invoice", "Order", "Quotation"];
		} else {
			if (data.is_return) {
				this._normalizeReturnDocTotals(data);
				// For return without invoice case, check if there's a return_against
				// Only set customer readonly if this is a return with reference to an invoice
				if (data.return_against) {
					this.eventBus.emit("set_customer_readonly", true);
				} else {
					// Allow customer selection for returns without invoice
					this.eventBus.emit("set_customer_readonly", false);
				}
				this.invoiceType = "Return";
				this.invoiceTypes = ["Return"];
			}
			this.invoice_doc = data;
			this.posa_offers = data.posa_offers || [];
			this.items = data.items;
			// this.update_items_details(this.items);
			this.items.forEach((item) => {
				if (!item.posa_row_id) {
					item.posa_row_id = this.makeid(20);
				}
				if (item.batch_no) {
					this.set_batch_qty(item, item.batch_no);
				}
			});
			this.customer = data.customer;
			this.posting_date = this.formatDateForBackend(data.posting_date || frappe.datetime.nowdate());
			this.discount_amount = data.discount_amount;
			if (data.is_return && this.pos_profile?.posa_use_percentage_discount) {
				this.additional_discount_percentage = -Math.abs(flt(data.additional_discount_percentage));
			} else {
				this.additional_discount_percentage = data.additional_discount_percentage;
			}
			this.items.forEach((item) => {
				if (item.serial_no) {
					item.serial_no_selected = [];
					const serial_list = item.serial_no.split("\n");
					serial_list.forEach((element) => {
						if (element.length) {
							item.serial_no_selected.push(element);
						}
					});
					item.serial_no_selected_count = item.serial_no_selected.length;
				}
			});
		}
		return old_invoice;
	},

	// Build the invoice document object for backend submission
	get_invoice_doc() {
		let doc = {};
		const sourceDoc = this.invoice_doc || {};

		if (sourceDoc.name) {
			doc = { ...sourceDoc };
		}

		// Always set these fields first
		if (this.invoiceType === "Quotation") {
			doc.doctype = "Quotation";
		} else if (this.invoiceType === "Order" && this.pos_profile.posa_create_only_sales_order) {
			doc.doctype = "Sales Order";
		} else if (this.pos_profile.create_pos_invoice_instead_of_sales_invoice) {
			doc.doctype = "POS Invoice";
		} else {
			doc.doctype = "Sales Invoice";
		}
		doc.is_pos = 1;
		doc.ignore_pricing_rule = 0;
		doc.company = doc.company || this.pos_profile.company;
		doc.pos_profile = doc.pos_profile || this.pos_profile.name;
		doc.posa_show_custom_name_marker_on_print = this.pos_profile.posa_show_custom_name_marker_on_print;

		// Currency related fields
		doc.currency = this.selected_currency || this.pos_profile.currency;
		doc.conversion_rate = (sourceDoc && sourceDoc.conversion_rate) || this.conversion_rate || 1;

		// Use actual price list currency if available
		doc.price_list_currency = this.price_list_currency || doc.currency;

		doc.plc_conversion_rate =
			(sourceDoc && sourceDoc.plc_conversion_rate) ||
			(doc.price_list_currency === doc.currency ? 1 : this.exchange_rate);

		// Other fields
		doc.campaign = doc.campaign || this.pos_profile.campaign;
		doc.selling_price_list = this.pos_profile.selling_price_list;
		doc.naming_series = doc.naming_series || this.pos_profile.naming_series;
		const customerDetails =
			this.customer_info && typeof this.customer_info === "object" ? this.customer_info : {};
		const resolvedCustomer = this.customer || customerDetails.customer || doc.customer || null;
		doc.customer = resolvedCustomer;
		if (!doc.customer_name && customerDetails.customer_name) {
			doc.customer_name = customerDetails.customer_name;
		}
		if (doc.doctype === "Quotation") {
			doc.quotation_to = doc.quotation_to || "Customer";
			if (resolvedCustomer) {
				doc.party_name = resolvedCustomer;
			}
		}

		// Determine if this is a return invoice
		const isReturn = this.isReturnInvoice;
		doc.is_return = isReturn ? 1 : 0;

		// Calculate amounts in selected currency
		const items = this.get_invoice_items();
		doc.items = items;
		doc.packed_items = (this.packed_items || []).map((pi) => ({
			parent_item: pi.parent_item,
			item_code: pi.item_code,
			item_name: pi.item_name,
			qty: flt(pi.qty),
			uom: pi.uom,
			warehouse: pi.warehouse,
			batch_no: pi.batch_no,
			serial_no: pi.serial_no,
			rate: flt(pi.rate),
		}));

		// Calculate totals in selected currency ensuring negative values for returns
		let total = this.Total;
		if (isReturn && total > 0) total = -Math.abs(total);

		doc.total = total;
		doc.net_total = total; // Will adjust later if taxes are inclusive
		doc.base_total = total * (this.exchange_rate || 1);
		doc.base_net_total = total * (this.exchange_rate || 1);

		// Apply discounts with correct sign for returns
		let discountAmount = flt(this.additional_discount);
		if (isReturn && discountAmount > 0) discountAmount = -Math.abs(discountAmount);

		doc.discount_amount = discountAmount;
		doc.base_discount_amount = discountAmount * (this.exchange_rate || 1);

		let discountPercentage = flt(this.additional_discount_percentage);
		if (this.pos_profile?.posa_use_percentage_discount) {
			discountPercentage = Math.abs(discountPercentage);
		} else if (isReturn && discountPercentage > 0) {
			discountPercentage = -Math.abs(discountPercentage);
		}

		doc.additional_discount_percentage = discountPercentage;

		// Calculate grand total with correct sign for returns
		let grandTotal = this.subtotal;

		// Prepare taxes array
		doc.taxes = [];
		if (this.invoice_doc && this.invoice_doc.taxes) {
			let totalTax = 0;
			this.invoice_doc.taxes.forEach((tax) => {
				if (tax.tax_amount) {
					grandTotal += flt(tax.tax_amount);
					totalTax += flt(tax.tax_amount);
				}
				doc.taxes.push({
					account_head: tax.account_head,
					charge_type: tax.charge_type || "On Net Total",
					description: tax.description,
					rate: tax.rate,
					included_in_print_rate: tax.included_in_print_rate || 0,
					tax_amount: tax.tax_amount,
					total: tax.total,
					base_tax_amount: tax.tax_amount * (this.exchange_rate || 1),
					base_total: tax.total * (this.exchange_rate || 1),
				});
			});
			doc.total_taxes_and_charges = totalTax;
		} else if (isOffline()) {
			const tmpl = getTaxTemplate(this.pos_profile.taxes_and_charges);
			if (tmpl && Array.isArray(tmpl.taxes)) {
				const inclusive = getTaxInclusiveSetting();
				let runningTotal = grandTotal;
				let totalTax = 0;
				tmpl.taxes.forEach((row) => {
					let tax_amount = 0;
					if (row.charge_type === "Actual") {
						tax_amount = flt(row.tax_amount || 0);
					} else if (inclusive) {
						tax_amount = flt((doc.total * flt(row.rate)) / 100);
					} else {
						tax_amount = flt((doc.net_total * flt(row.rate)) / 100);
					}
					if (!inclusive) {
						runningTotal += tax_amount;
					}
					totalTax += tax_amount;
					doc.taxes.push({
						account_head: row.account_head,
						charge_type: row.charge_type || "On Net Total",
						description: row.description,
						rate: row.rate,
						included_in_print_rate: row.charge_type === "Actual" ? 0 : inclusive ? 1 : 0,
						tax_amount: tax_amount,
						total: runningTotal,
						base_tax_amount: tax_amount * (this.exchange_rate || 1),
						base_total: runningTotal * (this.exchange_rate || 1),
					});
				});
				if (inclusive) {
					doc.net_total = doc.total - totalTax;
					doc.base_net_total = doc.net_total * (this.exchange_rate || 1);
					grandTotal = doc.total;
				} else {
					grandTotal = runningTotal;
				}
				doc.total_taxes_and_charges = totalTax;
			}
		}

		if (isReturn && grandTotal > 0) grandTotal = -Math.abs(grandTotal);

		doc.grand_total = grandTotal;
		doc.base_grand_total = grandTotal * (this.exchange_rate || 1);

		// Apply rounding to get rounded total unless disabled in POS Profile
		if (this.pos_profile.disable_rounded_total) {
			doc.rounded_total = flt(grandTotal, this.currency_precision);
			doc.base_rounded_total = flt(doc.base_grand_total, this.currency_precision);
		} else {
			doc.rounded_total = this.roundAmount(grandTotal);
			doc.base_rounded_total = this.roundAmount(doc.base_grand_total);
		}

		// Add POS specific fields
		doc.posa_pos_opening_shift = this.pos_opening_shift.name;
		doc.payments = this.get_payments();

		// Handle return specific fields
		if (isReturn) {
			if (this.invoice_doc.return_against) {
				doc.return_against = this.invoice_doc.return_against;
			}
			doc.update_stock = 1;

			// Double-check all values are negative
			if (doc.grand_total > 0) doc.grand_total = -Math.abs(doc.grand_total);
			if (doc.base_grand_total > 0) doc.base_grand_total = -Math.abs(doc.base_grand_total);
			if (doc.rounded_total > 0) doc.rounded_total = -Math.abs(doc.rounded_total);
			if (doc.base_rounded_total > 0) doc.base_rounded_total = -Math.abs(doc.base_rounded_total);
			if (doc.total > 0) doc.total = -Math.abs(doc.total);
			if (doc.base_total > 0) doc.base_total = -Math.abs(doc.base_total);
			if (doc.net_total > 0) doc.net_total = -Math.abs(doc.net_total);
			if (doc.base_net_total > 0) doc.base_net_total = -Math.abs(doc.base_net_total);

			// Ensure payments have negative amounts
			if (doc.payments && doc.payments.length) {
				doc.payments.forEach((payment) => {
					if (payment.amount > 0) payment.amount = -Math.abs(payment.amount);
					if (payment.base_amount > 0) payment.base_amount = -Math.abs(payment.base_amount);
				});
			}
		}

		// Add offer details
		doc.posa_offers = this.posa_offers;
		doc.posa_coupons = this.posa_coupons;
		doc.posa_delivery_charges = this.selected_delivery_charge?.name || null;
		doc.posa_delivery_charges_rate = this.delivery_charges_rate || 0;
		doc.posa_notes = sourceDoc.posa_notes ?? null;
		doc.posa_authorization_code = sourceDoc.posa_authorization_code ?? null;
		doc.posa_return_valid_upto = sourceDoc.posa_return_valid_upto ?? null;
		doc.posting_date = this.formatDateForBackend(this.posting_date_display);

		// Add flags to ensure proper rate handling
		doc.ignore_pricing_rule = 0;

		// Preserve the real price list currency
		doc.price_list_currency = this.price_list_currency || doc.currency;
		doc.plc_conversion_rate = this.exchange_rate || doc.conversion_rate;
		doc.ignore_default_fields = 1; // Add this to prevent default field updates

		// Add custom fields to track offer rates
		doc.posa_is_offer_applied = this.posa_offers.length > 0 ? 1 : 0;

		// Calculate base amounts using the exchange rate
		const baseCurrency = this.price_list_currency || this.pos_profile.currency;
		if (this.selected_currency !== baseCurrency) {
			// For returns, we need to ensure negative values
			const multiplier = isReturn ? -1 : 1;

			// Convert amounts back to the base currency
			doc.base_total = (total / this.exchange_rate) * multiplier;
			doc.base_net_total = (total / this.exchange_rate) * multiplier;
			doc.base_discount_amount = (discountAmount / this.exchange_rate) * multiplier;
			doc.base_grand_total = (grandTotal / this.exchange_rate) * multiplier;
			doc.base_rounded_total = (grandTotal / this.exchange_rate) * multiplier;
		} else {
			// Same currency, just ensure negative values for returns
			const multiplier = isReturn ? -1 : 1;
			// When in base currency, the base amounts are the same as the regular amounts
			doc.base_total = total * multiplier;
			doc.base_net_total = total * multiplier;
			doc.base_discount_amount = discountAmount * multiplier;
			doc.base_grand_total = grandTotal * multiplier;
			doc.base_rounded_total = grandTotal * multiplier;
		}

		// Ensure payments have correct base amounts
		if (doc.payments && doc.payments.length) {
			doc.payments.forEach((payment) => {
				if (this.selected_currency !== baseCurrency) {
					// Convert payment amount to base currency
					payment.base_amount = payment.amount / this.exchange_rate;
				} else {
					payment.base_amount = payment.amount;
				}

				// For returns, ensure negative values
				if (isReturn) {
					payment.amount = -Math.abs(payment.amount);
					payment.base_amount = -Math.abs(payment.base_amount);
				}
			});
		}

		return doc;
	},

	// Get invoice doc from order doc (for sales order to invoice conversion)
	async get_invoice_from_order_doc() {
		let doc = {};
		if (this.invoice_doc.doctype == "Sales Order") {
			await frappe.call({
				method: "posawesome.posawesome.api.invoices.create_sales_invoice_from_order",
				args: {
					sales_order: this.invoice_doc.name,
				},
				// async: false,
				callback: function (r) {
					if (r.message) {
						doc = r.message;
					}
				},
			});
		} else {
			doc = this.invoice_doc;
		}
		const Items = [];
		const updatedItemsData = this.get_invoice_items();
		doc.items.forEach((item) => {
			const updatedData = updatedItemsData.find(
				(updatedItem) => updatedItem.item_code === item.item_code,
			);
			if (updatedData) {
				item.item_code = updatedData.item_code;
				item.posa_row_id = updatedData.posa_row_id;
				item.posa_offers = updatedData.posa_offers;
				item.posa_offer_applied = updatedData.posa_offer_applied;
				item.posa_is_offer = updatedData.posa_is_offer;
				item.posa_is_replace = updatedData.posa_is_replace;
				item.is_free_item = updatedData.is_free_item;
				item.qty = flt(updatedData.qty);
				item.rate = flt(updatedData.rate);
				item.uom = updatedData.uom;
				item.amount = flt(updatedData.qty) * flt(updatedData.rate);
				item.conversion_factor = updatedData.conversion_factor;
				item.serial_no = updatedData.serial_no;
				item.discount_percentage = flt(updatedData.discount_percentage);
				item.discount_amount = flt(updatedData.discount_amount);
				item.batch_no = updatedData.batch_no;
				item.posa_notes = updatedData.posa_notes;
				item.posa_delivery_date = this.formatDateForDisplay(updatedData.posa_delivery_date);
				item.price_list_rate = updatedData.price_list_rate;
				Items.push(item);
			}
		});

		doc.items = Items;
		const newItems = [...doc.items];
		const existingItemCodes = new Set(newItems.map((item) => item.item_code));
		updatedItemsData.forEach((updatedItem) => {
			if (!existingItemCodes.has(updatedItem.item_code)) {
				newItems.push(updatedItem);
			}
		});
		doc.items = newItems;
		doc.update_stock = 1;
		doc.is_pos = 1;
		doc.payments = this.get_payments();
		return doc;
	},

	// Prepare items array for invoice doc
	get_invoice_items() {
		const items_list = [];
		const isReturn = this.isReturnInvoice;
		const usesPosInvoice = this.pos_profile.create_pos_invoice_instead_of_sales_invoice;
		const omitFreebies = !isOffline();

		this.items.forEach((item) => {
			if (omitFreebies && item && item.auto_free_source) {
				return;
			}
			const new_item = {
				item_code: item.item_code,
				// Retain the item name for offline invoices
				// Fallback to item_code if item_name is not available
				item_name: item.item_name || item.item_code,
				name_overridden: item.name_overridden ? 1 : 0,
				posa_row_id: item.posa_row_id,
				posa_offers: item.posa_offers,
				posa_offer_applied: item.posa_offer_applied,
				posa_is_offer: item.posa_is_offer,
				posa_is_replace: item.posa_is_replace,
				is_free_item: item.is_free_item,
				qty: flt(item.qty),
				uom: item.uom,
				conversion_factor: item.conversion_factor,
				serial_no: item.serial_no,
				// Link to original invoice item when doing returns
				// Needed for backend validation that the item exists in
				// the referenced Sales or POS Invoice
				...(item.sales_invoice_item && { sales_invoice_item: item.sales_invoice_item }),
				...(item.pos_invoice_item && { pos_invoice_item: item.pos_invoice_item }),
				discount_percentage: flt(item.discount_percentage),
				batch_no: item.batch_no,
				posa_notes: item.posa_notes,
				posa_delivery_date: this.formatDateForBackend(item.posa_delivery_date),
			};
			if (isReturn) {
				const refField = usesPosInvoice ? "pos_invoice_item" : "sales_invoice_item";
				if (!new_item[refField] && item.name) {
					new_item[refField] = item.name;
				}
			}

			// Handle currency conversion for rates and amounts
			const baseCurrency = this.price_list_currency || this.pos_profile.currency;
			if (this.selected_currency !== baseCurrency) {
				// If exchange rate is 300 PKR = 1 USD
				// item.rate is in USD (e.g. 10 USD)
				// base_rate should be in PKR (e.g. 3000 PKR)
				new_item.rate = flt(item.rate); // Keep rate in USD

				// Use pre-stored base_rate if available, otherwise calculate
				new_item.base_rate = item.base_rate || flt(item.rate / this.exchange_rate);

				new_item.price_list_rate = flt(item.price_list_rate); // Keep price list rate in USD
				new_item.base_price_list_rate =
					item.base_price_list_rate ?? flt(item.price_list_rate / this.exchange_rate);

				// Calculate amounts
				new_item.amount = flt(item.qty) * new_item.rate; // Amount in USD
				new_item.base_amount = new_item.amount / this.exchange_rate; // Convert to base currency

				// Handle discount amount
				new_item.discount_amount = flt(item.discount_amount); // Keep discount in USD
				new_item.base_discount_amount =
					item.base_discount_amount || flt(item.discount_amount / this.exchange_rate);
			} else {
				// Same currency (base currency), make sure we use base rates if available
				new_item.rate = flt(item.rate);
				new_item.base_rate = item.base_rate || flt(item.rate);
				new_item.price_list_rate = flt(item.price_list_rate);
				new_item.base_price_list_rate = item.base_price_list_rate ?? flt(item.price_list_rate);
				new_item.amount = flt(item.qty) * new_item.rate;
				new_item.base_amount = new_item.amount;
				new_item.discount_amount = flt(item.discount_amount);
				new_item.base_discount_amount = item.base_discount_amount || flt(item.discount_amount);
			}

			// For returns, ensure all amounts are negative
			if (isReturn) {
				new_item.qty = -Math.abs(new_item.qty);
				new_item.amount = -Math.abs(new_item.amount);
				new_item.base_amount = -Math.abs(new_item.base_amount);
				new_item.discount_amount = -Math.abs(new_item.discount_amount);
				new_item.base_discount_amount = -Math.abs(new_item.base_discount_amount);
			}

			items_list.push(new_item);
		});

		return items_list;
	},

	// Prepare items array for order doc
	get_order_items() {
		const items_list = [];
		this.items.forEach((item) => {
			const new_item = {
				item_code: item.item_code,
				// Retain item name to show on offline order documents
				// Use item_code if item_name is missing
				item_name: item.item_name || item.item_code,
				name_overridden: item.name_overridden ? 1 : 0,
				posa_row_id: item.posa_row_id,
				posa_offers: item.posa_offers,
				posa_offer_applied: item.posa_offer_applied,
				posa_is_offer: item.posa_is_offer,
				posa_is_replace: item.posa_is_replace,
				is_free_item: item.is_free_item,
				qty: flt(item.qty),
				rate: flt(item.rate),
				uom: item.uom,
				amount: flt(item.qty) * flt(item.rate),
				conversion_factor: item.conversion_factor,
				serial_no: item.serial_no,
				discount_percentage: flt(item.discount_percentage),
				discount_amount: flt(item.discount_amount),
				batch_no: item.batch_no,
				posa_notes: item.posa_notes,
				posa_delivery_date: item.posa_delivery_date,
				price_list_rate: item.price_list_rate,
			};
			items_list.push(new_item);
		});

		return items_list;
	},

	// Prepare payments array for invoice doc
	get_payments() {
		const payments = [];
		// Use this.subtotal which is already in selected currency and includes all calculations
		const total_amount = this.subtotal;
		let remaining_amount = total_amount;

		if (this.loyalty_amount) remaining_amount -= this.loyalty_amount;
		if (this.redeemed_customer_credit) remaining_amount -= this.redeemed_customer_credit;

		// Find the index of the default payment method
		const defaultPaymentIndex = this.pos_profile.payments.findIndex((payment) => payment.default === 1);
		const targetIndex = defaultPaymentIndex >= 0 ? defaultPaymentIndex : 0;

		this.pos_profile.payments.forEach((payment, index) => {
			// For the default payment method (or first if no default), assign the full remaining amount
			const payment_amount = index === targetIndex ? remaining_amount : payment.amount || 0;

			// For return invoices, ensure payment amounts are negative
			const adjusted_amount = this.isReturnInvoice ? -Math.abs(payment_amount) : payment_amount;

			// Handle currency conversion
			// If selected_currency is USD and base is PKR:
			// amount is in USD (e.g. 10 USD)
			// base_amount should be in PKR (e.g. 3000 PKR)
			// So multiply by exchange rate to get base_amount
			const baseCurrency = this.price_list_currency || this.pos_profile.currency;
			const base_amount =
				this.selected_currency !== baseCurrency
					? this.flt(adjusted_amount / (this.exchange_rate || 1), this.currency_precision)
					: adjusted_amount;

			payments.push({
				amount: adjusted_amount, // Keep in selected currency (e.g. USD)
				base_amount: base_amount, // Convert to base currency (e.g. PKR)
				mode_of_payment: payment.mode_of_payment,
				default: payment.default,
				account: payment.account || "",
				type: payment.type || "Cash",
				currency: this.selected_currency || this.pos_profile.currency,
				conversion_rate: this.conversion_rate || 1,
			});

			// Only subtract if we actually used the remaining amount
			if (index === targetIndex) {
				remaining_amount -= payment_amount;
			}
		});

		console.log("Generated payments:", {
			currency: this.selected_currency,
			exchange_rate: this.exchange_rate,
			payments: payments.map((p) => ({
				mode: p.mode_of_payment,
				amount: p.amount,
				base_amount: p.base_amount,
			})),
		});

		return payments;
	},

	// Convert amount to selected currency
	convert_amount(amount) {
		const baseCurrency = this.price_list_currency || this.pos_profile.currency;
		if (this.selected_currency === baseCurrency) {
			return amount;
		}
		return this.flt(amount * this.exchange_rate, this.currency_precision);
	},

	// Update invoice in backend
	async update_invoice(doc) {
		if (isOffline()) {
			// When offline, simply merge the passed doc with the current invoice_doc
			// to allow offline invoice creation without server calls
			this.invoice_doc = Object.assign({}, this.invoice_doc || {}, doc);
			return this.invoice_doc;
		}

		const method =
			doc.doctype === "Sales Order" && this.pos_profile.posa_create_only_sales_order
				? "posawesome.posawesome.api.sales_orders.update_sales_order"
				: doc.doctype === "Quotation"
					? "posawesome.posawesome.api.quotations.update_quotation"
					: "posawesome.posawesome.api.invoices.update_invoice";

		try {
			const response = await frappe.call({
				method,
				args: {
					data: doc,
				},
			});

			const message = response?.message;
			if (message) {
				if (message.is_return) {
					this._normalizeReturnDocTotals(message);
				}
				this.invoice_doc = message;
				if (message.exchange_rate_date) {
					this.exchange_rate_date = message.exchange_rate_date;
					const posting_backend = this.formatDateForBackend(this.posting_date_display);
					if (posting_backend !== this.exchange_rate_date) {
						this.eventBus.emit("show_message", {
							title: __(
								"Exchange rate date " +
									this.exchange_rate_date +
									" differs from posting date " +
									posting_backend,
							),
							color: "warning",
						});
					}
				}
			}

			return this.invoice_doc;
		} catch (error) {
			console.error("Error updating invoice:", error);
			throw error;
		}
	},

	// Update invoice from order in backend
	async update_invoice_from_order(doc) {
		if (isOffline()) {
			// Offline mode - merge doc locally without server update
			this.invoice_doc = Object.assign({}, this.invoice_doc || {}, doc);
			return this.invoice_doc;
		}

		try {
			const response = await frappe.call({
				method: "posawesome.posawesome.api.invoices.update_invoice_from_order",
				args: {
					data: doc,
				},
			});

			const message = response?.message;
			if (message) {
				if (message.is_return) {
					this._normalizeReturnDocTotals(message);
				}
				this.invoice_doc = message;
				if (message.exchange_rate_date) {
					this.exchange_rate_date = message.exchange_rate_date;
					const posting_backend = this.formatDateForBackend(this.posting_date_display);
					if (posting_backend !== this.exchange_rate_date) {
						this.eventBus.emit("show_message", {
							title: __(
								"Exchange rate date " +
									this.exchange_rate_date +
									" differs from posting date " +
									posting_backend,
							),
							color: "warning",
						});
					}
				}
			}

			return this.invoice_doc;
		} catch (error) {
			console.error("Error updating invoice from order:", error);
			throw error;
		}
	},

	// Process and save invoice (handles update or create)
	async process_invoice() {
		const doc = this.get_invoice_doc();
		try {
			const updated_doc = await this.update_invoice(doc);
			if (updated_doc && updated_doc.posting_date) {
				this.posting_date = this.formatDateForBackend(updated_doc.posting_date);
			}
			return updated_doc;
		} catch (error) {
			console.error("Error in process_invoice:", error);
			this.eventBus.emit("show_message", {
				title: __(error.message || "Error processing invoice"),
				color: "error",
			});
			return false;
		}
	},

	// Process and save invoice from order
	async process_invoice_from_order() {
		const doc = await this.get_invoice_from_order_doc();
		return this.update_invoice_from_order(doc);
	},

	// Apply available offers, save the invoice, and reload it from backend
	async apply_offers_and_reload() {
		try {
			if (!Array.isArray(this.items) || this.items.length === 0) {
				this.eventBus.emit("show_message", {
					title: __("Select items to apply offers"),
					color: "warning",
				});
				return;
			}

			// Recompute and apply offers for current items
			if (typeof this.handelOffers === "function") {
				await this.handelOffers();
			}

			// Persist invoice (server calculates totals/taxes)
			const updated = await this.process_invoice();
			if (!updated) {
				return;
			}

			// Reload same invoice from backend without selection UI
			if (!isOffline() && updated.name) {
				await this.reload_current_invoice_from_backend();
			}

			this.eventBus.emit("show_message", {
				title: __("Offers applied and invoice refreshed"),
				color: "success",
			});
		} catch (error) {
			console.error("Error in apply_offers_and_reload:", error);
			this.eventBus.emit("show_message", {
				title: __("Failed to apply offers"),
				color: "error",
			});
		}
	},

	// Reload the currently open invoice from the backend and load it into the UI
	async reload_current_invoice_from_backend() {
		try {
			if (isOffline()) {
				return null;
			}

			const current = this.invoice_doc || {};
			const name = current.name;
			let doctype = current.doctype;

			if (!doctype) {
				if (this.invoiceType === "Quotation") {
					doctype = "Quotation";
				} else if (this.invoiceType === "Order" && this.pos_profile?.posa_create_only_sales_order) {
					doctype = "Sales Order";
				} else if (this.pos_profile?.create_pos_invoice_instead_of_sales_invoice) {
					doctype = "POS Invoice";
				} else {
					doctype = "Sales Invoice";
				}
			}

			if (!name || !doctype) {
				return null;
			}

			const manualOverrides = this._collectManualRateOverrides(this.items);

			const r = await frappe.call({
				method: "frappe.client.get",
				args: { doctype, name },
			});

			const doc = r?.message;
			if (doc) {
				if (manualOverrides.length) {
					this._applyManualRateOverridesToDoc(doc, manualOverrides);
				}
				await this.load_invoice(doc, {
					preserveAdditionalDiscountPercentage: true,
				});
				return doc;
			}
			return null;
		} catch (error) {
			console.error("Error reloading current invoice from backend:", error);
			this.eventBus.emit("show_message", {
				title: __("Failed to reload invoice from server"),
				color: "warning",
			});
			return null;
		}
	},

	_normalizeReturnDocTotals(doc) {
		if (!doc || !doc.is_return) {
			return doc;
		}

		const toNumber = (value) => {
			if (value === undefined || value === null || value === "") {
				return null;
			}

			const number = flt(value, this.currency_precision);
			return Number.isFinite(number) ? number : null;
		};

		const ensureNegative = (value) => {
			if (value === null) {
				return value;
			}
			return value > 0 ? -Math.abs(value) : value;
		};

		const adjustFieldByDelta = (field, delta) => {
			if (!delta || !Number.isFinite(delta)) {
				return;
			}

			if (doc[field] === undefined || doc[field] === null || doc[field] === "") {
				return;
			}

			const currentValue = toNumber(doc[field]);
			if (currentValue === null) {
				return;
			}

			doc[field] = flt(currentValue - delta, this.currency_precision);
		};

		const originalDiscount = toNumber(doc.discount_amount);
		let discountDelta = 0;
		if (originalDiscount !== null) {
			const normalizedDiscount = ensureNegative(originalDiscount);
			discountDelta = normalizedDiscount - originalDiscount;
			doc.discount_amount = normalizedDiscount;
		}

		const originalBaseDiscount = toNumber(doc.base_discount_amount);
		let baseDiscountDelta = 0;
		if (originalBaseDiscount !== null) {
			const normalizedBaseDiscount = ensureNegative(originalBaseDiscount);
			baseDiscountDelta = normalizedBaseDiscount - originalBaseDiscount;
			doc.base_discount_amount = normalizedBaseDiscount;
		}

		if (discountDelta) {
			["net_total", "grand_total", "rounded_total"].forEach((field) =>
				adjustFieldByDelta(field, discountDelta),
			);
		}

		if (baseDiscountDelta) {
			["base_net_total", "base_grand_total", "base_rounded_total"].forEach((field) =>
				adjustFieldByDelta(field, baseDiscountDelta),
			);
		}

		[
			"total",
			"net_total",
			"grand_total",
			"rounded_total",
			"base_total",
			"base_net_total",
			"base_grand_total",
			"base_rounded_total",
		].forEach((field) => {
			if (doc[field] === undefined || doc[field] === null || doc[field] === "") {
				return;
			}

			const value = toNumber(doc[field]);
			if (value === null) {
				return;
			}

			doc[field] = ensureNegative(value);
		});

		return doc;
	},

	_collectManualRateOverrides(items) {
		if (!Array.isArray(items) || !items.length) {
			return [];
		}

		return items
			.filter((item) => item && item._manual_rate_set)
			.map((item) => {
				const keys = {
					name: item.name || null,
					posa_row_id: item.posa_row_id || null,
					item_code: item.item_code || null,
					idx: item.idx !== undefined && item.idx !== null ? Number(item.idx) : null,
					batch_no: item.batch_no || null,
					serial_no: item.serial_no || null,
				};

				const determineFreeLine = () => {
					if (typeof this._isFreeLine === "function") {
						return this._isFreeLine(item);
					}
					const coerce = (value) => value === true || value === 1 || value === "1";
					return (
						coerce(item?.is_free_item) ||
						coerce(item?.same_item) ||
						(typeof item?.auto_free_source === "string" && item.auto_free_source) ||
						(typeof item?.free_item_source === "string" && item.free_item_source)
					);
				};

				if (determineFreeLine()) {
					keys.is_free_item = 1;
					if (item.auto_free_source) {
						keys.auto_free_source = item.auto_free_source;
					}
					if (item.parent_row_id) {
						keys.parent_row_id = item.parent_row_id;
					}
					const rawRule = Array.isArray(item.pricing_rules)
						? item.pricing_rules.find((rule) => !!rule)
						: item.pricing_rules;
					const normalizedRule = rawRule || item.source_rule || item.pricing_rule || null;
					if (normalizedRule) {
						keys.source_rule = normalizedRule;
					}
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
	},

	_doesManualOverrideMatchItem(override, item) {
		if (!override?.keys || !item) {
			return false;
		}

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

		if (name && item.name && name === item.name) {
			return true;
		}

		if (posa_row_id && item.posa_row_id && posa_row_id === item.posa_row_id) {
			return true;
		}

		const coerce = (value) => value === true || value === 1 || value === "1";

		if (is_free_item !== undefined && is_free_item !== null) {
			const expectsFree = coerce(is_free_item);
			const itemIsFree =
				(typeof this._isFreeLine === "function" && this._isFreeLine(item)) ||
				coerce(item.is_free_item) ||
				coerce(item.same_item) ||
				Boolean(
					(typeof item.auto_free_source === "string" && item.auto_free_source) ||
						(typeof item.free_item_source === "string" && item.free_item_source),
				);

			if (expectsFree !== itemIsFree) {
				return false;
			}
		}

		if (auto_free_source) {
			const itemSource =
				typeof item.auto_free_source === "string" && item.auto_free_source
					? item.auto_free_source
					: typeof item.free_item_source === "string" && item.free_item_source
						? item.free_item_source
						: null;
			if (itemSource && itemSource !== auto_free_source) {
				return false;
			}
		}

		if (parent_row_id) {
			const itemParent = item.parent_row_id || null;
			if (itemParent && itemParent !== parent_row_id) {
				return false;
			}
		}

		if (source_rule) {
			const rawRule = Array.isArray(item.pricing_rules)
				? item.pricing_rules.find((rule) => !!rule)
				: item.pricing_rules;
			const itemRule = rawRule || item.source_rule || item.pricing_rule || null;
			if (itemRule && itemRule !== source_rule) {
				return false;
			}
		}

		if (item_code && item.item_code === item_code) {
			if (idx !== null && idx !== undefined) {
				const itemIdx = item.idx !== undefined && item.idx !== null ? Number(item.idx) : null;
				if (itemIdx !== null && itemIdx === idx) {
					return true;
				}
			}

			const batchMatch = (batch_no || null) === (item.batch_no || null);
			const serialMatch = (serial_no || null) === (item.serial_no || null);

			if (batchMatch && serialMatch) {
				return true;
			}
		}

		return false;
	},

	_assignManualOverrideValues(item, values = {}) {
		if (!item || !values) {
			return;
		}

		item._manual_rate_set = true;
		item._manual_rate_set_from_uom = false;

		if (values.uom) {
			item.uom = values.uom;
		}
		if (values.conversion_factor !== undefined && values.conversion_factor !== null) {
			item.conversion_factor = values.conversion_factor;
		}

		if (values.price_list_rate !== undefined) {
			item.price_list_rate = values.price_list_rate;
		}
		if (values.base_price_list_rate !== undefined) {
			item.base_price_list_rate = values.base_price_list_rate;
		}
		if (values.rate !== undefined) {
			item.rate = values.rate;
		}
		if (values.base_rate !== undefined) {
			item.base_rate = values.base_rate;
		}
		if (values.discount_amount !== undefined) {
			item.discount_amount = values.discount_amount;
		}
		if (values.base_discount_amount !== undefined) {
			item.base_discount_amount = values.base_discount_amount;
		}
		if (values.discount_percentage !== undefined) {
			item.discount_percentage = values.discount_percentage;
		}

		if (values.amount !== undefined) {
			item.amount = values.amount;
		} else if (typeof item.qty === "number" && typeof item.rate === "number") {
			item.amount = this.flt(item.qty * item.rate, this.currency_precision);
		}

		if (values.base_amount !== undefined) {
			item.base_amount = values.base_amount;
		} else if (typeof item.qty === "number" && typeof item.base_rate === "number") {
			item.base_amount = this.flt(item.qty * item.base_rate, this.currency_precision);
		}
	},

	_applyManualRateOverridesToDoc(doc, overrides) {
		if (!doc || !Array.isArray(doc.items) || !Array.isArray(overrides) || !overrides.length) {
			return;
		}

		const remaining = [...overrides];

		doc.items.forEach((item) => {
			if (!item || !remaining.length) {
				return;
			}

			const index = remaining.findIndex((entry) => this._doesManualOverrideMatchItem(entry, item));
			if (index === -1) {
				return;
			}

			const override = remaining.splice(index, 1)[0];
			this._assignManualOverrideValues(item, override.values);
		});
	},

	_buildManualOverrideKeyFromItem(item) {
		if (!item) {
			return null;
		}

		const idx =
			item.idx !== undefined && item.idx !== null && !Number.isNaN(Number(item.idx))
				? Number(item.idx)
				: null;

		if (!item.name && !item.posa_row_id && !item.item_code) {
			return null;
		}

		return {
			name: item.name || null,
			posa_row_id: item.posa_row_id || null,
			item_code: item.item_code || null,
			idx,
			batch_no: item.batch_no || null,
			serial_no: item.serial_no || null,
		};
	},

	_snapshotManualValuesFromDocItems(items) {
		if (!Array.isArray(items) || !items.length) {
			return [];
		}

		const EPSILON = 0.000001;

		return items
			.map((item) => {
				const keys = this._buildManualOverrideKeyFromItem(item);
				if (!keys) {
					return null;
				}

				const rate = Number(item?.rate ?? 0);
				const priceListRate = Number(item?.price_list_rate ?? rate);
				const baseRate = Number(item?.base_rate ?? 0);
				const basePriceListRate = Number(item?.base_price_list_rate ?? baseRate);
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
	},

	_restoreManualSnapshots(items, snapshots) {
		if (!Array.isArray(items) || !Array.isArray(snapshots) || !snapshots.length) {
			return;
		}

		const remaining = [...snapshots];

		items.forEach((item) => {
			if (!item || !remaining.length) {
				return;
			}

			const index = remaining.findIndex((snapshot) =>
				this._doesManualOverrideMatchItem({ keys: snapshot.keys }, item),
			);

			if (index === -1) {
				return;
			}

			const snapshot = remaining.splice(index, 1)[0];
			const values = snapshot.values || {};

			if (snapshot.preserveRate) {
				this._assignManualOverrideValues(item, values);
			} else if (snapshot.preserveUom) {
				if (values.uom !== undefined) {
					item.uom = values.uom;
				}
				if (values.conversion_factor !== undefined && values.conversion_factor !== null) {
					item.conversion_factor = values.conversion_factor;
				}

				if (values.amount !== undefined) {
					item.amount = values.amount;
				} else if (typeof item.qty === "number" && typeof item.rate === "number") {
					item.amount = this.flt(item.qty * item.rate, this.currency_precision);
				}

				if (values.base_amount !== undefined) {
					item.base_amount = values.base_amount;
				} else if (typeof item.qty === "number" && typeof item.base_rate === "number") {
					item.base_amount = this.flt(item.qty * item.base_rate, this.currency_precision);
				}
			}
		});
	},

	// Show payment dialog after validation and processing
	async show_payment() {
		if (this._suppressClosePaymentsTimer) {
			clearTimeout(this._suppressClosePaymentsTimer);
			this._suppressClosePaymentsTimer = null;
		}
		this._suppressClosePayments = true;

		try {
			console.log("Starting show_payment process");
			console.log("Invoice state before payment:", {
				invoiceType: this.invoiceType,
				is_return: this.invoice_doc ? this.invoice_doc.is_return : false,
				items_count: this.items.length,
				customer: this.customer,
			});

			if (!this.customer) {
				console.log("Customer validation failed");
				this.eventBus.emit("show_message", {
					title: __(`Select a customer`),
					color: "error",
				});
				return;
			}

			if (!this.items.length) {
				console.log("Items validation failed - no items");
				this.eventBus.emit("show_message", {
					title: __(`Select items to sell`),
					color: "error",
				});
				return;
			}

			console.log("Basic validations passed, proceeding to main validation");
			const isValid = this.validate();
			console.log("Main validation result:", isValid);

			if (!isValid) {
				console.log("Main validation failed");
				return;
			}

			let invoice_doc;
			if (
				this.invoiceType === "Order" &&
				this.pos_profile.posa_create_only_sales_order &&
				!this.new_delivery_date &&
				!(this.invoice_doc && this.invoice_doc.posa_delivery_date)
			) {
				console.log("Building local Sales Order doc for payment");
				invoice_doc = this.get_invoice_doc();
			} else if (
				this.invoice_doc &&
				this.invoice_doc.doctype === "Sales Order" &&
				this.invoiceType === "Invoice"
			) {
				console.log("Processing Sales Order payment");
				invoice_doc = await this.process_invoice_from_order();
			} else {
				console.log("Processing regular invoice");
				invoice_doc = await this.process_invoice();
			}

			if (!invoice_doc) {
				console.log("Failed to process invoice");
				return;
			}

			// Reload current invoice from backend (no selection dialog) to ensure items/totals are up-to-date
			if (!isOffline() && invoice_doc.name) {
				console.log("Reloading current invoice from backend");
				const refreshed = await this.reload_current_invoice_from_backend();
				if (refreshed) {
					invoice_doc = refreshed;
					console.log("Refreshed invoice:", invoice_doc);
				} else {
					console.log("Failed to refresh invoice");
				}
			}

			// Update invoice_doc with current currency info
			invoice_doc.currency = this.selected_currency || this.pos_profile.currency;
			invoice_doc.conversion_rate = this.conversion_rate || 1;
			invoice_doc.plc_conversion_rate = this.exchange_rate || 1;

			// Sync additional discount values back to the UI so totals remain accurate
			// in the summary panel even after the invoice is refreshed from the server.
			if (invoice_doc.discount_amount !== undefined && invoice_doc.discount_amount !== null) {
				this.discount_amount = this.flt(invoice_doc.discount_amount, this.currency_precision);
				this.additional_discount = this.discount_amount;
			}

			if (
				invoice_doc.additional_discount_percentage !== undefined &&
				invoice_doc.additional_discount_percentage !== null
			) {
				this.additional_discount_percentage = this.flt(
					invoice_doc.additional_discount_percentage,
					this.float_precision,
				);
			}

			// Preserve totals calculated on the server to ensure taxes are included
			// The process_invoice method already updates the invoice with taxes and
			// totals via the backend. Overriding those values here caused the
			// payment dialog to display amounts without taxes applied. Simply use
			// the values returned from the server instead of recalculating them on
			// the client side.

			// Update totals on the client has been disabled. The original code is
			// kept below for reference and is intentionally commented out to avoid
			// overriding the server calculated values.
			// invoice_doc.total = this.Total;
			// invoice_doc.grand_total = this.subtotal;

			// if (this.pos_profile.disable_rounded_total) {
			//   invoice_doc.rounded_total = flt(this.subtotal, this.currency_precision);
			// } else {
			//   invoice_doc.rounded_total = this.roundAmount(this.subtotal);
			// }
			// invoice_doc.base_total = this.Total * (1 / this.exchange_rate || 1);
			// invoice_doc.base_grand_total = this.subtotal * (1 / this.exchange_rate || 1);
			// if (this.pos_profile.disable_rounded_total) {
			//   invoice_doc.base_rounded_total = flt(invoice_doc.base_grand_total, this.currency_precision);
			// } else {
			//   invoice_doc.base_rounded_total = this.roundAmount(invoice_doc.base_grand_total);
			// }

			// Check if this is a return invoice
			if (this.isReturnInvoice || invoice_doc.is_return) {
				console.log("Preparing RETURN invoice for payment with:", {
					is_return: invoice_doc.is_return,
					invoiceType: this.invoiceType,
					return_against: invoice_doc.return_against,
					items: invoice_doc.items.length,
					grand_total: invoice_doc.grand_total,
				});

				// For return invoices, explicitly ensure all amounts are negative
				invoice_doc.is_return = 1;
				if (invoice_doc.grand_total > 0) invoice_doc.grand_total = -Math.abs(invoice_doc.grand_total);
				if (invoice_doc.rounded_total > 0)
					invoice_doc.rounded_total = -Math.abs(invoice_doc.rounded_total);
				if (invoice_doc.total > 0) invoice_doc.total = -Math.abs(invoice_doc.total);
				if (invoice_doc.base_grand_total > 0)
					invoice_doc.base_grand_total = -Math.abs(invoice_doc.base_grand_total);
				if (invoice_doc.base_rounded_total > 0)
					invoice_doc.base_rounded_total = -Math.abs(invoice_doc.base_rounded_total);
				if (invoice_doc.base_total > 0) invoice_doc.base_total = -Math.abs(invoice_doc.base_total);

				// Ensure all items have negative quantity and amount
				if (invoice_doc.items && invoice_doc.items.length) {
					invoice_doc.items.forEach((item) => {
						if (item.qty > 0) item.qty = -Math.abs(item.qty);
						if (item.stock_qty > 0) item.stock_qty = -Math.abs(item.stock_qty);
						if (item.amount > 0) item.amount = -Math.abs(item.amount);
					});
				}
			}

			// Get payments with correct sign (positive/negative)
			invoice_doc.payments = this.get_payments();
			console.log("Final payment data:", invoice_doc.payments);

			// Double-check return invoice payments are negative
			if ((this.isReturnInvoice || invoice_doc.is_return) && invoice_doc.payments.length) {
				invoice_doc.payments.forEach((payment) => {
					if (payment.amount > 0) payment.amount = -Math.abs(payment.amount);
					if (payment.base_amount > 0) payment.base_amount = -Math.abs(payment.base_amount);
				});
				console.log("Ensured negative payment amounts for return:", invoice_doc.payments);
			}

			// Defer showing payment dialog until next DOM update cycle
			// This prevents a race condition where the dialog opens before
			// the invoice UI has finished re-rendering with updated totals
			await this.$nextTick();

			console.log("Showing payment dialog with currency:", invoice_doc.currency);
			if (typeof this.paymentVisible !== "undefined") {
				this.paymentVisible = true;
			}
			this.eventBus.emit("show_payment", "true");
			this.eventBus.emit("send_invoice_doc_payment", invoice_doc);
		} catch (error) {
			console.error("Error in show_payment:", error);
			this.eventBus.emit("show_message", {
				title: __("Error processing payment"),
				color: "error",
				message: error.message,
			});
		} finally {
			this._suppressClosePaymentsTimer = setTimeout(() => {
				this._suppressClosePayments = false;
				this._suppressClosePaymentsTimer = null;
			}, 300);
		}
	},

	// Validate invoice before payment/submit (return logic, quantity, rates, etc)
	async validate() {
		console.log("Starting return validation");

		// For all returns, check if amounts are negative
		if (this.isReturnInvoice) {
			console.log("Validating return invoice values");

			// Check if quantities are negative
			const positiveItems = this.items.filter((item) => item.qty >= 0 || item.stock_qty >= 0);
			if (positiveItems.length > 0) {
				console.log(
					"Found positive quantities in return items:",
					positiveItems.map((i) => i.item_code),
				);
				this.eventBus.emit("show_message", {
					title: __(`Return items must have negative quantities`),
					color: "error",
				});

				// Fix the quantities to be negative
				positiveItems.forEach((item) => {
					item.qty = -Math.abs(item.qty);
					item.stock_qty = -Math.abs(item.stock_qty);
				});

				// Force update to reflect changes
				this.$forceUpdate();
			}

			// Ensure total amount is negative
			if (this.subtotal > 0) {
				console.log("Return has positive subtotal:", this.subtotal);
				this.eventBus.emit("show_message", {
					title: __(`Return total must be negative`),
					color: "warning",
				});
			}
		}

		// For return with reference to existing invoice
		const currentInvoice = this.invoice_doc;
		if (currentInvoice && currentInvoice.is_return && currentInvoice.return_against) {
			console.log("Return doc:", this.invoice_doc);
			console.log("Current items:", this.items);

			try {
				// Get original invoice items for comparison
				const original_items = await new Promise((resolve, reject) => {
					frappe.call({
						method: "frappe.client.get",
						args: {
							doctype: this.pos_profile.create_pos_invoice_instead_of_sales_invoice
								? "POS Invoice"
								: "Sales Invoice",
							name: currentInvoice.return_against,
						},
						callback: (r) => {
							if (r.message) {
								console.log("Original invoice data:", r.message);
								resolve(r.message.items || []);
							} else {
								reject(new Error("Original invoice not found"));
							}
						},
					});
				});

				console.log("Original invoice items:", original_items);
				console.log(
					"Original item codes:",
					original_items.map((item) => ({
						item_code: item.item_code,
						qty: item.qty,
						rate: item.rate,
					})),
				);

				// Validate each return item
				for (const item of this.items) {
					console.log("Validating return item:", {
						item_code: item.item_code,
						rate: item.rate,
						qty: item.qty,
					});

					// Normalize item codes by trimming and converting to uppercase
					const normalized_return_item_code = item.item_code.trim().toUpperCase();

					// Find matching item in original invoice
					const original_item = original_items.find(
						(orig) => orig.item_code.trim().toUpperCase() === normalized_return_item_code,
					);

					if (!original_item) {
						console.log("Item not found in original invoice:", {
							return_item_code: normalized_return_item_code,
							original_items: original_items.map((i) => i.item_code.trim().toUpperCase()),
						});

						this.eventBus.emit("show_message", {
							title: __(`Item ${item.item_code} not found in original invoice`),
							color: "error",
						});
						return false;
					}

					// Compare rates with precision
					const rate_diff = Math.abs(original_item.rate - item.rate);
					console.log("Rate comparison:", {
						return_rate: item.rate,
						orig_rate: original_item.rate,
						difference: rate_diff,
					});

					if (rate_diff > 0.01) {
						this.eventBus.emit("show_message", {
							title: __(`Rate mismatch for item ${item.item_code}`),
							color: "error",
						});
						return false;
					}

					// Compare quantities
					const return_qty = Math.abs(item.qty);
					const orig_qty = original_item.qty;
					console.log("Quantity comparison:", {
						return_qty: return_qty,
						orig_qty: orig_qty,
					});

					if (return_qty > orig_qty) {
						this.eventBus.emit("show_message", {
							title: __(
								`Return quantity cannot be greater than original quantity for item ${item.item_code}`,
							),
							color: "error",
						});
						return false;
					}
				}
			} catch (error) {
				console.error("Error in validation:", error);
				this.eventBus.emit("show_message", {
					title: __(`Error validating return: ${error.message}`),
					color: "error",
				});
				return false;
			}
		}
		return true;
	},

	// Get draft invoices from backend
	async get_draft_invoices() {
		try {
			const { message } = await frappe.call({
				method: "posawesome.posawesome.api.invoices.get_draft_invoices",
				args: {
					pos_opening_shift: this.pos_opening_shift.name,
					doctype: this.pos_profile.create_pos_invoice_instead_of_sales_invoice
						? "POS Invoice"
						: "Sales Invoice",
				},
			});
			if (message) {
				this.eventBus.emit("open_drafts", message);
			}
		} catch (error) {
			console.error("Error fetching draft invoices:", error);
			this.eventBus.emit("show_message", {
				title: __("Unable to fetch draft invoices"),
				color: "error",
			});
		}
	},

	// Get draft orders from backend
	async get_draft_orders() {
		try {
			const { message } = await frappe.call({
				method: "posawesome.posawesome.api.sales_orders.search_orders",
				args: {
					company: this.pos_profile.company,
					currency: this.pos_profile.currency,
				},
			});
			if (message) {
				this.eventBus.emit("open_orders", message);
			}
		} catch (error) {
			console.error("Error fetching draft orders:", error);
			this.eventBus.emit("show_message", {
				title: __("Unable to fetch draft orders"),
				color: "error",
			});
		}
	},

	// Open returns dialog
	open_returns() {
		this.eventBus.emit("open_returns", this.pos_profile.company);
	},

	// Close payment dialog
	close_payments() {
		if (this._suppressClosePayments) {
			return;
		}

		if (typeof this.paymentVisible !== "undefined" && !this.paymentVisible) {
			return;
		}

		if (typeof this.paymentVisible !== "undefined") {
			this.paymentVisible = false;
		}

		this.eventBus.emit("show_payment", "false");
	},

	// Update details for all items (fetch from backend)
	async update_items_details(items) {
		if (!items?.length) return;
		if (!this.pos_profile) return;

		try {
			const response = await frappe.call({
				method: "posawesome.posawesome.api.items.get_items_details",
				args: {
					pos_profile: JSON.stringify(this.pos_profile),
					items_data: JSON.stringify(items),
					price_list: this.selected_price_list || this.pos_profile.selling_price_list,
				},
			});

			if (response?.message) {
				const detailMap = new Map();
				response.message.forEach((detail) => {
					if (!detail) {
						return;
					}
					const key = detail.posa_row_id || detail.item_code;
					if (key) {
						detailMap.set(key, detail);
					}
				});

				items.forEach((item) => {
					if (!item) {
						return;
					}

					const key = item.posa_row_id || item.item_code;
					const updated_item = key ? detailMap.get(key) : null;
					if (!updated_item) {
						return;
					}

					item.actual_qty = updated_item.actual_qty;
					item.item_uoms = updated_item.item_uoms;
					item.has_batch_no = updated_item.has_batch_no;
					item.has_serial_no = updated_item.has_serial_no;
					item.allow_negative_stock = updated_item.allow_negative_stock;
					item.batch_no_data = updated_item.batch_no_data;
					item.serial_no_data = updated_item.serial_no_data;

					if (updated_item.price_list_currency) {
						item.price_list_currency = updated_item.price_list_currency;
					}

					if (updated_item.rate !== undefined || updated_item.price_list_rate !== undefined) {
						const force = this.pos_profile?.posa_force_price_from_customer_price_list !== false;
						const price = updated_item.price_list_rate ?? updated_item.rate ?? 0;
						const priceCurrency =
							updated_item.currency ||
							updated_item.price_list_currency ||
							item.price_list_currency ||
							this.selected_currency;
						const manualLocked =
							item._manual_rate_set === true && item._manual_rate_set_from_uom !== true;
						const shouldOverrideRate =
							!item.locked_price && !item.posa_offer_applied && !manualLocked;

						if (shouldOverrideRate) {
							if (force || price) {
								this._applyPriceListRate(item, price, priceCurrency);
							}
						} else if (!item.price_list_rate && (force || price)) {
							const converted = this._computePriceConversion(price, priceCurrency);
							if (converted.base_price_list_rate !== undefined) {
								item.base_price_list_rate = converted.base_price_list_rate;
							}
							item.price_list_rate = converted.price_list_rate;
						}
					}

					const resolvedCurrency = this.selected_currency || updated_item.currency;
					if (resolvedCurrency) {
						item.currency = resolvedCurrency;
					}
				});
			}
		} catch (error) {
			console.error("Error updating items:", error);
			this.eventBus.emit("show_message", {
				title: __("Error updating item details"),
				color: "error",
			});
		}
	},

	// Update details for a single item (fetch from backend)
	async update_item_detail(item, force_update = false) {
		return this.queueItemTask(
			item,
			"update_item_detail",
			() => this._performItemDetailUpdate(item, force_update),
			{ force: force_update },
		);
	},

	async _performItemDetailUpdate(item, force_update = false) {
		console.log("update_item_detail request", {
			code: item ? item.item_code : undefined,
			force_update,
		});
		if (!item || !item.item_code) {
			return;
		}

		if (item._manual_rate_set && !force_update) {
			return;
		}

		if (force_update) {
			item._detailSynced = false;
		}

		if (!force_update && item._detailSynced) {
			return;
		}

		const cacheKey = this._getItemDetailCacheKey(item);
		if (!force_update) {
			const cachedPayload = this._getCachedItemDetail(cacheKey);
			if (cachedPayload) {
				this._applyItemDetailPayload(item, cachedPayload, {
					forceUpdate: force_update,
					fromCache: true,
				});
				item._detailSynced = true;
				return;
			}
		}

		if (item._detailInFlight) {
			return;
		}

		item._detailInFlight = true;

		try {
			const currentDoc = this.get_invoice_doc();
			const response = await frappe.call({
				method: "posawesome.posawesome.api.items.get_item_detail",
				args: {
					warehouse: item.warehouse || this.pos_profile.warehouse,
					doc: currentDoc,
					price_list: this.selected_price_list || this.pos_profile.selling_price_list,
					item: {
						item_code: item.item_code,
						customer: this.customer,
						doctype: currentDoc.doctype,
						name: currentDoc.name || `New ${currentDoc.doctype} 1`,
						company: this.pos_profile.company,
						conversion_rate: 1,
						currency: this.pos_profile.currency,
						qty: item.qty,
						price_list_rate: item.base_price_list_rate ?? item.price_list_rate ?? 0,
						child_docname: `New ${currentDoc.doctype} Item 1`,
						cost_center: this.pos_profile.cost_center,
						pos_profile: this.pos_profile.name,
						uom: item.uom,
						tax_category: "",
						transaction_type: "selling",
						update_stock: this.pos_profile.update_stock,
						price_list: this.get_price_list(),
						has_batch_no: item.has_batch_no,
						has_serial_no: item.has_serial_no,
						serial_no: item.serial_no,
						batch_no: item.batch_no,
						is_stock_item: item.is_stock_item,
					},
				},
			});

			const data = response?.message;
			if (!data) {
				return;
			}

			this._applyItemDetailPayload(item, data, { forceUpdate: force_update, fromCache: false });
			this._storeItemDetailCache(cacheKey, data);
			item._detailSynced = true;
			if (typeof this.$forceUpdate === "function") {
				this.$forceUpdate();
			}
		} catch (error) {
			console.error("Error updating item detail:", error);
			this.eventBus.emit("show_message", {
				title: __("Error updating item details"),
				color: "error",
			});
		} finally {
			item._detailInFlight = false;
		}
	},

	_applyItemDetailPayload(item, data, options = {}) {
		const { forceUpdate = false } = options;

		if (!item.warehouse) {
			item.warehouse = this.pos_profile.warehouse;
		}
		if (data.price_list_currency) {
			this.price_list_currency = data.price_list_currency;
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
			const existingIndex = item.item_uoms.findIndex((uom) => uom.uom === item.uom);
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
		item.locked_price = data.locked_price;
		item.description = data.description;
		item.item_tax_template = data.item_tax_template;
		item.discount_percentage = data.discount_percentage;
		item.warehouse = data.warehouse || item.warehouse;
		item.has_batch_no = data.has_batch_no;
		item.has_serial_no = data.has_serial_no;
		item.allow_negative_stock = data.allow_negative_stock;
		item.serial_no = data.serial_no;
		item.batch_no = data.batch_no;
		item.is_stock_item = data.is_stock_item;
		item.is_fixed_asset = data.is_fixed_asset;
		item.allow_alternative_item = data.allow_alternative_item;
		item.is_stock_item = data.is_stock_item;
		item.warehouse = data.warehouse || item.warehouse;

		item.actual_qty = data.actual_qty;
		item.available_qty = data.actual_qty;

		const hasCode = item && item.item_code !== undefined && item.item_code !== null;
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
			stockCoordinator.applyAvailabilityToItem(item, { updateBaseAvailable: false });
		}

		if (this.update_qty_limits) {
			this.update_qty_limits(item);
		}

		if (data.barcode) {
			item.barcode = data.barcode;
		}
		if (data.brand) {
			item.brand = data.brand;
		}
		if (data.batch_no) {
			item.batch_no = data.batch_no;
		}
		if (data.serial_no_data) {
			item.serial_no_data = data.serial_no_data;
		}
		if (data.batch_no_data) {
			item.batch_no_data = data.batch_no_data;
		}
		if (
			item.has_batch_no &&
			this.pos_profile.posa_auto_set_batch &&
			!item.batch_no &&
			Array.isArray(data.batch_no_data) &&
			data.batch_no_data.length > 0
		) {
			item.batch_no_data = data.batch_no_data;
			this.set_batch_qty(item, null, false);
		}

		if (!item.locked_price) {
			if (forceUpdate || !item.base_rate) {
				if (data.price_list_rate !== 0 || !item.base_price_list_rate) {
					item.base_price_list_rate = data.price_list_rate;
					if (!item.posa_offer_applied) {
						item.base_rate = data.price_list_rate;
					}
				}
			}

			if (!item.posa_offer_applied) {
				const companyCurrency = this.pos_profile.currency;
				const baseCurrency = companyCurrency;

				if (
					this.selected_currency === this.price_list_currency &&
					this.selected_currency !== companyCurrency
				) {
					const conv = this.conversion_rate || 1;
					item.price_list_rate = this.flt(
						item.base_price_list_rate / conv,
						this.currency_precision,
					);

					if (!item._manual_rate_set) {
						item.rate = this.flt(item.base_rate / conv, this.currency_precision);
					}
				} else if (this.selected_currency !== baseCurrency) {
					const exchange_rate = this.exchange_rate || 1;
					item.price_list_rate = this.flt(
						item.base_price_list_rate * exchange_rate,
						this.currency_precision,
					);

					item.rate = this.flt(item.base_rate * exchange_rate, this.currency_precision);
				} else {
					item.price_list_rate = item.base_price_list_rate;

					if (!item._manual_rate_set) {
						item.rate = item.base_rate;
					}
				}
			} else {
				const baseCurrency = this.price_list_currency || this.pos_profile.currency;
				if (this.selected_currency !== baseCurrency) {
					item.price_list_rate = this.flt(
						item.base_rate * this.exchange_rate,
						this.currency_precision,
					);
				} else {
					item.price_list_rate = item.base_rate;
				}
			}

			const serverDiscountPercentage = Number.parseFloat(data.discount_percentage);
			const hasServerPercentage =
				Number.isFinite(serverDiscountPercentage) && serverDiscountPercentage !== 0;
			if (hasServerPercentage && !item.posa_offer_applied && !item._manual_rate_set) {
				const existingDiscount = Number(item.discount_amount) || 0;
				const EPSILON = 0.000001;
				if (Math.abs(existingDiscount) < EPSILON) {
					const resolvedPercentage = this.flt(serverDiscountPercentage, this.float_precision);

					const priceListRateCandidate =
						item.price_list_rate ?? data.price_list_rate ?? item.rate ?? 0;
					const priceListRate = Number(priceListRateCandidate) || 0;

					const basePriceListRateCandidate =
						item.base_price_list_rate ?? data.price_list_rate ?? priceListRate;
					const basePriceListRate = Number(basePriceListRateCandidate) || 0;

					const hasRate =
						Math.abs(priceListRate) > EPSILON || Math.abs(basePriceListRate) > EPSILON;

					if (hasRate) {
						const discountAmount = this.flt(
							(priceListRate * resolvedPercentage) / 100,
							this.currency_precision,
						);
						const baseDiscountAmount = this.flt(
							(basePriceListRate * resolvedPercentage) / 100,
							this.currency_precision,
						);

						const newRate = Math.max(priceListRate - discountAmount, 0);
						const newBaseRate = Math.max(basePriceListRate - baseDiscountAmount, 0);

						item.discount_percentage = resolvedPercentage;
						item.discount_amount = discountAmount;
						item.base_discount_amount = baseDiscountAmount;
						item.rate = this.flt(newRate, this.currency_precision);
						item.base_rate = this.flt(newBaseRate, this.currency_precision);
					}
				}
			}

			if (
				!item.posa_offer_applied &&
				this.pos_profile.posa_apply_customer_discount &&
				this.customer_info.posa_discount > 0 &&
				this.customer_info.posa_discount <= 100 &&
				item.posa_is_offer == 0 &&
				!item.posa_is_replace
			) {
				const discount_percent =
					item.max_discount > 0
						? Math.min(item.max_discount, this.customer_info.posa_discount)
						: this.customer_info.posa_discount;

				item.discount_percentage = discount_percent;

				const discount_amount = this.flt(
					(item.price_list_rate * discount_percent) / 100,
					this.currency_precision,
				);
				item.discount_amount = discount_amount;

				item.base_discount_amount = this.flt(
					(item.base_price_list_rate * discount_percent) / 100,
					this.currency_precision,
				);

				item.rate = this.flt(item.price_list_rate - discount_amount, this.currency_precision);
				item.base_rate = this.flt(
					item.base_price_list_rate - item.base_discount_amount,
					this.currency_precision,
				);
			}
		}

		item.last_purchase_rate = data.last_purchase_rate;
		item.projected_qty = data.projected_qty;
		item.reserved_qty = data.reserved_qty;
		item.conversion_factor = data.conversion_factor;
		item.stock_qty = data.stock_qty;
		item.stock_uom = data.stock_uom;
		item.has_serial_no = data.has_serial_no;
		item.has_batch_no = data.has_batch_no;

		item.amount = this.flt(item.qty * item.rate, this.currency_precision);
		item.base_amount = this.flt(item.qty * item.base_rate, this.currency_precision);

		console.log(`Updated rates for ${item.item_code} on expand:`, {
			base_rate: item.base_rate,
			rate: item.rate,
			base_price_list_rate: item.base_price_list_rate,
			price_list_rate: item.price_list_rate,
			exchange_rate: this.exchange_rate,
			selected_currency: this.selected_currency,
			default_currency: this.pos_profile.currency,
		});
	},
	// Fetch customer details (info, price list, etc)
	async fetch_customer_details() {
		var vm = this;
		if (!this.customer) return;

		if (isOffline()) {
			try {
				const list = await getCustomerStorage();
				const cached = (list || []).find(
					(c) => c.name === vm.customer || c.customer_name === vm.customer,
				);
				if (cached) {
					vm.customer_info = { ...cached };
					vm.sync_invoice_customer_details(vm.customer_info);
					if (vm.pos_profile.posa_force_price_from_customer_price_list !== false) {
						const defaultPriceList = vm.pos_profile?.selling_price_list || null;
						const resolvedPriceList = cached.customer_price_list || defaultPriceList;
						vm.selected_price_list = resolvedPriceList;
						vm.eventBus.emit("update_customer_price_list", resolvedPriceList);
						vm.apply_cached_price_list(resolvedPriceList);
					}
					return;
				}
				const queued = (getOfflineCustomers() || [])
					.map((e) => e.args)
					.find((c) => c.customer_name === vm.customer);
				if (queued) {
					vm.customer_info = { ...queued, name: queued.customer_name };
					vm.sync_invoice_customer_details(vm.customer_info);
					if (vm.pos_profile.posa_force_price_from_customer_price_list !== false) {
						const defaultPriceList = vm.pos_profile?.selling_price_list || null;
						const resolvedPriceList = queued.customer_price_list || defaultPriceList;
						vm.selected_price_list = resolvedPriceList;
						vm.eventBus.emit("update_customer_price_list", resolvedPriceList);
						vm.apply_cached_price_list(resolvedPriceList);
					}
					return;
				}
			} catch (error) {
				console.error("Failed to fetch cached customer", error);
			}
		}

		try {
			const r = await frappe.call({
				method: "posawesome.posawesome.api.customers.get_customer_info",
				args: {
					customer: vm.customer,
					_timestamp: Date.now(),
				},
			});
			const message = r.message;
			if (!r.exc) {
				vm.customer_info = {
					...message,
				};
				vm.sync_invoice_customer_details(vm.customer_info);
			}
			// When force reload is enabled, automatically switch to the
			// customer's default price list so that item rates are fetched
			// correctly from the server.
			if (vm.pos_profile.posa_force_price_from_customer_price_list !== false) {
				const defaultPriceList = vm.pos_profile?.selling_price_list || null;
				const resolvedPriceList = message.customer_price_list || defaultPriceList;
				vm.selected_price_list = resolvedPriceList;
				vm.eventBus.emit("update_customer_price_list", resolvedPriceList);
				vm.apply_cached_price_list(resolvedPriceList);
			}
		} catch (error) {
			console.error("Failed to fetch customer details", error);
		}
	},

	// Get price list for current customer
	get_price_list() {
		// Use the currently selected price list if available,
		// otherwise fall back to the POS Profile selling price list
		return this.selected_price_list || this.pos_profile.selling_price_list;
	},

	// Update price list for customer
	update_price_list() {
		const price_list = this.pos_profile?.selling_price_list || null;
		const hasChanged = this.selected_price_list !== price_list;
		if (hasChanged) {
			this.selected_price_list = price_list;
		} else if (this.selected_price_list === undefined) {
			this.selected_price_list = price_list;
		}
		this.eventBus.emit("update_customer_price_list", price_list);
		this.schedulePricingRuleApplication(true);
	},

	sync_invoice_customer_details(details = null) {
		if (!this.invoice_doc || typeof this.invoice_doc !== "object") {
			return;
		}

		const existingDoc = this.invoice_doc || {};
		const customerDetails = details || this.customer_info || {};
		const resolvedCustomer = this.customer || customerDetails.customer || existingDoc.customer;
		const hasCustomerChanged =
			existingDoc.customer && resolvedCustomer && existingDoc.customer !== resolvedCustomer;

		const resolvedCustomerName =
			customerDetails.customer_name ?? customerDetails.customer ?? resolvedCustomer ?? null;

		const updatedDoc = {
			...existingDoc,
			customer: resolvedCustomer,
		};

		const fieldsToSync = [
			"customer_name",
			"customer_group",
			"customer_price_list",
			"territory",
			"customer_type",
			"tax_id",
			"primary_address",
			"primary_address_name",
			"customer_primary_address",
			"shipping_address_name",
			"customer_primary_contact",
			"mobile_no",
			"phone",
			"email_id",
			"contact_person",
			"contact_display",
			"contact_email",
			"contact_mobile",
			"contact_phone",
		];

		fieldsToSync.forEach((field) => {
			if (customerDetails[field] !== undefined && customerDetails[field] !== null) {
				updatedDoc[field] = customerDetails[field];
			}
		});

		if (!updatedDoc.customer_name && resolvedCustomerName) {
			updatedDoc.customer_name = resolvedCustomerName;
		}

		const currentDoctype = updatedDoc.doctype || existingDoc.doctype || null;
		if (currentDoctype === "Quotation") {
			updatedDoc.quotation_to = updatedDoc.quotation_to || "Customer";
			if (resolvedCustomer) {
				updatedDoc.party_name = resolvedCustomer;
			} else if (hasCustomerChanged) {
				updatedDoc.party_name = null;
			}
		}

		const addressFields = {
			customer_address:
				customerDetails.customer_address ?? customerDetails.primary_address_name ?? null,
			customer_address_display:
				customerDetails.customer_address_display ?? customerDetails.primary_address ?? null,
			shipping_address: customerDetails.shipping_address ?? null,
			shipping_address_display:
				customerDetails.shipping_address_display ?? customerDetails.shipping_address ?? null,
		};

		Object.entries(addressFields).forEach(([field, value]) => {
			if (value !== undefined && value !== null) {
				updatedDoc[field] = value;
			} else if (hasCustomerChanged) {
				updatedDoc[field] = null;
			}
		});

		if (resolvedCustomerName) {
			const previousTitle = existingDoc.title ?? null;
			const titleMatchesPreviousCustomer =
				previousTitle &&
				(previousTitle === existingDoc.customer || previousTitle === existingDoc.customer_name);
			if (hasCustomerChanged || !previousTitle || titleMatchesPreviousCustomer) {
				updatedDoc.title = resolvedCustomerName;
			}
		} else if (hasCustomerChanged) {
			updatedDoc.title = resolvedCustomer || "";
		}

		if (hasCustomerChanged) {
			const alwaysResetOnChange = [
				"shipping_address_name",
				"contact_person",
				"contact_display",
				"contact_email",
				"contact_mobile",
				"contact_phone",
			];

			alwaysResetOnChange.forEach((field) => {
				if (customerDetails[field] === undefined) {
					updatedDoc[field] = null;
				}
			});
		}

		this.invoice_doc = updatedDoc;
	},

	_applyPriceListRate(item, newRate, priceCurrency) {
		if (!item) {
			return;
		}

		const rate = Number.isFinite(Number(newRate)) ? Number(newRate) : 0;
		const resolvedCurrency = priceCurrency || this.selected_currency;
		const manualOverride = item._manual_rate_set === true && item._manual_rate_set_from_uom !== true;
		const companyCurrency = this.pos_profile?.currency;

		if (!item.original_currency) {
			item.original_currency = resolvedCurrency;
		}
		if (item.original_rate === undefined || item.original_rate === null) {
			item.original_rate = rate;
		}

		if (resolvedCurrency === this.selected_currency) {
			if (resolvedCurrency !== companyCurrency) {
				const conv = this.conversion_rate || 1;
				item.base_price_list_rate = rate * conv;
				if (!manualOverride) {
					item.base_rate = rate * conv;
				}
			} else {
				item.base_price_list_rate = rate;
				if (!manualOverride) {
					item.base_rate = rate;
				}
			}
			item.price_list_rate = rate;
			if (!manualOverride) {
				item.rate = rate;
			}
		} else {
			if (rate !== 0 || !item.base_price_list_rate) {
				item.base_price_list_rate = rate;
				if (!manualOverride) {
					item.base_rate = rate;
				}
			}

			if (this.selected_currency !== companyCurrency) {
				const conv = this.exchange_rate || 1;
				const converted = this.flt(rate * conv, this.currency_precision);
				if (rate !== 0 || !item.price_list_rate) {
					item.price_list_rate = converted;
				}
				if (!manualOverride && (rate !== 0 || !item.rate)) {
					item.rate = converted;
				}
			} else {
				if (rate !== 0 || !item.price_list_rate) {
					item.price_list_rate = rate;
				}
				if (!manualOverride && (rate !== 0 || !item.rate)) {
					item.rate = rate;
				}
			}
		}

		if (typeof item.qty === "number" && typeof item.rate === "number") {
			item.amount = this.flt(item.qty * item.rate, this.currency_precision);
		}
		if (typeof item.qty === "number" && typeof item.base_rate === "number") {
			item.base_amount = this.flt(item.qty * item.base_rate, this.currency_precision);
		}
	},

	_computePriceConversion(rate, priceCurrency) {
		const numericRate = Number.isFinite(Number(rate)) ? Number(rate) : 0;
		const resolvedCurrency = priceCurrency || this.selected_currency;
		const companyCurrency = this.pos_profile?.currency;
		const selectedCurrency = this.selected_currency || companyCurrency;

		const result = {
			base_price_list_rate: this.flt(numericRate, this.currency_precision),
			price_list_rate: this.flt(numericRate, this.currency_precision),
		};

		if (!resolvedCurrency || resolvedCurrency === selectedCurrency) {
			if (resolvedCurrency && companyCurrency && resolvedCurrency !== companyCurrency) {
				const conv = this.conversion_rate || 1;
				result.base_price_list_rate = this.flt(numericRate * conv, this.currency_precision);
			}
			return result;
		}

		result.base_price_list_rate = this.flt(numericRate, this.currency_precision);

		if (selectedCurrency && companyCurrency && selectedCurrency !== companyCurrency) {
			const exchange = this.exchange_rate || 1;
			result.price_list_rate = this.flt(numericRate * exchange, this.currency_precision);
		}

		return result;
	},

	// Apply cached price list rates to existing invoice items
	async apply_cached_price_list(price_list) {
		const targetPriceList = price_list || this.pos_profile?.selling_price_list;
		const cached = targetPriceList ? await getCachedPriceListItems(targetPriceList) : null;

		const fallbackItems = [];

		if (Array.isArray(this.items)) {
			if (Array.isArray(cached) && cached.length) {
				const priceMap = new Map();
				cached.forEach((row) => {
					if (row && row.item_code) {
						priceMap.set(row.item_code, row);
					}
				});

				this.items.forEach((item) => {
					if (!item || !item.item_code) {
						return;
					}
					const row = priceMap.get(item.item_code);
					if (row) {
						const rate = row.rate ?? row.price_list_rate ?? 0;
						const currency = row.currency || this.selected_currency;
						this._applyPriceListRate(item, rate, currency);
					} else {
						fallbackItems.push(item);
					}
				});
			} else {
				fallbackItems.push(...this.items);
			}
		}

		if (fallbackItems.length && !isOffline() && targetPriceList) {
			try {
				const response = await frappe.call({
					method: "posawesome.posawesome.api.items.get_items_details",
					args: {
						pos_profile: JSON.stringify(this.pos_profile),
						items_data: JSON.stringify(fallbackItems),
						price_list: targetPriceList,
					},
				});

				const details = response?.message;
				if (Array.isArray(details) && details.length) {
					const detailMap = new Map();
					details.forEach((detail) => {
						if (!detail) {
							return;
						}
						const key = detail.posa_row_id || detail.item_code;
						if (key) {
							detailMap.set(key, detail);
						}
					});

					fallbackItems.forEach((item) => {
						if (!item) {
							return;
						}
						const key = item.posa_row_id || item.item_code;
						const detail = detailMap.get(key);
						if (!detail) {
							return;
						}
						const rate = detail.price_list_rate ?? detail.rate ?? 0;
						const currency =
							detail.currency || detail.price_list_currency || this.selected_currency;
						this._applyPriceListRate(item, rate, currency);
					});
				}
			} catch (error) {
				console.error("Failed to refresh price list rates for invoice items", error);
			}
		}

		if (typeof this.$forceUpdate === "function") {
			this.$forceUpdate();
		}
	},
	// Update additional discount amount based on percentage
	update_discount_umount() {
		return updateDiscountAmount(this);
	},

	// Calculate prices and discounts for an item based on field change
	calc_prices(item, value, $event) {
		const outcome = calcPrices(item, value, $event, this);
		this.schedulePricingRuleApplication();
		return outcome;
	},

	// Calculate item price and discount fields
	calc_item_price(item) {
		const outcome = calcItemPrice(item, this);
		this.schedulePricingRuleApplication();
		return outcome;
	},

	// Update UOM (unit of measure) for an item and recalculate prices
	calc_uom(item, value) {
		if (!item) {
			return;
		}
		return this.queueItemTask(item, "calc_uom", () => calcUom(item, value, this));
	},

	// Calculate stock quantity for an item (simplified - validation handled centrally)
	calc_stock_qty(item, value) {
		calcStockQty(item, value, this);
		if (this.update_qty_limits) {
			this.update_qty_limits(item);
		}

		const blockSale = Boolean(
			this.pos_profile?.posa_block_sale_beyond_available_qty || this.blockSaleBeyondAvailableQty,
		);
		const allowNegativeStock =
			!blockSale &&
			(parseBooleanSetting(this.stock_settings?.allow_negative_stock) ||
				parseBooleanSetting(item?.allow_negative_stock));
		let clamped = false;
		if (blockSale && !allowNegativeStock && item.max_qty !== undefined && flt(item.qty) > item.max_qty) {
			this.eventBus.emit("show_message", {
				title: __("Quantity exceeds available stock"),
				text: __("The quantity for {0} has been adjusted to the maximum available stock.", [
					item.item_name,
				]),
				color: "warning",
			});
			item.qty = item.max_qty;
			clamped = true;
		}

		if (flt(item.qty) === 0) {
			this.remove_item(item);
			this.$forceUpdate();
			return;
		}

		if (clamped) {
			this.calc_item_price(item);
		} else if (!this._applyingPricingRules) {
			this.schedulePricingRuleApplication();
		}
	},

	// Update quantity limits based on available stock (simplified - validation handled centrally)
	update_qty_limits(item) {
		if (item && item.is_stock_item === 0) {
			item.max_qty = undefined;
			item.disable_increment = false;
			return;
		}

		if (item && item._base_actual_qty !== undefined) {
			item.max_qty = flt(item._base_actual_qty / (item.conversion_factor || 1));

			// Set increment disable flag based on stock limits
			const blockSale = Boolean(
				this.pos_profile?.posa_block_sale_beyond_available_qty || this.blockSaleBeyondAvailableQty,
			);
			const allowNegativeStock =
				!blockSale &&
				(parseBooleanSetting(this.stock_settings?.allow_negative_stock) ||
					parseBooleanSetting(item?.allow_negative_stock));

			if (allowNegativeStock) {
				item.disable_increment = false;
			} else if (blockSale) {
				item.disable_increment = item.qty >= item.max_qty;
			} else {
				item.disable_increment =
					!parseBooleanSetting(this.stock_settings?.allow_negative_stock) &&
					item.qty >= item.max_qty;
			}
		}
	},

	// Fetch available stock for an item and cache it
	async fetch_available_qty(item) {
		if (!item || !item.item_code || !item.warehouse || item.is_stock_item === 0) return;

		const key = this._getStockCacheKey(item);
		const cachedQty = this._getCachedStockQty(key);
		if (cachedQty !== null && cachedQty !== undefined) {
			item.available_qty = cachedQty;
			this.update_qty_limits(item);
			return cachedQty;
		}

		const runner = async () => {
			try {
				const response = await frappe.call({
					method: "posawesome.posawesome.api.items.get_available_qty",
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
					response.message && response.message.length ? flt(response.message[0].available_qty) : 0;
				this._storeStockQty(key, qty);
				if (this.available_stock_cache) {
					this.available_stock_cache[key] = { qty, ts: Date.now() };
				}
				item.available_qty = qty;
				this.update_qty_limits(item);
				return qty;
			} catch (error) {
				console.error("Failed to fetch available qty", error);
				throw error;
			}
		};

		return this.queueItemTask(item, "fetch_available_qty", runner);
	},

	// Set serial numbers for an item (and update qty)
	set_serial_no(item) {
		return setSerialNo(item, this);
	},

	// Set batch number for an item (and update batch data)
	set_batch_qty(item, value, update = true) {
		return setBatchQty(item, value, update, this);
	},

	schedulePricingRuleApplication: debounce(function (force = false) {
		this.applyPricingRulesForCart(force);
	}, 150),

	change_price_list_rate(item) {
		const vm = this;

		const d = new frappe.ui.Dialog({
			title: __("Change Price"),
			fields: [
				{
					fieldname: "new_rate",
					fieldtype: "Float",
					label: __("New Price List Rate"),
					default: item.price_list_rate ?? item.rate ?? 0,
					reqd: 1,
				},
			],
			primary_action_label: __("Update"),
			primary_action(values) {
				const rate = flt(values.new_rate);
				frappe.call({
					method: "posawesome.posawesome.api.items.update_price_list_rate",
					args: {
						item_code: item.item_code,
						price_list: vm.get_price_list(),
						rate: rate,
						uom: item.uom,
					},
					callback(r) {
						if (!r.exc) {
							item.price_list_rate = rate;
							item.base_price_list_rate = rate;
							if (!item._manual_rate_set) {
								item.rate = rate;
								item.base_rate = rate;
							}
							vm.calc_item_price(item);
							vm.eventBus.emit("show_message", {
								title: r.message || __("Item price updated"),
								color: "success",
							});
						}
					},
				});
				d.hide();
			},
		});

		d.get_field("new_rate").$input.on("keydown", function (e) {
			if (e.key === "Enter") {
				d.get_primary_btn().click();
			}
		});

		d.show();
	},
};
