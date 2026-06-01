import { startPerfMeasure } from "../posapp/utils/perf";
import { db, memory, persist, withDbTransaction } from "./db";

export const LOCAL_SNAPSHOT_SCHEMA_VERSION = 1;
export const LOCAL_SNAPSHOT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type LocalSnapshotResourceKey =
	| "pos_profile"
	| "payment_methods"
	| "currency"
	| "exchange_rates"
	| "items"
	| "cart_pricing"
	| "pricing_rules"
	| "offers"
	| "customers";

export type LocalSnapshotResourceState = {
	key: LocalSnapshotResourceKey;
	required: boolean;
	state: "ready" | "missing" | "stale" | "invalid";
	localVersion: string | null;
	remoteVersion: string | null;
	lastHydratedAt: string | null;
	lastRemoteRefreshAt: string | null;
	staleUsable: boolean;
	blocking: boolean;
	error: string | null;
};

export type LocalSnapshotManifest = {
	schemaVersion: number;
	compatibilitySignature: string;
	profileName: string | null;
	company: string | null;
	warehouse: string | null;
	priceList: string | null;
	baseCurrency: string | null;
	transactionCurrency: string | null;
	tenderCurrencies: string[];
	generationId: string;
	createdAt: string;
	updatedAt: string;
	lastValidatedAt: string | null;
	validity: "valid" | "stale" | "invalid";
	staleUsable: boolean;
	featureFlags: Record<string, boolean>;
	resources: Record<LocalSnapshotResourceKey, LocalSnapshotResourceState>;
};

export type LocalSnapshotValidationResult = {
	valid: boolean;
	usable: boolean;
	stale: boolean;
	reasons: string[];
	blockingResources: LocalSnapshotResourceKey[];
};

export type LocalSnapshotManifestInput = {
	buildVersion?: string | null;
	posProfile?: Record<string, any> | null;
	openingShift?: Record<string, any> | null;
	itemCount?: number;
	hasPriceListCache?: boolean;
	hasCurrencyOptions?: boolean;
	hasExchangeRates?: boolean;
	hasPaymentMethodCurrencyMap?: boolean;
	hasPricingSnapshot?: boolean;
	hasOffers?: boolean;
	customerCount?: number;
	now?: number;
	previous?: LocalSnapshotManifest | null;
};

function nowIso(now = Date.now()) {
	return new Date(now).toISOString();
}

function normalizeString(value: unknown) {
	const normalized = String(value ?? "").trim();
	return normalized || null;
}

function generationId(now = Date.now()) {
	return `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildCompatibilitySignature(input: {
	buildVersion?: string | null;
	posProfile?: Record<string, any> | null;
}) {
	const profile = input.posProfile || {};
	return [
		input.buildVersion || "unknown-build",
		profile.name || "no-profile",
		profile.modified || "no-profile-version",
		profile.company || "no-company",
		profile.warehouse || "no-warehouse",
		profile.selling_price_list || "no-price-list",
		profile.currency || "no-currency",
	].join("::");
}

function makeResource(
	key: LocalSnapshotResourceKey,
	required: boolean,
	ready: boolean,
	options: {
		now: string;
		localVersion?: string | null;
		staleUsable?: boolean;
		error?: string | null;
	} = { now: nowIso() },
): LocalSnapshotResourceState {
	const staleUsable = options.staleUsable !== false;
	return {
		key,
		required,
		state: ready ? "ready" : "missing",
		localVersion: options.localVersion || null,
		remoteVersion: null,
		lastHydratedAt: ready ? options.now : null,
		lastRemoteRefreshAt: null,
		staleUsable,
		blocking: required && !ready,
		error: options.error || null,
	};
}

export function buildLocalSnapshotManifest(
	input: LocalSnapshotManifestInput,
): LocalSnapshotManifest {
	const profile = input.posProfile || {};
	const now = input.now || Date.now();
	const iso = nowIso(now);
	const payments = Array.isArray(profile.payments) ? profile.payments : [];
	const tenderCurrencies = Array.from(
		new Set(
			payments
				.map((payment) => payment?.currency || profile.currency)
				.filter(Boolean)
				.map(String),
		),
	);
	const hasPaymentMethods = payments.length > 0;
	const hasCurrency = Boolean(profile.currency);
	const hasMultiCurrency = tenderCurrencies.some(
		(currency) => currency && currency !== profile.currency,
	);
	const hasExchangeRates = !hasMultiCurrency || Boolean(input.hasExchangeRates);
	const hasItems = Number(input.itemCount || 0) > 0;
	const hasPriceList = Boolean(profile.selling_price_list || input.hasPriceListCache);
	const resources: LocalSnapshotManifest["resources"] = {
		pos_profile: makeResource("pos_profile", true, Boolean(profile.name), {
			now: iso,
			localVersion: profile.modified || profile.name || null,
			staleUsable: true,
		}),
		payment_methods: makeResource("payment_methods", true, hasPaymentMethods, {
			now: iso,
			localVersion: String(payments.length || 0),
			staleUsable: true,
		}),
		currency: makeResource("currency", true, hasCurrency && Boolean(input.hasCurrencyOptions || profile.currency), {
			now: iso,
			localVersion: profile.currency || null,
			staleUsable: true,
		}),
		exchange_rates: makeResource("exchange_rates", hasMultiCurrency, hasExchangeRates, {
			now: iso,
			localVersion: hasExchangeRates ? "cached" : null,
			staleUsable: true,
		}),
		items: makeResource("items", true, hasItems, {
			now: iso,
			localVersion: String(input.itemCount || 0),
			staleUsable: true,
		}),
		cart_pricing: makeResource("cart_pricing", true, hasPriceList, {
			now: iso,
			localVersion: profile.selling_price_list || null,
			staleUsable: true,
		}),
		pricing_rules: makeResource("pricing_rules", false, Boolean(input.hasPricingSnapshot), {
			now: iso,
			localVersion: input.hasPricingSnapshot ? "cached" : null,
			staleUsable: true,
		}),
		offers: makeResource("offers", false, Boolean(input.hasOffers), {
			now: iso,
			localVersion: input.hasOffers ? "cached" : null,
			staleUsable: true,
		}),
		customers: makeResource("customers", false, Number(input.customerCount || 0) > 0, {
			now: iso,
			localVersion: String(input.customerCount || 0),
			staleUsable: true,
		}),
	};
	const validation = validateLocalSnapshotManifest({
		schemaVersion: LOCAL_SNAPSHOT_SCHEMA_VERSION,
		compatibilitySignature: buildCompatibilitySignature({
			buildVersion: input.buildVersion,
			posProfile: profile,
		}),
		profileName: normalizeString(profile.name),
		company: normalizeString(profile.company),
		warehouse: normalizeString(profile.warehouse),
		priceList: normalizeString(profile.selling_price_list),
		baseCurrency: normalizeString(profile.currency),
		transactionCurrency: normalizeString(profile.currency),
		tenderCurrencies,
		generationId: input.previous?.generationId || generationId(now),
		createdAt: input.previous?.createdAt || iso,
		updatedAt: iso,
		lastValidatedAt: iso,
		validity: "valid",
		staleUsable: true,
		featureFlags: {
			multiCurrency: hasMultiCurrency,
			offlinePricingRules: Boolean(input.hasPricingSnapshot),
			offlineOffers: Boolean(input.hasOffers),
		},
		resources,
	});

	return {
		schemaVersion: LOCAL_SNAPSHOT_SCHEMA_VERSION,
		compatibilitySignature: buildCompatibilitySignature({
			buildVersion: input.buildVersion,
			posProfile: profile,
		}),
		profileName: normalizeString(profile.name),
		company: normalizeString(profile.company),
		warehouse: normalizeString(profile.warehouse),
		priceList: normalizeString(profile.selling_price_list),
		baseCurrency: normalizeString(profile.currency),
		transactionCurrency: normalizeString(profile.currency),
		tenderCurrencies,
		generationId: validation.valid
			? input.previous?.generationId || generationId(now)
			: generationId(now),
		createdAt: input.previous?.createdAt || iso,
		updatedAt: iso,
		lastValidatedAt: iso,
		validity: validation.valid ? "valid" : "invalid",
		staleUsable: validation.usable,
		featureFlags: {
			multiCurrency: hasMultiCurrency,
			offlinePricingRules: Boolean(input.hasPricingSnapshot),
			offlineOffers: Boolean(input.hasOffers),
		},
		resources,
	};
}

export function validateLocalSnapshotManifest(
	manifest: LocalSnapshotManifest | null | undefined,
	options: {
		buildVersion?: string | null;
		posProfile?: Record<string, any> | null;
		now?: number;
		maxAgeMs?: number;
	} = {},
): LocalSnapshotValidationResult {
	const reasons: string[] = [];
	if (!manifest) {
		return {
			valid: false,
			usable: false,
			stale: false,
			reasons: ["manifest_missing"],
			blockingResources: [],
		};
	}
	if (manifest.schemaVersion !== LOCAL_SNAPSHOT_SCHEMA_VERSION) {
		reasons.push("schema_version_mismatch");
	}
	if (manifest.validity === "invalid") {
		reasons.push("manifest_invalid");
	}
	const expectedSignature = options.posProfile
		? buildCompatibilitySignature({
				buildVersion: options.buildVersion,
				posProfile: options.posProfile,
			})
		: null;
	if (
		expectedSignature &&
		manifest.compatibilitySignature !== expectedSignature
	) {
		reasons.push("compatibility_signature_mismatch");
	}
	const now = options.now || Date.now();
	const maxAgeMs = options.maxAgeMs || LOCAL_SNAPSHOT_STALE_AFTER_MS;
	const updatedAt = Date.parse(manifest.updatedAt || "");
	const stale =
		Number.isFinite(updatedAt) && now - updatedAt > maxAgeMs;
	if (stale) {
		reasons.push("manifest_stale");
	}
	const blockingResources = Object.values(manifest.resources || {})
		.filter((resource) => resource.required && resource.blocking)
		.map((resource) => resource.key);
	if (blockingResources.length) {
		reasons.push("required_resource_missing");
	}
	const valid =
		!reasons.includes("schema_version_mismatch") &&
		!reasons.includes("manifest_invalid") &&
		!reasons.includes("compatibility_signature_mismatch") &&
		blockingResources.length === 0;
	return {
		valid,
		usable: valid && (!stale || manifest.staleUsable),
		stale,
		reasons,
		blockingResources,
	};
}

export function getLocalSnapshotManifest(): LocalSnapshotManifest | null {
	return memory.local_snapshot_manifest || null;
}

export function getLocalSnapshotManifestStatus() {
	return memory.local_snapshot_manifest_status || null;
}

export function setLocalSnapshotManifestStatus(status: Record<string, any> | null) {
	memory.local_snapshot_manifest_status = status
		? JSON.parse(JSON.stringify(status))
		: null;
	persist("local_snapshot_manifest_status");
}

export async function commitLocalSnapshotManifestAtomic(
	manifest: LocalSnapshotManifest,
) {
	const metric = startPerfMeasure("pos.boot.snapshot_atomic_commit", {
		source: "local",
		snapshot_generation: manifest.generationId,
	});
	try {
		await withDbTransaction("rw", "settings", async () => {
			await db.table("settings").put({
				key: "local_snapshot_manifest",
				value: JSON.parse(JSON.stringify(manifest)),
			});
		});
		memory.local_snapshot_manifest = JSON.parse(JSON.stringify(manifest));
		metric.finish("success", {
			snapshot_validity: manifest.validity,
		});
		return manifest;
	} catch (error) {
		metric.fail(error);
		throw error;
	}
}
