import {
	type BootstrapSnapshot,
	createBootstrapSnapshotFromRegisterData,
	resolveBootstrapRuntimeState,
	validateBootstrapSnapshot,
} from "../../../offline/bootstrapSnapshot";
import { getValidCachedOpeningForCurrentUser } from "../../utils/openingCache";

import type {
	PosSessionRegisterData,
	PosSessionSource,
	RecoverPosSessionResult,
	ReadyPosSession,
} from "./posSessionTypes";

type RecoverPosSessionOptions = {
	getCachedOpening: () => PosSessionRegisterData;
	getServerOpening: () => Promise<PosSessionRegisterData> | PosSessionRegisterData;
	currentUser?: string | null;
	currentSnapshot?: BootstrapSnapshot | null;
	buildVersion?: string | null;
	continueOffline?: boolean;
};

function hasRegisterData(registerData: PosSessionRegisterData) {
	return Boolean(
		registerData?.pos_profile?.name &&
		registerData?.pos_opening_shift?.name &&
		registerData?.pos_opening_shift?.user,
	);
}

function buildReadySession(
	registerData: PosSessionRegisterData,
	source: PosSessionSource,
): ReadyPosSession {
	return {
		posProfile: (registerData?.pos_profile || null) as any,
		posOpeningShift: (registerData?.pos_opening_shift || null) as any,
		source,
	};
}

function createNeedsRegisterSetupResult(
	message: string,
	bootstrapSnapshot: BootstrapSnapshot | null = null,
	warningCodes: string[] = [],
): RecoverPosSessionResult {
	return {
		status: "needs_register_setup",
		source: null,
		session: null,
		registerData: null,
		bootstrapSnapshot,
		warningCodes,
		message,
	};
}

function validateRecoveredSession(
	registerData: PosSessionRegisterData,
	options: RecoverPosSessionOptions,
) {
	const bootstrapRegisterData = registerData
		? {
				pos_profile: registerData.pos_profile || undefined,
				pos_opening_shift: registerData.pos_opening_shift || undefined,
			}
		: null;
	const bootstrapSnapshot = createBootstrapSnapshotFromRegisterData(
		bootstrapRegisterData,
		options.currentSnapshot || null,
		{
			buildVersion: options.buildVersion || null,
		},
	);
	const validation = validateBootstrapSnapshot(bootstrapSnapshot, {
		buildVersion: options.buildVersion || null,
		profileName: registerData?.pos_profile?.name || null,
		profileModified: registerData?.pos_profile?.modified || null,
		sessionUser: options.currentUser || null,
	});
	const runtime = resolveBootstrapRuntimeState(validation, {
		continueOffline: options.continueOffline ?? true,
	});

	return {
		bootstrapSnapshot,
		runtime,
	};
}

async function resolveRegisterData(
	options: RecoverPosSessionOptions,
): Promise<{
	registerData: PosSessionRegisterData;
	source: PosSessionSource | null;
}> {
	const cachedOpening = getValidCachedOpeningForCurrentUser(
		options.getCachedOpening(),
		options.currentUser,
	);

	if (hasRegisterData(cachedOpening)) {
		return {
			registerData: cachedOpening,
			source: "cache",
		};
	}

	const serverOpening = await Promise.resolve(options.getServerOpening());
	if (hasRegisterData(serverOpening)) {
		return {
			registerData: serverOpening,
			source: "server",
		};
	}

	return {
		registerData: null,
		source: null,
	};
}

export async function recoverPosSession(
	options: RecoverPosSessionOptions,
): Promise<RecoverPosSessionResult> {
	const { registerData, source } = await resolveRegisterData(options);

	if (!registerData || !source) {
		return createNeedsRegisterSetupResult("No opening shift found.");
	}

	const { bootstrapSnapshot, runtime } = validateRecoveredSession(
		registerData,
		options,
	);

	if (runtime.mode === "invalid") {
		return createNeedsRegisterSetupResult(
			"POS session belongs to a different cashier.",
			bootstrapSnapshot,
			runtime.warningCodes,
		);
	}

	return {
		status: "ready",
		source,
		session: buildReadySession(registerData, source),
		registerData,
		bootstrapSnapshot,
		warningCodes: runtime.warningCodes,
	};
}
