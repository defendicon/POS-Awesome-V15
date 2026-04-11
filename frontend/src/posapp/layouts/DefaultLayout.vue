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
				:loading-message="loadingMessage"
				:bootstrap-warning-active="bootstrapWarningActive"
				:bootstrap-warning-tooltip="bootstrapWarningTooltip"
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
						{{ bootstrapWarningTitle }}
					</div>
					<div
						v-for="message in bootstrapWarningMessages"
						:key="message"
						class="bootstrap-warning-message"
					>
						{{ message }}
					</div>
					<div
						v-if="bootstrapRecoveryMessage"
						class="bootstrap-warning-message"
					>
						{{ bootstrapRecoveryMessage }}
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
import ClosingDialog from "../components/terminal/ClosingDialog.vue";
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
import { useCatalogStore } from "../stores/catalogStore.js";
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
import {
	setupNetworkListeners as initNetworkListeners,
	checkNetworkConnectivity as utilsCheckNetworkConnectivity,
	manualNetworkRetry,
} from "../composables/core/useNetwork";
import { useRtl } from "../composables/core/useRtl";
import authService from "../services/authService.js";
import { getValidCachedOpeningForCurrentUser } from "../utils/openingCache";
import {
	formatBootstrapWarning,
	shouldShowBootstrapBanner,
} from "../utils/bootstrapWarnings";

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
const BUILD_VERSION =
	typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : null;
const OFFLINE_SYNC_SCHEMA_VERSION = "2026-04-09";

// Utils
const { overlayVisible: globalLoading } = useLoading();
const { get_closing_data } = usePosShift();
const syncStore = useSyncStore();
const customersStore = useCustomersStore();
const itemsStore = useCatalogStore();
const offlineSyncStore = useOfflineSyncStore();
const toastStore = useToastStore();
const uiStore = useUIStore();
const updateStore = useUpdateStore();

// UI Store State
const { posProfile, lastInvoiceId, posOpeningShift } = storeToRefs(uiStore);

const { pendingInvoicesCount } = storeToRefs(syncStore);
const { loadProgress, customersLoaded } = storeToRefs(customersStore);
const { itemsLoaded, loadProgress: itemsLoadProgress } = storeToRefs(itemsStore);
const supportedOfflineSyncResources = filterSupportedOfflineSyncResources(
	getSyncResourceDefinitions(),
);
const syncCoordinator = new SyncCoordinator({
	concurrency: 1,
	resources: supportedOfflineSyncResources,
	runResource: async (resource, trigger) =>
		runOfflineSyncResource(resource, trigger),
	onStateChange: (states) => {
		offlineSyncStore.setResourceStates(filterSupportedOfflineSyncStates(states));
	},
});
const offlineSyncRuntime = createOfflineSyncRuntime({
	canSync: canRunOfflineSync,
	runTrigger: (trigger) => syncCoordinator.runTrigger(trigger),
});

// State
// const posProfile = ref({}); // Migrated to UI Store

// Network status
const networkOnline = ref(navigator.onLine || false);
const serverOnline = ref(false);
const serverConnecting = ref(false);
const internetReachable = ref(false);
const isIpHost = ref(false);

// Sync data
const syncTotals = ref({ pending: 0, synced: 0, drafted: 0 });
const manualOffline = ref(false);

// Cache data
const cacheUsage = ref(0);
const cacheUsageLoading = ref(false);
const cacheUsageDetails = ref({ total: 0, indexedDB: 0, localStorage: 0 });
const bootstrapStatus = ref(getBootstrapSnapshotStatus());
const bootstrapLimitedMode = ref(getBootstrapLimitedMode());
const bootstrapSnackbarVisible = ref(false);
const confirmedBootstrapDecisionKey = ref("");
let _sidebarObserver = null;
let updateInterval = null;

// Event Bus
const eventBus = instance?.proxy?.eventBus;

// Initialize loading sources immediately in setup so watchers can mark them 100%
initLoadingSources(["init", "items", "customers"]);

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

	const nextSnapshot = createBootstrapSnapshotFromRegisterData(
		registerData,
		currentSnapshot,
		{ buildVersion: BUILD_VERSION },
	);

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
	};

	bootstrapStatus.value = nextStatus;
	bootstrapLimitedMode.value = decision.limitedMode;
	setBootstrapSnapshotStatus(nextStatus);
	setBootstrapLimitedMode(decision.limitedMode);
}

function buildBootstrapConfirmationMessage(validation) {
	const details = Array.from(
		new Set(
			(validation?.reasons || []).map((code) =>
				formatBootstrapWarning(code, __),
			),
		),
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
	const validation = validateBootstrapSnapshot(
		snapshot,
		buildCurrentBootstrapValidationInput(),
	);
	const decisionKey = buildBootstrapValidationKey(validation);
	let decision = resolveBootstrapRuntimeState(validation, {
		continueOffline: confirmedBootstrapDecisionKey.value === decisionKey,
	});

	if (decision.requiresConfirmation && allowPrompt) {
		const confirmed = window.confirm(
			buildBootstrapConfirmationMessage(validation),
		);

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

function canRunOfflineSync() {
	return !!(
		getOfflineSyncProfile()?.name &&
		!getIsManualOffline() &&
		navigator.onLine
	);
}

async function callOfflineSyncMethod(method, args = {}) {
	if (typeof frappe === "undefined" || typeof frappe.call !== "function") {
		throw new Error("Frappe call API is unavailable");
	}
	const response = await frappe.call({
		method,
		args,
	});
	return typeof response?.message === "undefined"
		? response || {}
		: response.message;
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
		const states = filterSupportedOfflineSyncStates(
			await listSyncResourceStates(),
		);
		syncCoordinator.hydrateResourceStates(states);
	} catch (error) {
		console.error("Failed to hydrate offline sync state", error);
	}
}

function scheduleBootCriticalWarmSync() {
	return offlineSyncRuntime.scheduleBootWarmSync().catch((error) => {
		console.error("Failed to schedule offline sync", error);
		return false;
	});
}

function triggerOnlineResumeSync() {
	return offlineSyncRuntime.triggerOnlineResumeSync().catch((error) => {
		console.error("Failed to trigger online resume sync", error);
		return false;
	});
}

// Computed
const loadingProgress = computed(() => loadingState.progress);
const loadingActive = computed(() => loadingState.active);
const loadingMessage = computed(() => loadingState.message);
const bootstrapAlertType = computed(() =>
	bootstrapStatus.value?.runtime_mode === "invalid" ? "error" : "warning",
);
const bootstrapWarningTitle = computed(() => {
	if (bootstrapStatus.value?.runtime_mode === "invalid") {
		return __("Offline restore is unavailable for this session.");
	}
	if (bootstrapLimitedMode.value) {
		return __("POS is running with limited offline prerequisites.");
	}
	return "";
});
const bootstrapWarningMessages = computed(() => {
	if (!shouldShowBootstrapBanner(bootstrapStatus.value)) {
		return [];
	}

	return Array.from(
		new Set(
			(bootstrapStatus.value?.warning_codes || []).map((code) =>
				formatBootstrapWarning(code, __),
			),
		),
	);
});
const bootstrapWarningActive = computed(
	() => bootstrapWarningMessages.value.length > 0,
);
const bootstrapRecoveryMessage = computed(() => {
	if (!bootstrapWarningActive.value) {
		return "";
	}

	return __("If the warning persists, open Status > Clear Cache.");
});
const bootstrapWarningTooltip = computed(() => {
	if (!bootstrapWarningActive.value) {
		return "";
	}

	return [
		bootstrapWarningTitle.value,
		...bootstrapWarningMessages.value,
		bootstrapRecoveryMessage.value,
	]
		.filter(Boolean)
		.join("\n");
});
const bootstrapWarningSignature = computed(() => {
	if (!bootstrapWarningActive.value) {
		return "";
	}

	return JSON.stringify({
		type: bootstrapAlertType.value,
		title: bootstrapWarningTitle.value,
		messages: bootstrapWarningMessages.value,
	});
});

// Watchers
watch(networkOnline, (newVal, oldVal) => {
	if (newVal && !oldVal) {
		refreshTaxInclusiveSetting();
		eventBus?.emit("network-online");
		handleSyncInvoices();
		evaluateBootstrapSnapshot({ allowPrompt: false });
	}
});

watch(serverOnline, (newVal, oldVal) => {
	if (newVal && !oldVal) {
		eventBus?.emit("server-online");
		handleSyncInvoices();
		evaluateBootstrapSnapshot({ allowPrompt: false });
	}
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

	window.addEventListener("resize", adjust_frappe_sidebar_offset);
	// initLoadingSources move to setup to catch early store readiness
	initializeData();
	setupNetworkListeners(); // Local function wrapper
	setupEventListeners();
	handleRefreshCacheUsage();

	updateStore.initializeFromStorage();
	if (BUILD_VERSION) {
		updateStore.setCurrentVersion(BUILD_VERSION);
	}
	updateStore.checkForUpdates(true);
	updateInterval = setInterval(
		() => updateStore.checkForUpdates(),
		24 * 60 * 60 * 1000,
	);
});

onBeforeUnmount(() => {
	if (updateInterval) {
		clearInterval(updateInterval);
		updateInterval = null;
	}
	if (eventBus) {
		eventBus.off("data-loaded");
		eventBus.off("register_pos_profile");
		eventBus.off("set_last_invoice");
		eventBus.off("data-load-progress");
		eventBus.off("print_last_invoice");
		eventBus.off("sync_invoices");
	}

	window.removeEventListener("resize", adjust_frappe_sidebar_offset);

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
			setTimeout(checkAndRemove, interval);
		}
	};
	checkAndRemove();
};

// Network Logic - Bridge mixin-style composable to Composition API refs.
const networkProxy = {
	get networkOnline() {
		return networkOnline.value;
	},
	set networkOnline(value) {
		networkOnline.value = Boolean(value);
	},
	get serverOnline() {
		return serverOnline.value;
	},
	set serverOnline(value) {
		serverOnline.value = Boolean(value);
	},
	get serverConnecting() {
		return serverConnecting.value;
	},
	set serverConnecting(value) {
		serverConnecting.value = Boolean(value);
	},
	get internetReachable() {
		return internetReachable.value;
	},
	set internetReachable(value) {
		internetReachable.value = Boolean(value);
	},
	get isIpHost() {
		return isIpHost.value;
	},
	set isIpHost(value) {
		isIpHost.value = Boolean(value);
	},
	onConnectivityRecovered: async () => {
		await triggerOnlineResumeSync();
	},
	$forceUpdate: () => {},
	checkNetworkConnectivity: async (options = {}) => {
		await utilsCheckNetworkConnectivity.call(networkProxy, options);
	},
};

const setupNetworkListeners = () => {
	initNetworkListeners.call(networkProxy);
};

const initializeData = async () => {
	await initPromise;
	await memoryInitPromise;
	await hydrateOfflineSyncResourceStates();
	checkDbHealth().catch(() => {});
	// Offline-first bootstrap: hydrate register state from IndexedDB before server checks.
	const openingData = getValidCachedOpeningForCurrentUser(
		getOpeningStorage(),
		frappe?.session?.user,
	);
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

	getCacheUsageEstimate()
		.then((usage) => {
			if (usage.percentage > 90) {
				alert("Local cache nearing capacity. Consider going online to sync.");
			}
		})
		.catch(() => {});

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
	void scheduleBootCriticalWarmSync();

	markSourceLoaded("init");

	// Trigger initial customer load only when POS profile is already available
	if (
		navigator.onLine &&
		!isOffline() &&
		posProfile.value &&
		posProfile.value.name
	) {
		customersStore.setPosProfile(posProfile.value);
		customersStore.get_customer_names();
	}
};

const setupEventListeners = () => {
	// Listen for POS profile registration
	if (eventBus) {
		// Watch for POS profile becoming available to trigger customer load
		watch(
			posProfile,
			(newProfile) => {
				if (newProfile && newProfile.name) {
					// Update customers store with profile
					customersStore.setPosProfile(newProfile);
					void scheduleBootCriticalWarmSync();

					if (navigator.onLine && !getIsManualOffline()) {
						refreshTaxInclusiveSetting();
						customersStore.get_customer_names();
					}
				}
			},
			{ deep: true, immediate: true },
		);

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

	// Enhanced server connection status listeners
	if (frappe.realtime) {
		frappe.realtime.on("connect", () => {
			serverOnline.value = true;
			window.serverOnline = true;
			serverConnecting.value = false;
			console.log("Server: Connected via WebSocket");
		});

		frappe.realtime.on("disconnect", () => {
			serverOnline.value = false;
			window.serverOnline = false;
			serverConnecting.value = false;
			console.log("Server: Disconnected from WebSocket");
		});

		frappe.realtime.on("connecting", () => {
			serverConnecting.value = true;
			console.log("Server: Connecting to WebSocket...");
		});

		frappe.realtime.on("reconnect", () => {
			console.log("Server: Reconnected to WebSocket");
			window.serverOnline = true;
			void triggerOnlineResumeSync();
		});
	}

	// Visibility Listener
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden && navigator.onLine && !getIsManualOffline()) {
			// checkNetworkConnectivity();
		}
	});
};

const handleNavClick = () => {
	// Handle navigation click
};

const handleCloseShift = () => {
	get_closing_data();
};

const handleSyncInvoices = async () => {
	const pending = getPendingOfflineInvoiceCount();
	const pendingCashMovements = getPendingOfflineCashMovementCount();
	if (pending) {
		toastStore.show({
			title: `${pending} invoice${pending > 1 ? "s" : ""} pending for sync`,
			color: "warning",
		});
	}
	if (pendingCashMovements) {
		toastStore.show({
			title: `${pendingCashMovements} cash movement${pendingCashMovements > 1 ? "s" : ""} pending for sync`,
			color: "warning",
		});
	}
	if (isOffline()) {
		return;
	}
	const result = await syncOfflineInvoices();
	const cashMovementResult = await syncOfflineCashMovements();
	if (result && (result.synced || result.drafted)) {
		if (result.synced) {
			toastStore.show({
				title: `${result.synced} offline invoice${result.synced > 1 ? "s" : ""} synced`,
				color: "success",
			});
		}
		if (result.drafted) {
			toastStore.show({
				title: `${result.drafted} offline invoice${result.drafted > 1 ? "s" : ""} saved as draft`,
				color: "warning",
			});
		}
	}
	if (cashMovementResult?.synced) {
		toastStore.show({
			title: `${cashMovementResult.synced} offline cash movement${cashMovementResult.synced > 1 ? "s" : ""} synced`,
			color: "success",
		});
	}
	syncStore.updatePendingCount();
	syncTotals.value = result || syncTotals.value;
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
	await manualNetworkRetry(networkProxy);
};

const handleRefreshOfflineData = async () => {
	handleRefreshCacheUsage();
	evaluateBootstrapSnapshot({
		allowPrompt: getIsManualOffline() || !navigator.onLine,
	});
	if (!getIsManualOffline() && navigator.onLine) {
		await handleRetryStatus();
		await triggerOnlineResumeSync();
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
		await scheduleBootCriticalWarmSync();
	}
	toastStore.show({
		title: __("Offline rebuild guidance"),
		detail: __("If stale data remains, open Status > Clear Cache and reload this terminal online."),
		color: "warning",
	});
};

const handleOpenOfflineDiagnostics = () => {
	handleRefreshCacheUsage();
	toastStore.show({
		title: __("Offline diagnostics"),
		detail: __("Pending sales: {0} | Cache usage: {1}%", [
			pendingInvoicesCount.value || 0,
			Math.round(cacheUsage.value || 0),
		]),
		color: bootstrapWarningActive.value ? "warning" : "info",
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
	cacheUsageLoading.value = true;
	getCacheUsageEstimate()
		.then((usage) => {
			cacheUsage.value = usage.percentage || 0;
			cacheUsageDetails.value = {
				total: usage.total || 0,
				indexedDB: usage.indexedDB || 0,
				localStorage: usage.localStorage || 0,
			};
		})
		.catch((e) => {
			console.error("Failed to refresh cache usage", e);
		})
		.finally(() => {
			cacheUsageLoading.value = false;
		});
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
			try {
				localStorage.setItem("posa_tax_inclusive", JSON.stringify(val));
			} catch (err) {
				console.warn("Failed to cache tax inclusive setting", err);
			}
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
