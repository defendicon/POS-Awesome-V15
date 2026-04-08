export type BootstrapPrerequisiteState =
	| "ready"
	| "missing"
	| "stale"
	| "error";

export type BootstrapSnapshotInput = {
	buildVersion?: string | null;
	profileName?: string | null;
	profileModified?: string | null;
	openingShiftName?: string | null;
	openingShiftUser?: string | null;
	prerequisites?: Record<string, BootstrapPrerequisiteState>;
};

export type BootstrapSnapshot = {
	build_version: string | null;
	profile_name: string | null;
	profile_modified: string | null;
	opening_shift_name: string | null;
	opening_shift_user: string | null;
	prerequisites: Record<string, BootstrapPrerequisiteState>;
};

export type BootstrapValidationMode =
	| "normal"
	| "limited"
	| "confirmation_required"
	| "invalid";

export type BootstrapCapabilities = {
	canSellOffline: boolean;
	canApplyPricingOffline: boolean;
	canPrintOffline: boolean;
	canUseOffersOffline: boolean;
	canUseCustomerDisplayOffline: boolean;
};

export type BootstrapValidationInput = {
	buildVersion?: string | null;
	profileName?: string | null;
	profileModified?: string | null;
	sessionUser?: string | null;
};

type RegisterData = {
	pos_profile?: {
		name?: string | null;
		modified?: string | null;
	};
	pos_opening_shift?: {
		name?: string | null;
		user?: string | null;
	};
} | null;

const PREREQUISITES_FOR_OFFLINE_SELL = [
	"pos_profile",
	"pos_opening_shift",
	"payment_methods",
];

const PREREQUISITES_FOR_OFFLINE_PRICING = [
	"pricing_rules_snapshot",
	"pricing_rules_context",
];

const PREREQUISITES_FOR_OFFLINE_PRINT = [
	"print_template",
	"terms_and_conditions",
];

const PREREQUISITES_FOR_OFFERS = ["offers_cache", "coupons_cache"];

function isReadyState(state: BootstrapPrerequisiteState | undefined) {
	return state === "ready";
}

function collectMissingPrerequisites(
	prerequisites: Record<string, BootstrapPrerequisiteState>,
) {
	return Object.entries(prerequisites)
		.filter(([, state]) => !isReadyState(state))
		.map(([key]) => key);
}

function hasAllReady(
	prerequisites: Record<string, BootstrapPrerequisiteState>,
	keys: string[],
) {
	return keys.every((key) => isReadyState(prerequisites[key]));
}

function deriveCapabilities(
	prerequisites: Record<string, BootstrapPrerequisiteState>,
): BootstrapCapabilities {
	return {
		canSellOffline: hasAllReady(
			prerequisites,
			PREREQUISITES_FOR_OFFLINE_SELL,
		),
		canApplyPricingOffline: hasAllReady(
			prerequisites,
			PREREQUISITES_FOR_OFFLINE_PRICING,
		),
		canPrintOffline: hasAllReady(
			prerequisites,
			PREREQUISITES_FOR_OFFLINE_PRINT,
		),
		canUseOffersOffline: hasAllReady(prerequisites, PREREQUISITES_FOR_OFFERS),
		canUseCustomerDisplayOffline: isReadyState(
			prerequisites.pos_opening_shift,
		),
	};
}

export function buildBootstrapSnapshot(
	input: BootstrapSnapshotInput,
): BootstrapSnapshot {
	return {
		build_version: input.buildVersion || null,
		profile_name: input.profileName || null,
		profile_modified: input.profileModified || null,
		opening_shift_name: input.openingShiftName || null,
		opening_shift_user: input.openingShiftUser || null,
		prerequisites: input.prerequisites || {},
	};
}

export function createBootstrapSnapshotFromRegisterData(
	registerData: RegisterData,
	currentSnapshot: BootstrapSnapshot | null | undefined,
): BootstrapSnapshot {
	const nextPrerequisites = {
		...(currentSnapshot?.prerequisites || {}),
		pos_profile: registerData?.pos_profile?.name ? "ready" : "missing",
		pos_opening_shift:
			registerData?.pos_opening_shift?.name &&
			registerData?.pos_opening_shift?.user
				? "ready"
				: "missing",
	};

	return buildBootstrapSnapshot({
		buildVersion: currentSnapshot?.build_version || null,
		profileName: registerData?.pos_profile?.name || null,
		profileModified: registerData?.pos_profile?.modified || null,
		openingShiftName: registerData?.pos_opening_shift?.name || null,
		openingShiftUser: registerData?.pos_opening_shift?.user || null,
		prerequisites: nextPrerequisites,
	});
}

export function validateBootstrapSnapshot(
	snapshot: BootstrapSnapshot | null | undefined,
	current: BootstrapValidationInput,
) {
	const reasons: string[] = [];
	const prerequisites = snapshot?.prerequisites || {};
	const missingPrerequisites = collectMissingPrerequisites(prerequisites);
	const capabilities = deriveCapabilities(prerequisites);
	let mode: BootstrapValidationMode = "normal";

	if ((snapshot?.build_version || null) !== (current?.buildVersion || null)) {
		reasons.push("build_version_mismatch");
	}
	if ((snapshot?.profile_name || null) !== (current?.profileName || null)) {
		reasons.push("profile_name_mismatch");
	}
	if (
		(snapshot?.profile_modified || null) !== (current?.profileModified || null)
	) {
		reasons.push("profile_modified_mismatch");
	}
	if (
		(snapshot?.opening_shift_user || null) !== (current?.sessionUser || null)
	) {
		reasons.push("opening_shift_user_mismatch");
	}

	if (reasons.includes("opening_shift_user_mismatch")) {
		mode = "invalid";
	} else if (
		reasons.includes("build_version_mismatch") ||
		reasons.includes("profile_name_mismatch") ||
		reasons.includes("profile_modified_mismatch")
	) {
		mode = "confirmation_required";
	} else if (missingPrerequisites.length) {
		mode = "limited";
	}

	return {
		mode,
		reasons,
		missingPrerequisites,
		capabilities,
	};
}
