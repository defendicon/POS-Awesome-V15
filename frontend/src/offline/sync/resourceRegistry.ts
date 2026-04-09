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

export function getSyncResourceDefinitions(): SyncResourceDefinition[] {
	return SYNC_RESOURCES.map((resource) => ({
		...resource,
		triggers: [...resource.triggers],
	}));
}

export function getSyncResourcesByPriority(
	priority: SyncResourcePriority,
): SyncResourceDefinition[] {
	return getSyncResourceDefinitions().filter(
		(resource) => resource.priority === priority,
	);
}

export function getSyncResourcesForTrigger(
	trigger: SyncTrigger,
): SyncResourceDefinition[] {
	return getSyncResourceDefinitions().filter((resource) =>
		resource.triggers.includes(trigger),
	);
}
