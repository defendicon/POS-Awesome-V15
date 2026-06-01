import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
	commitLocalSnapshotManifestAtomic,
	getLocalSnapshotManifest,
	getLocalSnapshotManifestStatus,
	getStoredItemsCountByScope,
	initPromise,
	isOffline,
	memory,
	setLocalSnapshotManifestStatus,
	type LocalSnapshotManifest,
	type LocalSnapshotResourceKey,
	type LocalSnapshotResourceState,
	buildLocalSnapshotManifest,
	validateLocalSnapshotManifest,
} from "../../offline";
import {
	startPerfMeasure,
	type PerfMeasurement,
	type PerfTags,
} from "../utils/perf";

declare const __BUILD_VERSION__: string;

export type BootReadinessPhase =
	| "initialising"
	| "reading_local_snapshot"
	| "local_snapshot_valid"
	| "local_snapshot_missing"
	| "local_snapshot_invalid"
	| "local_sell_ready"
	| "refreshing_remote"
	| "fresh_sell_ready"
	| "degraded_sell_ready"
	| "blocked_no_valid_snapshot"
	| "recovery_required"
	| "failed";

export type SellReadySource =
	| "local_valid_snapshot"
	| "online_minimum_bootstrap"
	| "degraded_cached_snapshot"
	| null;

type RegisterData = {
	pos_profile?: Record<string, any> | null;
	pos_opening_shift?: Record<string, any> | null;
};

type RefreshResult = {
	ok: boolean;
	source: SellReadySource;
};

function buildVersion() {
	return typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : null;
}

function nowIso() {
	return new Date().toISOString();
}

function getItemScope(profile: Record<string, any> | null | undefined) {
	if (!profile?.name) {
		return "";
	}
	return `${profile.name}_${profile.warehouse || "no_warehouse"}`;
}

function objectKeyCount(value: unknown) {
	return value && typeof value === "object" ? Object.keys(value).length : 0;
}

function hasCachedExchangeRates(profile: Record<string, any> | null | undefined) {
	const payments = Array.isArray(profile?.payments) ? profile?.payments : [];
	const multiCurrencyRequired = payments.some(
		(payment) => payment?.currency && payment.currency !== profile?.currency,
	);
	if (!multiCurrencyRequired) {
		return true;
	}
	return objectKeyCount(memory.exchange_rate_cache) > 0;
}

function hasPricingSnapshot() {
	return Boolean(memory.pricing_rules_last_sync || memory.pricing_rules_context);
}

function hasOffers() {
	return Array.isArray(memory.offers_cache) && memory.offers_cache.length > 0;
}

function firstBlockingResource(
	resources: Record<LocalSnapshotResourceKey, LocalSnapshotResourceState> | null,
) {
	return (
		Object.values(resources || {}).find((resource) => resource.blocking)?.key ||
		null
	);
}

export const useBootReadinessStore = defineStore("boot-readiness", () => {
	const phase = ref<BootReadinessPhase>("initialising");
	const manifest = ref<LocalSnapshotManifest | null>(getLocalSnapshotManifest());
	const manifestStatus = ref<Record<string, any> | null>(
		getLocalSnapshotManifestStatus(),
	);
	const resources = ref<
		Record<LocalSnapshotResourceKey, LocalSnapshotResourceState> | null
	>(manifest.value?.resources || null);
	const sellReady = ref(false);
	const sellReadySource = ref<SellReadySource>(null);
	const blockingResource = ref<LocalSnapshotResourceKey | null>(
		firstBlockingResource(resources.value),
	);
	const localSellReadyAt = ref<string | null>(null);
	const freshSellReadyAt = ref<string | null>(null);
	const lastCriticalSnapshotRefreshAt = ref<string | null>(
		manifest.value?.updatedAt || null,
	);
	const remoteRefreshState = ref<"idle" | "refreshing" | "success" | "failure">(
		"idle",
	);
	const remoteRefreshError = ref<string | null>(null);
	const initialised = ref(false);
	const initialisingPromise = ref<Promise<void> | null>(null);
	const shellVisible = ref(false);
	const sellReadyMetric = ref<PerfMeasurement | null>(null);
	const bootStartedAt = ref<number>(Date.now());

	const diagnosticState = computed(() => ({
		phase: phase.value,
		sellReady: sellReady.value,
		sellReadySource: sellReadySource.value,
		blockingResource: blockingResource.value,
		localSellReadyAt: localSellReadyAt.value,
		freshSellReadyAt: freshSellReadyAt.value,
		lastCriticalSnapshotRefreshAt: lastCriticalSnapshotRefreshAt.value,
		remoteRefreshState: remoteRefreshState.value,
		remoteRefreshError: remoteRefreshError.value,
		manifest: manifest.value,
		manifestStatus: manifestStatus.value,
		resources: resources.value,
		offline: isOffline(),
	}));

	function transition(nextPhase: BootReadinessPhase) {
		phase.value = nextPhase;
	}

	function startShellVisible() {
		if (shellVisible.value) {
			return;
		}
		shellVisible.value = true;
		startPerfMeasure("pos.boot.shell_visible", { source: "app" }).finish(
			"success",
		);
	}

	function startSellReadyMetric(tags: PerfTags = {}) {
		if (!sellReadyMetric.value) {
			sellReadyMetric.value = startPerfMeasure("pos.boot.sell_ready", tags);
		}
		return sellReadyMetric.value;
	}

	function finishSellReady(source: SellReadySource, tags: PerfTags = {}) {
		if (sellReady.value) {
			return;
		}
		sellReady.value = true;
		sellReadySource.value = source;
		localSellReadyAt.value = nowIso();
		startSellReadyMetric({
			source: source || "unknown",
			online: isOffline() ? "offline" : "online",
		}).finish("success", {
			...tags,
			source: source || "unknown",
			online: isOffline() ? "offline" : "online",
			snapshot_generation: manifest.value?.generationId || null,
		});
		startPerfMeasure(
			source === "degraded_cached_snapshot"
				? "pos.boot.degraded_sell_ready"
				: "pos.boot.local_sell_ready",
			{
				source: source || "unknown",
			},
		).finish("success");
	}

	function blockSellReady(reason: string) {
		sellReady.value = false;
		sellReadySource.value = null;
		startPerfMeasure("pos.boot.blocked_no_valid_snapshot", {
			reason,
			blocking_resource: blockingResource.value || "unknown",
			online: isOffline() ? "offline" : "online",
		}).finish("failure");
	}

	async function buildManifestFromRuntime(
		registerData?: RegisterData | null,
	) {
		const profile =
			registerData?.pos_profile ||
			(manifest.value?.profileName ? memory.pos_opening_storage?.pos_profile : null) ||
			memory.pos_opening_storage?.pos_profile ||
			null;
		const readMetric = startPerfMeasure("pos.boot.manifest_read", {
			source: "indexeddb",
		});
		const itemCount = profile?.name
			? await getStoredItemsCountByScope(getItemScope(profile))
			: 0;
		readMetric.finish("success", {
			cache_hit: Boolean(manifest.value),
		});
		return buildLocalSnapshotManifest({
			buildVersion: buildVersion(),
			posProfile: profile,
			openingShift:
				registerData?.pos_opening_shift ||
				memory.pos_opening_storage?.pos_opening_shift ||
				null,
			itemCount,
			customerCount: Array.isArray(memory.customer_storage)
				? memory.customer_storage.length
				: 0,
			hasPriceListCache:
				objectKeyCount(memory.price_list_cache) > 0 ||
				Boolean(profile?.selling_price_list),
			hasCurrencyOptions:
				objectKeyCount(memory.currency_options_cache) > 0 ||
				Boolean(profile?.currency),
			hasExchangeRates: hasCachedExchangeRates(profile),
			hasPaymentMethodCurrencyMap:
				objectKeyCount(memory.payment_method_currency_cache) > 0,
			hasPricingSnapshot: hasPricingSnapshot(),
			hasOffers: hasOffers(),
			previous: manifest.value,
		});
	}

	async function evaluateSellReady(registerData?: RegisterData | null) {
		const validateMetric = startPerfMeasure("pos.boot.manifest_validate", {
			source: "local",
		});
		const nextManifest = await buildManifestFromRuntime(registerData);
		const profile =
			registerData?.pos_profile ||
			memory.pos_opening_storage?.pos_profile ||
			null;
		const validation = validateLocalSnapshotManifest(nextManifest, {
			buildVersion: buildVersion(),
			posProfile: profile,
		});
		manifest.value = nextManifest;
		resources.value = nextManifest.resources;
		blockingResource.value = firstBlockingResource(nextManifest.resources);
		manifestStatus.value = {
			valid: validation.valid,
			usable: validation.usable,
			stale: validation.stale,
			reasons: validation.reasons,
			blocking_resources: validation.blockingResources,
			updated_at: nowIso(),
		};
		setLocalSnapshotManifestStatus(manifestStatus.value);
		validateMetric.finish(validation.usable ? "success" : "failure", {
			snapshot_valid: validation.valid,
			snapshot_usable: validation.usable,
			blocking_resource: blockingResource.value || null,
		});

		if (validation.usable) {
			await commitLocalSnapshotManifestAtomic(nextManifest);
			lastCriticalSnapshotRefreshAt.value = nextManifest.updatedAt;
			transition(validation.stale ? "degraded_sell_ready" : "local_sell_ready");
			finishSellReady(
				validation.stale ? "degraded_cached_snapshot" : "local_valid_snapshot",
				{ snapshot_stale: validation.stale },
			);
			return {
				ok: true,
				source: sellReadySource.value,
			} as RefreshResult;
		}

		transition(
			manifest.value ? "local_snapshot_invalid" : "local_snapshot_missing",
		);
		blockSellReady(validation.reasons[0] || "not_usable");
		return {
			ok: false,
			source: null,
		} as RefreshResult;
	}

	async function initialiseBoot(registerData?: RegisterData | null) {
		if (initialisingPromise.value) {
			return initialisingPromise.value;
		}
		initialisingPromise.value = (async () => {
			bootStartedAt.value = Date.now();
			startSellReadyMetric({ source: "readiness_aggregator" });
			transition("reading_local_snapshot");
			const hydrateMetric = startPerfMeasure("pos.boot.snapshot_hydrate", {
				source: "local",
			});
			try {
				await initPromise;
				manifest.value = getLocalSnapshotManifest();
				manifestStatus.value = getLocalSnapshotManifestStatus();
				hydrateMetric.finish("success", {
					cache_hit: Boolean(manifest.value),
				});
				await evaluateSellReady(registerData);
				initialised.value = true;
			} catch (error) {
				hydrateMetric.fail(error);
				transition("failed");
				throw error;
			} finally {
				initialisingPromise.value = null;
			}
		})();
		return initialisingPromise.value;
	}

	async function applyRegisterData(registerData: RegisterData) {
		await initialiseBoot(registerData);
		return evaluateSellReady(registerData);
	}

	async function refreshCriticalResourcesInBackground(
		refresher: () => Promise<unknown>,
		options: { blockUntilReady?: boolean; reason?: string } = {},
	) {
		if (remoteRefreshState.value === "refreshing") {
			return false;
		}
		remoteRefreshState.value = "refreshing";
		remoteRefreshError.value = null;
		transition("refreshing_remote");
		startPerfMeasure("pos.boot.remote_refresh_start", {
			source: options.reason || "background",
			blocking: Boolean(options.blockUntilReady),
		}).finish("success");
		const metric = startPerfMeasure("pos.boot.remote_refresh_complete", {
			source: options.reason || "background",
			blocking: Boolean(options.blockUntilReady),
		});
		try {
			await refresher();
			remoteRefreshState.value = "success";
			await evaluateSellReady();
			if (sellReady.value) {
				freshSellReadyAt.value = nowIso();
				transition("fresh_sell_ready");
				if (sellReadySource.value === null) {
					finishSellReady("online_minimum_bootstrap");
				}
				startPerfMeasure("pos.boot.fresh_sell_ready", {
					source: sellReadySource.value || "online_minimum_bootstrap",
				}).finish("success");
			}
			metric.finish("success");
			return true;
		} catch (error) {
			remoteRefreshState.value = "failure";
			remoteRefreshError.value =
				error instanceof Error ? error.message : String(error || "Unknown error");
			if (!sellReady.value) {
				transition(isOffline() ? "blocked_no_valid_snapshot" : "recovery_required");
			}
			metric.fail(error);
			return false;
		}
	}

	function getBootDiagnosticState() {
		return diagnosticState.value;
	}

	return {
		phase,
		manifest,
		manifestStatus,
		resources,
		sellReady,
		sellReadySource,
		blockingResource,
		localSellReadyAt,
		freshSellReadyAt,
		lastCriticalSnapshotRefreshAt,
		remoteRefreshState,
		remoteRefreshError,
		diagnosticState,
		startShellVisible,
		initialiseBoot,
		applyRegisterData,
		evaluateSellReady,
		refreshCriticalResourcesInBackground,
		getBootDiagnosticState,
	};
});
