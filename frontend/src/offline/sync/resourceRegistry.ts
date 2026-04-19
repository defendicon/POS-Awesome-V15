/**
 * Static registry of all offline sync resource definitions.
 *
 * This is the single source of truth for **what** gets synced, **when**, and **how**.
 * `SyncCoordinator` reads these definitions at startup to build its internal state
 * map and to determine which resources to process on each trigger event.
 *
 * ## Priorities
 * Resources are processed in priority order within each trigger run:
 *
 * - **`"boot_critical"`** — must succeed before the POS is usable offline. These run
 *   first and block the boot sequence. Failures here put the POS into `"limited"` mode.
 *   All boot-critical resources include `"boot"` as a trigger.
 *
 * - **`"warm"`** — important but not blocking. Synced after all boot-critical resources
 *   complete. Warm resources do NOT include `"boot"` — they are not part of the initial
 *   boot sequence and only run on subsequent triggers (`online_resume`, `timer`, etc.).
 *
 * - **`"lazy"`** — fetched only on explicit user action. Always `mode: "on_demand"` and
 *   `fullResyncSupported: false`. Never scheduled automatically by the coordinator.
 *
 * ## Triggers
 * Each resource lists the {@link SyncTrigger} events that cause it to sync:
 * - `"boot"` — app startup (boot-critical resources only).
 * - `"online_resume"` — network connection regained.
 * - `"timer"` — periodic background tick.
 * - `"profile_change"` — POS profile switched mid-session.
 * - `"user_action"` — explicit operator-initiated refresh.
 *
 * ## Modes
 * - `"delta"` — fetches only records changed since the stored watermark timestamp.
 * - `"scoped"` — fetches all records matching the current profile/company scope.
 * - `"on_demand"` — never scheduled; only fetched when explicitly requested.
 *
 * ## Adding a new resource
 * 1. Add its ID to `SyncResourceId` in `types.ts`.
 * 2. Create a sync adapter in `adapters/` that fetches data and writes to IndexedDB.
 * 3. Add a `SyncResourceDefinition` entry below. Key decisions:
 *    - **Priority**: prefer `"warm"` unless the resource is required for offline sell.
 *      Every `"boot_critical"` addition increases startup time.
 *    - **Triggers**: include `"boot"` only for `"boot_critical"` resources. Include
 *      `"timer"` only if periodic background refresh is meaningful for this data type.
 *    - **Mode**: use `"on_demand"` for customer-scoped data that changes per transaction.
 *    - **`fullResyncSupported`**: set to `false` for `"on_demand"` resources where a
 *      full re-fetch is unsafe or the data scope cannot be enumerated server-side.
 *    - **`storageKey`**: must match the IndexedDB store name used by the adapter.
 *
 * @module offline/sync/resourceRegistry
 */

import type {
	SyncResourceDefinition,
	SyncResourcePriority,
	SyncTrigger,
} from "./types";

const SYNC_RESOURCES: ReadonlyArray<SyncResourceDefinition> = Object.freeze([
	{
		id: "bootstrap_config",
		scope: "profile",
		mode: "delta",
		priority: "boot_critical",
		triggers: ["boot", "online_resume", "profile_change", "user_action"],
		storageKey: "bootstrap_snapshot",
		watermarkType: "timestamp",
		fullResyncSupported: true,
	},
	{
		id: "price_list_meta",
		scope: "profile",
		mode: "delta",
		priority: "boot_critical",
		triggers: ["boot", "online_resume", "profile_change", "user_action"],
		storageKey: "price_list_meta_cache",
		watermarkType: "timestamp",
		fullResyncSupported: true,
	},
	{
		id: "currency_matrix",
		scope: "profile",
		mode: "scoped",
		priority: "boot_critical",
		triggers: ["boot", "online_resume", "profile_change", "user_action"],
		storageKey: "exchange_rate_cache",
		watermarkType: "timestamp",
		fullResyncSupported: true,
	},
	{
		id: "payment_method_currencies",
		scope: "company",
		mode: "delta",
		priority: "boot_critical",
		triggers: ["boot", "online_resume", "profile_change", "user_action"],
		storageKey: "payment_method_currency_cache",
		watermarkType: "timestamp",
		fullResyncSupported: true,
	},
	{
		id: "item_groups",
		scope: "profile",
		mode: "delta",
		priority: "boot_critical",
		triggers: ["boot", "online_resume", "profile_change", "user_action"],
		storageKey: "item_groups_cache",
		watermarkType: "timestamp",
		fullResyncSupported: true,
	},
	{
		id: "offers",
		scope: "profile",
		mode: "delta",
		priority: "boot_critical",
		triggers: ["boot", "online_resume", "profile_change", "user_action"],
		storageKey: "offers_cache",
		watermarkType: "timestamp",
		fullResyncSupported: true,
	},
	{
		id: "items",
		scope: "profile",
		mode: "delta",
		priority: "warm",
		triggers: ["online_resume", "timer", "profile_change", "user_action"],
		storageKey: "items",
		watermarkType: "timestamp",
		fullResyncSupported: true,
	},
	{
		id: "item_prices",
		scope: "profile",
		mode: "delta",
		priority: "warm",
		triggers: ["online_resume", "timer", "profile_change", "user_action"],
		storageKey: "item_details_cache",
		watermarkType: "timestamp",
		fullResyncSupported: true,
	},
	{
		id: "stock",
		scope: "profile",
		mode: "delta",
		priority: "warm",
		triggers: ["online_resume", "timer", "profile_change", "user_action"],
		storageKey: "local_stock_cache",
		watermarkType: "timestamp",
		fullResyncSupported: true,
	},
	{
		id: "customers",
		scope: "company",
		mode: "delta",
		priority: "warm",
		triggers: ["online_resume", "timer", "profile_change", "user_action"],
		storageKey: "customer_storage",
		watermarkType: "timestamp",
		fullResyncSupported: true,
	},
	{
		id: "customer_addresses",
		scope: "customer",
		mode: "on_demand",
		priority: "lazy",
		triggers: ["user_action"],
		storageKey: "customer_addresses_cache",
		watermarkType: "timestamp",
		fullResyncSupported: false,
	},
	{
		id: "delivery_charges",
		scope: "customer",
		mode: "on_demand",
		priority: "lazy",
		triggers: ["user_action"],
		storageKey: "delivery_charges_cache",
		watermarkType: "timestamp",
		fullResyncSupported: false,
	},
]);

/**
 * Returns a shallow copy of all resource definitions with cloned `triggers` arrays.
 * Callers receive mutable copies so that the frozen registry cannot be accidentally mutated.
 */
export function getSyncResourceDefinitions(): SyncResourceDefinition[] {
	return SYNC_RESOURCES.map((resource) => ({
		...resource,
		triggers: [...resource.triggers],
	}));
}

/**
 * Returns all resource definitions with the given `priority`.
 * Used by `SyncCoordinator` to process resources in priority order
 * (`"boot_critical"` → `"warm"` → `"lazy"`).
 */
export function getSyncResourcesByPriority(
	priority: SyncResourcePriority,
): SyncResourceDefinition[] {
	return getSyncResourceDefinitions().filter(
		(resource) => resource.priority === priority,
	);
}

/**
 * Returns all resource definitions whose `triggers` array includes `trigger`.
 * Used by `SyncCoordinator` at the start of each trigger run to build
 * the work list for that event.
 */
export function getSyncResourcesForTrigger(
	trigger: SyncTrigger,
): SyncResourceDefinition[] {
	return getSyncResourceDefinitions().filter((resource) =>
		resource.triggers.includes(trigger),
	);
}
