/**
 * Offline bootstrap snapshot — validation and runtime-mode resolution.
 *
 * The bootstrap snapshot is a lightweight record stored in IndexedDB that captures the
 * state of all offline caches at the time of the last full sync. On every page load,
 * `validateBootstrapSnapshot` compares the snapshot against the current session to
 * decide whether the POS can operate offline.
 *
 * **Mode resolution rules:**
 * - `"normal"` — all blocking prerequisites are present and the session matches.
 * - `"limited"` — one or more prerequisites from `PREREQUISITES_FOR_OFFLINE_SELL` are missing.
 * - `"confirmation_required"` — snapshot is present but belongs to a different build,
 *   profile, or profile revision; user must confirm to continue.
 * - `"invalid"` — opening shift was created by a different user; cannot be restored.
 *
 * Optional prerequisites (offers, delivery charges, currencies, print template, etc.) do
 * **not** affect the mode — their absence is a valid empty/not-configured state.
 *
 * @module offline/bootstrapSnapshot
 */

/**
 * Readiness state of a single offline prerequisite.
 * - `"ready"` — data is present and current.
 * - `"missing"` — data was not found in the cache.
 * - `"stale"` — data exists but has exceeded its TTL.
 * - `"error"` — an error occurred while populating the cache.
 */
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
	deliveryChargesCount?: number | boolean | null;
	currencyOptionsCount?: number | boolean | null;
	exchangeRateCount?: number | boolean | null;
	priceListMetaReady?: boolean | null;
	customerAddressesCount?: number | boolean | null;
	paymentMethodCurrencyCount?: number | boolean | null;
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

export type BootstrapCapabilityId =
	| "sell_offline"
	| "pricing_offline"
	| "print_offline"
	| "customer_display_offline"
	| "offers_offline"
	| "address_lookup_offline"
	| "delivery_charges_offline"
	| "stock_confidence_offline";

export type BootstrapCapabilityStatus =
	| "ready"
	| "degraded"
	| "unavailable"
	| "override_required"
	| "blocked";

export type BootstrapCapabilitySeverity = "info" | "warning" | "error";

export type BootstrapOfflinePolicyMode =
	| "allow_with_warning"
	| "require_manager_override"
	| "block_if_unverified";

export type BootstrapOfflinePolicies = {
	pricingVerification: BootstrapOfflinePolicyMode;
	stockConfidence: BootstrapOfflinePolicyMode;
};

export type BootstrapCapabilitySummary = {
	id: BootstrapCapabilityId;
	label: string;
	status: BootstrapCapabilityStatus;
	severity: BootstrapCapabilitySeverity;
	message: string;
	action: string;
	warningCodes: string[];
	prerequisites: string[];
	policy: BootstrapOfflinePolicyMode | null;
};

export type BootstrapCapabilities = {
	canSellOffline: boolean;
	canApplyPricingOffline: boolean;
	canPrintOffline: boolean;
	canUseOffersOffline: boolean;
	canUseCustomerDisplayOffline: boolean;
	canLookupAddressesOffline: boolean;
	canCalculateDeliveryChargesOffline: boolean;
	canTrustStockOffline: boolean;
};

export type BootstrapValidationInput = {
	buildVersion?: string | null;
	profileName?: string | null;
	profileModified?: string | null;
	sessionUser?: string | null;
	policies?: Partial<BootstrapOfflinePolicies>;
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
	capabilitySummaries: BootstrapCapabilitySummary[];
};

export type BootstrapPrimaryWarning = {
	active: boolean;
	title: string;
	messages: string[];
	severity: BootstrapCapabilitySeverity;
	capabilityId: BootstrapCapabilityId | "session_mismatch" | "snapshot";
};

export type BootstrapRuntimeDecision = {
	mode: "normal" | "limited" | "invalid" | "confirmation_required";
	limitedMode: boolean;
	requiresConfirmation: boolean;
	warningCodes: string[];
	capabilities: BootstrapCapabilities;
	capabilitySummaries: BootstrapCapabilitySummary[];
	primaryWarning: BootstrapPrimaryWarning;
};

type RegisterData = {
	pos_profile?: {
		name?: string | null;
		modified?: string | null;
		payments?: unknown[] | null;
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
const PREREQUISITES_FOR_ADDRESS_LOOKUP = ["customer_addresses_cache"];
const PREREQUISITES_FOR_DELIVERY_CHARGES = ["delivery_charges_cache"];
const PREREQUISITES_FOR_STOCK_CONFIDENCE = ["stock_cache_ready"];

const DEFAULT_BOOTSTRAP_POLICIES: BootstrapOfflinePolicies = {
	pricingVerification: "allow_with_warning",
	stockConfidence: "require_manager_override",
};

const CAPABILITY_LABELS: Record<BootstrapCapabilityId, string> = {
	sell_offline: "Sell Offline",
	pricing_offline: "Pricing Offline",
	print_offline: "Print Offline",
	customer_display_offline: "Customer Display Offline",
	offers_offline: "Offers Offline",
	address_lookup_offline: "Address Lookup Offline",
	delivery_charges_offline: "Delivery Charges Offline",
	stock_confidence_offline: "Stock Confidence Offline",
};

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

function hasOwnKey<T extends object>(value: T | null | undefined, key: keyof T) {
	return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function deriveCapabilities(
	capabilitySummaries: BootstrapCapabilitySummary[],
): BootstrapCapabilities {
	const capabilityState = Object.fromEntries(
		capabilitySummaries.map((summary) => [summary.id, summary.status]),
	) as Record<BootstrapCapabilityId, BootstrapCapabilityStatus>;

	return {
		canSellOffline: capabilityState.sell_offline === "ready",
		canApplyPricingOffline: capabilityState.pricing_offline === "ready",
		canPrintOffline: capabilityState.print_offline === "ready",
		canUseOffersOffline: capabilityState.offers_offline === "ready",
		canUseCustomerDisplayOffline:
			capabilityState.customer_display_offline === "ready",
		canLookupAddressesOffline:
			capabilityState.address_lookup_offline === "ready",
		canCalculateDeliveryChargesOffline:
			capabilityState.delivery_charges_offline === "ready",
		canTrustStockOffline:
			capabilityState.stock_confidence_offline === "ready",
	};
}

function resolveBootstrapPolicies(
	inputPolicies: Partial<BootstrapOfflinePolicies> | undefined,
): BootstrapOfflinePolicies {
	return {
		...DEFAULT_BOOTSTRAP_POLICIES,
		...(inputPolicies || {}),
	};
}

function buildCapabilitySummary(
	id: BootstrapCapabilityId,
	status: BootstrapCapabilityStatus,
	severity: BootstrapCapabilitySeverity,
	message: string,
	action: string,
	warningCodes: string[],
	prerequisites: string[],
	policy: BootstrapOfflinePolicyMode | null = null,
): BootstrapCapabilitySummary {
	return {
		id,
		label: CAPABILITY_LABELS[id],
		status,
		severity,
		message,
		action,
		warningCodes,
		prerequisites,
		policy,
	};
}

function deriveCapabilitySummaries(
	prerequisites: Record<string, BootstrapPrerequisiteState>,
	policies: BootstrapOfflinePolicies,
): BootstrapCapabilitySummary[] {
	const sellReady = hasAllReady(prerequisites, PREREQUISITES_FOR_OFFLINE_SELL);
	const missingPricing = PREREQUISITES_FOR_OFFLINE_PRICING.filter(
		(key) => !isReadyState(prerequisites[key]),
	);
	const missingPrint = PREREQUISITES_FOR_OFFLINE_PRINT.filter(
		(key) => !isReadyState(prerequisites[key]),
	);
	const missingOffers = PREREQUISITES_FOR_OFFERS.filter(
		(key) => !isReadyState(prerequisites[key]),
	);
	const missingCustomerDisplay = PREREQUISITES_FOR_CUSTOMER_DISPLAY.filter(
		(key) => !isReadyState(prerequisites[key]),
	);
	const missingAddresses = PREREQUISITES_FOR_ADDRESS_LOOKUP.filter(
		(key) => !isReadyState(prerequisites[key]),
	);
	const missingDeliveryCharges = PREREQUISITES_FOR_DELIVERY_CHARGES.filter(
		(key) => !isReadyState(prerequisites[key]),
	);
	const missingStockConfidence = PREREQUISITES_FOR_STOCK_CONFIDENCE.filter(
		(key) => !isReadyState(prerequisites[key]),
	);

	const summaries: BootstrapCapabilitySummary[] = [];

	summaries.push(
		sellReady
			? buildCapabilitySummary(
					"sell_offline",
					"ready",
					"info",
					"Offline selling prerequisites are ready.",
					"",
					[],
					PREREQUISITES_FOR_OFFLINE_SELL,
				)
			: buildCapabilitySummary(
					"sell_offline",
					"unavailable",
					"error",
					"Offline selling is unavailable until core selling caches are refreshed.",
					"Reconnect and refresh offline sell prerequisites before continuing.",
					PREREQUISITES_FOR_OFFLINE_SELL.filter(
						(key) => !isReadyState(prerequisites[key]),
					),
					PREREQUISITES_FOR_OFFLINE_SELL,
				),
	);

	if (!sellReady) {
		summaries.push(
			buildCapabilitySummary(
				"pricing_offline",
				"unavailable",
				"error",
				"Offline pricing cannot be trusted until core selling data is ready.",
				"Restore offline selling prerequisites first.",
				missingPricing,
				PREREQUISITES_FOR_OFFLINE_PRICING,
				policies.pricingVerification,
			),
		);
	} else if (!missingPricing.length) {
		summaries.push(
			buildCapabilitySummary(
				"pricing_offline",
				"ready",
				"info",
				"Offline pricing rules and tax settings are ready.",
				"",
				[],
				PREREQUISITES_FOR_OFFLINE_PRICING,
				policies.pricingVerification,
			),
		);
	} else {
		const pricingStatusByPolicy: Record<
			BootstrapOfflinePolicyMode,
			{
				status: BootstrapCapabilityStatus;
				severity: BootstrapCapabilitySeverity;
				message: string;
				action: string;
			}
		> = {
			allow_with_warning: {
				status: "degraded",
				severity: "warning",
				message:
					"Offline pricing is unverified. Offers, customer pricing, taxes, or discounts may differ after reconnect.",
				action:
					"Allow sale with warning and flag the invoice as offline pricing unverified.",
			},
			require_manager_override: {
				status: "override_required",
				severity: "warning",
				message:
					"Offline pricing is unverified and requires a local supervisor override before selling.",
				action:
					"Collect a local supervisor PIN or privileged approval on the terminal.",
			},
			block_if_unverified: {
				status: "blocked",
				severity: "error",
				message:
					"Offline pricing is unverified and selling is blocked by policy until pricing is refreshed.",
				action: "Reconnect and refresh pricing data before selling.",
			},
		};
		const policyState = pricingStatusByPolicy[policies.pricingVerification];
		summaries.push(
			buildCapabilitySummary(
				"pricing_offline",
				policyState.status,
				policyState.severity,
				policyState.message,
				policyState.action,
				missingPricing,
				PREREQUISITES_FOR_OFFLINE_PRICING,
				policies.pricingVerification,
			),
		);
	}

	summaries.push(
		!missingPrint.length
			? buildCapabilitySummary(
					"print_offline",
					"ready",
					"info",
					"Offline printing prerequisites are ready.",
					"",
					[],
					PREREQUISITES_FOR_OFFLINE_PRINT,
				)
			: buildCapabilitySummary(
					"print_offline",
					"degraded",
					"info",
					"Offline printing may omit template content until cached print assets are refreshed.",
					"Reconnect to refresh receipt template content.",
					missingPrint,
					PREREQUISITES_FOR_OFFLINE_PRINT,
				),
	);

	summaries.push(
		!missingCustomerDisplay.length
			? buildCapabilitySummary(
					"customer_display_offline",
					"ready",
					"info",
					"Customer display can continue operating offline.",
					"",
					[],
					PREREQUISITES_FOR_CUSTOMER_DISPLAY,
				)
			: buildCapabilitySummary(
					"customer_display_offline",
					"degraded",
					"info",
					"Customer display may be incomplete offline until display prerequisites are refreshed.",
					"Reconnect to refresh customer display prerequisites.",
					missingCustomerDisplay,
					PREREQUISITES_FOR_CUSTOMER_DISPLAY,
				),
	);

	summaries.push(
		!missingOffers.length
			? buildCapabilitySummary(
					"offers_offline",
					"ready",
					"info",
					"Offline offers and coupons are ready.",
					"",
					[],
					PREREQUISITES_FOR_OFFERS,
				)
			: buildCapabilitySummary(
					"offers_offline",
					"degraded",
					"info",
					"Offers and coupons may be unavailable offline.",
					"Reconnect to refresh offers and coupon data.",
					missingOffers,
					PREREQUISITES_FOR_OFFERS,
				),
	);

	summaries.push(
		!missingAddresses.length
			? buildCapabilitySummary(
					"address_lookup_offline",
					"ready",
					"info",
					"Offline customer address lookup is ready.",
					"",
					[],
					PREREQUISITES_FOR_ADDRESS_LOOKUP,
				)
			: buildCapabilitySummary(
					"address_lookup_offline",
					"degraded",
					"info",
					"Customer address lookup may be incomplete offline.",
					"Reconnect to refresh cached customer addresses.",
					missingAddresses,
					PREREQUISITES_FOR_ADDRESS_LOOKUP,
				),
	);

	summaries.push(
		!missingDeliveryCharges.length
			? buildCapabilitySummary(
					"delivery_charges_offline",
					"ready",
					"info",
					"Offline delivery charge lookup is ready.",
					"",
					[],
					PREREQUISITES_FOR_DELIVERY_CHARGES,
				)
			: buildCapabilitySummary(
					"delivery_charges_offline",
					"degraded",
					"info",
					"Delivery charges may need review because cached delivery data is incomplete.",
					"Reconnect to refresh delivery charge data.",
					missingDeliveryCharges,
					PREREQUISITES_FOR_DELIVERY_CHARGES,
				),
	);

	if (!sellReady) {
		summaries.push(
			buildCapabilitySummary(
				"stock_confidence_offline",
				"unavailable",
				"error",
				"Offline stock confidence cannot be assessed until core selling data is ready.",
				"Restore offline selling prerequisites first.",
				missingStockConfidence,
				PREREQUISITES_FOR_STOCK_CONFIDENCE,
				policies.stockConfidence,
			),
		);
	} else if (!missingStockConfidence.length) {
		summaries.push(
			buildCapabilitySummary(
				"stock_confidence_offline",
				"ready",
				"info",
				"Offline stock cache is ready for stock confidence checks.",
				"",
				[],
				PREREQUISITES_FOR_STOCK_CONFIDENCE,
				policies.stockConfidence,
			),
		);
	} else {
		const stockStatusByPolicy: Record<
			BootstrapOfflinePolicyMode,
			{
				status: BootstrapCapabilityStatus;
				severity: BootstrapCapabilitySeverity;
				message: string;
				action: string;
			}
		> = {
			allow_with_warning: {
				status: "degraded",
				severity: "warning",
				message:
					"Stock confidence is low because offline stock data is incomplete.",
				action: "Review quantities carefully before completing the sale.",
			},
			require_manager_override: {
				status: "override_required",
				severity: "warning",
				message:
					"Stock confidence is low and a local supervisor override is required by policy.",
				action:
					"Collect a local supervisor PIN or privileged approval before selling uncertain stock.",
			},
			block_if_unverified: {
				status: "blocked",
				severity: "error",
				message:
					"Stock confidence is low and policy blocks the sale until stock data is refreshed.",
				action: "Reconnect and refresh stock data before selling.",
			},
		};
		const policyState = stockStatusByPolicy[policies.stockConfidence];
		summaries.push(
			buildCapabilitySummary(
				"stock_confidence_offline",
				policyState.status,
				policyState.severity,
				policyState.message,
				policyState.action,
				missingStockConfidence,
				PREREQUISITES_FOR_STOCK_CONFIDENCE,
				policies.stockConfidence,
			),
		);
	}

	return summaries;
}

function buildPrimaryWarningFromDecision(
	validation: BootstrapValidationResult,
	capabilitySummaries: BootstrapCapabilitySummary[],
): BootstrapPrimaryWarning {
	if (validation.mode === "invalid") {
		return {
			active: true,
			title: "Offline restore is unavailable for this session.",
			messages: [
				"Cached opening shift belongs to another user and cannot be restored offline.",
			],
			severity: "error",
			capabilityId: "session_mismatch",
		};
	}

	const mismatchMessages: Record<string, string> = {
		snapshot_missing:
			"Offline bootstrap snapshot is missing. Refresh offline data while online.",
		build_version_mismatch:
			"Cached offline data belongs to a different app build.",
		profile_name_mismatch:
			"Cached offline data belongs to a different POS profile.",
		profile_modified_mismatch:
			"POS profile settings changed after the offline snapshot was captured.",
	};

	if (
		validation.mode === "confirmation_required" &&
		validation.reasons.length
	) {
		return {
			active: true,
			title: "Offline snapshot needs confirmation.",
			messages: validation.reasons.map(
				(reason) => mismatchMessages[reason] || reason,
			),
			severity: "warning",
			capabilityId: "session_mismatch",
		};
	}

	const priorityOrder: BootstrapCapabilityId[] = [
		"sell_offline",
		"stock_confidence_offline",
		"pricing_offline",
		"print_offline",
	];
	const ranked = capabilitySummaries
		.filter((summary) => summary.severity !== "info" && summary.status !== "ready")
		.sort(
			(left, right) =>
				priorityOrder.indexOf(left.id) - priorityOrder.indexOf(right.id),
		);

	if (!ranked.length) {
		return {
			active: false,
			title: "",
			messages: [],
			severity: "info",
			capabilityId: "snapshot",
		};
	}

	const top = ranked[0]!;
	return {
		active: true,
		title: top.label,
		messages: [top.message, top.action].filter(Boolean),
		severity: top.severity,
		capabilityId: top.id,
	};
}

/**
 * Derives a full prerequisite-state map from live cache data.
 * Called after a sync pass to produce the prerequisites stored in the snapshot.
 *
 * @param input - Current counts and flags for every cacheable resource.
 * @returns A record mapping each prerequisite key to its readiness state.
 */
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
		delivery_charges_cache: hasPositiveCountOrReadyFlag(
			input?.deliveryChargesCount,
		)
			? "ready"
			: "missing",
		currency_options_cache: hasPositiveCountOrReadyFlag(
			input?.currencyOptionsCount,
		)
			? "ready"
			: "missing",
		exchange_rate_cache: hasPositiveCountOrReadyFlag(input?.exchangeRateCount)
			? "ready"
			: "missing",
		price_list_meta_cache: input?.priceListMetaReady ? "ready" : "missing",
		customer_addresses_cache: hasPositiveCountOrReadyFlag(
			input?.customerAddressesCount,
		)
			? "ready"
			: "missing",
		payment_method_currency_cache: hasPositiveCountOrReadyFlag(
			input?.paymentMethodCurrencyCount,
		)
			? "ready"
			: "missing",
	};
}

function collectBootstrapPrerequisitePatch(
	input: BootstrapPrerequisiteCollectionInput,
): Record<string, BootstrapPrerequisiteState> {
	const patch: Record<string, BootstrapPrerequisiteState> = {
		pos_profile: hasTruthyValue(input?.profileName) ? "ready" : "missing",
		pos_opening_shift:
			hasTruthyValue(input?.openingShiftName) &&
			hasTruthyValue(input?.openingShiftUser)
				? "ready"
				: "missing",
	};

	if (hasOwnKey(input, "paymentMethods")) {
		patch.payment_methods = hasNonEmptyArray(input?.paymentMethods)
			? "ready"
			: "missing";
	}

	if (hasOwnKey(input, "salesPersons")) {
		patch.sales_persons = hasNonEmptyArray(input?.salesPersons)
			? "ready"
			: "missing";
	}

	if (hasOwnKey(input, "itemsCount")) {
		patch.items_cache_ready = hasPositiveCountOrReadyFlag(input?.itemsCount)
			? "ready"
			: "missing";
	}

	if (hasOwnKey(input, "customersCount")) {
		patch.customers_cache_ready = hasPositiveCountOrReadyFlag(
			input?.customersCount,
		)
			? "ready"
			: "missing";
	}

	if (hasOwnKey(input, "itemGroups")) {
		patch.item_groups = hasNonEmptyArray(input?.itemGroups)
			? "ready"
			: "missing";
	}

	if (hasOwnKey(input, "pricingSnapshotCount")) {
		patch.pricing_rules_snapshot = Number(input?.pricingSnapshotCount || 0) > 0
			? "ready"
			: "missing";
	}

	if (hasOwnKey(input, "pricingContext")) {
		patch.pricing_rules_context = hasTruthyValue(input?.pricingContext)
			? "ready"
			: "missing";
	}

	if (hasOwnKey(input, "taxInclusive")) {
		patch.tax_inclusive =
			input?.taxInclusive === null || typeof input?.taxInclusive === "undefined"
				? "missing"
				: "ready";
	}

	if (hasOwnKey(input, "printTemplate")) {
		patch.print_template = hasTruthyValue(input?.printTemplate)
			? "ready"
			: "missing";
	}

	if (hasOwnKey(input, "termsAndConditions")) {
		patch.terms_and_conditions = hasTruthyValue(input?.termsAndConditions)
			? "ready"
			: "missing";
	}

	if (hasOwnKey(input, "offers")) {
		patch.offers_cache = hasNonEmptyArray(input?.offers) ? "ready" : "missing";
	}

	if (hasOwnKey(input, "coupons")) {
		patch.coupons_cache = hasCoupons(input?.coupons) ? "ready" : "missing";
	}

	if (hasOwnKey(input, "stockCacheReady")) {
		patch.stock_cache_ready = input?.stockCacheReady ? "ready" : "missing";
	}

	if (hasOwnKey(input, "deliveryChargesCount")) {
		patch.delivery_charges_cache = hasPositiveCountOrReadyFlag(
			input?.deliveryChargesCount,
		)
			? "ready"
			: "missing";
	}

	if (hasOwnKey(input, "currencyOptionsCount")) {
		patch.currency_options_cache = hasPositiveCountOrReadyFlag(
			input?.currencyOptionsCount,
		)
			? "ready"
			: "missing";
	}

	if (hasOwnKey(input, "exchangeRateCount")) {
		patch.exchange_rate_cache = hasPositiveCountOrReadyFlag(
			input?.exchangeRateCount,
		)
			? "ready"
			: "missing";
	}

	if (hasOwnKey(input, "priceListMetaReady")) {
		patch.price_list_meta_cache = input?.priceListMetaReady
			? "ready"
			: "missing";
	}

	if (hasOwnKey(input, "customerAddressesCount")) {
		patch.customer_addresses_cache = hasPositiveCountOrReadyFlag(
			input?.customerAddressesCount,
		)
			? "ready"
			: "missing";
	}

	if (hasOwnKey(input, "paymentMethodCurrencyCount")) {
		patch.payment_method_currency_cache = hasPositiveCountOrReadyFlag(
			input?.paymentMethodCurrencyCount,
		)
			? "ready"
			: "missing";
	}

	return patch;
}

/**
 * Constructs a {@link BootstrapSnapshot} from a plain input object.
 * All fields default to `null` when not supplied.
 */
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

/**
 * Creates or updates a bootstrap snapshot immediately after the `/api/method/posawesome.…/get_register_data`
 * response is received. Only the profile and opening-shift prerequisites are updated;
 * cache-based prerequisites are preserved from `currentSnapshot`.
 *
 * @param registerData - Response from the register-data RPC call.
 * @param currentSnapshot - Existing snapshot (if any) to merge from.
 * @param runtime - Optional metadata overrides (e.g. build version).
 */
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
	if (hasOwnKey(registerData?.pos_profile, "payments")) {
		nextPrerequisites.payment_methods = hasNonEmptyArray(
			registerData?.pos_profile?.payments,
		)
			? "ready"
			: "missing";
	}

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

/**
 * Rebuilds the bootstrap snapshot from the latest cache state.
 * Called after any sync adapter completes to ensure the snapshot reflects current data.
 *
 * Prerequisites are updated incrementally — only keys present in `input.cacheState` are
 * patched; existing keys not mentioned are preserved from `currentSnapshot`.
 */
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
			...collectBootstrapPrerequisitePatch({
				profileName,
				openingShiftName,
				openingShiftUser,
				...(input?.cacheState || {}),
			}),
		},
	});
}

/**
 * Validates a stored {@link BootstrapSnapshot} against the current session context.
 *
 * Returns a {@link BootstrapValidationResult} whose `mode` reflects the severity:
 * - `"normal"` — fully ready.
 * - `"limited"` — one or more **blocking** prerequisites (`PREREQUISITES_FOR_OFFLINE_SELL`) are missing.
 * - `"confirmation_required"` — snapshot exists but version/profile mismatch detected.
 * - `"invalid"` — opening shift belongs to a different user.
 *
 * Optional prerequisites (offers, delivery charges, currencies, print templates, etc.)
 * do **not** affect the mode — their absence is a valid empty/not-configured state.
 *
 * @param snapshot - Snapshot read from IndexedDB. Pass `null` if none exists.
 * @param current - Session context to compare against (build version, profile, user).
 */
export function validateBootstrapSnapshot(
	snapshot: BootstrapSnapshot | null | undefined,
	current: BootstrapValidationInput,
): BootstrapValidationResult {
	const policies = resolveBootstrapPolicies(current?.policies);
	if (!snapshot) {
		const capabilitySummaries = deriveCapabilitySummaries({}, policies);
		return {
			mode: "limited" as BootstrapValidationMode,
			reasons: ["snapshot_missing"],
			missingPrerequisites: ["bootstrap_snapshot"],
			capabilities: deriveCapabilities(capabilitySummaries),
			capabilitySummaries,
		};
	}

	const reasons: string[] = [];
	const prerequisites = snapshot?.prerequisites || {};
	const missingPrerequisites = collectMissingPrerequisites(prerequisites);
	const capabilitySummaries = deriveCapabilitySummaries(
		prerequisites,
		policies,
	);
	const capabilities = deriveCapabilities(capabilitySummaries);
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

	// Only prerequisites that actually block offline selling should set mode =
	// "limited". Optional prerequisites (offers, delivery charges, currencies,
	// print templates, sales persons, etc.) may be empty because the feature is
	// simply not configured — that is a valid empty state, not an error.
	const blockingMissingPrerequisites = missingPrerequisites.filter((key) =>
		PREREQUISITES_FOR_OFFLINE_SELL.includes(key),
	);

	if (reasons.includes("opening_shift_user_mismatch")) {
		mode = "invalid";
	} else if (
		reasons.includes("build_version_mismatch") ||
		reasons.includes("profile_name_mismatch") ||
		reasons.includes("profile_modified_mismatch")
	) {
		mode = "confirmation_required";
	} else if (blockingMissingPrerequisites.length) {
		mode = "limited";
	}

	return {
		mode,
		reasons,
		missingPrerequisites,
		capabilities,
		capabilitySummaries,
	};
}

/**
 * Converts a {@link BootstrapValidationResult} into an actionable {@link BootstrapRuntimeDecision}
 * used by `DefaultLayout.vue` to control the offline warning banner and the `limitedMode` flag.
 *
 * `warningCodes` in the returned decision contains only **blocking** missing prerequisites
 * and mismatch reasons — optional missing prerequisites are excluded to avoid noise in the
 * operator-facing warning messages.
 *
 * @param validation - Output of {@link validateBootstrapSnapshot}.
 * @param options.continueOffline - When `true`, a `"confirmation_required"` result is
 *   downgraded to `"limited"` (the user has already confirmed they want to proceed).
 */
export function resolveBootstrapRuntimeState(
	validation: BootstrapValidationResult,
	options: {
		continueOffline?: boolean;
	} = {},
): BootstrapRuntimeDecision {
	// Only include blocking missing prerequisites in warning codes shown to the
	// user. Optional prerequisites (offers, delivery charges, currencies, etc.)
	// being absent is a normal empty/not-configured state and should not surface
	// as an actionable warning in the UI.
	const blockingMissingCodes = (validation?.missingPrerequisites || []).filter(
		(key) => PREREQUISITES_FOR_OFFLINE_SELL.includes(key),
	);
	const warningCodes = [
		...(validation?.reasons || []),
		...blockingMissingCodes,
	];
	const primaryWarning = buildPrimaryWarningFromDecision(
		validation,
		validation?.capabilitySummaries || [],
	);
	const hasSellingImpact = (validation?.capabilitySummaries || []).some(
		(summary) =>
			["sell_offline", "pricing_offline", "stock_confidence_offline"].includes(
				summary.id,
			) && summary.status !== "ready",
	);

	if (validation?.mode === "confirmation_required") {
		if (options.continueOffline) {
			return {
				mode: "limited",
				limitedMode: true,
				requiresConfirmation: false,
				warningCodes,
				capabilities: validation.capabilities,
				capabilitySummaries: validation.capabilitySummaries || [],
				primaryWarning,
			};
		}

		return {
			mode: "confirmation_required",
			limitedMode: false,
			requiresConfirmation: true,
			warningCodes,
			capabilities: validation.capabilities,
			capabilitySummaries: validation.capabilitySummaries || [],
			primaryWarning,
		};
	}

	if (validation?.mode === "limited") {
		return {
			mode: "limited",
			limitedMode: true,
			requiresConfirmation: false,
			warningCodes,
			capabilities: validation.capabilities,
			capabilitySummaries: validation.capabilitySummaries || [],
			primaryWarning,
		};
	}

	if (validation?.mode === "invalid") {
		return {
			mode: "invalid",
			limitedMode: false,
			requiresConfirmation: false,
			warningCodes,
			capabilities: validation.capabilities,
			capabilitySummaries: validation.capabilitySummaries || [],
			primaryWarning,
		};
	}

	return {
		mode: hasSellingImpact ? "limited" : "normal",
		limitedMode: hasSellingImpact,
		requiresConfirmation: false,
		warningCodes: primaryWarning.active ? warningCodes : [],
		capabilities: validation.capabilities,
		capabilitySummaries: validation.capabilitySummaries || [],
		primaryWarning,
	};
}
