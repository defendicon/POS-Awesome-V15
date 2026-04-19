/**
 * Offline pricing-rules snapshot with context-scoped indexes and staleness tracking.
 *
 * **Interfaces**
 * - `PricingRule` — a single rule record with optional `item_code`, `item_group`,
 *   `brand`, discount/rate fields, `specificity` (computed), and `priority`.
 * - `RuleContext` — lookup scope: `company`, `price_list`, `currency`, `customer`,
 *   `customer_group`, `territory`, `date`.
 *
 * **Specificity and sorting**
 * `normaliseRule` attaches a `specificity` score (item_code=3, item_group=2,
 * brand=1, general=0). `compareRules` sorts by specificity → priority →
 * `benefitScore` (max of discount/margin/freebies) → name. All index buckets are
 * sorted on write so callers always receive the highest-priority rule first.
 *
 * **Four inverted indexes**
 * `indexRules()` partitions the rule list into `indexes.byItem`, `indexes.byGroup`,
 * `indexes.byBrand`, and `indexes.general`. These are rebuilt synchronously on
 * every `setSnapshot` call and on hydration.
 *
 * **Staleness (`HOURS_STALE = 24`)**
 * `staleAt` stores an ISO timestamp 24 hours after the last sync. `isStale`
 * returns true when `Date.now()` exceeds that timestamp. The snapshot is
 * preserved without refresh when the device is offline, even if stale.
 *
 * **Offline persistence**
 * The snapshot is saved to IndexedDB via `savePricingRulesSnapshot` on every
 * `setSnapshot` call. `hydrateFromCache()` is called at store creation to
 * restore the snapshot without a network round-trip.
 *
 * **`ensureActiveRules(ctx, { force? })`**
 * Idempotent — skips the server fetch if the context key matches and the snapshot
 * is not stale (unless `force: true`). Context key is the JSON-serialised
 * `RuleContext`; a mismatch triggers `invalidateIfContextChanges`.
 */
import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";
// @ts-ignore
import {
	isOffline,
	savePricingRulesSnapshot,
	getCachedPricingRulesSnapshot,
	clearPricingRulesSnapshot,
} from "../../offline/index";

const HOURS_STALE = 24;

export interface PricingRule {
  name?: string;
  item_code?: string;
  item_group?: string;
  brand?: string;
  rate_or_discount?: number;
  margin_rate_or_amount?: number;
  free_qty?: number;
  free_qty_per_unit?: number;
  specificity?: number;
  priority?: number;
  [key: string]: any;
}

export interface RuleContext {
  company?: string;
  price_list?: string;
  currency?: string;
  customer?: string;
  customer_group?: string;
  territory?: string;
  date?: string | Date;
}

const benefitScore = (rule: PricingRule) => {
	const discount = Math.abs(rule.rate_or_discount || 0);
	const margin = Math.abs(rule.margin_rate_or_amount || 0);
	const freebies = Math.abs(rule.free_qty || 0) + Math.abs(rule.free_qty_per_unit || 0);
	return Math.max(discount, margin, freebies);
};

const compareRules = (a: PricingRule, b: PricingRule) => {
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

const buildContextKey = (ctx: RuleContext = {}) => {
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

const computeStaleTimestamp = (fromIso: string | null) => {
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

const normaliseRule = (rule: any = {}): PricingRule => {
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
	const rules = ref<PricingRule[]>([]);
	const indexes = reactive({
		byItem: new Map<string, PricingRule[]>(),
		byGroup: new Map<string, PricingRule[]>(),
		byBrand: new Map<string, PricingRule[]>(),
		general: [] as PricingRule[],
	});
	const contextKey = ref<string | null>(null);
	const lastSyncedAt = ref<string | null>(null);
	const staleAt = ref<string | null>(null);

	const hasSnapshot = computed(() => rules.value.length > 0);
	const isStale = computed(() => {
		if (!staleAt.value) return false;
		const ts = new Date(staleAt.value).getTime();
		return Number.isFinite(ts) ? Date.now() > ts : false;
	});

	const indexRules = () => {
		const itemMap = new Map<string, PricingRule[]>();
		const groupMap = new Map<string, PricingRule[]>();
		const brandMap = new Map<string, PricingRule[]>();
		const general: PricingRule[] = [];

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

	hydrateFromCache();

	const setSnapshot = (snapshot: any[], ctxKey: string) => {
		rules.value = Array.isArray(snapshot) ? snapshot.map(normaliseRule) : [];
		contextKey.value = ctxKey;
		lastSyncedAt.value = new Date().toISOString();
		staleAt.value = computeStaleTimestamp(lastSyncedAt.value);
		indexRules();
		if (contextKey.value && staleAt.value) {
			(savePricingRulesSnapshot as any)(rules.value, contextKey.value, staleAt.value);
		}
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

	const ensureActiveRules = async (ctx: RuleContext = {}, options: { force?: boolean } = {}) => {
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
			const response = await (frappe.call as any)({
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

	const invalidateIfContextChanges = async (ctx: RuleContext = {}) => {
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

export default usePricingRulesStore;
