import {
	bucketCount,
	startPerfMeasure,
	type PerfMetricName,
} from "../posapp/utils/perf";
import { checkDbHealth, db, safeBulkDelete, safeBulkPut } from "./db";
import { getQueuedPayloadCount } from "./writeQueue";

type RawCustomer = Record<string, any>;

export type OperationalCustomerRecord = {
	key: string;
	scope: string;
	name: string;
	customer_name: string;
	display_name: string;
	mobile_no?: string | null;
	email_id?: string | null;
	tax_id?: string | null;
	customer_group?: string | null;
	territory?: string | null;
	default_price_list?: string | null;
	customer_price_list?: string | null;
	primary_address?: string | null;
	disabled: boolean;
	pending_sync: boolean;
	offline_created: boolean;
	modified?: string | null;
	search_tokens: string[];
	phone_keys: string[];
	email_key?: string | null;
	tax_key?: string | null;
	payload: RawCustomer;
};

export type CustomerSearchOptions = {
	scope?: string;
	limit?: number;
	offset?: number;
	includePending?: boolean;
};

export type CustomerDeltaBatch = {
	scope: string;
	changed?: RawCustomer[];
	deletedCustomerNames?: string[];
	source?: string;
};

export type CustomerEngineDiagnostics = {
	ready: boolean;
	scope: string | null;
	generation: number;
	indexedCustomerCount: number;
	mobileCount: number;
	pendingOfflineCount: number;
	lastHydratedAt: string | null;
	lastBuiltAt: string | null;
	lastDeltaAppliedAt: string | null;
	lastRemoteRefreshAt: string | null;
	lastHydrateDurationMs: number | null;
	lastBuildDurationMs: number | null;
	lastBlockingReason: string | null;
	fullReloadAvoidedCount: number;
};

const DEFAULT_SEARCH_LIMIT = 50;
const MAX_SEARCH_LIMIT = 100;
const MAX_PREFIX_LENGTH = 24;
const EMPTY_DIAGNOSTICS: CustomerEngineDiagnostics = {
	ready: false,
	scope: null,
	generation: 0,
	indexedCustomerCount: 0,
	mobileCount: 0,
	pendingOfflineCount: 0,
	lastHydratedAt: null,
	lastBuiltAt: null,
	lastDeltaAppliedAt: null,
	lastRemoteRefreshAt: null,
	lastHydrateDurationMs: null,
	lastBuildDurationMs: null,
	lastBlockingReason: null,
	fullReloadAvoidedCount: 0,
};

function nowIso() {
	return new Date().toISOString();
}

function normalizeScope(scope: unknown) {
	return String(scope || "").trim();
}

export function normalizeCustomerSearchValue(value: unknown) {
	return String(value ?? "")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9@.+-]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

function normalizeExactKey(value: unknown) {
	return String(value ?? "").trim().toLowerCase();
}

function normalizePhone(value: unknown) {
	return String(value ?? "").replace(/\D+/g, "");
}

function tokenize(value: unknown) {
	const normalized = normalizeCustomerSearchValue(value);
	return normalized ? normalized.split(" ").filter(Boolean) : [];
}

function unique(values: unknown[]) {
	const seen = new Set<string>();
	const result: string[] = [];
	values.forEach((value) => {
		const normalized = String(value ?? "").trim();
		if (!normalized || seen.has(normalized)) return;
		seen.add(normalized);
		result.push(normalized);
	});
	return result;
}

function isDisabled(customer: RawCustomer) {
	return Boolean(customer?.disabled || customer?.disabled === 1);
}

function isPending(customer: RawCustomer) {
	return Boolean(customer?.pending_sync || customer?.offline_created || customer?._offline_created);
}

function compactPayload(customer: RawCustomer) {
	const name = String(customer?.name || customer?.customer || customer?.customer_name || "").trim();
	const customerName = String(customer?.customer_name || customer?.customer || name).trim();
	return {
		name,
		customer_name: customerName || name,
		mobile_no: customer?.mobile_no || null,
		email_id: customer?.email_id || null,
		tax_id: customer?.tax_id || null,
		customer_group: customer?.customer_group || null,
		territory: customer?.territory || null,
		default_price_list: customer?.default_price_list || null,
		customer_price_list: customer?.customer_price_list || customer?.default_price_list || null,
		primary_address: customer?.primary_address || customer?.address_line1 || null,
		loyalty_program: customer?.loyalty_program || null,
		loyalty_points: customer?.loyalty_points,
		conversion_factor: customer?.conversion_factor,
		stored_value_balance: customer?.stored_value_balance,
		stored_value_sources: customer?.stored_value_sources,
		modified: customer?.modified || null,
		pending_sync: isPending(customer),
		offline_created: Boolean(customer?.offline_created || customer?._offline_created),
	};
}

function buildTokens(customer: RawCustomer, phoneKeys: string[]) {
	return unique([
		...tokenize(customer?.name),
		...tokenize(customer?.customer),
		...tokenize(customer?.customer_name),
		...tokenize(customer?.email_id),
		...tokenize(customer?.tax_id),
		...phoneKeys,
	]).filter(Boolean);
}

export function buildOperationalCustomerRecord(
	customer: RawCustomer,
	scope = "",
): OperationalCustomerRecord | null {
	const name = String(customer?.name || customer?.customer || customer?.customer_name || "").trim();
	if (!name) return null;
	const customerName = String(customer?.customer_name || customer?.customer || name).trim() || name;
	const phoneKeys = unique([
		normalizePhone(customer?.mobile_no),
		normalizePhone(customer?.phone),
		normalizePhone(customer?.contact_mobile),
	]).filter(Boolean);
	const emailKey = normalizeExactKey(customer?.email_id);
	const taxKey = normalizeExactKey(customer?.tax_id);
	const payload = compactPayload({ ...customer, name, customer_name: customerName });
	return {
		key: `${normalizeScope(scope)}::${name}`,
		scope: normalizeScope(scope),
		name,
		customer_name: customerName,
		display_name: customerName,
		mobile_no: customer?.mobile_no || null,
		email_id: customer?.email_id || null,
		tax_id: customer?.tax_id || null,
		customer_group: customer?.customer_group || null,
		territory: customer?.territory || null,
		default_price_list: customer?.default_price_list || null,
		customer_price_list: customer?.customer_price_list || customer?.default_price_list || null,
		primary_address: customer?.primary_address || customer?.address_line1 || null,
		disabled: isDisabled(customer),
		pending_sync: isPending(customer),
		offline_created: Boolean(customer?.offline_created || customer?._offline_created),
		modified: customer?.modified || null,
		search_tokens: buildTokens({ ...customer, name, customer_name: customerName }, phoneKeys),
		phone_keys: phoneKeys,
		email_key: emailKey || null,
		tax_key: taxKey || null,
		payload,
	};
}

function toVisibleCustomer(record: OperationalCustomerRecord) {
	return {
		...record.payload,
		name: record.name,
		customer_name: record.customer_name,
		mobile_no: record.mobile_no || undefined,
		email_id: record.email_id || undefined,
		tax_id: record.tax_id || undefined,
		primary_address: record.primary_address || undefined,
		pending_sync: record.pending_sync || undefined,
		offline_created: record.offline_created || undefined,
	};
}

class LocalCustomerEngine {
	private recordsByKey = new Map<string, OperationalCustomerRecord>();
	private exactByName = new Map<string, string>();
	private exactMobile = new Map<string, string>();
	private prefixIndex = new Map<string, Set<string>>();
	private orderedKeys: string[] = [];
	private diagnostics: CustomerEngineDiagnostics = { ...EMPTY_DIAGNOSTICS };

	reset(scope: string | null = null) {
		this.recordsByKey.clear();
		this.exactByName.clear();
		this.exactMobile.clear();
		this.prefixIndex.clear();
		this.orderedKeys = [];
		this.diagnostics = { ...EMPTY_DIAGNOSTICS, scope };
	}

	getDiagnostics() {
		return {
			...this.diagnostics,
			pendingOfflineCount: getQueuedPayloadCount("customer"),
		};
	}

	private assertReady(scope = "") {
		const resolvedScope = normalizeScope(scope);
		return this.diagnostics.ready && this.diagnostics.scope === resolvedScope;
	}

	private addPrefix(token: string, key: string) {
		const value = normalizeCustomerSearchValue(token);
		if (!value) return;
		for (let length = 1; length <= Math.min(value.length, MAX_PREFIX_LENGTH); length += 1) {
			const prefix = value.slice(0, length);
			let set = this.prefixIndex.get(prefix);
			if (!set) {
				set = new Set<string>();
				this.prefixIndex.set(prefix, set);
			}
			set.add(key);
		}
	}

	private indexRecord(record: OperationalCustomerRecord) {
		if (record.disabled) return;
		const alreadyIndexed = this.recordsByKey.has(record.key);
		this.recordsByKey.set(record.key, record);
		this.exactByName.set(normalizeExactKey(record.name), record.key);
		this.exactByName.set(normalizeExactKey(record.customer_name), record.key);
		record.phone_keys.forEach((phone) => {
			if (!this.exactMobile.has(phone)) this.exactMobile.set(phone, record.key);
			this.addPrefix(phone, record.key);
		});
		if (record.email_key) this.addPrefix(record.email_key, record.key);
		if (record.tax_key) this.addPrefix(record.tax_key, record.key);
		this.addPrefix(record.name, record.key);
		this.addPrefix(record.customer_name, record.key);
		record.search_tokens.forEach((token) => this.addPrefix(token, record.key));
		if (!alreadyIndexed) {
			this.orderedKeys.push(record.key);
		}
	}

	private rebuild(records: OperationalCustomerRecord[], scope: string, durationStart: number) {
		this.recordsByKey.clear();
		this.exactByName.clear();
		this.exactMobile.clear();
		this.prefixIndex.clear();
		this.orderedKeys = [];
		records.forEach((record) => this.indexRecord(record));
		this.diagnostics = {
			...this.diagnostics,
			ready: true,
			scope,
			generation: this.diagnostics.generation + 1,
			indexedCustomerCount: this.recordsByKey.size,
			mobileCount: this.exactMobile.size,
			lastBuiltAt: nowIso(),
			lastBuildDurationMs: performance.now() - durationStart,
			lastBlockingReason: null,
		};
	}

	async hydrate(scope = "") {
		const resolvedScope = normalizeScope(scope);
		const metric = startPerfMeasure("pos.customers.index_hydrate" as PerfMetricName, {
			source: "local",
		});
		const started = performance.now();
		try {
			if (this.assertReady(resolvedScope)) {
				metric.finish("success", {
					cache_hit: true,
					customer_result_count: bucketCount(this.recordsByKey.size),
				});
				return this.getDiagnostics();
			}
			await checkDbHealth();
			if (!db.isOpen()) await db.open();
			let records: OperationalCustomerRecord[] = await db
				.table("operational_customers")
				.where("scope")
				.equals(resolvedScope)
				.toArray();
			if (!records.length) {
				const rebuildMetric = startPerfMeasure("pos.customers.index_build" as PerfMetricName, {
					source: "raw_customers",
				});
				const rawRows = await db.table("customers").toArray();
				records = rawRows
					.map((row: RawCustomer) => buildOperationalCustomerRecord(row, resolvedScope))
					.filter((row): row is OperationalCustomerRecord => !!row);
				if (records.length) {
					await safeBulkPut("operational_customers", records);
				}
				rebuildMetric.finish("success", {
					customer_result_count: bucketCount(records.length),
				});
			}
			this.rebuild(records, resolvedScope, started);
			this.diagnostics.lastHydratedAt = nowIso();
			this.diagnostics.lastHydrateDurationMs = performance.now() - started;
			metric.finish("success", {
				cache_hit: records.length > 0,
				customer_result_count: bucketCount(records.length),
			});
			return this.getDiagnostics();
		} catch (error) {
			this.diagnostics.ready = false;
			this.diagnostics.lastBlockingReason = "hydrate_failed";
			metric.fail(error);
			throw error;
		}
	}

	async upsertRawCustomers(customers: RawCustomer[], scope = "") {
		const resolvedScope = normalizeScope(scope);
		const metric = startPerfMeasure("pos.customers.index_commit" as PerfMetricName, {
			source: "cache",
			customer_count_bucket: bucketCount(customers?.length || 0),
		});
		try {
			const records = (Array.isArray(customers) ? customers : [])
				.map((customer) => buildOperationalCustomerRecord(customer, resolvedScope))
				.filter((row): row is OperationalCustomerRecord => !!row);
			if (!records.length) {
				metric.finish("success", { customer_result_count: "0" });
				return this.getDiagnostics();
			}
			await safeBulkPut("operational_customers", records);
			if (this.diagnostics.scope === resolvedScope) {
				records.forEach((record) => this.indexRecord(record));
				this.diagnostics.generation += 1;
				this.diagnostics.indexedCustomerCount = this.recordsByKey.size;
				this.diagnostics.mobileCount = this.exactMobile.size;
				this.diagnostics.lastDeltaAppliedAt = nowIso();
			}
			metric.finish("success", {
				customer_result_count: bucketCount(records.length),
			});
			return this.getDiagnostics();
		} catch (error) {
			metric.fail(error);
			throw error;
		}
	}

	async deleteCustomersByNames(names: string[], scope = "") {
		const resolvedScope = normalizeScope(scope);
		const keys = unique(names).map((name) => `${resolvedScope}::${name}`);
		if (!keys.length) return this.getDiagnostics();
		await safeBulkDelete("operational_customers", keys);
		if (this.diagnostics.scope === resolvedScope) {
			keys.forEach((key) => this.recordsByKey.delete(key));
			this.orderedKeys = this.orderedKeys.filter((key) => this.recordsByKey.has(key));
			this.diagnostics.generation += 1;
			this.diagnostics.indexedCustomerCount = this.recordsByKey.size;
			this.diagnostics.mobileCount = this.exactMobile.size;
			this.diagnostics.lastDeltaAppliedAt = nowIso();
		}
		return this.getDiagnostics();
	}

	searchCustomersLocal(query: string, options: CustomerSearchOptions = {}) {
		const scope = normalizeScope(options.scope);
		const limit = Math.max(1, Math.min(Number(options.limit || DEFAULT_SEARCH_LIMIT), MAX_SEARCH_LIMIT));
		const offset = Math.max(0, Number(options.offset || 0));
		const metric = startPerfMeasure("pos.customers.query_autocomplete" as PerfMetricName, {
			source: "local",
			cache_hit: this.assertReady(scope),
		});
		const legacyMetric = startPerfMeasure("pos.customers.local_search", {
			source: "local",
			cache_hit: this.assertReady(scope),
		});
		try {
			const normalized = normalizeCustomerSearchValue(query);
			const phone = normalizePhone(query);
			let candidateKeys: string[] = [];
			const seen = new Set<string>();
			const add = (key?: string | null) => {
				if (!key || seen.has(key)) return;
				const record = this.recordsByKey.get(key);
				if (!record || record.disabled) return;
				if (!options.includePending && record.pending_sync && !record.name) return;
				seen.add(key);
				candidateKeys.push(key);
			};

			if (!normalized && !phone) {
				this.orderedKeys.forEach(add);
			} else {
				add(this.exactByName.get(normalizeExactKey(query)));
				if (phone) add(this.exactMobile.get(phone));
				const prefixSet = this.prefixIndex.get(phone || normalized);
				prefixSet?.forEach(add);
				tokenize(normalized).forEach((token) => {
					this.prefixIndex.get(token)?.forEach(add);
				});
			}

			if (offset || candidateKeys.length > limit) {
				candidateKeys = candidateKeys.slice(offset, offset + limit);
			}
			const result = candidateKeys.map((key) => toVisibleCustomer(this.recordsByKey.get(key)!));
			const tags = { customer_result_count: bucketCount(result.length) };
			metric.finish("success", tags);
			legacyMetric.finish("success", tags);
			return result;
		} catch (error) {
			metric.fail(error);
			legacyMetric.fail(error);
			throw error;
		}
	}

	lookupCustomerExact(customerKey: string, scope = "") {
		const resolvedScope = normalizeScope(scope);
		const metric = startPerfMeasure("pos.customers.query_exact" as PerfMetricName, {
			source: "local",
			cache_hit: this.assertReady(resolvedScope),
		});
		try {
			if (!this.assertReady(resolvedScope)) {
				metric.finish("success", { cache_hit: false });
				return null;
			}
			const key = this.exactByName.get(normalizeExactKey(customerKey));
			const result = key ? this.recordsByKey.get(key) || null : null;
			metric.finish("success", { cache_hit: !!result });
			return result ? toVisibleCustomer(result) : null;
		} catch (error) {
			metric.fail(error);
			throw error;
		}
	}

	lookupCustomerByMobileExact(mobile: string, scope = "") {
		const resolvedScope = normalizeScope(scope);
		const metric = startPerfMeasure("pos.customers.query_mobile_exact" as PerfMetricName, {
			source: "local",
			cache_hit: this.assertReady(resolvedScope),
		});
		try {
			if (!this.assertReady(resolvedScope)) {
				metric.finish("success", { cache_hit: false });
				return null;
			}
			const key = this.exactMobile.get(normalizePhone(mobile));
			const result = key ? this.recordsByKey.get(key) || null : null;
			metric.finish("success", { cache_hit: !!result });
			return result ? toVisibleCustomer(result) : null;
		} catch (error) {
			metric.fail(error);
			throw error;
		}
	}

	async applyCustomerDeltas(batch: CustomerDeltaBatch) {
		const metric = startPerfMeasure("pos.customers.delta_apply" as PerfMetricName, {
			source: batch.source || "sync",
			customer_count_bucket: bucketCount(batch.changed?.length || 0),
		});
		try {
			if (batch.changed?.length) await this.upsertRawCustomers(batch.changed, batch.scope);
			if (batch.deletedCustomerNames?.length) await this.deleteCustomersByNames(batch.deletedCustomerNames, batch.scope);
			this.diagnostics.fullReloadAvoidedCount += 1;
			this.diagnostics.lastDeltaAppliedAt = nowIso();
			startPerfMeasure("pos.customers.full_reload_avoided" as PerfMetricName, {
				source: batch.source || "sync",
			}).finish("success");
			metric.finish("success", {
				customer_result_count: bucketCount(batch.changed?.length || 0),
				deleted_count: bucketCount(batch.deletedCustomerNames?.length || 0),
			});
			return this.getDiagnostics();
		} catch (error) {
			metric.fail(error);
			throw error;
		}
	}
}

export const localCustomerEngine = new LocalCustomerEngine();

export function resetCustomerEngine(scope: string | null = null) {
	localCustomerEngine.reset(scope);
}

export function getCustomerEngineDiagnostics() {
	return localCustomerEngine.getDiagnostics();
}

export async function hydrateOperationalCustomerIndex(scope = "") {
	return localCustomerEngine.hydrate(scope);
}

export async function getOperationalCustomerCountByScope(scope = "") {
	const metric = startPerfMeasure("pos.offline.db_schema_open", {
		table: "operational_customers",
		source: "count",
	});
	try {
		await checkDbHealth();
		if (!db.isOpen()) await db.open();
		const count = await db
			.table("operational_customers")
			.where("scope")
			.equals(normalizeScope(scope))
			.count();
		metric.finish("success", {
			customer_result_count: bucketCount(count),
		});
		return count;
	} catch (error) {
		metric.fail(error);
		return 0;
	}
}

export async function saveOperationalCustomersFromRaw(customers: RawCustomer[], scope = "") {
	return localCustomerEngine.upsertRawCustomers(customers, scope);
}

export async function deleteOperationalCustomersByNames(names: string[], scope = "") {
	return localCustomerEngine.deleteCustomersByNames(names, scope);
}

export function searchCustomersLocal(query: string, options: CustomerSearchOptions = {}) {
	return localCustomerEngine.searchCustomersLocal(query, options);
}

export function lookupCustomerExact(customerKey: string, scope = "") {
	return localCustomerEngine.lookupCustomerExact(customerKey, scope);
}

export function lookupCustomerByMobileExact(mobile: string, scope = "") {
	return localCustomerEngine.lookupCustomerByMobileExact(mobile, scope);
}

export async function applyCustomerDeltas(batch: CustomerDeltaBatch) {
	return localCustomerEngine.applyCustomerDeltas(batch);
}

export async function upsertOfflineCreatedCustomer(customer: RawCustomer, scope = "") {
	const metric = startPerfMeasure("pos.customers.offline_create" as PerfMetricName, {
		source: "local",
	});
	try {
		const row = {
			...customer,
			pending_sync: true,
			offline_created: true,
			modified: customer?.modified || nowIso(),
		};
		const result = await saveOperationalCustomersFromRaw([row], scope);
		metric.finish("success");
		return result;
	} catch (error) {
		metric.fail(error);
		throw error;
	}
}

export async function reconcileSyncedOfflineCustomer(localId: string, serverCustomer: RawCustomer, scope = "") {
	const metric = startPerfMeasure("pos.customers.offline_reconcile" as PerfMetricName, {
		source: "sync",
	});
	try {
		const changed = serverCustomer?.name ? [serverCustomer] : [];
		const deleted = localId && serverCustomer?.name !== localId ? [localId] : [];
		const result = await localCustomerEngine.applyCustomerDeltas({
			scope,
			changed,
			deletedCustomerNames: deleted,
			source: "offline_reconcile",
		});
		metric.finish("success");
		return result;
	} catch (error) {
		metric.fail(error);
		throw error;
	}
}
