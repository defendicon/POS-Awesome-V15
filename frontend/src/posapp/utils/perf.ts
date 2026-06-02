/**
 * Lightweight POS performance telemetry.
 *
 * Metrics are kept in a bounded in-memory buffer and are disabled by default
 * unless explicitly enabled through configuration, localStorage, URL query, or
 * the developer profiler helper.
 */

export type PerfStatus = "success" | "failure";

export type PerfTagValue = string | number | boolean | null | undefined;
export type PerfTags = Record<string, PerfTagValue>;

export type PerfMetricName =
	| "pos.app.mount"
	| "pos.boot.total"
	| "pos.boot.shell_visible"
	| "pos.boot.manifest_read"
	| "pos.boot.manifest_validate"
	| "pos.boot.local_snapshot_read"
	| "pos.boot.snapshot_hydrate"
	| "pos.boot.snapshot_rebuild"
	| "pos.boot.profile_load"
	| "pos.boot.payment_methods_load"
	| "pos.boot.currency_load"
	| "pos.boot.item_cache_ready"
	| "pos.boot.customer_cache_ready"
	| "pos.boot.local_sell_ready"
	| "pos.boot.sell_ready"
	| "pos.boot.remote_refresh_start"
	| "pos.boot.remote_refresh_complete"
	| "pos.boot.fresh_sell_ready"
	| "pos.boot.degraded_sell_ready"
	| "pos.boot.blocked_no_valid_snapshot"
	| "pos.boot.critical_resource_wait"
	| "pos.boot.index_hydrate"
	| "pos.boot.index_rebuild"
	| "pos.boot.reconciliation_apply"
	| "pos.boot.snapshot_atomic_commit"
	| "pos.items.initial_load"
	| "pos.items.delta_sync"
	| "pos.items.local_search"
	| "pos.items.remote_search"
	| "pos.items.barcode_lookup"
	| "pos.items.add_to_cart"
	| "pos.items.price_refresh"
	| "pos.inventory.engine_init"
	| "pos.inventory.index_hydrate"
	| "pos.inventory.index_build"
	| "pos.inventory.index_commit"
	| "pos.inventory.index_memory_estimate"
	| "pos.inventory.query_exact_item_code"
	| "pos.inventory.query_barcode_exact"
	| "pos.inventory.query_autocomplete"
	| "pos.inventory.query_remote_fallback"
	| "pos.inventory.rate_lookup_local"
	| "pos.inventory.rate_lookup_remote"
	| "pos.inventory.delta_items_apply"
	| "pos.inventory.delta_barcodes_apply"
	| "pos.inventory.delta_rates_apply"
	| "pos.inventory.delta_stock_apply"
	| "pos.inventory.active_cart_refresh"
	| "pos.inventory.worker_build"
	| "pos.inventory.full_reload_avoided"
	| "pos.customers.initial_load"
	| "pos.customers.delta_sync"
	| "pos.customers.local_search"
	| "pos.customers.remote_search"
	| "pos.customers.select"
	| "pos.customers.engine_init"
	| "pos.customers.index_hydrate"
	| "pos.customers.index_build"
	| "pos.customers.index_commit"
	| "pos.customers.query_exact"
	| "pos.customers.query_mobile_exact"
	| "pos.customers.query_autocomplete"
	| "pos.customers.query_remote_fallback"
	| "pos.customers.details_cache_hit"
	| "pos.customers.details_load"
	| "pos.customers.balance_cache_hit"
	| "pos.customers.balance_load"
	| "pos.customers.balance_stale_display"
	| "pos.customers.offline_create"
	| "pos.customers.offline_reconcile"
	| "pos.customers.delta_apply"
	| "pos.customers.realtime_invalidate"
	| "pos.customers.full_reload_avoided"
	| "pos.customers.selection_rule_apply"
	| "pos.pricing.calculate_cart"
	| "pos.pricing.calculate_line"
	| "pos.pricing.rules_load"
	| "pos.pricing.promotion_apply"
	| "pos.pricing.coupon_apply"
	| "pos.pricing.recalculate_after_quantity_change"
	| "pos.currency.bootstrap"
	| "pos.currency.exchange_rate_load"
	| "pos.currency.change_transaction_currency"
	| "pos.currency.payment_conversion"
	| "pos.payment.screen_open"
	| "pos.payment.recalculate"
	| "pos.payment.submit"
	| "pos.offline.db_open"
	| "pos.offline.snapshot_hydrate"
	| "pos.offline.outbox_enqueue"
	| "pos.offline.sync_start"
	| "pos.offline.sync_mutation"
	| "pos.offline.sync_complete"
	| "pos.offline.conflict_detected"
	| "pos.realtime.connect"
	| "pos.realtime.reconnect"
	| "pos.realtime.invalidation_received"
	| "pos.realtime.delta_applied"
	| "pos.ui.cart_render"
	| "pos.ui.item_list_render"
	| "pos.ui.customer_list_render"
	| "pos.ui.payment_render"
	| `pos.api.${string}`
	| `pos.${string}`;

export type PerfEvent = {
	id: number;
	name: PerfMetricName;
	startedAt: number;
	endedAt: number;
	durationMs: number;
	status: PerfStatus;
	tags: PerfTags;
	errorCode?: string;
};

export type PerfSummary = {
	name: string;
	count: number;
	failures: number;
	p50: number | null;
	p95: number | null;
	p99: number | null;
	latest: number;
	slowest: number;
};

export type PerfConfig = {
	enabled: boolean;
	debug: boolean;
	sampleRate: number;
	bufferSize: number;
};

const hasWindow = typeof window !== "undefined";
const hasPerformance = typeof performance !== "undefined";
const DEFAULT_BUFFER_SIZE = 500;
const DEFAULT_CONFIG: PerfConfig = {
	enabled: false,
	debug: false,
	sampleRate: 1,
	bufferSize: DEFAULT_BUFFER_SIZE,
};

let sequence = 0;
let activeSequence = 0;
let config: PerfConfig = readInitialConfig();
let events: PerfEvent[] = [];
let listeners = new Set<() => void>();
let longTaskCleanup: (() => void) | null = null;
const legacyMeasurements = new Map<string, PerfMeasurement>();

function now() {
	return hasPerformance && performance.now ? performance.now() : Date.now();
}

function clampSampleRate(value: unknown) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 1;
	return Math.max(0, Math.min(parsed, 1));
}

function readInitialConfig(): PerfConfig {
	if (!hasWindow) return { ...DEFAULT_CONFIG };
	const search = new URLSearchParams(window.location.search || "");
	const storageEnabled = window.localStorage?.getItem("posa_perf_enabled");
	const queryEnabled = search.get("posa_perf") || search.get("perf");
	const debug =
		search.get("posa_perf_debug") === "1" ||
		window.localStorage?.getItem("posa_perf_debug") === "1";
	const sampleRate =
		search.get("posa_perf_sample") ||
		window.localStorage?.getItem("posa_perf_sample") ||
		"1";
	return {
		enabled:
			queryEnabled === "1" ||
			storageEnabled === "1" ||
			Boolean((window as any).__PROF__),
		debug,
		sampleRate: clampSampleRate(sampleRate),
		bufferSize: DEFAULT_BUFFER_SIZE,
	};
}

function emitChange() {
	listeners.forEach((listener) => listener());
}

function sanitizeTagValue(value: PerfTagValue): string | number | boolean | null {
	if (value === undefined) return null;
	if (typeof value === "string") {
		return value.length > 80 ? `${value.slice(0, 77)}...` : value;
	}
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}
	if (typeof value === "boolean" || value === null) return value;
	return String(value);
}

export function bucketCount(count: unknown): string {
	const value = Number(count);
	if (!Number.isFinite(value) || value < 0) return "unknown";
	if (value === 0) return "0";
	if (value <= 5) return "1-5";
	if (value <= 20) return "6-20";
	if (value <= 100) return "21-100";
	if (value <= 1000) return "101-1000";
	return "1000+";
}

export function safePerfTags(tags: PerfTags = {}): PerfTags {
	const safe: PerfTags = {};
	Object.entries(tags).forEach(([key, value]) => {
		if (!key) return;
		safe[key] = sanitizeTagValue(value);
	});
	return safe;
}

function shouldRecord() {
	return config.enabled && Math.random() <= config.sampleRate;
}

function pushEvent(event: PerfEvent) {
	events.push(event);
	const excess = events.length - config.bufferSize;
	if (excess > 0) events.splice(0, excess);
	if (config.debug && typeof console !== "undefined") {
		console.info("[POS_PERF]", event.name, {
			durationMs: event.durationMs,
			status: event.status,
			tags: event.tags,
		});
	}
	emitChange();
}

export function configurePerfMonitor(options: Partial<PerfConfig>) {
	config = {
		...config,
		...options,
		sampleRate:
			options.sampleRate === undefined
				? config.sampleRate
				: clampSampleRate(options.sampleRate),
		bufferSize: Math.max(25, Number(options.bufferSize || config.bufferSize)),
	};
	if (events.length > config.bufferSize) {
		events.splice(0, events.length - config.bufferSize);
	}
	if (hasWindow) {
		(window as any).__PROF__ = config.enabled;
	}
}

export function getPerfConfig(): PerfConfig {
	return { ...config };
}

export function isPerfEnabled(): boolean {
	return config.enabled;
}

export function getPerfEvents(): PerfEvent[] {
	return events.slice();
}

export function resetPerfEvents() {
	events = [];
	emitChange();
}

export function subscribePerfEvents(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export type PerfMeasurement = {
	name: PerfMetricName;
	startedAt: number;
	tags: PerfTags;
	mark?: string;
	finish: (_statusOrTags?: PerfStatus | PerfTags, _tags?: PerfTags) => PerfEvent | null;
	fail: (_error?: unknown, _tags?: PerfTags) => PerfEvent | null;
};

export function startPerfMeasure(
	name: PerfMetricName,
	tags: PerfTags = {},
): PerfMeasurement {
	const startedAt = now();
	const active = shouldRecord();
	const measurementId = ++activeSequence;
	const mark = active ? `${name}:${measurementId}:start` : undefined;
	let closed = false;
	if (active && hasPerformance && performance.mark && mark) {
		try {
			performance.mark(mark);
		} catch {
			// Marking is best-effort; the event buffer remains authoritative.
		}
	}

	const finish = (
		statusOrTags: PerfStatus | PerfTags = "success",
		extraTags: PerfTags = {},
		errorCode?: string,
	): PerfEvent | null => {
		if (!active || closed) return null;
		closed = true;
		const endedAt = now();
		const status =
			typeof statusOrTags === "string" ? statusOrTags : "success";
		const finalTags =
			typeof statusOrTags === "string"
				? { ...tags, ...extraTags }
				: { ...tags, ...statusOrTags };
		const endMark = `${name}:${measurementId}:end`;
		if (hasPerformance && performance.mark && performance.measure && mark) {
			try {
				performance.mark(endMark);
				performance.measure(name, mark, endMark);
			} catch {
				// Ignore Performance API failures in restricted browsers.
			} finally {
				performance.clearMarks?.(mark);
				performance.clearMarks?.(endMark);
			}
		}
		const event: PerfEvent = {
			id: ++sequence,
			name,
			startedAt,
			endedAt,
			durationMs: Number((endedAt - startedAt).toFixed(2)),
			status,
			tags: safePerfTags({ ...finalTags, status }),
			errorCode,
		};
		pushEvent(event);
		return event;
	};

	return {
		name,
		startedAt,
		tags: safePerfTags(tags),
		mark,
		finish: (statusOrTags?: PerfStatus | PerfTags, extraTags?: PerfTags) =>
			finish(statusOrTags, extraTags),
		fail: (error?: unknown, extraTags: PerfTags = {}) =>
			finish("failure", extraTags, errorToCode(error)),
	};
}

export async function measureAsync<T>(
	name: PerfMetricName,
	tags: PerfTags,
	fn: () => Promise<T>,
): Promise<T> {
	const metric = startPerfMeasure(name, tags);
	try {
		const result = await fn();
		metric.finish("success");
		return result;
	} catch (error) {
		metric.fail(error);
		throw error;
	}
}

export function measureSync<T>(
	name: PerfMetricName,
	tags: PerfTags,
	fn: () => T,
): T {
	const metric = startPerfMeasure(name, tags);
	try {
		const result = fn();
		metric.finish("success");
		return result;
	} catch (error) {
		metric.fail(error);
		throw error;
	}
}

function errorToCode(error: unknown): string {
	if (!error) return "UNKNOWN";
	if (typeof error === "object" && "code" in error) {
		return String((error as any).code || "UNKNOWN");
	}
	if (error instanceof Error && error.name) {
		return error.name;
	}
	return "ERROR";
}

function percentile(values: number[], pct: number) {
	if (!values.length) return null;
	const index = Math.ceil((pct / 100) * values.length) - 1;
	return values[Math.max(0, Math.min(index, values.length - 1))] ?? null;
}

export function getPerfSummaries(): PerfSummary[] {
	const groups = new Map<string, PerfEvent[]>();
	events.forEach((event) => {
		const group = groups.get(event.name) || [];
		group.push(event);
		groups.set(event.name, group);
	});
	return Array.from(groups.entries())
		.map(([name, group]) => {
			const durations = group
				.map((event) => event.durationMs)
				.sort((a, b) => a - b);
			const latest = group[group.length - 1]?.durationMs || 0;
			return {
				name,
				count: group.length,
				failures: group.filter((event) => event.status === "failure").length,
				p50: percentile(durations, 50),
				p95: percentile(durations, 95),
				p99: percentile(durations, 99),
				latest,
				slowest: durations[durations.length - 1] || 0,
			};
		})
		.sort((a, b) => b.slowest - a.slowest);
}

export function recordPerfEvent(
	name: PerfMetricName,
	durationMs: number,
	status: PerfStatus = "success",
	tags: PerfTags = {},
) {
	if (!shouldRecord()) return null;
	const endedAt = now();
	const event: PerfEvent = {
		id: ++sequence,
		name,
		startedAt: endedAt - durationMs,
		endedAt,
		durationMs: Number(durationMs.toFixed(2)),
		status,
		tags: safePerfTags({ ...tags, status }),
	};
	pushEvent(event);
	return event;
}

function markName(label: string, suffix: string): string {
	return `${label}-${suffix}`;
}

export function perfMarkStart(label: string): string | null {
	const measurement = startPerfMeasure(label as PerfMetricName);
	const key = measurement.mark || markName(label, `${activeSequence}:start`);
	legacyMeasurements.set(key, measurement);
	return key;
}

export function perfMarkEnd(label: string, startMark?: string | null): void {
	const key = startMark || "";
	const measurement = legacyMeasurements.get(key);
	if (measurement) {
		measurement.finish("success");
		legacyMeasurements.delete(key);
		return;
	}
	recordPerfEvent(label as PerfMetricName, 0, "success");
}

export function withPerf<T extends (..._args: any[]) => any>(
	label: string,
	fn: T,
): T {
	return function withPerfWrapper(this: any, ...args: any[]) {
		const metric = startPerfMeasure(label as PerfMetricName);
		try {
			const result = fn.apply(this, args);
			if (result && typeof result.then === "function") {
				return result
					.then((value: any) => {
						metric.finish("success");
						return value;
					})
					.catch((error: unknown) => {
						metric.fail(error);
						throw error;
					});
			}
			metric.finish("success");
			return result;
		} catch (error) {
			metric.fail(error);
			throw error;
		}
	} as T;
}

export function scheduleFrame(callback?: () => void): Promise<void> {
	return new Promise((resolve) => {
		const scheduler =
			typeof requestAnimationFrame === "function"
				? requestAnimationFrame
				: (cb: FrameRequestCallback) => setTimeout(cb, 16);
		scheduler(() => {
			if (callback) callback();
			resolve();
		});
	});
}

export function initLongTaskObserver(
	label: string = "pos-long-task",
): () => void {
	if (!isPerfEnabled() || typeof PerformanceObserver === "undefined") {
		return () => {};
	}
	if (longTaskCleanup) return longTaskCleanup;
	try {
		const observer = new PerformanceObserver((list) => {
			list.getEntries().forEach((entry) => {
				recordPerfEvent("pos.ui.long_task", entry.duration, "success", {
					source: label,
				});
			});
		});
		observer.observe({ entryTypes: ["longtask"] });
		longTaskCleanup = () => observer.disconnect();
	} catch {
		longTaskCleanup = () => {};
	}
	return longTaskCleanup;
}

export function logComponentRender(
	_vm: any,
	componentName: string,
	phase: string,
	details: Record<string, any> = {},
): void {
	if (!isPerfEnabled()) return;
	const nameByComponent: Record<string, PerfMetricName> = {
		Invoice: "pos.ui.cart_render",
		ItemsSelector: "pos.ui.item_list_render",
		Customer: "pos.ui.customer_list_render",
		Payments: "pos.ui.payment_render",
		PayView: "pos.ui.payment_render",
	};
	recordPerfEvent(nameByComponent[componentName] || "pos.ui.render", 0, "success", {
		component: componentName,
		phase,
		...details,
	});
}

export function attachProfilerHelpers(): void {
	if (!hasWindow) return;
	(window as any).__POS_PERF__ = {
		enable(options: Partial<PerfConfig> = {}) {
			configurePerfMonitor({ enabled: true, ...options });
			window.localStorage?.setItem("posa_perf_enabled", "1");
			return initLongTaskObserver();
		},
		disable() {
			configurePerfMonitor({ enabled: false });
			window.localStorage?.removeItem("posa_perf_enabled");
			if (longTaskCleanup) {
				longTaskCleanup();
				longTaskCleanup = null;
			}
		},
		configure: configurePerfMonitor,
		events: getPerfEvents,
		summaries: getPerfSummaries,
		reset: resetPerfEvents,
	};
	(window as any).__POS_PROFILER__ = (window as any).__POS_PROFILER__ || {
		enable: (options?: Partial<PerfConfig>) =>
			(window as any).__POS_PERF__.enable(options),
		disable: () => (window as any).__POS_PERF__.disable(),
		initLongTaskObserver,
	};
}
