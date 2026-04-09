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

export type BootstrapRuntimeMetadataInput = {
	buildVersion?: string | null;
};

export type BootstrapPrerequisiteCollectionInput = {
	profileName?: string | null;
	openingShiftName?: string | null;
	openingShiftUser?: string | null;
	paymentMethods?: unknown[] | null;
	salesPersons?: unknown[] | null;
	itemsCount?: number | boolean | null;
	customersCount?: number | boolean | null;
	itemGroups?: unknown[] | null;
	pricingSnapshotCount?: number | null;
	pricingContext?: unknown;
	taxInclusive?: boolean | null;
	printTemplate?: string | null;
	termsAndConditions?: string | null;
	offers?: unknown[] | null;
	coupons?: Record<string, unknown> | unknown[] | null;
	stockCacheReady?: boolean | null;
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

export type BootstrapSnapshotRefreshInput = {
	currentSnapshot?: BootstrapSnapshot | null;
	buildVersion?: string | null;
	registerData?: RegisterData;
	cacheState?: Omit<
		BootstrapPrerequisiteCollectionInput,
		"profileName" | "openingShiftName" | "openingShiftUser"
	>;
};

export type BootstrapValidationResult = {
	mode: BootstrapValidationMode;
	reasons: string[];
	missingPrerequisites: string[];
	capabilities: BootstrapCapabilities;
};

export type BootstrapRuntimeDecision = {
	mode: "normal" | "limited" | "invalid" | "confirmation_required";
	limitedMode: boolean;
	requiresConfirmation: boolean;
	warningCodes: string[];
	capabilities: BootstrapCapabilities;
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
	"items_cache_ready",
	"customers_cache_ready",
];

const PREREQUISITES_FOR_OFFLINE_PRICING = [
	"pricing_rules_snapshot",
	"pricing_rules_context",
	"tax_inclusive",
];

const PREREQUISITES_FOR_OFFLINE_PRINT = [
	"print_template",
	"terms_and_conditions",
];

const PREREQUISITES_FOR_OFFERS = ["offers_cache", "coupons_cache"];
const PREREQUISITES_FOR_CUSTOMER_DISPLAY = [
	"pos_opening_shift",
	"items_cache_ready",
];

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

function hasTruthyValue(value: unknown) {
	return value !== null && value !== undefined && value !== "";
}

function hasNonEmptyArray(value: unknown) {
	return Array.isArray(value) && value.length > 0;
}

function hasPositiveCountOrReadyFlag(value: number | boolean | null | undefined) {
	if (typeof value === "boolean") {
		return value;
	}
	return Number(value || 0) > 0;
}

function hasCoupons(value: Record<string, unknown> | unknown[] | null | undefined) {
	if (Array.isArray(value)) {
		return value.length > 0;
	}
	if (!value || typeof value !== "object") {
		return false;
	}
	return Object.keys(value).length > 0;
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
		canUseCustomerDisplayOffline: hasAllReady(
			prerequisites,
			PREREQUISITES_FOR_CUSTOMER_DISPLAY,
		),
	};
}

export function collectBootstrapPrerequisites(
	input: BootstrapPrerequisiteCollectionInput,
): Record<string, BootstrapPrerequisiteState> {
	return {
		pos_profile: hasTruthyValue(input?.profileName) ? "ready" : "missing",
		pos_opening_shift:
			hasTruthyValue(input?.openingShiftName) &&
			hasTruthyValue(input?.openingShiftUser)
				? "ready"
				: "missing",
		payment_methods: hasNonEmptyArray(input?.paymentMethods)
			? "ready"
			: "missing",
		sales_persons: hasNonEmptyArray(input?.salesPersons) ? "ready" : "missing",
		items_cache_ready: hasPositiveCountOrReadyFlag(input?.itemsCount)
			? "ready"
			: "missing",
		customers_cache_ready: hasPositiveCountOrReadyFlag(input?.customersCount)
			? "ready"
			: "missing",
		item_groups: hasNonEmptyArray(input?.itemGroups) ? "ready" : "missing",
		pricing_rules_snapshot: Number(input?.pricingSnapshotCount || 0) > 0
			? "ready"
			: "missing",
		pricing_rules_context: hasTruthyValue(input?.pricingContext)
			? "ready"
			: "missing",
		tax_inclusive:
			input?.taxInclusive === null || typeof input?.taxInclusive === "undefined"
				? "missing"
				: "ready",
		print_template: hasTruthyValue(input?.printTemplate) ? "ready" : "missing",
		terms_and_conditions: hasTruthyValue(input?.termsAndConditions)
			? "ready"
			: "missing",
		offers_cache: hasNonEmptyArray(input?.offers) ? "ready" : "missing",
		coupons_cache: hasCoupons(input?.coupons) ? "ready" : "missing",
		stock_cache_ready: input?.stockCacheReady ? "ready" : "missing",
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
	runtime: BootstrapRuntimeMetadataInput = {},
): BootstrapSnapshot {
	const nextPrerequisites: Record<string, BootstrapPrerequisiteState> = {
		...(currentSnapshot?.prerequisites || {}),
		pos_profile: registerData?.pos_profile?.name ? "ready" : "missing",
		pos_opening_shift:
			registerData?.pos_opening_shift?.name &&
			registerData?.pos_opening_shift?.user
				? "ready"
				: "missing",
	};

	return buildBootstrapSnapshot({
		buildVersion:
			runtime?.buildVersion || currentSnapshot?.build_version || null,
		profileName: registerData?.pos_profile?.name || null,
		profileModified: registerData?.pos_profile?.modified || null,
		openingShiftName: registerData?.pos_opening_shift?.name || null,
		openingShiftUser: registerData?.pos_opening_shift?.user || null,
		prerequisites: nextPrerequisites,
	});
}

export function refreshBootstrapSnapshotFromCaches(
	input: BootstrapSnapshotRefreshInput,
): BootstrapSnapshot {
	const currentSnapshot = input?.currentSnapshot || null;
	const registerData = input?.registerData || null;
	const profileName =
		registerData?.pos_profile?.name || currentSnapshot?.profile_name || null;
	const profileModified =
		registerData?.pos_profile?.modified ||
		currentSnapshot?.profile_modified ||
		null;
	const openingShiftName =
		registerData?.pos_opening_shift?.name ||
		currentSnapshot?.opening_shift_name ||
		null;
	const openingShiftUser =
		registerData?.pos_opening_shift?.user ||
		currentSnapshot?.opening_shift_user ||
		null;

	return buildBootstrapSnapshot({
		buildVersion: input?.buildVersion || currentSnapshot?.build_version || null,
		profileName,
		profileModified,
		openingShiftName,
		openingShiftUser,
		prerequisites: {
			...(currentSnapshot?.prerequisites || {}),
			...collectBootstrapPrerequisites({
				profileName,
				openingShiftName,
				openingShiftUser,
				...(input?.cacheState || {}),
			}),
		},
	});
}

export function validateBootstrapSnapshot(
	snapshot: BootstrapSnapshot | null | undefined,
	current: BootstrapValidationInput,
): BootstrapValidationResult {
	if (!snapshot) {
		return {
			mode: "limited" as BootstrapValidationMode,
			reasons: ["snapshot_missing"],
			missingPrerequisites: ["bootstrap_snapshot"],
			capabilities: {
				canSellOffline: false,
				canApplyPricingOffline: false,
				canPrintOffline: false,
				canUseOffersOffline: false,
				canUseCustomerDisplayOffline: false,
			},
		};
	}

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

export function resolveBootstrapRuntimeState(
	validation: BootstrapValidationResult,
	options: {
		continueOffline?: boolean;
	} = {},
): BootstrapRuntimeDecision {
	const warningCodes = [
		...(validation?.reasons || []),
		...(validation?.missingPrerequisites || []),
	];

	if (validation?.mode === "confirmation_required") {
		if (options.continueOffline) {
			return {
				mode: "limited",
				limitedMode: true,
				requiresConfirmation: false,
				warningCodes,
				capabilities: validation.capabilities,
			};
		}

		return {
			mode: "confirmation_required",
			limitedMode: false,
			requiresConfirmation: true,
			warningCodes,
			capabilities: validation.capabilities,
		};
	}

	if (validation?.mode === "limited") {
		return {
			mode: "limited",
			limitedMode: true,
			requiresConfirmation: false,
			warningCodes,
			capabilities: validation.capabilities,
		};
	}

	if (validation?.mode === "invalid") {
		return {
			mode: "invalid",
			limitedMode: false,
			requiresConfirmation: false,
			warningCodes,
			capabilities: validation.capabilities,
		};
	}

	return {
		mode: "normal",
		limitedMode: false,
		requiresConfirmation: false,
		warningCodes: [],
		capabilities: validation.capabilities,
	};
}
