export type SyncResourceId =
	| "bootstrap_config"
	| "price_list_meta"
	| "currency_matrix"
	| "payment_method_currencies"
	| "item_groups"
	| "offers"
	| "items"
	| "item_prices"
	| "stock"
	| "customers"
	| "customer_addresses"
	| "delivery_charges";

export type SyncResourceMode = "delta" | "scoped" | "on_demand";

export type SyncResourcePriority = "boot_critical" | "warm" | "lazy";

export type SyncTrigger =
	| "boot"
	| "online_resume"
	| "timer"
	| "profile_change"
	| "user_action";

export type SyncLifecycleState =
	| "idle"
	| "syncing"
	| "fresh"
	| "stale"
	| "error"
	| "limited";

export interface SyncResourceDefinition {
	id: SyncResourceId;
	scope: "global" | "company" | "profile" | "customer";
	mode: SyncResourceMode;
	priority: SyncResourcePriority;
	triggers: SyncTrigger[];
	storageKey: string;
	watermarkType: "none" | "timestamp" | "cursor";
	fullResyncSupported: boolean;
	ttlMs?: number | null;
}

export interface SyncResourceState {
	resourceId: SyncResourceId;
	status: SyncLifecycleState;
	lastSyncedAt: string | null;
	watermark: string | null;
	lastSuccessHash: string | null;
	lastError: string | null;
	consecutiveFailures: number;
	scopeSignature: string | null;
	schemaVersion: string | null;
}
