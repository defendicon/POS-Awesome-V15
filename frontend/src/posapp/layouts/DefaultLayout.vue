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
				@nav-click="handleNavClick"
				@close-shift="handleCloseShift"
				@print-last-invoice="handlePrintLastInvoice"
				@sync-invoices="handleSyncInvoices"
				@toggle-offline="handleToggleOffline"
				@retry-status="handleRetryStatus"
				@toggle-theme="handleToggleTheme"
				@logout="handleLogout"
				@open-customer-display="handleOpenCustomerDisplay"
				@refresh-cache-usage="handleRefreshCacheUsage"
				@update-after-delete="handleUpdateAfterDelete"
			/>
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
import { storeToRefs } from "pinia";
import {
	getOpeningStorage,
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
} from "../../offline/index";
import {
	setupNetworkListeners as initNetworkListeners,
	checkNetworkConnectivity as utilsCheckNetworkConnectivity,
	manualNetworkRetry,
} from "../composables/core/useNetwork";
import { useRtl } from "../composables/core/useRtl";
import authService from "../services/authService.js";
import { getValidCachedOpeningForCurrentUser } from "../utils/openingCache";

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

// Utils
const { overlayVisible: globalLoading } = useLoading();
const { get_closing_data } = usePosShift();
const syncStore = useSyncStore();
const customersStore = useCustomersStore();
const itemsStore = useItemsStore();
const toastStore = useToastStore();
const uiStore = useUIStore();
const updateStore = useUpdateStore();

// UI Store State
const { posProfile, lastInvoiceId } = storeToRefs(uiStore);

const { pendingInvoicesCount } = storeToRefs(syncStore);
const { loadProgress, customersLoaded } = storeToRefs(customersStore);
const { itemsLoaded, loadProgress: itemsLoadProgress } = storeToRefs(itemsStore);

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
let _sidebarObserver = null;
let updateInterval = null;

// Event Bus
const eventBus = instance?.proxy?.eventBus;

// Initialize loading sources immediately in setup so watchers can mark them 100%
initLoadingSources(["init", "items", "customers"]);

// Computed
const loadingProgress = computed(() => loadingState.progress);
const loadingActive = computed(() => loadingState.active);
const loadingMessage = computed(() => loadingState.message);

// Watchers
watch(networkOnline, (newVal, oldVal) => {
	if (newVal && !oldVal) {
		refreshTaxInclusiveSetting();
		eventBus?.emit("network-online");
		handleSyncInvoices();
	}
});

watch(serverOnline, (newVal, oldVal) => {
	if (newVal && !oldVal) {
		eventBus?.emit("server-online");
		handleSyncInvoices();
	}
});

watch(
	loadProgress,
	(progress) => {
		setSourceProgress("customers", progress);
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
	// @ts-ignore
	const BUILD_VERSION =
		typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : null;
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
	manualNetworkRetry(networkProxy);
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
