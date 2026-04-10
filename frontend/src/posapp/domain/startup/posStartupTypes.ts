import type {
	BootstrapRuntimeDecision,
	BootstrapValidationResult,
} from "../../../offline/bootstrapSnapshot";

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

export type PosRegisterStartupData = {
	profileName: string | null;
	profileModified: string | null;
	openingShiftName: string | null;
	openingShiftUser: string | null;
};

export type PosRegisterStartupResult = {
	status: "ready" | "degraded" | "blocked";
	data?: PosRegisterStartupData;
	validation?: BootstrapValidationResult;
	runtime?: BootstrapRuntimeDecision;
	warningCodes?: string[];
	blocker?: PosStartupBlocker | null;
};

export type PosCatalogStartupResult = {
	status: "ready" | "degraded" | "blocked";
	sources: Record<string, string>;
	warningCodes?: string[];
	blocker?: PosStartupBlocker | null;
};

export type PosCatalogSourceProgress = {
	started: boolean;
	ready: boolean;
};

export type PosStartupState = {
	stage: PosStartupStage;
	blocker: PosStartupBlocker | null;
	timeline: PosStartupTimelineEvent[];
	registerResult: PosRegisterStartupResult | null;
	catalogResult: PosCatalogStartupResult | null;
	warningCodes: string[];
};
