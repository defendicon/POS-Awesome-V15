export type PosStartupStage =
	| "idle"
	| "register"
	| "catalog"
	| "ready"
	| "degraded"
	| "blocked";

export type PosStartupBlocker = {
	code: string;
	summary: string;
};

export type PosStartupTimelineEvent = {
	stage: PosStartupStage;
	at: string;
	blockerCode: string | null;
};

export type PosRegisterStartupResult = {
	status: "ready" | "degraded" | "blocked";
	data?: Record<string, unknown>;
	warningCodes?: string[];
	blocker?: PosStartupBlocker | null;
};

export type PosCatalogStartupResult = {
	status: "ready" | "degraded" | "blocked";
	sources: Record<string, string>;
	warningCodes?: string[];
	blocker?: PosStartupBlocker | null;
};

export type PosStartupState = {
	stage: PosStartupStage;
	blocker: PosStartupBlocker | null;
	timeline: PosStartupTimelineEvent[];
	registerResult: PosRegisterStartupResult | null;
	catalogResult: PosCatalogStartupResult | null;
	warningCodes: string[];
};
