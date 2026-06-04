/**
 * All registered offline-sync resource identifiers.
 * Each ID maps 1-to-1 with a {@link SyncResourceDefinition} in the resource registry.
 */
export type SyncResourceId =
	| "bootstrap_config"
	| "price_list_meta"
	| "currency_matrix"
	| "payment_method_currencies"
	| "item_groups"
	| "offers"
	| "pricing_rules"
	| "items"
	| "item_prices"
	| "stock"
	| "customers"
	| "invoice_outbox"
	| "customer_addresses"
	| "delivery_charges";

/**
 * How a resource is synchronised from the server:
 * - `"delta"` — fetch only records changed since the last watermark.
 * - `"scoped"` — fetch all records whose scope (profile/company/customer) matches the current session.
 * - `"on_demand"` — fetched only when explicitly requested, not on a schedule.
 */
export type SyncResourceMode = "delta" | "scoped" | "on_demand";

/**
 * Controls the order in which resources are processed within a single trigger run:
 * - `"boot_critical"` — must succeed before the POS is usable offline.
 * - `"warm"` — important but not blocking; synced after boot-critical resources.
 * - `"lazy"` — can be deferred until the app is idle.
 */
export type SyncResourcePriority = "boot_critical" | "warm" | "lazy";

/**
 * Events that can kick off a sync run:
 * - `"boot"` — app startup.
 * - `"online_resume"` — network connection regained.
 * - `"timer"` — periodic background tick.
 * - `"profile_change"` — POS profile switched mid-session.
 * - `"user_action"` — explicit user-initiated refresh.
 */
export type SyncTrigger =
	| "boot"
	| "online_resume"
	| "timer"
	| "profile_change"
	| "user_action";

/**
 * Per-resource lifecycle state exposed to the UI:
 * - `"idle"` — not yet synced in this session.
 * - `"syncing"` — fetch in progress.
 * - `"fresh"` — successfully synced and within TTL.
 * - `"stale"` — synced but TTL has expired.
 * - `"error"` — last sync attempt failed.
 * - `"limited"` — partial data available (e.g. scope mismatch).
 */
export type SyncLifecycleState =
	| "idle"
	| "syncing"
	| "fresh"
	| "stale"
	| "error"
	| "limited";

/**
 * Static definition of a single sync resource. Registered in `resourceRegistry.ts`
 * and consumed by `SyncCoordinator`.
 */
export interface SyncResourceDefinition {
	/** Unique identifier. */
	id: SyncResourceId;
	/** Data isolation boundary — determines the scope-signature used for cache invalidation. */
	scope: "global" | "company" | "profile" | "customer";
	/** Fetch strategy. */
	mode: SyncResourceMode;
	/** Execution priority within a trigger run. */
	priority: SyncResourcePriority;
	/** Which triggers activate this resource. */
	triggers: SyncTrigger[];
	/** IndexedDB/localStorage key prefix used by the adapter. */
	storageKey: string;
	/** Watermark type used for delta syncs. `"none"` means full-resync every time. */
	watermarkType: "none" | "timestamp" | "cursor";
	/** Whether the adapter supports full-resync (wiping and re-fetching all records). */
	fullResyncSupported: boolean;
	/** Optional TTL in milliseconds. `null` means no expiry. */
	ttlMs?: number | null;
}

/**
 * Runtime state of a single sync resource, persisted across page loads.
 * Returned by `SyncCoordinator.getResourceState()` and
 * `SyncCoordinator.getResourceStates()`.
 *
 * Timestamp fields use ISO-8601 strings. `watermark` stores the next delta cursor
 * or timestamp, `lastSuccessHash` skips no-op writes, failure fields drive retry
 * backoff, `scopeSignature` detects profile/company changes, and `schemaVersion`
 * triggers full resyncs after data-model changes.
 */
export interface SyncResourceState {
	resourceId: SyncResourceId;
	status: SyncLifecycleState;
	lastSyncedAt: string | null;
	watermark: string | null;
	lastSuccessHash: string | null;
	lastError: string | null;
	consecutiveFailures: number;
	lastAttemptAt?: string | null;
	nextRetryAt?: string | null;
	cooldownMs?: number | null;
	lastTrigger?: SyncTrigger | null;
	scopeSignature: string | null;
	schemaVersion: string | null;
}

export interface SyncTriggerResourceSummary {
	resourceId: SyncResourceId;
	priority: SyncResourcePriority;
	status: SyncLifecycleState;
	skipped: boolean;
	error: string | null;
}

export interface SyncTriggerRunSummary {
	trigger: SyncTrigger;
	startedAt: string;
	finishedAt: string;
	resourcesTotal: number;
	succeeded: number;
	failed: number;
	skipped: number;
	bootCriticalFailures: number;
	errors: Array<{
		resourceId: SyncResourceId;
		priority: SyncResourcePriority;
		message: string;
	}>;
	resources: SyncTriggerResourceSummary[];
}
