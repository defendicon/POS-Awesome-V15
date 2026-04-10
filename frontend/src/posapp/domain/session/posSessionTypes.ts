import type { POSProfile } from "../../types/models";
import type { BootstrapSnapshot } from "../../../offline/bootstrapSnapshot";

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

export type PosSessionRegisterData = {
	pos_profile?: POSProfile | null;
	pos_opening_shift?: PosOpeningShift | null;
	[key: string]: any;
} | null;

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

export type RecoverPosSessionReadyResult = {
	status: "ready";
	source: PosSessionSource;
	session: ReadyPosSession;
	registerData: PosSessionRegisterData;
	bootstrapSnapshot: BootstrapSnapshot;
	warningCodes: string[];
};

export type RecoverPosSessionNeedsSetupResult = {
	status: "needs_register_setup";
	source: null;
	session: null;
	registerData: null;
	bootstrapSnapshot: BootstrapSnapshot | null;
	warningCodes: string[];
	message: string;
};

export type RecoverPosSessionResult =
	| RecoverPosSessionReadyResult
	| RecoverPosSessionNeedsSetupResult;
