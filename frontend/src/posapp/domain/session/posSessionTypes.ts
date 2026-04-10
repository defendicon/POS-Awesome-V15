import type { POSProfile } from "../../types/models";

export type PosSessionStage =
	| "recovering"
	| "ready"
	| "needs_register_setup"
	| "submitting_register_setup"
	| "closing_shift"
	| "blocked";

export type PosSessionSource =
	| "cache"
	| "server"
	| "register_setup"
	| "unknown";

export type PosOpeningShift = {
	name?: string | null;
	user?: string | null;
	[key: string]: any;
};

export type PosSessionBlocker = {
	code: string;
	summary: string;
};

export type ReadyPosSession = {
	posProfile: POSProfile;
	posOpeningShift: PosOpeningShift;
	source: PosSessionSource;
};

export type PosSessionState = {
	stage: PosSessionStage;
	posProfile: POSProfile | null;
	posOpeningShift: PosOpeningShift | null;
	source: PosSessionSource | null;
	message: string | null;
	blocker: PosSessionBlocker | null;
};
