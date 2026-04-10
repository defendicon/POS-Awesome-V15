import {
	resolveBootstrapRuntimeState,
	validateBootstrapSnapshot,
} from "../../../offline/bootstrapSnapshot";
import {
	createPosStartupBlocker,
} from "./posStartupDiagnostics";
import type {
	PosRegisterStartupData,
	PosRegisterStartupResult,
} from "./posStartupTypes";
import type {
	BootstrapSnapshot,
	BootstrapValidationInput,
} from "../../../offline/bootstrapSnapshot";

type RegisterData = {
	pos_profile?: {
		name?: string | null;
		modified?: string | null;
	} | null;
	pos_opening_shift?: {
		name?: string | null;
		user?: string | null;
	} | null;
} | null;

type RunRegisterStartupOptions = {
	snapshot?: BootstrapSnapshot | null;
	registerData?: RegisterData;
	validationInput: BootstrapValidationInput;
	continueOffline?: boolean;
};

function normalizeRegisterStartupData(
	registerData: RegisterData,
): PosRegisterStartupData {
	return {
		profileName: registerData?.pos_profile?.name || null,
		profileModified: registerData?.pos_profile?.modified || null,
		openingShiftName: registerData?.pos_opening_shift?.name || null,
		openingShiftUser: registerData?.pos_opening_shift?.user || null,
	};
}

function createRegisterBlockedResult(
	data: PosRegisterStartupData,
	validation: ReturnType<typeof validateBootstrapSnapshot>,
	runtime: ReturnType<typeof resolveBootstrapRuntimeState>,
	blockerCode: string,
	blockerSummary: string,
): PosRegisterStartupResult {
	return {
		status: "blocked",
		data,
		validation,
		runtime,
		warningCodes: runtime.warningCodes,
		blocker: createPosStartupBlocker(blockerCode, blockerSummary),
	};
}

export function runRegisterStartup(
	options: RunRegisterStartupOptions,
): PosRegisterStartupResult {
	const data = normalizeRegisterStartupData(options?.registerData || null);
	const validation = validateBootstrapSnapshot(
		options?.snapshot || null,
		options?.validationInput,
	);
	const runtime = resolveBootstrapRuntimeState(validation, {
		continueOffline: options?.continueOffline,
	});

	if (!data.profileName || !data.openingShiftName || !data.openingShiftUser) {
		return createRegisterBlockedResult(
			data,
			validation,
			runtime,
			"register_data_missing",
			"POS register data is incomplete.",
		);
	}

	if (runtime.mode === "invalid") {
		return createRegisterBlockedResult(
			data,
			validation,
			runtime,
			"offline_bootstrap_invalid",
			"Offline bootstrap data belongs to a different cashier or session.",
		);
	}

	if (runtime.mode === "confirmation_required") {
		return createRegisterBlockedResult(
			data,
			validation,
			runtime,
			"offline_confirmation_required",
			"Offline bootstrap confirmation is required before POS can continue.",
		);
	}

	return {
		status: runtime.mode === "limited" ? "degraded" : "ready",
		data,
		validation,
		runtime,
		warningCodes: runtime.warningCodes,
		blocker: null,
	};
}
