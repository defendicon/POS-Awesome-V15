const DEFAULT_PRECISION = 2;

function round(value, precision = DEFAULT_PRECISION) {
        if (!Number.isFinite(value)) {
                return 0;
        }
        const factor = 10 ** precision;
        return Math.round((value + Number.EPSILON) * factor) / factor;
}

function toNumber(value, fallback = 0) {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
}

function parseDate(value) {
        if (!value) {
                return null;
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
}

function inDateRange(dateStr, start, end) {
        const today = parseDate(dateStr) || new Date();
        const startDate = parseDate(start);
        const endDate = parseDate(end);
        if (startDate && today < startDate) {
                return false;
        }
        if (endDate && today > endDate) {
                return false;
        }
        return true;
}

function matchParty(rule, customer, customerGroup, territory) {
        if (rule.customer && customer && rule.customer !== customer) {
                return false;
        }
        if (rule.customer && !customer) {
                return false;
        }
        if (rule.customer_group && customerGroup && rule.customer_group !== customerGroup) {
                return false;
        }
        if (rule.customer_group && !customerGroup) {
                return false;
        }
        if (rule.territory && territory && rule.territory !== territory) {
                return false;
        }
        if (rule.territory && !territory) {
                return false;
        }
        return true;
}

function matchPLCurrency(rule, priceList, currency) {
        if (rule.price_list && priceList && rule.price_list !== priceList) {
                return false;
        }
        if (rule.price_list && !priceList) {
                return false;
        }
        if (rule.currency && currency && rule.currency !== currency) {
                return false;
        }
        if (rule.currency && !currency) {
                return false;
        }
        return true;
}

function isFreeItemRule(rule) {
        return toNumber(rule.is_free_item_rule) === 1;
}

function collectCandidates(item, indexes = {}) {
        const result = [];
        const seen = new Set();
        if (!item) {
                return result;
        }
        const { byItem, byGroup, byBrand } = indexes;
        const addRules = (list) => {
                if (!Array.isArray(list)) {
                        return;
                }
                list.forEach((rule) => {
                        if (!rule || seen.has(rule.name)) {
                                return;
                        }
                        seen.add(rule.name);
                        result.push(rule);
                });
        };
        if (byItem && byItem.get && item.item_code) {
                addRules(byItem.get(item.item_code));
        }
        if (byGroup && byGroup.get && item.item_group) {
                addRules(byGroup.get(item.item_group));
        }
        if (byBrand && byBrand.get && item.brand) {
                addRules(byBrand.get(item.brand));
        }
        return result;
}

function pickSlab(rule, qty) {
        if (!Array.isArray(rule.slabs) || !rule.slabs.length) {
                return null;
        }
        const quantity = toNumber(qty, 0);
        for (const slab of rule.slabs) {
                const minQty = toNumber(slab.min_qty, 0);
                const maxQty = slab.max_qty != null ? toNumber(slab.max_qty, 0) : null;
                if (quantity >= minQty && (maxQty == null || quantity <= maxQty)) {
                        return slab;
                }
        }
        return null;
}

function resolveRuleValue(rule, slab, field, fallback = 0) {
        if (slab && slab[field] != null) {
                return toNumber(slab[field], fallback);
        }
        if (rule && rule[field] != null) {
                return toNumber(rule[field], fallback);
        }
        return fallback;
}

function applyDiscountRule(currentRate, discount, discountType) {
        const base = toNumber(currentRate, 0);
        if (discountType === "Rate") {
                const perc = Math.max(Math.min(toNumber(discount, 0), 100), -100);
                const updated = base * (1 - perc / 100);
                return { newRate: Math.max(updated, 0), discountApplied: base - Math.max(updated, 0) };
        }
        const amount = Math.max(toNumber(discount, 0), 0);
        const updated = Math.max(base - amount, 0);
        return { newRate: updated, discountApplied: base - updated };
}

function applyPriceRule(discountValue) {
        const rate = Math.max(toNumber(discountValue, 0), 0);
        return { newRate: rate, discountApplied: 0 };
}

function applyMarginRule(currentRate, ruleValue) {
        const base = toNumber(currentRate, 0);
        const margin = toNumber(ruleValue, 0);
        const updated = Math.max(base + margin, 0);
        return { newRate: updated, discountApplied: 0 };
}

function applyOnePaidRule(currentRate, rule, qty, precision) {
        const slab = pickSlab(rule, qty);
        const priceOrDiscount = rule.price_or_discount;
        if (priceOrDiscount === "Discount") {
                const discountType = rule.discount_type;
                const value = resolveRuleValue(rule, slab, "rate_or_discount", rule.rate_or_discount);
                const { newRate, discountApplied } = applyDiscountRule(currentRate, value, discountType);
                return { newRate: round(newRate, precision), discountApplied: round(discountApplied, precision) };
        }
        if (priceOrDiscount === "Price") {
                const targetPrice = resolveRuleValue(rule, slab, "rate_or_discount", rule.rate_or_discount);
                const { newRate } = applyPriceRule(targetPrice);
                return { newRate: round(newRate, precision), discountApplied: round(currentRate - newRate, precision) };
        }
        if (priceOrDiscount === "Margin") {
                const marginValue = resolveRuleValue(rule, slab, "margin_rate_or_amount", rule.margin_rate_or_amount);
                const { newRate } = applyMarginRule(currentRate, marginValue);
                return { newRate: round(newRate, precision), discountApplied: 0 };
        }
        return { newRate: round(currentRate, precision), discountApplied: 0 };
}

function filterPaidRules(candidates, qty, ctx) {
        const quantity = toNumber(qty, 0);
        return candidates.filter((rule) => {
                if (!rule || isFreeItemRule(rule)) {
                        return false;
                }
                const minQty = toNumber(rule.min_qty, 0);
                const maxQty = rule.max_qty != null ? toNumber(rule.max_qty, 0) : null;
                if (minQty && quantity < minQty) {
                        return false;
                }
                if (maxQty != null && maxQty !== 0 && quantity > maxQty) {
                        return false;
                }
                if (!inDateRange(ctx.date, rule.valid_from, rule.valid_upto)) {
                        return false;
                }
                if (!matchParty(rule, ctx.customer, ctx.customer_group, ctx.territory)) {
                        return false;
                }
                if (!matchPLCurrency(rule, ctx.price_list, ctx.currency)) {
                        return false;
                }
                return true;
        });
}

function filterFreeRules(candidates, qty, ctx) {
        const quantity = toNumber(qty, 0);
        return candidates.filter((rule) => {
                if (!rule || !isFreeItemRule(rule)) {
                        return false;
                }
                const minQty = toNumber(rule.min_qty, 0) || 1;
                if (quantity < minQty) {
                        return false;
                }
                if (!inDateRange(ctx.date, rule.valid_from, rule.valid_upto)) {
                        return false;
                }
                if (!matchParty(rule, ctx.customer, ctx.customer_group, ctx.territory)) {
                        return false;
                }
                if (!matchPLCurrency(rule, ctx.price_list, ctx.currency)) {
                        return false;
                }
                return true;
        });
}

function sortRules(rules) {
        return rules.slice().sort((a, b) => {
                const specA = toNumber(a.specificity, 0);
                const specB = toNumber(b.specificity, 0);
                if (specA !== specB) {
                        return specB - specA;
                }
                const priorityA = toNumber(a.priority, 0);
                const priorityB = toNumber(b.priority, 0);
                if (priorityA !== priorityB) {
                        return priorityB - priorityA;
                }
                const benefitA = Math.abs(toNumber(a.rate_or_discount, 0));
                const benefitB = Math.abs(toNumber(b.rate_or_discount, 0));
                if (benefitA !== benefitB) {
                        return benefitB - benefitA;
                }
                return (a.name || "").localeCompare(b.name || "");
        });
}

export function applyLocalPricingRules({ item, qty, baseRate, ctx = {}, indexes = {} }) {
        const precision = toNumber(indexes.precision, DEFAULT_PRECISION);
        const candidates = collectCandidates(item, indexes);
        const validRules = sortRules(filterPaidRules(candidates, qty, ctx));
        if (!validRules.length) {
                return { rate: round(baseRate || 0, precision), discount: 0, rules: [] };
        }
        let rate = toNumber(baseRate, 0);
        const applied = [];
        let discountAggregate = 0;
        for (const rule of validRules) {
                const { newRate, discountApplied } = applyOnePaidRule(rate, rule, qty, precision);
                if (discountApplied > 0 || newRate !== rate) {
                        applied.push(rule.name);
                }
                discountAggregate += discountApplied;
                rate = newRate;
                if (rule.stop_further_rules) {
                        break;
                }
                if (!rule.apply_multiple_pricing_rules) {
                        break;
                }
        }
        return {
                rate: round(rate, precision),
                discount: round(discountAggregate, precision),
                rules: applied,
        };
}

function computeFreeQuantity(rule, qty) {
        const quantity = toNumber(qty, 0);
        const minQty = Math.max(toNumber(rule.min_qty, 0) || 1, 1);
        const freeQty = toNumber(rule.free_qty, 0);
        const perUnit = toNumber(rule.free_qty_per_unit, 0);
        const maxFreeQty = rule.max_free_qty != null ? toNumber(rule.max_free_qty, 0) : null;
        const perThreshold = toNumber(rule.apply_per_threshold, 0) === 1;

        let multiplier = 0;
        if (perThreshold) {
                multiplier = Math.floor(quantity / minQty);
        } else if (quantity >= minQty) {
                multiplier = 1;
        }
        let total = multiplier * (freeQty || perUnit);
        if (!total && perUnit) {
                total = multiplier * perUnit;
        }
        if (maxFreeQty != null && maxFreeQty > 0) {
                total = Math.min(total, maxFreeQty);
        }
        return { total, multiplier, minQty };
}

export function computeFreeItems({ item, qty, ctx = {}, indexes = {} }) {
        const candidates = collectCandidates(item, indexes);
        const validRules = sortRules(filterFreeRules(candidates, qty, ctx));
        if (!validRules.length) {
                return [];
        }
        const freebies = [];
        for (const rule of validRules) {
                const { total, multiplier, minQty } = computeFreeQuantity(rule, qty);
                if (total > 0) {
                        freebies.push({
                                item_code: rule.same_item ? item.item_code : rule.free_item || item.item_code,
                                qty: total,
                                rule: rule.name,
                                multiplier,
                                min_qty: minQty,
                        });
                }
                if (rule.stop_further_rules) {
                        break;
                }
        }
        return freebies;
}

export {
        collectCandidates,
        inDateRange,
        matchParty,
        matchPLCurrency,
        applyOnePaidRule,
        round,
        isFreeItemRule,
};
