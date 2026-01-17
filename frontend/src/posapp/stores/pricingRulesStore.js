import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";
import {
	isOffline,
	savePricingRulesSnapshot,
	getCachedPricingRulesSnapshot,
	clearPricingRulesSnapshot,
} from "../../offline/index.js";

const HOURS_STALE = 24;

const benefitScore = (rule) => {
	const discount = Math.abs(rule.rate_or_discount || 0);
	const margin = Math.abs(rule.margin_rate_or_amount || 0);
	const freebies = Math.abs(rule.free_qty || 0) + Math.abs(rule.free_qty_per_unit || 0);
	return Math.max(discount, margin, freebies);
};

const compareRules = (a, b) => {
	if ((b.specificity || 0) !== (a.specificity || 0)) {
		return (b.specificity || 0) - (a.specificity || 0);
	}
	if ((b.priority || 0) !== (a.priority || 0)) {
		return (b.priority || 0) - (a.priority || 0);
	}
	const benefitDelta = benefitScore(b) - benefitScore(a);
	if (benefitDelta !== 0) {
		return benefitDelta;
	}
	return String(a.name || "").localeCompare(String(b.name || ""));
};

const buildContextKey = (ctx = {}) => {
	const payload = {
		company: ctx.company || "",
		price_list: ctx.price_list || "",
		currency: ctx.currency || "",
		customer: ctx.customer || "",
		customer_group: ctx.customer_group || "",
		territory: ctx.territory || "",
		date: ctx.date ? String(ctx.date).slice(0, 10) : "",
	};
	return JSON.stringify(payload);
};

const computeStaleTimestamp = (fromIso) => {
	try {
		const base = fromIso ? new Date(fromIso) : new Date();
		if (Number.isNaN(base.getTime())) {
			return null;
		}
		const ts = new Date(base.getTime() + HOURS_STALE * 60 * 60 * 1000);
		return ts.toISOString();
	} catch (error) {
		console.error("Failed to compute stale timestamp", error);
		return null;
	}
};

const normaliseRule = (rule = {}) => {
	const copy = { ...rule };
	if (copy.item_code) {
		copy.specificity = 3;
	} else if (copy.item_group) {
		copy.specificity = 2;
	} else if (copy.brand) {
		copy.specificity = 1;
	} else {
		copy.specificity = 0;
	}
	copy.priority = copy.priority ?? 0;
	return copy;
};

export const usePricingRulesStore = defineStore("pricing-rules", () => {
	const ready = ref(false);
	const loading = ref(false);
	const rules = ref([]);
	const indexes = reactive({
		byItem: new Map(),
		byGroup: new Map(),
		byBrand: new Map(),
		general: [],
	});
	const contextKey = ref(null);
	const lastSyncedAt = ref(null);
	const staleAt = ref(null);

	const hasSnapshot = computed(() => rules.value.length > 0);
	const isStale = computed(() => {
		if (!staleAt.value) return false;
		const ts = new Date(staleAt.value).getTime();
		return Number.isFinite(ts) ? Date.now() > ts : false;
	});

	const hydrateFromCache = () => {
		if (ready.value) {
			return;
		}
		try {
			const cached = getCachedPricingRulesSnapshot();
			if (cached) {
				rules.value = Array.isArray(cached.snapshot) ? cached.snapshot.map(normaliseRule) : [];
				contextKey.value = cached.context || null;
				lastSyncedAt.value = cached.lastSync || null;
				staleAt.value = cached.staleAt || null;
				indexRules();
			}
		} catch (error) {
			console.error("Failed to hydrate pricing rules cache", error);
		} finally {
			ready.value = true;
		}
	};

	const indexRules = () => {
		const itemMap = new Map();
		const groupMap = new Map();
		const brandMap = new Map();
		const general = [];

		for (const entry of rules.value) {
			const rule = normaliseRule(entry);

			if (rule.item_code) {
				const bucket = itemMap.get(rule.item_code) || [];
				bucket.push(rule);
				itemMap.set(rule.item_code, bucket);
			} else if (rule.item_group) {
				const bucket = groupMap.get(rule.item_group) || [];
				bucket.push(rule);
				groupMap.set(rule.item_group, bucket);
			} else if (rule.brand) {
				const bucket = brandMap.get(rule.brand) || [];
				bucket.push(rule);
				brandMap.set(rule.brand, bucket);
			} else {
				general.push(rule);
			}
		}

		for (const bucket of itemMap.values()) {
			bucket.sort(compareRules);
		}
		for (const bucket of groupMap.values()) {
			bucket.sort(compareRules);
		}
		for (const bucket of brandMap.values()) {
			bucket.sort(compareRules);
		}
		general.sort(compareRules);

		indexes.byItem = itemMap;
		indexes.byGroup = groupMap;
		indexes.byBrand = brandMap;
		indexes.general = general;
	};

	hydrateFromCache();

	const setSnapshot = (snapshot, ctxKey) => {
		rules.value = Array.isArray(snapshot) ? snapshot.map(normaliseRule) : [];
		contextKey.value = ctxKey;
		lastSyncedAt.value = new Date().toISOString();
		staleAt.value = computeStaleTimestamp(lastSyncedAt.value);
		indexRules();
		savePricingRulesSnapshot(rules.value, contextKey.value, staleAt.value);
	};

	const clearSnapshot = () => {
		rules.value = [];
		contextKey.value = null;
		lastSyncedAt.value = null;
		staleAt.value = null;
		indexes.byItem = new Map();
		indexes.byGroup = new Map();
		indexes.byBrand = new Map();
		indexes.general = [];
		clearPricingRulesSnapshot();
	};

	const ensureActiveRules = async (ctx = {}, options = {}) => {
		hydrateFromCache();
		const desiredKey = buildContextKey(ctx);
		const force = options.force === true;

		if (!force && contextKey.value === desiredKey && hasSnapshot.value && !isStale.value) {
			return;
		}

		if (isOffline()) {
			// Preserve cached snapshot when offline even if stale
			return;
		}

		if (!ctx.company || !ctx.price_list || !ctx.currency) {
			return;
		}

		loading.value = true;
		try {
			const response = await frappe.call({
				method: "posawesome.posawesome.api.pricing_rules.get_active_pricing_rules",
				args: {
					company: ctx.company,
					price_list: ctx.price_list,
					currency: ctx.currency,
					date: ctx.date,
					customer: ctx.customer,
					customer_group: ctx.customer_group,
					territory: ctx.territory,
				},
			});
			const snapshot = Array.isArray(response?.message) ? response.message : [];
			setSnapshot(snapshot, desiredKey);
		} catch (error) {
			console.error("Failed to fetch pricing rules", error);
			if (force) {
				clearSnapshot();
			}
		} finally {
			loading.value = false;
		}
	};

	const invalidateIfContextChanges = async (ctx = {}) => {
		hydrateFromCache();
		const targetKey = buildContextKey(ctx);
		if (contextKey.value !== targetKey) {
			await ensureActiveRules(ctx, { force: false });
		}
	};

	const getIndexes = () => ({
		byItem: indexes.byItem,
		byGroup: indexes.byGroup,
		byBrand: indexes.byBrand,
		general: indexes.general,
	});

	return {
		loading: computed(() => loading.value),
		rules,
		indexes,
		contextKey,
		lastSyncedAt,
		staleAt,
		hasSnapshot,
		isStale,
		ensureActiveRules,
		invalidateIfContextChanges,
		clearSnapshot,
		getIndexes,
	};
});
