/* global frappe */
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
        savePricingRulesSnapshot,
        getCachedPricingRulesSnapshot,
} from "../../offline/index.js";

const SPECIFICITY_WEIGHT = {
        "Item Code": 3,
        "Item Group": 2,
        "Brand": 1,
};

const STALE_THRESHOLD_HOURS = 24;
const MS_PER_HOUR = 60 * 60 * 1000;
const DEFAULT_PRECISION = 2;

function normalizeRule(rule) {
        if (!rule) {
                return null;
        }
        const normalized = {
                ...rule,
                min_qty: Number(rule.min_qty || 0),
                max_qty: rule.max_qty != null ? Number(rule.max_qty) : null,
                rate_or_discount: Number(rule.rate_or_discount || 0),
                priority: Number(rule.priority || 0),
                stop_further_rules: Number(rule.stop_further_rules || 0),
                apply_multiple_pricing_rules: Number(rule.apply_multiple_pricing_rules || 0),
                free_qty: Number(rule.free_qty || 0),
                free_qty_per_unit: Number(rule.free_qty_per_unit || 0),
                apply_per_threshold: Number(rule.apply_per_threshold || 0),
                max_free_qty: rule.max_free_qty != null ? Number(rule.max_free_qty) : null,
                specificity: SPECIFICITY_WEIGHT[rule.apply_on] || 0,
                slabs: Array.isArray(rule.slabs)
                        ? rule.slabs
                                .map((slab) => ({
                                        min_qty: Number(slab.min_qty || 0),
                                        max_qty: slab.max_qty != null ? Number(slab.max_qty) : null,
                                        rate_or_discount: Number(slab.rate_or_discount || 0),
                                        margin_rate_or_amount: Number(slab.margin_rate_or_amount || 0),
                                }))
                                .sort((a, b) => b.min_qty - a.min_qty)
                        : [],
        };
        return normalized;
}

function signatureForContext(context = {}) {
        const payload = {
                company: context.company || null,
                price_list: context.price_list || null,
                currency: context.currency || null,
                customer: context.customer || null,
                customer_group: context.customer_group || null,
                territory: context.territory || null,
                date: context.date || null,
        };
        return JSON.stringify(payload);
}

function getRuleBenefit(rule) {
        if (!rule) {
                return 0;
        }
        if (rule.price_or_discount === "Price") {
                return -(rule.rate_or_discount || 0);
        }
        if (rule.price_or_discount === "Discount") {
                if (rule.discount_type === "Rate") {
                        return rule.rate_or_discount || 0;
                }
                return (rule.rate_or_discount || 0) * 1000;
        }
        if (rule.price_or_discount === "Margin") {
                return rule.margin_rate_or_amount || rule.rate_or_discount || 0;
        }
        return rule.priority || 0;
}

function compareRules(a, b) {
        if (a.specificity !== b.specificity) {
                return b.specificity - a.specificity;
        }
        if (a.priority !== b.priority) {
                return b.priority - a.priority;
        }
        const benefitDiff = getRuleBenefit(b) - getRuleBenefit(a);
        if (benefitDiff !== 0) {
                return benefitDiff;
        }
        const nameA = a.name || "";
        const nameB = b.name || "";
        return nameA.localeCompare(nameB);
}

function buildIndex(rules, key) {
        const index = new Map();
        rules.forEach((rule) => {
                if (!rule) {
                        return;
                }
                const value = rule[key];
                if (!value) {
                        return;
                }
                if (!index.has(value)) {
                        index.set(value, []);
                }
                index.get(value).push(rule);
        });
        for (const [, list] of index.entries()) {
                list.sort(compareRules);
        }
        return index;
}

export const usePricingRulesStore = defineStore("pricing-rules", () => {
        const rules = ref([]);
        const byItem = ref(new Map());
        const byGroup = ref(new Map());
        const byBrand = ref(new Map());
        const lastSyncedAt = ref(null);
        const contextHash = ref(null);
        const loading = ref(false);
        const error = ref(null);
        const precision = ref(DEFAULT_PRECISION);

        const isStale = computed(() => {
                if (!lastSyncedAt.value) {
                        return true;
                }
                const age = Date.now() - lastSyncedAt.value;
                return age > STALE_THRESHOLD_HOURS * MS_PER_HOUR;
        });

        function reindex() {
                const list = rules.value;
                byItem.value = buildIndex(list, "item_code");
                byGroup.value = buildIndex(list, "item_group");
                byBrand.value = buildIndex(list, "brand");
        }

        function applySnapshot(snapshot) {
                if (!snapshot) {
                        return;
                }
                const normalized = Array.isArray(snapshot.rules)
                        ? snapshot.rules
                                .map((rule) => normalizeRule(rule))
                                .filter(Boolean)
                        : [];
                rules.value = normalized;
                lastSyncedAt.value = snapshot.lastSyncedAt || null;
                contextHash.value = snapshot.contextHash || null;
                reindex();
        }

        function setPrecision(value) {
                if (Number.isFinite(value) && value > 0) {
                        precision.value = value;
                }
        }

        function getIndexes() {
                return {
                        byItem: byItem.value,
                        byGroup: byGroup.value,
                        byBrand: byBrand.value,
                        precision: precision.value,
                };
        }

        async function hydrateFromCache() {
                const snapshot = getCachedPricingRulesSnapshot();
                if (snapshot) {
                        applySnapshot(snapshot);
                }
        }

        async function fetchActiveRules(context, options = {}) {
                const signature = signatureForContext(context);
                const shouldRefetch =
                        options.force === true ||
                        contextHash.value !== signature ||
                        !rules.value.length ||
                        isStale.value;
                if (!shouldRefetch) {
                        return;
                }

                loading.value = true;
                error.value = null;
                try {
                        const response = await frappe.call({
                                method: "posawesome.posawesome.api.pricing_rules.get_active_pricing_rules",
                                args: {
                                        company: context.company,
                                        price_list: context.price_list,
                                        currency: context.currency,
                                        customer: context.customer,
                                        customer_group: context.customer_group,
                                        territory: context.territory,
                                        date: context.date,
                                },
                        });
                        const fetched = response?.message || [];
                        const snapshot = {
                                rules: fetched,
                                lastSyncedAt: Date.now(),
                                contextHash: signature,
                        };
                        savePricingRulesSnapshot(snapshot);
                        applySnapshot(snapshot);
                } catch (err) {
                        console.error("Failed to fetch pricing rules", err);
                        error.value = err;
                } finally {
                        loading.value = false;
                }
        }

        async function invalidateIfContextChanges(context, options = {}) {
                const signature = signatureForContext(context);
                const requireRefresh =
                        signature !== contextHash.value ||
                        (!rules.value.length && !loading.value);
                if (requireRefresh || options.force) {
                        await fetchActiveRules(context, { force: options.force });
                }
        }

        return {
                rules,
                byItem,
                byGroup,
                byBrand,
                lastSyncedAt,
                contextHash,
                loading,
                error,
                precision,
                isStale,
                hydrateFromCache,
                fetchActiveRules,
                invalidateIfContextChanges,
                reindex,
                getIndexes,
                setPrecision,
        };
});
