const DEFAULT_PRECISION = 6;

export const round = (value, precision = DEFAULT_PRECISION) => {
        const numeric = Number.parseFloat(value || 0);
        if (!Number.isFinite(numeric)) {
                return 0;
        }
        const factor = 10 ** precision;
        return Math.round(numeric * factor) / factor;
};

export const inDateRange = (currentDate, start, end) => {
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

export const matchParty = (rule, customer, customerGroup, territory) => {
        if (rule.customer && customer && rule.customer !== customer) {
                        return false;
        }
        if (rule.customer_group && customerGroup && rule.customer_group !== customerGroup) {
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

export const matchPriceListAndCurrency = (rule, priceList, currency) => {
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

const pushUnique = (bucket, rule, seen) => {
        if (!rule || seen.has(rule.name)) {
                return;
        }
        bucket.push(rule);
        seen.add(rule.name);
};

export const collectCandidates = (item = {}, indexBundle = {}) => {
        const { byItem, byGroup, byBrand, general } = indexBundle;
        const bucket = [];
        const seen = new Set();

        if (item.item_code && byItem instanceof Map && byItem.has(item.item_code)) {
                for (const rule of byItem.get(item.item_code)) {
                        pushUnique(bucket, rule, seen);
                }
        }
        if (item.item_group && byGroup instanceof Map && byGroup.has(item.item_group)) {
                for (const rule of byGroup.get(item.item_group)) {
                        pushUnique(bucket, rule, seen);
                }
        }
        if (item.brand && byBrand instanceof Map && byBrand.has(item.brand)) {
                for (const rule of byBrand.get(item.brand)) {
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

const ruleBenefitScore = (rule = {}) => {
        const discount = Math.abs(rule.rate_or_discount || 0);
        const margin = Math.abs(rule.margin_rate_or_amount || 0);
        const freebies = Math.abs(rule.free_qty || 0) + Math.abs(rule.free_qty_per_unit || 0);
        return Math.max(discount, margin, freebies);
};

export const ruleSort = (a, b) => {
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

const normaliseQuantity = (value) => {
        const numeric = Number.parseFloat(value);
        return Number.isFinite(numeric) ? Math.abs(numeric) : 0;
};

const selectSlab = (rule, qty) => {
        if (!Array.isArray(rule.slabs) || !rule.slabs.length) {
                return null;
        }
        let chosen = null;
        for (const slab of rule.slabs) {
                const minQty = Number.parseFloat(slab.min_qty || 0);
                if (qty >= minQty && (!chosen || minQty >= Number.parseFloat(chosen.min_qty || 0))) {
                        chosen = slab;
                }
        }
        return chosen;
};

const applyMargin = (baseRate, rule) => {
        const marginType = rule.margin_type || rule.discount_type;
        const marginValue = Number.parseFloat(rule.margin_rate_or_amount || rule.rate_or_discount || 0);

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

const resolveSlabValue = (rule, slab) => {
        if (slab && slab.rate_or_discount !== undefined && slab.rate_or_discount !== null) {
                return Number.parseFloat(slab.rate_or_discount);
        }
        return Number.parseFloat(rule.rate_or_discount || 0);
};

const applyOneRule = (currentRate, rule, qty, baseRate) => {
        const slab = selectSlab(rule, qty);
        const value = resolveSlabValue(rule, slab);

        let newRate = currentRate;
        let change = 0;

        const rawType = String(rule.rate_or_discount_type || "").toLowerCase();
        const priceMode = String(rule.price_or_discount || "").toLowerCase();
        const discountType = String(rule.discount_type || "").toLowerCase();

        const isAmount = rawType === "discount amount" || discountType === "amount";
        const isMargin = discountType === "margin" || !!rule.margin_type;
        const isPriceOverride = priceMode === "price" && (rawType === "rate" || rawType === "price" || (!rawType && discountType === "rate"));

        let type = rule.discount_type || rule.rate_or_discount_type || rule.price_or_discount;

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

const isFreeRule = (rule) => rule && (rule.is_free_item_rule || (rule.price_or_discount || "").toLowerCase() === "product");

export const applyLocalPricingRules = ({ item, qty, stockQty, baseRate, ctx, indexes }) => {
        const saleQty = normaliseQuantity(qty);
        let stockQtyValue = normaliseQuantity(stockQty);
        if (!stockQtyValue) {
                const conversion = Number.parseFloat(item?.conversion_factor || 1);
                if (Number.isFinite(conversion)) {
                        stockQtyValue = normaliseQuantity(saleQty * conversion);
                }
        }
        if (!stockQtyValue) {
                stockQtyValue = saleQty;
        }

        const resolveRuleQuantity = (rule) => (rule?.min_qty_as_per_stock_uom ? stockQtyValue : saleQty);
        const minimumForRule = (rule) => {
                const minimum = Number.parseFloat(rule?.min_qty ?? 0);
                return Number.isFinite(minimum) ? minimum : 0;
        };

        const effectiveBase = Number.isFinite(baseRate) ? baseRate : Number.parseFloat(item?.base_price_list_rate || item?.price_list_rate || item?.rate || 0);
        const startRate = Number.isFinite(effectiveBase) ? effectiveBase : 0;

        const candidates = collectCandidates(item, indexes);
        const filtered = candidates
                .filter((rule) => !isFreeRule(rule))
                .filter((rule) => inDateRange(ctx?.date, rule.valid_from, rule.valid_upto))
                .filter((rule) => matchParty(rule, ctx?.customer, ctx?.customer_group, ctx?.territory))
                .filter((rule) => matchPriceListAndCurrency(rule, ctx?.price_list, ctx?.currency))
                .filter((rule) => resolveRuleQuantity(rule) >= minimumForRule(rule))
                .sort(ruleSort);

        if (!filtered.length) {
                return { rate: round(startRate), discountPerUnit: 0, applied: [] };
        }

        const applied = [];
        let rate = startRate;

        for (const rule of filtered) {
                const basisQty = resolveRuleQuantity(rule);
                const { newRate, discount, detail } = applyOneRule(rate, rule, basisQty, startRate);
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

        return {
                rate: round(rate),
                discountPerUnit: round(startRate - rate),
                applied,
        };
};

const computeThresholdInfo = (rule, saleQty, stockQty) => {
        const minimum = Number.parseFloat(rule.min_qty || rule.recurse_for || 1) || 1;
        const basisQtyRaw = rule?.min_qty_as_per_stock_uom ? stockQty : saleQty;
        const basisQty = Number.isFinite(basisQtyRaw) ? Math.max(0, basisQtyRaw) : 0;

        let multiplier = 0;

        if (rule.apply_per_threshold || rule.is_recursive || rule.recurse_for) {
                const divisor = Number.parseFloat(rule.recurse_for || rule.min_qty || 1) || 1;
                const safeDivisor = divisor > 0 ? divisor : 1;
                multiplier = Math.floor(basisQty / safeDivisor);
        } else {
                multiplier = basisQty >= minimum ? 1 : 0;
        }

        return { minimum, multiplier, basisQty };
};

export const computeFreeItems = ({ item, qty, stockQty, ctx, indexes }) => {
        const saleQty = normaliseQuantity(qty);
        let stockQtyValue = normaliseQuantity(stockQty);
        if (!stockQtyValue) {
                const conversion = Number.parseFloat(item?.conversion_factor || 1);
                if (Number.isFinite(conversion)) {
                        stockQtyValue = normaliseQuantity(saleQty * conversion);
                }
        }
        if (!stockQtyValue) {
                stockQtyValue = saleQty;
        }

        const resolveRuleQuantity = (rule) => (rule?.min_qty_as_per_stock_uom ? stockQtyValue : saleQty);
        const minimumForRule = (rule) => {
                const fallback = rule?.min_qty ?? rule?.recurse_for ?? 1;
                const numeric = Number.parseFloat(fallback);
                return Number.isFinite(numeric) ? (numeric || 1) : 1;
        };

        const candidates = collectCandidates(item, indexes)
                .filter((rule) => isFreeRule(rule))
                .filter((rule) => inDateRange(ctx?.date, rule.valid_from, rule.valid_upto))
                .filter((rule) => matchParty(rule, ctx?.customer, ctx?.customer_group, ctx?.territory))
                .filter((rule) => matchPriceListAndCurrency(rule, ctx?.price_list, ctx?.currency))
                .filter((rule) => resolveRuleQuantity(rule) >= minimumForRule(rule))
                .sort(ruleSort);

        if (!candidates.length) {
                return [];
        }

        const freebies = [];

        for (const rule of candidates) {
                const { minimum, multiplier, basisQty } = computeThresholdInfo(rule, saleQty, stockQtyValue);
                let freeQty = 0;
                const thresholdQty = minimum;
                const freePerThreshold = rule.free_qty_per_unit
                        ? Number.parseFloat(rule.free_qty_per_unit || 0) || 0
                        : Number.parseFloat(rule.free_qty || 0) || 0;

                if (rule.apply_per_threshold || rule.is_recursive || rule.recurse_for) {
                        freeQty = multiplier * freePerThreshold;
                } else if (rule.free_qty_per_unit) {
                        freeQty = basisQty * Number.parseFloat(rule.free_qty_per_unit || 0);
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
                        if (rule.stop_further_rules) {
                                break;
                        }
                        continue;
                }

                freebies.push({
                        item_code: rule.same_item ? item.item_code : rule.free_item || item.item_code,
                        qty: freeQty,
                        rule: rule.name,
                        same_item: !!rule.same_item,
                        min_qty: minimum,
                        multiplier,
                        apply_per_threshold: !!rule.apply_per_threshold || !!rule.is_recursive || !!rule.recurse_for,
                        max_free_qty: rule.max_free_qty,
                        threshold_qty: thresholdQty,
                        free_qty_per_threshold: freePerThreshold,
                });

                if (rule.stop_further_rules) {
                        break;
                }
        }

        return freebies;
};

