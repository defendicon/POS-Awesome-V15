/**
 * Offline pricing-rule evaluation engine.
 *
 * Applies Frappe/ERPNext pricing rules to a single cart item without any network calls.
 * Used by `usePricingRulesStore` which holds a pre-loaded rule snapshot from IndexedDB.
 *
 * The primary entry point is {@link evaluatePricingRules}. Helper functions
 * ({@link collectCandidates}, {@link ruleSort}, {@link matchParty}, etc.) are exported
 * for unit testing but are not part of the public API contract — they may change.
 *
 * @module lib/pricingEngine
 */

const DEFAULT_PRECISION = 6;

type AnyRecord = Record<string, any>;

const parseOptionalFloat = (value: unknown): number | null => {
	const numeric = Number.parseFloat(String(value));
	return Number.isFinite(numeric) ? numeric : null;
};

/**
 * Rounds `value` to `precision` decimal places using symmetric (half-up) rounding.
 * Non-finite inputs return `0`.
 */
export const round = (
	value: unknown,
	precision = DEFAULT_PRECISION,
): number => {
	const numeric = Number.parseFloat(String(value ?? 0));
	if (!Number.isFinite(numeric)) {
		return 0;
	}
	const factor = 10 ** precision;
	return Math.round(numeric * factor) / factor;
};

/**
 * Returns `true` when `currentDate` falls within the `[start, end]` range.
 * A missing `start` or `end` is treated as unbounded. A missing or unparseable
 * `currentDate` returns `true` (permissive — the rule is not excluded on date grounds).
 */
export const inDateRange = (
	currentDate: string | Date | null | undefined,
	start: string | Date | null | undefined,
	end: string | Date | null | undefined,
): boolean => {
	if (!currentDate) {
		return true;
	}
	const now = new Date(currentDate);
	if (Number.isNaN(now.getTime())) {
		return true;
	}

	if (start) {
		const from = new Date(start);
		if (!Number.isNaN(from.getTime()) && now < from) {
			return false;
		}
	}

	if (end) {
		const to = new Date(end);
		if (!Number.isNaN(to.getTime()) && now > to) {
			return false;
		}
	}

	return true;
};

/**
 * Returns `true` when the pricing rule's customer/group/territory restrictions are
 * satisfied by the current invoice context.
 * A rule with no restrictions on a dimension always passes that dimension's check.
 */
export const matchParty = (
	rule: AnyRecord,
	customer: string | null | undefined,
	customerGroup: string | null | undefined,
	territory: string | null | undefined,
): boolean => {
	if (rule.customer && customer && rule.customer !== customer) {
		return false;
	}
	if (
		rule.customer_group &&
		customerGroup &&
		rule.customer_group !== customerGroup
	) {
		return false;
	}
	if (rule.territory && territory && rule.territory !== territory) {
		return false;
	}
	if (rule.customer && !customer) {
		return false;
	}
	if (rule.customer_group && !customerGroup) {
		return false;
	}
	if (rule.territory && !territory) {
		return false;
	}
	return true;
};

export const matchPriceListAndCurrency = (
	rule: AnyRecord,
	priceList: string | null | undefined,
	currency: string | null | undefined,
): boolean => {
	if (rule.price_list && priceList && rule.price_list !== priceList) {
		return false;
	}
	if (rule.currency && currency && rule.currency !== currency) {
		return false;
	}
	if (rule.price_list && !priceList) {
		return false;
	}
	if (rule.currency && !currency) {
		return false;
	}
	return true;
};

const pushUnique = (
	bucket: AnyRecord[],
	rule: AnyRecord | null | undefined,
	seen: Set<string>,
) => {
	if (!rule) {
		return;
	}
	const ruleKey = String(rule.name ?? "__missing_rule_name__");
	if (seen.has(ruleKey)) {
		return;
	}
	bucket.push(rule);
	seen.add(ruleKey);
};

/**
 * Collects all pricing-rule candidates applicable to `item` from the pre-built index.
 *
 * Candidates are de-duplicated by rule name. The order is: item-specific → group → brand → general.
 * Callers must then filter by date, party, currency, and quantity thresholds.
 *
 * @param item - The cart item to match against.
 * @param indexBundle - Pre-built lookup maps produced by `usePricingRulesStore`.
 */
export const collectCandidates = (
	item: AnyRecord = {},
	indexBundle: {
		byItem?: Map<string, AnyRecord[]>;
		byGroup?: Map<string, AnyRecord[]>;
		byBrand?: Map<string, AnyRecord[]>;
		general?: AnyRecord[];
	} = {},
): AnyRecord[] => {
	const { byItem, byGroup, byBrand, general } = indexBundle;
	const bucket: AnyRecord[] = [];
	const seen = new Set<string>();

	if (item.item_code && byItem instanceof Map && byItem.has(item.item_code)) {
		for (const rule of byItem.get(item.item_code) || []) {
			pushUnique(bucket, rule, seen);
		}
	}
	if (
		item.item_group &&
		byGroup instanceof Map &&
		byGroup.has(item.item_group)
	) {
		for (const rule of byGroup.get(item.item_group) || []) {
			pushUnique(bucket, rule, seen);
		}
	}
	if (item.brand && byBrand instanceof Map && byBrand.has(item.brand)) {
		for (const rule of byBrand.get(item.brand) || []) {
			pushUnique(bucket, rule, seen);
		}
	}
	if (Array.isArray(general)) {
		for (const rule of general) {
			pushUnique(bucket, rule, seen);
		}
	}

	return bucket;
};

const ruleBenefitScore = (rule: AnyRecord = {}): number => {
	const discount = Math.abs(rule.rate_or_discount || 0);
	const margin = Math.abs(rule.margin_rate_or_amount || 0);
	const freebies =
		Math.abs(rule.free_qty || 0) + Math.abs(rule.free_qty_per_unit || 0);
	return Math.max(discount, margin, freebies);
};

export const ruleSort = (a: AnyRecord, b: AnyRecord): number => {
	if ((b.specificity || 0) !== (a.specificity || 0)) {
		return (b.specificity || 0) - (a.specificity || 0);
	}
	if ((b.priority || 0) !== (a.priority || 0)) {
		return (b.priority || 0) - (a.priority || 0);
	}
	const benefitDelta = ruleBenefitScore(b) - ruleBenefitScore(a);
	if (benefitDelta !== 0) {
		return benefitDelta;
	}
	return String(a.name || "").localeCompare(String(b.name || ""));
};

const selectSlab = (rule: AnyRecord, qty: number): AnyRecord | null => {
	if (!Array.isArray(rule.slabs) || !rule.slabs.length) {
		return null;
	}
	let chosen: AnyRecord | null = null;
	for (const slab of rule.slabs) {
		const minQty = Number.parseFloat(slab.min_qty || 0);
		if (
			qty >= minQty &&
			(!chosen || minQty >= Number.parseFloat(chosen.min_qty || 0))
		) {
			chosen = slab;
		}
	}
	return chosen;
};

const applyMargin = (baseRate: number, rule: AnyRecord): number => {
	const marginType = rule.margin_type || rule.discount_type;
	const marginValue = Number.parseFloat(
		rule.margin_rate_or_amount || rule.rate_or_discount || 0,
	);

	if (!marginValue) {
		return baseRate;
	}

	if (marginType === "Amount") {
		return baseRate + marginValue;
	}
	if (marginType === "Percentage") {
		return baseRate * (1 + marginValue / 100);
	}
	return baseRate;
};

const resolveSlabValue = (rule: AnyRecord, slab: AnyRecord | null): number => {
	if (
		slab &&
		slab.rate_or_discount !== undefined &&
		slab.rate_or_discount !== null
	) {
		return Number.parseFloat(slab.rate_or_discount);
	}
	return Number.parseFloat(rule.rate_or_discount || 0);
};

const applyOneRule = (
	currentRate: number,
	rule: AnyRecord,
	qty: number,
	baseRate: number,
) => {
	const slab = selectSlab(rule, qty);
	const value = resolveSlabValue(rule, slab);

	let newRate = currentRate;
	let change = 0;

	const rawType = String(rule.rate_or_discount_type || "").toLowerCase();
	const priceMode = String(rule.price_or_discount || "").toLowerCase();
	const discountType = String(rule.discount_type || "").toLowerCase();

	const isAmount = rawType === "discount amount" || discountType === "amount";
	const isMargin = discountType === "margin" || !!rule.margin_type;
	const isPriceOverride =
		priceMode === "price" &&
		(rawType === "rate" ||
			rawType === "price" ||
			(!rawType && discountType === "rate"));

	let type =
		rule.discount_type ||
		rule.rate_or_discount_type ||
		rule.price_or_discount;

	if (rule.is_free_item_rule) {
		return { newRate: currentRate, discount: 0, detail: null };
	}

	if (isPriceOverride) {
		if (isAmount) {
			newRate = currentRate - value;
			type = "Amount";
		} else {
			newRate = value || currentRate;
			type = "Rate";
		}
	} else if (isMargin) {
		newRate = applyMargin(baseRate, rule);
		type = rule.margin_type || "Margin";
	} else if (isAmount) {
		newRate = currentRate - value;
		type = "Amount";
	} else {
		const percent = value;
		newRate = currentRate * (1 - percent / 100);
		type = "Rate";
	}

	if (!Number.isFinite(newRate)) {
		newRate = currentRate;
	}

	newRate = Math.max(0, newRate);
	change = currentRate - newRate;

	const detail = {
		name: rule.name,
		type,
		value,
		change,
	};

	return { newRate, discount: change, detail };
};

const isFreeRule = (rule: AnyRecord | null | undefined): boolean =>
	rule &&
	(rule.is_free_item_rule ||
		(rule.price_or_discount || "").toLowerCase() === "product");

const computeThresholdInfo = (rule: AnyRecord, qty: number) => {
	const minimum =
		Number.parseFloat(rule.min_qty || rule.recurse_for || 1) || 1;
	let multiplier = 0;

	if (rule.apply_per_threshold) {
		const divisor =
			Number.parseFloat(rule.recurse_for || rule.min_qty || 1) || 1;
		multiplier = Math.floor(qty / divisor);
	} else {
		multiplier = qty >= minimum ? 1 : 0;
	}

	return { minimum, multiplier };
};

const applyFreeItemRule = (
	rule: AnyRecord,
	item: AnyRecord,
	effectiveQty: number,
) => {
	const { minimum, multiplier } = computeThresholdInfo(rule, effectiveQty);
	let freeQty = 0;
	const thresholdQty = minimum;
	const freePerThreshold = rule.free_qty_per_unit
		? Number.parseFloat(rule.free_qty_per_unit || 0) || 0
		: Number.parseFloat(rule.free_qty || 0) || 0;

	if (rule.apply_per_threshold) {
		freeQty = multiplier * freePerThreshold;
	} else if (rule.free_qty_per_unit) {
		freeQty = effectiveQty * Number.parseFloat(rule.free_qty_per_unit || 0);
	} else {
		freeQty = Number.parseFloat(rule.free_qty || 0) || 0;
	}

	if (rule.max_free_qty !== null && rule.max_free_qty !== undefined) {
		freeQty = Math.min(freeQty, Number.parseFloat(rule.max_free_qty));
	}

	if (rule.round_free_qty) {
		freeQty = Math.floor(freeQty);
	}

	if (freeQty <= 0) {
		return null;
	}

	const sameItem = !!rule.same_item;
	const uom = sameItem ? item.stock_uom || item.uom : null;
	const conversionFactor = sameItem ? 1 : null;

	const rawBaseRate =
		parseOptionalFloat(rule.free_item_base_rate) ??
		parseOptionalFloat(rule.base_free_item_rate) ??
		parseOptionalFloat(rule.free_item_rate);
	const rawDisplayRate =
		parseOptionalFloat(rule.free_item_rate) ??
		parseOptionalFloat(rule.rate_for_free_item);

	const baseRate = rawBaseRate ?? rawDisplayRate ?? null;

	const rawBasePriceListRate =
		parseOptionalFloat(rule.free_item_base_price_list_rate) ??
		parseOptionalFloat(rule.free_item_price_list_rate) ??
		parseOptionalFloat(rule.base_for_price_list_rate);
	const rawDisplayPriceListRate =
		parseOptionalFloat(rule.free_item_price_list_rate) ??
		parseOptionalFloat(rule.for_price_list_rate);

	const basePriceListRate =
		rawBasePriceListRate ?? rawDisplayPriceListRate ?? baseRate;

	let baseDiscount =
		parseOptionalFloat(rule.free_item_base_discount_amount) ??
		parseOptionalFloat(rule.free_item_discount_amount);
	if (
		baseDiscount === null &&
		basePriceListRate !== null &&
		baseRate !== null
	) {
		baseDiscount = Math.max(basePriceListRate - baseRate, 0);
	}

	const discountPercentage =
		parseOptionalFloat(rule.free_item_discount_percentage) ??
		(basePriceListRate
			? Math.max(((baseDiscount ?? 0) / basePriceListRate) * 100, 0)
			: null);

	return {
		item_code: sameItem ? item.item_code : rule.free_item || item.item_code,
		qty: freeQty,
		stock_qty: freeQty,
		rule: rule.name,
		same_item: sameItem,
		min_qty: minimum,
		multiplier,
		apply_per_threshold:
			!!rule.apply_per_threshold ||
			!!rule.is_recursive ||
			!!rule.recurse_for,
		max_free_qty: rule.max_free_qty,
		threshold_qty: thresholdQty,
		free_qty_per_threshold: freePerThreshold,
		uom,
		conversion_factor: conversionFactor,
		...(baseRate !== null
			? { base_rate: baseRate, rate: rawDisplayRate ?? baseRate }
			: {}),
		...(basePriceListRate !== null
			? {
					base_price_list_rate: basePriceListRate,
					price_list_rate:
						rawDisplayPriceListRate ?? basePriceListRate,
				}
			: {}),
		...(baseDiscount !== null
			? {
					base_discount_amount: baseDiscount,
					discount_amount:
						parseOptionalFloat(rule.free_item_discount_amount) ??
						baseDiscount,
				}
			: {}),
		...(discountPercentage !== null
			? { discount_percentage: discountPercentage }
			: {}),
	};
};

/**
 * Evaluates all applicable pricing rules for a single cart item in one pass.
 *
 * Returns two independent results:
 * - `pricing` — the final rate and accumulated discount after applying non-free-item rules.
 * - `freebies` — zero or more free-item records to be added to the invoice by the caller.
 *
 * Rules are applied in priority order determined by {@link ruleSort}. A rule with
 * `stop_further_rules` halts pricing-rule processing; `apply_multiple_pricing_rules`
 * controls whether subsequent rules are also applied.
 *
 * Input fields (all part of the single destructured argument):
 * - `item` — cart item to evaluate; must have `item_code`, `item_group`, and `brand`.
 * - `qty` — line quantity (UOM-adjusted). Defaults to `item.qty`.
 * - `docQty` — document-level quantity used for threshold checks.
 * - `baseRate` — starting rate before discounts. Defaults to `item.base_price_list_rate`.
 * - `ctx` — evaluation context: date, customer, customer_group, territory, price_list, currency.
 * - `indexes` — pre-built rule index from `usePricingRulesStore.buildIndexes()`.
 */
export const evaluatePricingRules = ({
	item,
	qty,
	docQty,
	baseRate,
	ctx,
	indexes,
}: {
	item: AnyRecord;
	qty?: number | string;
	docQty?: number | string;
	baseRate?: number;
	ctx?: AnyRecord;
	indexes?: {
		byItem?: Map<string, AnyRecord[]>;
		byGroup?: Map<string, AnyRecord[]>;
		byBrand?: Map<string, AnyRecord[]>;
		general?: AnyRecord[];
	};
}): {
	pricing: {
		rate: number;
		discountPerUnit: number;
		applied: AnyRecord[];
	};
	freebies: AnyRecord[];
} => {
	const rawRuleQty = Number.parseFloat(String(qty ?? item?.qty ?? 0));
	const rawDocQty =
		docQty !== undefined
			? Number.parseFloat(String(docQty))
			: Number.parseFloat(String(item?.qty ?? rawRuleQty));
	const rawStockQty = Number.parseFloat(
		String(item?.stock_qty ?? item?.base_qty ?? item?.base_quantity ?? 0),
	);

	const absoluteQty = Math.max(
		0,
		Number.isFinite(rawRuleQty) ? rawRuleQty : 0,
	);
	const absoluteDocQty = Math.max(
		0,
		Number.isFinite(rawDocQty) ? rawDocQty : 0,
	);
	const absoluteStockQty = Math.max(
		0,
		Number.isFinite(rawStockQty) ? rawStockQty : 0,
	);
	const effectiveQty = Math.max(
		absoluteQty,
		absoluteDocQty,
		absoluteStockQty,
	);

	const effectiveBase =
		typeof baseRate === "number" && Number.isFinite(baseRate)
			? baseRate
			: Number.parseFloat(
					item?.base_price_list_rate ||
						item?.price_list_rate ||
						item?.rate ||
						0,
				);
	const startRate = Number.isFinite(effectiveBase) ? effectiveBase : 0;

	// Optimization: collect candidates once
	const candidates = collectCandidates(item, indexes);

	// Shared filters
	const validCandidates = candidates
		.filter((rule) =>
			inDateRange(ctx?.date, rule.valid_from, rule.valid_upto),
		)
		.filter((rule) =>
			matchParty(
				rule,
				ctx?.customer,
				ctx?.customer_group,
				ctx?.territory,
			),
		)
		.filter((rule) =>
			matchPriceListAndCurrency(rule, ctx?.price_list, ctx?.currency),
		);

	// Pricing logic
	const pricingRules = validCandidates
		.filter((rule) => !isFreeRule(rule))
		.filter((rule) => {
			const minimum = Number.parseFloat(rule.min_qty || 0);
			return effectiveQty >= minimum;
		})
		// Fix: Do not apply "Discount on Other Item" rules to the trigger item.
		// If same_item is false (0), the rule targets another item, so we shouldn't
		// apply the price discount to the current item (which matched the 'Apply On' criteria).
		// We use loose equality check (!!rule.same_item) because it could be 1, true, or "1".
		// The source rule data defaults same_item to 0 if unchecked.
		.filter((rule) => {
			// Fix: Do not apply "Discount on Other Item" rules to the trigger item.
			// If same_item is false (0), the rule targets another item, so we shouldn't
			// apply the price discount to the current item (which matched the 'Apply On' criteria).
			// We use loose equality check (!!rule.same_item) because it could be 1, true, or "1".

			// Simplified logic: Keep rule if same_item is true OR if "Apply On Other" is not set.
			// Blank "Apply On Other" behaves as "Apply on Self" even if same_item is 0.
			return !!rule.same_item || !rule.apply_rule_on_other;
		})
		.sort(ruleSort);

	let pricing: {
		rate: number;
		discountPerUnit: number;
		applied: AnyRecord[];
	} = {
		rate: round(startRate),
		discountPerUnit: 0,
		applied: [],
	};

	if (pricingRules.length) {
		const applied: AnyRecord[] = [];
		let rate = startRate;

		for (const rule of pricingRules) {
			const { newRate, discount, detail } = applyOneRule(
				rate,
				rule,
				effectiveQty,
				startRate,
			);
			rate = newRate;
			if (detail) {
				applied.push(detail);
			}
			if (rule.stop_further_rules) {
				break;
			}
			if (!rule.apply_multiple_pricing_rules) {
				break;
			}
		}

		pricing = {
			rate: round(rate),
			discountPerUnit: round(startRate - rate),
			applied,
		};
	}

	// Free items logic
	const freeRules = validCandidates
		.filter((rule) => isFreeRule(rule))
		.filter((rule) => {
			const minimum =
				Number.parseFloat(rule.min_qty || rule.recurse_for || 1) || 1;
			return effectiveQty >= minimum;
		})
		.sort(ruleSort);

	const freebies: AnyRecord[] = [];

	if (freeRules.length) {
		for (const rule of freeRules) {
			const freebie = applyFreeItemRule(rule, item, effectiveQty);
			if (freebie) {
				freebies.push(freebie);
			}

			if (rule.stop_further_rules) {
				break;
			}
		}
	}

	return { pricing, freebies };
};

// Deprecated: Wrappers for backward compatibility
export const applyLocalPricingRules = (params: {
	item: AnyRecord;
	qty?: number | string;
	docQty?: number | string;
	baseRate?: number;
	ctx?: AnyRecord;
	indexes?: {
		byItem?: Map<string, AnyRecord[]>;
		byGroup?: Map<string, AnyRecord[]>;
		byBrand?: Map<string, AnyRecord[]>;
		general?: AnyRecord[];
	};
}) => {
	const { pricing } = evaluatePricingRules(params);
	return pricing;
};

export const computeFreeItems = (params: {
	item: AnyRecord;
	qty?: number | string;
	docQty?: number | string;
	baseRate?: number;
	ctx?: AnyRecord;
	indexes?: {
		byItem?: Map<string, AnyRecord[]>;
		byGroup?: Map<string, AnyRecord[]>;
		byBrand?: Map<string, AnyRecord[]>;
		general?: AnyRecord[];
	};
}) => {
	const { freebies } = evaluatePricingRules(params);
	return freebies;
};
