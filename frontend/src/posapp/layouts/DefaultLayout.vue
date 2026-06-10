<template>
	<v-app class="container1 posapp pos-theme-root" :class="rtlClasses">
		<AppLoadingOverlay :visible="globalLoading" />
		<UpdatePrompt />
		<v-main class="main-content">
			<ClosingDialog />
			<Navbar
				:pos-profile="posProfile"
				:pending-invoices="pendingInvoicesCount"
				:last-invoice-id="lastInvoiceId"
				:network-online="networkOnline"
				:server-online="serverOnline"
				:server-connecting="serverConnecting"
				:is-ip-host="isIpHost"
				:sync-totals="syncTotals"
				:manual-offline="manualOffline"
				:cache-usage="cacheUsage"
				:cache-usage-loading="cacheUsageLoading"
				:cache-usage-details="cacheUsageDetails"
				:loading-progress="loadingProgress"
				:loading-active="loadingActive"
				:loading-indeterminate="loadingIndeterminate"
				:loading-message="loadingMessage"
				:bootstrap-warning-active="visibleBootstrapWarningActive"
				:bootstrap-warning-tooltip="visibleBootstrapWarningTooltip"
				:bootstrap-capabilities="visibleBootstrapCapabilitySummaries"
				@nav-click="handleNavClick"
				@close-shift="handleCloseShift"
				@print-last-invoice="handlePrintLastInvoice"
				@sync-invoices="handleSyncInvoices"
				@toggle-offline="handleToggleOffline"
				@retry-status="handleRetryStatus"
				@refresh-offline-data="handleRefreshOfflineData"
				@rebuild-offline-data="handleRebuildOfflineData"
				@open-offline-diagnostics="handleOpenOfflineDiagnostics"
				@toggle-theme="handleToggleTheme"
				@logout="handleLogout"
				@open-customer-display="handleOpenCustomerDisplay"
				@refresh-cache-usage="handleRefreshCacheUsage"
				@update-after-delete="handleUpdateAfterDelete"
			/>
			<v-snackbar
				v-model="bootstrapSnackbarVisible"
				:timeout="8000"
				:color="bootstrapAlertType"
				location="top center"
				class="bootstrap-warning-snackbar"
			>
				<div class="bootstrap-warning-snackbar__content">
					<div class="bootstrap-warning-title">
						{{ visibleBootstrapWarningTitle }}
					</div>
					<div
						v-for="message in visibleBootstrapWarningMessages"
						:key="message"
						class="bootstrap-warning-message"
					>
						{{ message }}
					</div>
					<div v-if="visibleBootstrapRecoveryMessage" class="bootstrap-warning-message">
						{{ visibleBootstrapRecoveryMessage }}
					</div>
				</div>
				<template #actions>
					<v-btn
						variant="text"
						class="bootstrap-warning-snackbar__close"
						@click="bootstrapSnackbarVisible = false"
					>
						{{ __("Close") }}
					</v-btn>
				</template>
			</v-snackbar>
			<div class="page-content">
				<!-- Replaced router-view with slot for layout usage -->
				<slot />
			</div>
		</v-main>
	</v-app>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, getCurrentInstance } from "vue";
// Note paths updated to be relative to layouts/ directory
import Navbar from "../components/Navbar.vue";
import ClosingDialog from "../components/pos/shell/ClosingDialog.vue";
import AppLoadingOverlay from "../components/ui/LoadingOverlay.vue";
import UpdatePrompt from "../components/ui/UpdatePrompt.vue";
import { useLoading } from "../composables/core/useLoading.js";
import { usePosShift } from "../composables/pos/shared/usePosShift";
import { loadingState, initLoadingSources, setSourceProgress, markSourceLoaded } from "../utils/loading.js";
import { useCustomersStore } from "../stores/customersStore.js";
import { useSyncStore } from "../stores/syncStore.js";
import { useToastStore } from "../stores/toastStore.js";
import { useUIStore } from "../stores/uiStore.js";
import { useUpdateStore } from "../stores/updateStore.js";
import { useItemsStore } from "../stores/itemsStore.js";
import { usePricingRulesStore } from "../stores/pricingRulesStore";
import { useOfflineSyncStore } from "../stores/offlineSyncStore";
import { storeToRefs } from "pinia";
import {
	getOpeningStorage,
	getBootstrapSnapshot,
	setBootstrapSnapshot,
	getBootstrapSnapshotStatus,
	setBootstrapSnapshotStatus,
	getBootstrapLimitedMode,
	setBootstrapLimitedMode,
	getCacheUsageEstimate,
	checkDbHealth,
	queueHealthCheck,
	purgeOldQueueEntries,
	initPromise,
	memoryInitPromise,
	ensureOfflineQueueReady,
	toggleManualOffline,
	isManualOffline as getIsManualOffline,
	syncOfflineInvoices,
	getPendingOfflineInvoiceCount,
	getPendingOfflineCashMovementCount,
	syncOfflineCashMovements,
	isOffline,
	getLastSyncTotals,
	getSyncResourceDefinitions,
	getSyncResourceState,
	listSyncResourceStates,
} from "../../offline/index";
import { SyncCoordinator } from "../../offline/sync/SyncCoordinator";
import { createOfflineSyncRuntime } from "../../offline/sync/runtime";
import {
	buildOfflineSyncProfile,
	filterSupportedOfflineSyncResources,
	filterSupportedOfflineSyncStates,
	runSupportedOfflineSyncResource,
} from "../../offline/sync/resourceRunner";
import {
	createBootstrapSnapshotFromRegisterData,
	resolveBootstrapRuntimeState,
	validateBootstrapSnapshot,
} from "../../offline/bootstrapSnapshot";
import { useRtl } from "../composables/core/useRtl";
import { useBootSync } from "../composables/runtime/useBootSync";
import { useNetworkLifecycle } from "../composables/runtime/useNetworkLifecycle";
import { useUpdateChecks } from "../composables/runtime/useUpdateChecks";
import { useCustomerReadiness } from "../composables/runtime/useCustomerReadiness";
import { useQueueMetrics } from "../composables/runtime/useQueueMetrics";
import { ensureItemsReady } from "../modules/items/itemLoadingCoordinator";
import authService from "../services/authService.js";
import { getValidCachedOpeningForCurrentUser } from "../utils/openingCache";
import { formatBootstrapWarning, shouldShowBootstrapBanner } from "../utils/bootstrapWarnings";
import { listenForBootstrapSnapshotUpdates } from "../utils/bootstrapRuntimeEvents";
import {
	resolveBootstrapWarningUiState,
	shouldLiftBootstrapWarningStartupGate,
} from "../utils/bootstrapWarningVisibility";

/**
 * Frappe Desk UI selectors to hide in POS view.
 */
const FRAPPE_NAV_SELECTORS = [
	".body-sidebar-container",
	".body-sidebar",
	".desk-sidebar",
	".app-sidebar",
	".layout-side-section",
	".page-head",
	".navbar.navbar-default.navbar-fixed-top",
	".sidebar-overlay",
];

const FRAPPE_NAV_SELECTOR_STRING = FRAPPE_NAV_SELECTORS.join(", ");

// Composable setup
const { rtlClasses } = useRtl();
// Use the global theme plugin via inject or assume it's available on globalProperties if not using composable yet
// For Composition API, we can access $theme if provided, or rely on custom logic.
// However, the original code used `this.$theme`. We can try injecting it if provided, or access via internal instance.
// Better way: simply assume it's attached to the app. In pure script setup, `this` is not available.
// We'll use getCurrentInstance().proxy to access globals if needed, but ideally we should refactor theme to a store/composable.
// For now, let's use a proxy helper.
const instance = getCurrentInstance();
const $theme = instance?.proxy?.$theme || { toggle: () => {}, isDark: false }; // Fallback
const __ = instance?.proxy?.__ || ((value) => value);
const BUILD_VERSION = typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : null;
const OFFLINE_SYNC_SCHEMA_VERSION = "2026-04-09";
const OFFLINE_SYNC_TIMER_INTERVAL_MS = 60_000;

// Utils
const createFallbackLoadingScope = () =>
	computed(() => ({
		count: 0,
		kind: "background",
		blocking: false,
		message: "",
		progress: null,
	}));

const loadingApi = (() => {
	try {
		return typeof useLoading === "function" ? useLoading() : null;
	} catch (error) {
		console.warn("Falling back to inert POS loading state", error);
		return null;
	}
})();
const globalLoading = loadingApi?.overlayVisible || ref(false);
const getScopeState =
	typeof loadingApi?.getScopeState === "function" ? loadingApi.getScopeState : createFallbackLoadingScope;
const { get_closing_data } = usePosShift();
const syncStore = useSyncStore();
const customersStore = useCustomersStore();
const itemsStore = useItemsStore();
const offlineSyncStore = useOfflineSyncStore();
const toastStore = useToastStore();
const uiStore = useUIStore();
const updateStore = useUpdateStore();
const pricingRulesStore = usePricingRulesStore();

// UI Store State
const { posProfile, lastInvoiceId, posOpeningShift } = storeToRefs(uiStore);

const { pendingInvoicesCount } = storeToRefs(syncStore);
const { loadProgress, customersLoaded, selectedCustomer } = storeToRefs(customersStore);
const {
	itemsLoaded,
	isBackgroundLoading: itemsBackgroundLoading,
	loadProgress: itemsLoadProgress,
} = storeToRefs(itemsStore);
const supportedOfflineSyncResources = filterSupportedOfflineSyncResources(getSyncResourceDefinitions());
const syncCoordinator = new SyncCoordinator({
	concurrency: 1,
	resources: supportedOfflineSyncResources,
	runResource: async (resource, trigger) => runOfflineSyncResource(resource, trigger),
	onStateChange: (states) => {
		offlineSyncStore.setResourceStates(filterSupportedOfflineSyncStates(states));
	},
});
const offlineSyncRuntime = createOfflineSyncRuntime({
	canSync: canRunOfflineSync,
	canRunTimerSync: canRunTimerOfflineSync,
	runTrigger: (trigger) => syncCoordinator.runTrigger(trigger),
	timerIntervalMs: OFFLINE_SYNC_TIMER_INTERVAL_MS,
});

// State
// const posProfile = ref({}); // Migrated to UI Store

// Network status
const networkOnline = ref(navigator.onLine || false);
const serverOnline = ref(false);
const serverConnecting = ref(false);
const internetReachable = ref(false);
const isIpHost = ref(false);

const manualOffline = ref(false);

const queueMetrics = useQueueMetrics({
	getCacheUsageEstimate,
	getPendingOfflineInvoiceCount,
	getPendingOfflineCashMovementCount,
	syncOfflineInvoices,
	syncOfflineCashMovements,
	isOffline,
	syncStore,
	toastStore,
	translate: __,
});
const {
	cacheUsage,
	cacheUsageLoading,
	cacheUsageDetails,
	syncTotals,
	refreshCacheUsage,
	checkCacheCapacity,
	syncQueues,
	formatDiagnosticsDetail,
} = queueMetrics;
const bootstrapStatus = ref(getBootstrapSnapshotStatus());
const bootstrapLimitedMode = ref(getBootstrapLimitedMode());
const bootstrapSnackbarVisible = ref(false);
const confirmedBootstrapDecisionKey = ref("");
const initialBootstrapSyncSettled = ref(false);
const startupBootstrapWarningsReady = ref(false);
const startupOfflineWarmupInFlight = ref(false);
const startupOfflineWarmupKey = ref("");
let _sidebarObserver = null;
let _navPollTimer = null;
let removeBootstrapSnapshotListener = null;

// Event Bus
const eventBus = instance?.proxy?.eventBus;

// Initialize loading sources immediately in setup so watchers can mark them 100%
initLoadingSources(["init", "items", "customers"]);

const bootSync = useBootSync({
	offlineSyncRuntime,
	evaluateBootstrapSnapshot,
	getLastRunSummary: () => syncCoordinator.getLastRunSummary(),
	onRefreshStateChange: (active) => offlineSyncStore.setRefreshActive(active),
});

const updateChecks = useUpdateChecks({
	updateStore,
	buildVersion: BUILD_VERSION,
});

const networkLifecycle = useNetworkLifecycle({
	networkOnline,
	serverOnline,
	serverConnecting,
	internetReachable,
	isIpHost,
	eventBus,
	realtime: frappe?.realtime,
	isManualOffline: getIsManualOffline,
	onSyncInvoices: () => handleSyncInvoices(),
	onConnectivityRecovered: () => triggerOnlineResumeSync(),
	onEvaluateBootstrap: (options) => evaluateBootstrapSnapshot(options),
	onRefreshTaxInclusive: () => refreshTaxInclusiveSetting(),
});

const customerReadiness = useCustomerReadiness({
	profile: posProfile,
	isOnline: () => navigator.onLine,
	isManualOffline: getIsManualOffline,
	setProfile: customersStore.setPosProfile,
	load: customersStore.get_customer_names,
	onProfileReady: () => {
		void scheduleBootCriticalWarmSync();
		if (navigator.onLine && !getIsManualOffline()) {
			void refreshTaxInclusiveSetting();
			void refreshOfflinePricingRules();
		}
	},
});

function ensureStartupItemsReady(profile) {
	if (!profile?.name) {
		return;
	}

	const customer = selectedCustomer.value || profile.customer || null;
	const priceList = profile.selling_price_list || null;

	void ensureItemsReady({
		profile,
		customer,
		priceList,
		initialize: async () => {
			await memoryInitPromise;
			await itemsStore.initialize(profile, customer, priceList);
		},
	}).catch((error) => {
		console.error("Failed to initialize POS item catalog", error);
	});
}

function getCurrentBootstrapProfile() {
	return posProfile.value || frappe?.boot?.pos_profile || null;
}

function getCurrentBootstrapOpeningShift() {
	return posOpeningShift.value || getOpeningStorage()?.pos_opening_shift || null;
}

function buildBootstrapValidationKey(validation) {
	return JSON.stringify({
		mode: validation?.mode || "normal",
		reasons: validation?.reasons || [],
		missingPrerequisites: validation?.missingPrerequisites || [],
	});
}

function buildCurrentBootstrapValidationInput() {
	const profile = getCurrentBootstrapProfile();
	return {
		buildVersion: BUILD_VERSION,
		profileName: profile?.name || null,
		profileModified: profile?.modified || null,
		sessionUser: frappe?.session?.user || null,
	};
}

function ensureBootstrapSnapshotIsCurrent() {
	const currentSnapshot = getBootstrapSnapshot();
	const registerData = {
		pos_profile: getCurrentBootstrapProfile(),
		pos_opening_shift: getCurrentBootstrapOpeningShift(),
	};

	if (!registerData.pos_profile && !registerData.pos_opening_shift) {
		return currentSnapshot;
	}

	const nextSnapshot = createBootstrapSnapshotFromRegisterData(registerData, currentSnapshot, {
		buildVersion: BUILD_VERSION,
	});

	if (JSON.stringify(currentSnapshot || null) !== JSON.stringify(nextSnapshot)) {
		setBootstrapSnapshot(nextSnapshot);
	}

	return nextSnapshot;
}

function persistBootstrapRuntime(validation, decision) {
	const nextStatus = {
		mode: validation.mode,
		runtime_mode: decision.mode,
		reasons: validation.reasons,
		missing_prerequisites: validation.missingPrerequisites,
		warning_codes: decision.warningCodes,
		capabilities: validation.capabilities,
		capability_summaries: decision.capabilitySummaries,
		primary_warning: decision.primaryWarning,
	};

	bootstrapStatus.value = nextStatus;
	bootstrapLimitedMode.value = decision.limitedMode;
	setBootstrapSnapshotStatus(nextStatus);
	setBootstrapLimitedMode(decision.limitedMode);
}

function buildBootstrapConfirmationMessage(validation) {
	const details = Array.from(
		new Set((validation?.reasons || []).map((code) => formatBootstrapWarning(code, __))),
	);

	return [
		__("Offline snapshot does not match the current POS state."),
		...details,
		__("Press OK to continue offline with a warning, or Cancel to retry."),
	].join("\n\n");
}

function evaluateBootstrapSnapshot(options = {}) {
	const allowPrompt = !!options.allowPrompt;
	const snapshot = ensureBootstrapSnapshotIsCurrent();
	const validation = validateBootstrapSnapshot(snapshot, buildCurrentBootstrapValidationInput());
	const decisionKey = buildBootstrapValidationKey(validation);
	let decision = resolveBootstrapRuntimeState(validation, {
		continueOffline: confirmedBootstrapDecisionKey.value === decisionKey,
	});

	if (decision.requiresConfirmation && allowPrompt) {
		const confirmed = window.confirm(buildBootstrapConfirmationMessage(validation));

		if (confirmed) {
			confirmedBootstrapDecisionKey.value = decisionKey;
			decision = resolveBootstrapRuntimeState(validation, {
				continueOffline: true,
			});
		} else {
			confirmedBootstrapDecisionKey.value = "";
			persistBootstrapRuntime(validation, decision);
			window.location.reload();
			return decision;
		}
	} else if (validation.mode !== "confirmation_required") {
		confirmedBootstrapDecisionKey.value = "";
	}

	persistBootstrapRuntime(validation, decision);
	return decision;
}

function getOfflineSyncProfile() {
	return buildOfflineSyncProfile(getCurrentBootstrapProfile());
}

function buildDefaultPricingRulesContext() {
	const profile = getCurrentBootstrapProfile();
	return {
		company: profile?.company || null,
		price_list: profile?.selling_price_list || null,
		currency: profile?.currency || null,
		date: new Date().toISOString().slice(0, 10),
	};
}

async function refreshOfflinePricingRules(options = {}) {
	if (!canRunOfflineSync()) {
		return false;
	}

	const context = buildDefaultPricingRulesContext();
	if (!context.company || !context.price_list || !context.currency) {
		return false;
	}

	try {
		await pricingRulesStore.ensureActiveRules(context, {
			force: options.force === true,
		});
		return true;
	} catch (error) {
		console.error("Failed to refresh offline pricing rules", error);
		return false;
	}
}

function canRunOfflineSync() {
	return !!(getOfflineSyncProfile()?.name && !getIsManualOffline() && navigator.onLine);
}

function canRunTimerOfflineSync() {
	return !!(canRunOfflineSync() && serverOnline.value && !serverConnecting.value);
}

async function callOfflineSyncMethod(method, args = {}) {
	if (typeof frappe === "undefined" || typeof frappe.call !== "function") {
		throw new Error("Frappe call API is unavailable");
	}
	const response = await frappe.call({
		method,
		args,
	});
	return typeof response?.message === "undefined" ? response || {} : response.message;
}

async function runOfflineSyncResource(resource) {
	const profile = getOfflineSyncProfile();
	if (!profile?.name) {
		return {
			status: "idle",
		};
	}

	return runSupportedOfflineSyncResource({
		resource,
		posProfile: profile,
		schemaVersion: OFFLINE_SYNC_SCHEMA_VERSION,
		getPersistedState: getSyncResourceState,
		getRuntimeState: (resourceId) => syncCoordinator.getResourceState(resourceId),
		callOfflineSyncMethod,
	});
}

async function hydrateOfflineSyncResourceStates() {
	try {
		const states = filterSupportedOfflineSyncStates(await listSyncResourceStates());
		syncCoordinator.hydrateResourceStates(states);
	} catch (error) {
		console.error("Failed to hydrate offline sync state", error);
	}
}

function scheduleBootCriticalWarmSync() {
	return bootSync.scheduleBootCriticalWarmSync();
}

function triggerOnlineResumeSync() {
	return bootSync.triggerOnlineResumeSync().then(async (result) => {
		await refreshOfflinePricingRules();
		evaluateBootstrapSnapshot({ allowPrompt: false });
		return result;
	});
}

function triggerOperatorRefreshSync(options = {}) {
	return bootSync.triggerOperatorRefreshSync(options);
}

async function runStartupOfflineDataWarmup(reason = "startup") {
	const profile = getOfflineSyncProfile();
	if (
		startupOfflineWarmupInFlight.value ||
		!initialBootstrapSyncSettled.value ||
		!profile?.name ||
		getIsManualOffline() ||
		!navigator.onLine ||
		!serverOnline.value ||
		serverConnecting.value
	) {
		return false;
	}

	const warmupKey = [
		BUILD_VERSION || "",
		profile.name || "",
		profile.modified || "",
		profile.selling_price_list || "",
		profile.currency || "",
		reason,
	].join("::");
	if (startupOfflineWarmupKey.value === warmupKey) {
		return false;
	}

	startupOfflineWarmupInFlight.value = true;
	try {
		await triggerOperatorRefreshSync({ includeBootSync: true });
		await refreshOfflinePricingRules();
		evaluateBootstrapSnapshot({ allowPrompt: false });
		startupOfflineWarmupKey.value = warmupKey;
		return true;
	} catch (error) {
		console.error("Failed to warm offline data after startup", error);
		return false;
	} finally {
		startupOfflineWarmupInFlight.value = false;
	}
}

// Computed
const routeLoadingState = getScopeState("route");
const loadingActive = computed(() => loadingState.active || routeLoadingState.value.count > 0);
const loadingIndeterminate = computed(() => !loadingState.active && routeLoadingState.value.count > 0);
const loadingMessage = computed(() => {
	if (loadingState.active) {
		return loadingState.message;
	}
	return routeLoadingState.value.message || __("Loading view...");
});
const loadingProgress = computed(() => {
	if (loadingState.active) {
		return loadingState.progress;
	}
	return 0;
});
const bootstrapAlertType = computed(() =>
	bootstrapStatus.value?.primary_warning?.severity === "error" ||
	bootstrapStatus.value?.runtime_mode === "invalid"
		? "error"
		: "warning",
);
const bootstrapCapabilitySummaries = computed(() => bootstrapStatus.value?.capability_summaries || []);
const bootstrapWarningTitle = computed(() => {
	if (bootstrapStatus.value?.primary_warning?.title) {
		return __(bootstrapStatus.value.primary_warning.title);
	}
	if (bootstrapStatus.value?.runtime_mode === "invalid") {
		return __("Offline restore is unavailable for this session.");
	}
	if (bootstrapLimitedMode.value) {
		return __("Offline selling is available with degraded capabilities.");
	}
	return "";
});
const bootstrapWarningMessages = computed(() => {
	if (!shouldShowBootstrapBanner(bootstrapStatus.value)) {
		return [];
	}

	if (Array.isArray(bootstrapStatus.value?.primary_warning?.messages)) {
		return bootstrapStatus.value.primary_warning.messages.map((message) => __(message));
	}

	return Array.from(
		new Set((bootstrapStatus.value?.warning_codes || []).map((code) => formatBootstrapWarning(code, __))),
	);
});
const bootstrapWarningActive = computed(() => bootstrapWarningMessages.value.length > 0);
const bootstrapRecoveryMessage = computed(() => {
	if (!bootstrapWarningActive.value) {
		return "";
	}

	return __(
		"If the warning persists, open Settings > Offline & Sync, then run Refresh Offline Data or Rebuild Offline Data.",
	);
});
const bootstrapWarningTooltip = computed(() => {
	if (!bootstrapWarningActive.value) {
		return "";
	}

	return [bootstrapWarningTitle.value, ...bootstrapWarningMessages.value, bootstrapRecoveryMessage.value]
		.filter(Boolean)
		.join("\n");
});
const bootstrapWarningUiState = computed(() =>
	resolveBootstrapWarningUiState({
		startupWarningsReady: startupBootstrapWarningsReady.value,
		warningActive: bootstrapWarningActive.value,
		warningTooltip: bootstrapWarningTooltip.value,
		capabilitySummaries: bootstrapCapabilitySummaries.value,
	}),
);
const visibleBootstrapWarningActive = computed(() => bootstrapWarningUiState.value.active);
const visibleBootstrapWarningTooltip = computed(() => bootstrapWarningUiState.value.tooltip);
const visibleBootstrapCapabilitySummaries = computed(() => bootstrapWarningUiState.value.capabilitySummaries);
const visibleBootstrapWarningTitle = computed(() =>
	visibleBootstrapWarningActive.value ? bootstrapWarningTitle.value : "",
);
const visibleBootstrapWarningMessages = computed(() =>
	visibleBootstrapWarningActive.value ? bootstrapWarningMessages.value : [],
);
const visibleBootstrapRecoveryMessage = computed(() =>
	visibleBootstrapWarningActive.value ? bootstrapRecoveryMessage.value : "",
);
const bootstrapWarningSignature = computed(() => {
	if (!visibleBootstrapWarningActive.value) {
		return "";
	}

	return JSON.stringify({
		type: bootstrapAlertType.value,
		title: visibleBootstrapWarningTitle.value,
		messages: visibleBootstrapWarningMessages.value,
	});
});

watch(
	() => [
		posProfile.value?.name || null,
		posProfile.value?.modified || null,
		posOpeningShift.value?.name || null,
		posOpeningShift.value?.user || null,
	],
	() => {
		evaluateBootstrapSnapshot({
			allowPrompt: getIsManualOffline() || !navigator.onLine,
		});
	},
);

watch(
	posProfile,
	(profile) => {
		ensureStartupItemsReady(profile);
	},
	{ deep: true, immediate: true },
);

watch(
	() => [
		initialBootstrapSyncSettled.value,
		startupBootstrapWarningsReady.value,
		networkOnline.value,
		serverOnline.value,
		serverConnecting.value,
		posProfile.value?.name || null,
		posProfile.value?.modified || null,
		posProfile.value?.selling_price_list || null,
		posProfile.value?.currency || null,
	],
	([
		isInitialSyncSettled,
		areWarningsReady,
		isNetworkOnline,
		isServerOnline,
		isServerConnecting,
	]) => {
		if (
			isInitialSyncSettled &&
			areWarningsReady &&
			isNetworkOnline &&
			isServerOnline &&
			!isServerConnecting
		) {
			void runStartupOfflineDataWarmup("post_load_online");
		}
	},
	{ immediate: true },
);

watch(
	loadProgress,
	(progress) => {
		setSourceProgress("customers", progress);
	},
	{ immediate: true },
);

watch(
	bootstrapWarningSignature,
	(nextSignature, previousSignature) => {
		if (!nextSignature) {
			bootstrapSnackbarVisible.value = false;
			return;
		}

		if (nextSignature !== previousSignature) {
			bootstrapSnackbarVisible.value = true;
		}
	},
	{ immediate: true },
);

watch(
	() => [
		loadingActive.value,
		initialBootstrapSyncSettled.value,
		itemsLoaded.value,
		itemsBackgroundLoading.value,
	],
	([isLoading, isBootstrapSettled, areItemsLoaded, areItemsSyncing]) => {
		const shouldLift = shouldLiftBootstrapWarningStartupGate({
			loadingActive: Boolean(isLoading),
			initialBootstrapSettled: Boolean(isBootstrapSettled),
			itemsStartupSyncSettled: Boolean(areItemsLoaded) && !areItemsSyncing,
			startupGateLifted: startupBootstrapWarningsReady.value,
		});

		if (!shouldLift || startupBootstrapWarningsReady.value) {
			return;
		}

		startupBootstrapWarningsReady.value = true;
		evaluateBootstrapSnapshot({ allowPrompt: false });
	},
	{ immediate: true },
);

watch(
	customersLoaded,
	(loaded) => {
		if (loaded) {
			markSourceLoaded("customers");
		}
	},
	{ immediate: true },
);

watch(
	itemsLoadProgress,
	(progress) => {
		setSourceProgress("items", progress);
	},
	{ immediate: true },
);

watch(
	itemsLoaded,
	(loaded) => {
		if (loaded) {
			markSourceLoaded("items");
		}
	},
	{ immediate: true },
);

// Lifecycle Hooks
onMounted(() => {
	pollForFrappeNav();
	removeBootstrapSnapshotListener = listenForBootstrapSnapshotUpdates(() => {
		evaluateBootstrapSnapshot({ allowPrompt: false });
	});

	window.addEventListener("resize", adjust_frappe_sidebar_offset);
	// initLoadingSources move to setup to catch early store readiness
	initializeData();
	bootSync.start();
	networkLifecycle.start();
	customerReadiness.start();
	setupEventListeners();
	handleRefreshCacheUsage();
	updateChecks.start();
});

onBeforeUnmount(() => {
	updateChecks.stop();
	if (removeBootstrapSnapshotListener) {
		removeBootstrapSnapshotListener();
		removeBootstrapSnapshotListener = null;
	}
	bootSync.stop();
	networkLifecycle.stop();
	customerReadiness.stop();
	if (eventBus) {
		eventBus.off("data-loaded");
		eventBus.off("register_pos_profile");
		eventBus.off("set_last_invoice");
		eventBus.off("data-load-progress");
		eventBus.off("print_last_invoice");
		eventBus.off("sync_invoices");
	}

	window.removeEventListener("resize", adjust_frappe_sidebar_offset);

	if (_navPollTimer) {
		clearTimeout(_navPollTimer);
		_navPollTimer = null;
	}

	if (_sidebarObserver) {
		_sidebarObserver.disconnect();
		_sidebarObserver = null;
	}
});

// Methods
const pollForFrappeNav = (maxAttempts = 50, interval = 100) => {
	let attempts = 0;
	const checkAndRemove = () => {
		attempts++;
		const hasSidebar = FRAPPE_NAV_SELECTORS.some((sel) => document.querySelector(sel));

		if (hasSidebar || attempts >= maxAttempts) {
			remove_frappe_nav();
			setup_sidebar_observer();
		} else {
			_navPollTimer = setTimeout(checkAndRemove, interval);
		}
	};
	checkAndRemove();
};

const initializeData = async () => {
	await initPromise;
	await memoryInitPromise;
	await ensureOfflineQueueReady();
	await hydrateOfflineSyncResourceStates();
	checkDbHealth().catch(() => {});
	// Offline-first bootstrap: hydrate register state from IndexedDB before server checks.
	const openingData = getValidCachedOpeningForCurrentUser(getOpeningStorage(), frappe?.session?.user);
	if (openingData) {
		uiStore.setRegisterData(openingData);
		if (navigator.onLine) {
			await refreshTaxInclusiveSetting();
		}
	}

	if (queueHealthCheck()) {
		alert("Offline queue is too large. Old entries will be purged.");
		purgeOldQueueEntries();
	}

	await syncStore.updatePendingCount();
	syncTotals.value = getLastSyncTotals();

	void checkCacheCapacity(90, () => {
		alert("Local cache nearing capacity. Consider going online to sync.");
	});

	// Check if running on IP host
	isIpHost.value = /^\d+\.\d+\.\d+\.\d+/.test(window.location.hostname);

	// Initialize manual offline state from cached value
	manualOffline.value = getIsManualOffline();
	if (manualOffline.value) {
		networkOnline.value = false;
		serverOnline.value = false;
		window.serverOnline = false;
	}
	evaluateBootstrapSnapshot({
		allowPrompt: manualOffline.value || !navigator.onLine,
	});
	await scheduleBootCriticalWarmSync();
	await refreshOfflinePricingRules();
	evaluateBootstrapSnapshot({ allowPrompt: false });
	initialBootstrapSyncSettled.value = true;
	void runStartupOfflineDataWarmup("initial_load");

	markSourceLoaded("init");
};

const setupEventListeners = () => {
	if (eventBus) {
		// Track last submitted invoice id
		// eventBus.on("set_last_invoice", (invoiceId) => {
		// 	uiStore.setLastInvoice(invoiceId);
		// });

		eventBus.on("data-loaded", (name) => {
			markSourceLoaded(name);
		});

		eventBus.on("data-load-progress", ({ name, progress }) => {
			setSourceProgress(name, progress);
		});

		// Allow other components to trigger printing
		// eventBus.on("print_last_invoice", () => {
		// 	handlePrintLastInvoice();
		// });

		// Manual trigger to sync offline invoices
		eventBus.on("sync_invoices", () => {
			handleSyncInvoices();
		});
	}
};

const handleNavClick = () => {
	// Handle navigation click
};

const handleCloseShift = () => {
	get_closing_data();
};

const handleSyncInvoices = async () => {
	await syncQueues();
};

const handleToggleOffline = () => {
	toggleManualOffline();
	manualOffline.value = getIsManualOffline();
	if (manualOffline.value) {
		networkOnline.value = false;
		serverOnline.value = false;
		window.serverOnline = false;
	} else {
		// checkNetworkConnectivity();
		// Optimistically set online if browser is online
		networkOnline.value = navigator.onLine;
	}
	evaluateBootstrapSnapshot({
		allowPrompt: manualOffline.value || !navigator.onLine,
	});
};

const handleRetryStatus = async () => {
	if (getIsManualOffline()) {
		toastStore.show({
			title: __("Manual offline mode is enabled"),
			detail: __("Disable offline mode first to recheck live connectivity."),
			color: "warning",
		});
		return;
	}

	networkOnline.value = navigator.onLine;
	await networkLifecycle.retry();
};

const handleRefreshOfflineData = async () => {
	handleRefreshCacheUsage();
	evaluateBootstrapSnapshot({
		allowPrompt: getIsManualOffline() || !navigator.onLine,
	});
	if (!getIsManualOffline() && navigator.onLine) {
		await handleRetryStatus();
		await triggerOperatorRefreshSync();
		await refreshOfflinePricingRules();
		evaluateBootstrapSnapshot({ allowPrompt: false });
	}
	toastStore.show({
		title: __("Offline data status refreshed"),
		detail: navigator.onLine
			? __("Connectivity and cached prerequisite status were rechecked.")
			: __("Reconnect online to refresh cached offline data from the server."),
		color: navigator.onLine ? "info" : "warning",
	});
};

const handleRebuildOfflineData = async () => {
	handleRefreshCacheUsage();
	evaluateBootstrapSnapshot({
		allowPrompt: true,
	});
	if (canRunOfflineSync()) {
		await triggerOperatorRefreshSync({ includeBootSync: true });
		await refreshOfflinePricingRules({ force: true });
		evaluateBootstrapSnapshot({ allowPrompt: false });
	}
	toastStore.show({
		title: __("Offline rebuild guidance"),
		detail: __(
			"If stale data remains, open Settings > Offline & Sync and run Rebuild Offline Data again while online.",
		),
		color: "warning",
	});
};

const handleOpenOfflineDiagnostics = () => {
	handleRefreshCacheUsage();
	const lastRunSummary = syncCoordinator.getLastRunSummary();
	const syncSummary =
		lastRunSummary && lastRunSummary.resourcesTotal
			? __("Last sync: {0} | ok: {1} | failed: {2} | skipped: {3}", [
					lastRunSummary.trigger,
					lastRunSummary.succeeded,
					lastRunSummary.failed,
					lastRunSummary.skipped,
				])
			: __("No sync trigger has run yet in this session.");
	toastStore.show({
		title: __("Offline diagnostics"),
		detail: formatDiagnosticsDetail(pendingInvoicesCount.value || 0, syncSummary),
		color: visibleBootstrapWarningActive.value ? "warning" : "info",
	});
};

const handleToggleTheme = () => {
	$theme?.toggle();
};

const handleLogout = () => {
	authService.logout().finally(() => {
		window.location.href = "/app";
	});
};

const handleOpenCustomerDisplay = () => {
	eventBus?.emit("open_customer_display");
};

const handleRefreshCacheUsage = () => {
	void refreshCacheUsage();
};

const refreshTaxInclusiveSetting = async () => {
	if (!posProfile.value || !posProfile.value.name || !navigator.onLine) {
		return;
	}
	try {
		const r = await frappe.call({
			method: "posawesome.posawesome.api.utilities.get_pos_profile_tax_inclusive",
			args: {
				pos_profile: posProfile.value.name,
			},
		});
		if (r.message !== undefined) {
			const val = r.message;
			import("../../offline/index")
				.then((m) => {
					if (m && m.setTaxInclusiveSetting) {
						m.setTaxInclusiveSetting(val);
					}
				})
				.catch(() => {});
		}
	} catch (e) {
		console.warn("Failed to refresh tax inclusive setting", e);
	}
};

const handleUpdateAfterDelete = () => {
	// Handle update after delete
};

const remove_frappe_nav = () => {
	FRAPPE_NAV_SELECTORS.forEach((selector) => {
		const elements = document.querySelectorAll(selector);
		elements.forEach((el) => el.remove());
	});

	document.documentElement.style.setProperty("--posa-desk-sidebar-width", "0px");
};

const setup_sidebar_observer = () => {
	if (_sidebarObserver) {
		_sidebarObserver.disconnect();
	}

	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (node.nodeType === Node.ELEMENT_NODE) {
					if (
						node.matches(FRAPPE_NAV_SELECTOR_STRING) ||
						node.querySelector(FRAPPE_NAV_SELECTOR_STRING)
					) {
						remove_frappe_nav();
						return;
					}
				}
			}
		}
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});

	_sidebarObserver = observer;
};

const adjust_frappe_sidebar_offset = () => {
	document.documentElement.style.setProperty("--posa-desk-sidebar-width", "0px");
};
</script>

<style scoped>
.container1 {
	width: 100%;
	max-width: 100%;
	min-height: 100dvh;
	height: 100dvh;
	overflow: hidden;
	padding-inline-start: var(--posa-desk-sidebar-width, 0px);
	box-sizing: border-box;
}

.main-content {
	width: 100%;
	max-width: 100%;
	min-width: 0;
	min-height: 0;
	height: 100%;
	display: flex;
	flex-direction: column;
}

.page-content {
	flex: 1 1 auto;
	min-width: 0;
	min-height: 0;
	overflow: auto;
	overscroll-behavior: contain;
	padding-top: 8px;
}

.bootstrap-warning-snackbar :deep(.v-snackbar__wrapper) {
	max-width: min(680px, calc(100vw - 24px));
}

.bootstrap-warning-snackbar__content {
	white-space: normal;
}

.bootstrap-warning-title {
	font-weight: 600;
	margin-bottom: 4px;
}

.bootstrap-warning-title,
.bootstrap-warning-message {
	white-space: normal;
	overflow-wrap: anywhere;
	word-break: break-word;
}

.bootstrap-warning-message + .bootstrap-warning-message {
	margin-top: 4px;
}

/* Ensure proper spacing and prevent layout shifts */
:deep(.v-main__wrap) {
	display: flex;
	flex-direction: column;
	width: 100%;
	min-height: 100%;
	height: 100%;
	min-width: 0;
}

@media (max-width: 768px) {
	.container1 {
		height: auto;
		min-height: 100dvh;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.main-content {
		height: auto;
		min-height: 100dvh;
	}

	.page-content {
		overflow: visible;
		min-height: 0;
	}

	:deep(.v-main__wrap) {
		height: auto;
		min-height: 100%;
		overflow: visible;
	}
}
</style>
