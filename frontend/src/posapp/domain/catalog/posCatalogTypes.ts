export type PosCatalogStage =
	| "idle"
	| "starting"
	| "loading-items"
	| "searching"
	| "adding-item"
	| "loading-details"
	| "ready"
	| "degraded"
	| "blocked";

export type PosCatalogStatus =
	| "idle"
	| "loading"
	| "ready"
	| "degraded"
	| "blocked";

export type PosCatalogViewMode = "cards" | "table";

export type PosCatalogItem = {
	item_code?: string;
	item_name?: string;
	item_group?: string;
	[key: string]: unknown;
};

export type PosCatalogBlocker = {
	code: string;
	summary: string;
};

export type PosCatalogTimelineEvent = {
	stage: PosCatalogStage;
	at: string;
	blockerCode: string | null;
};

export type PosCatalogState = {
	stage: PosCatalogStage;
	status: PosCatalogStatus;
	blocker: PosCatalogBlocker | null;
	timeline: PosCatalogTimelineEvent[];
	preferredView: PosCatalogViewMode;
	highlightedItemCode: string | null;
	selectedItemCode: string | null;
	searchTerm: string;
	activeGroup: string;
	displayedItems: PosCatalogItem[];
	profileName: string | null;
	warehouse: string | null;
};
