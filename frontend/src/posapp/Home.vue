<template>
	<v-app class="container1" :class="rtlClasses">
		<AppLoadingOverlay :visible="globalLoading" />
		<UpdatePrompt />
		<v-main class="main-content">
			<ClosingDialog />
			<Navbar
				:pos-profile="posProfile"
				:pending-invoices="pendingInvoices"
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
				@toggle-theme="handleToggleTheme"
				@logout="handleLogout"
				@refresh-cache-usage="handleRefreshCacheUsage"
				@update-after-delete="handleUpdateAfterDelete"
			/>
			<div class="page-content">
				<router-view v-slot="{ Component }">
					<component :is="Component" class="mx-4 md-4" />
				</router-view>
			</div>
		</v-main>
	</v-app>
</template>

<script>
/* global frappe, $ */
import Navbar from "./components/Navbar.vue";
import POS from "./components/pos/Pos.vue";
import Payments from "./components/payments/Pay.vue";
import PurchaseOrders from "./components/pos/PurchaseOrders.vue";
import BarcodePrinting from "./components/pos/BarcodePrinting.vue";
import ClosingDialog from "./components/pos/ClosingDialog.vue";
import AppLoadingOverlay from "./components/ui/LoadingOverlay.vue";
import UpdatePrompt from "./components/ui/UpdatePrompt.vue";
import { useLoading } from "./composables/useLoading.js";
import { usePosShift } from "./composables/usePosShift.js";
import { loadingState, initLoadingSources, setSourceProgress, markSourceLoaded } from "./utils/loading.js";
import { useCustomersStore } from "./stores/customersStore.js";
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
	isManualOffline,
	syncOfflineInvoices,
	getPendingOfflineInvoiceCount,
	isOffline,
	getLastSyncTotals,
} from "../offline/index.js";
import {
	appendDebugPrintParam,
	isDebugPrintEnabled,
	silentPrint,
	watchPrintWindow,
} from "./plugins/print.js";
import {
	setupNetworkListeners,
	checkNetworkConnectivity,
	detectHostType,
	performConnectivityChecks,
	checkFrappePing,
	checkCurrentOrigin,
	checkExternalConnectivity,
	checkWebSocketConnectivity,
} from "./composables/useNetwork.js";
import { useRtl } from "./composables/useRtl.js";
import authService from "./services/authService.js";

/**
 * Frappe Desk UI selectors to hide in POS view.
 * Used by: remove_frappe_nav(), pollForFrappeNav(), setup_sidebar_observer()
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

export default {
	setup() {
		const { isRtl, rtlStyles, rtlClasses } = useRtl();
		const { overlayVisible } = useLoading();
		const { get_closing_data } = usePosShift();
		return {
			isRtl,
			rtlStyles,
			rtlClasses,
			globalLoading: overlayVisible,
			get_closing_data,
		};
	},
	data: function () {
		return {
			// POS Profile data
			posProfile: {},
			pendingInvoices: 0,
			lastInvoiceId: "",

			// Network status
			networkOnline: navigator.onLine || false,
			serverOnline: false,
			serverConnecting: false,
			internetReachable: false,
			isIpHost: false,

			// Sync data
			syncTotals: { pending: 0, synced: 0, drafted: 0 },
			manualOffline: false,

			// Cache data
			cacheUsage: 0,
			cacheUsageLoading: false,
			cacheUsageDetails: { total: 0, indexedDB: 0, localStorage: 0 },
			_sidebarObserver: null, // Store observer reference
		};
	},
	computed: {
		isDark() {
			return this.$theme?.isDark || false;
		},
		loadingProgress() {
			return loadingState.progress;
		},
		loadingActive() {
			return loadingState.active;
		},
		loadingMessage() {
			return loadingState.message;
		},
	},
	watch: {
		networkOnline(newVal, oldVal) {
			if (newVal && !oldVal) {
				this.refreshTaxInclusiveSetting();
				this.eventBus.emit("network-online");
				this.handleSyncInvoices();
			}
		},
		serverOnline(newVal, oldVal) {
			if (newVal && !oldVal) {
				this.eventBus.emit("server-online");
				this.handleSyncInvoices();
			}
		},
	},
	components: {
		Navbar,
		POS,
		Payments,
		"Purchase Order": PurchaseOrders,
		"Barcode Printing": BarcodePrinting,
		ClosingDialog,
		AppLoadingOverlay,
		UpdatePrompt,
	},
	mounted() {
		// Poll for Frappe sidebar instead of fixed timeout
		this.pollForFrappeNav();

		// Rest of your initialization code...
		window.addEventListener("resize", this.adjust_frappe_sidebar_offset);
		initLoadingSources(["init", "items", "customers"]);
		this.initializeData();
		this.setupNetworkListeners();
		this.setupEventListeners();
		this.handleRefreshCacheUsage();
		
		const customersStore = useCustomersStore();
		const { loadProgress, customersLoaded } = storeToRefs(customersStore);
		this.$watch(
			() => loadProgress.value,
			(progress) => {
				setSourceProgress("customers", progress);
			},
			{ immediate: true },
		);
		this.$watch(
			() => customersLoaded.value,
			(loaded) => {
				if (loaded) {
					markSourceLoaded("customers");
				}
			},
			{ immediate: true },
		);
	},
	beforeUnmount() {
		// Clean up event bus listeners
		if (this.eventBus) {
			this.eventBus.off("pending_invoices_changed");
			this.eventBus.off("data-loaded");
			this.eventBus.off("register_pos_profile");
			this.eventBus.off("set_last_invoice");
			this.eventBus.off("data-load-progress");
			this.eventBus.off("print_last_invoice");
			this.eventBus.off("sync_invoices");
			this.eventBus.off("open_purchase_orders");
		}
		
		// Remove resize listener
		window.removeEventListener("resize", this.adjust_frappe_sidebar_offset);
		
		// CRITICAL FIX: Disconnect MutationObserver to prevent memory leak
		if (this._sidebarObserver) {
			this._sidebarObserver.disconnect();
			this._sidebarObserver = null;
		}
	},
	methods: {
		pollForFrappeNav(maxAttempts = 50, interval = 100) {
			let attempts = 0;
			const checkAndRemove = () => {
				attempts++;
				const hasSidebar = FRAPPE_NAV_SELECTORS.some((sel) => document.querySelector(sel));
				
				if (hasSidebar || attempts >= maxAttempts) {
					this.remove_frappe_nav();
					this.setup_sidebar_observer();
				} else {
					setTimeout(checkAndRemove, interval);
				}
			};
			checkAndRemove();
		},
		setupNetworkListeners,
		checkNetworkConnectivity,
		detectHostType,
		performConnectivityChecks,
		checkFrappePing,
		checkCurrentOrigin,
		checkExternalConnectivity,
		checkWebSocketConnectivity,


		async initializeData() {
			await initPromise;
			await memoryInitPromise;
			checkDbHealth().catch(() => {});
			// Load POS profile from cache or storage
			const openingData = getOpeningStorage();
			if (openingData && openingData.pos_profile) {
				this.posProfile = openingData.pos_profile;
				if (navigator.onLine) {
					await this.refreshTaxInclusiveSetting();
				}
			}

			if (queueHealthCheck()) {
				alert("Offline queue is too large. Old entries will be purged.");
				purgeOldQueueEntries();
			}

			this.pendingInvoices = getPendingOfflineInvoiceCount();
			this.syncTotals = getLastSyncTotals();

			getCacheUsageEstimate()
				.then((usage) => {
					if (usage.percentage > 90) {
						alert("Local cache nearing capacity. Consider going online to sync.");
					}
				})
				.catch(() => {});

			// Check if running on IP host
			this.isIpHost = /^\d+\.\d+\.\d+\.\d+/.test(window.location.hostname);

			// Initialize manual offline state from cached value
			this.manualOffline = isManualOffline();
			if (this.manualOffline) {
				this.networkOnline = false;
				this.serverOnline = false;
				window.serverOnline = false;
			}

			markSourceLoaded("init");
		},

		setupEventListeners() {
			// Listen for POS profile registration
			if (this.eventBus) {
				this.eventBus.on("register_pos_profile", (data) => {
					this.posProfile = data.pos_profile || {};
					if (navigator.onLine) {
						this.refreshTaxInclusiveSetting();
					}
				});

				// Track last submitted invoice id
				this.eventBus.on("set_last_invoice", (invoiceId) => {
					this.lastInvoiceId = invoiceId;
				});

				this.eventBus.on("data-loaded", (name) => {
					markSourceLoaded(name);
				});
				
				this.eventBus.on("data-load-progress", ({ name, progress }) => {
					setSourceProgress(name, progress);
				});

				// Allow other components to trigger printing
				this.eventBus.on("print_last_invoice", () => {
					this.handlePrintLastInvoice();
				});

				// Manual trigger to sync offline invoices
				this.eventBus.on("sync_invoices", () => {
					this.handleSyncInvoices();
				});

				// Update pending invoice count when other modules emit the change
				this.eventBus.on("pending_invoices_changed", (count) => {
					this.pendingInvoices = count;
				});

				this.eventBus.on("open_purchase_orders", () => {
					this.$router.push("/orders");
				});
			}

			// Enhanced server connection status listeners
			if (frappe.realtime) {
				frappe.realtime.on("connect", () => {
					this.serverOnline = true;
					window.serverOnline = true;
					this.serverConnecting = false;
					console.log("Server: Connected via WebSocket");
					this.$forceUpdate();
				});

				frappe.realtime.on("disconnect", () => {
					this.serverOnline = false;
					window.serverOnline = false;
					this.serverConnecting = false;
					console.log("Server: Disconnected from WebSocket");
					// Trigger connectivity check to verify if it's just WebSocket or full network
					setTimeout(() => {
						if (!isManualOffline()) {
							this.checkNetworkConnectivity();
						}
					}, 1000);
				});

				frappe.realtime.on("connecting", () => {
					this.serverConnecting = true;
					console.log("Server: Connecting to WebSocket...");
					this.$forceUpdate();
				});

				frappe.realtime.on("reconnect", () => {
					console.log("Server: Reconnected to WebSocket");
					window.serverOnline = true;
					if (!isManualOffline()) {
						this.checkNetworkConnectivity();
					}
				});
			}

			// Listen for visibility changes to check connectivity when tab becomes active
			document.addEventListener("visibilitychange", () => {
				if (!document.hidden && navigator.onLine && !isManualOffline()) {
					this.checkNetworkConnectivity();
				}
			});
		},

		// Event handlers for navbar events
		handleNavClick() {
			// Handle navigation click
		},

		handleCloseShift() {
			this.get_closing_data();
		},

		handlePrintLastInvoice() {
			if (!this.lastInvoiceId) {
				return;
			}

			const print_format = this.posProfile.print_format_for_online || this.posProfile.print_format;
			const letter_head = this.posProfile.letter_head || 0;
			const doctype = this.posProfile.create_pos_invoice_instead_of_sales_invoice
				? "POS Invoice"
				: "Sales Invoice";
			const debugPrint = isDebugPrintEnabled();
			let url =
				frappe.urllib.get_base_url() +
				"/printview?doctype=" +
				encodeURIComponent(doctype) +
				"&name=" +
				this.lastInvoiceId +
				"&trigger_print=1" +
				"&format=" +
				print_format +
				"&no_letterhead=" +
				letter_head;

			url = appendDebugPrintParam(url, debugPrint);
			const printOptions = {
				allowOfflineFallback: isOffline(),
				triggerPrint: "1",
				debugPrint,
				debugInfo: {
					printFormat: print_format,
					templatePath: "online-printview",
				},
			};
			if (this.posProfile.posa_silent_print) {
				silentPrint(url, printOptions);
			} else {
				const printWindow = window.open(url, "Print");
				watchPrintWindow(printWindow, printOptions);
			}
		},

		async handleSyncInvoices() {
			const pending = getPendingOfflineInvoiceCount();
			if (pending) {
				this.eventBus.emit("show_message", {
					title: `${pending} invoice${pending > 1 ? "s" : ""} pending for sync`,
					color: "warning",
				});
			}
			if (isOffline()) {
				return;
			}
			const result = await syncOfflineInvoices();
			if (result && (result.synced || result.drafted)) {
				if (result.synced) {
					this.eventBus.emit("show_message", {
						title: `${result.synced} offline invoice${result.synced > 1 ? "s" : ""} synced`,
						color: "success",
					});
				}
				if (result.drafted) {
					this.eventBus.emit("show_message", {
						title: `${result.drafted} offline invoice${result.drafted > 1 ? "s" : ""} saved as draft`,
						color: "warning",
					});
				}
			}
			this.pendingInvoices = getPendingOfflineInvoiceCount();
			this.syncTotals = result || this.syncTotals;
		},

		handleToggleOffline() {
			toggleManualOffline();
			this.manualOffline = isManualOffline();
			if (this.manualOffline) {
				this.networkOnline = false;
				this.serverOnline = false;
				window.serverOnline = false;
			} else {
				this.checkNetworkConnectivity();
			}
		},

		handleToggleTheme() {
			// Use the global theme plugin instead of local state
			this.$theme.toggle();
		},

		handleLogout() {
			authService.logout().finally(() => {
				window.location.href = "/app";
			});
		},

		handleRefreshCacheUsage() {
			this.cacheUsageLoading = true;
			getCacheUsageEstimate()
				.then((usage) => {
					this.cacheUsage = usage.percentage || 0;
					this.cacheUsageDetails = {
						total: usage.total || 0,
						indexedDB: usage.indexedDB || 0,
						localStorage: usage.localStorage || 0,
					};
				})
				.catch((e) => {
					console.error("Failed to refresh cache usage", e);
				})
				.finally(() => {
					this.cacheUsageLoading = false;
				});
		},

		async refreshTaxInclusiveSetting() {
			if (!this.posProfile || !this.posProfile.name || !navigator.onLine) {
				return;
			}
			try {
				const r = await frappe.call({
					method: "posawesome.posawesome.api.utilities.get_pos_profile_tax_inclusive",
					args: {
						pos_profile: this.posProfile.name,
					},
				});
				if (r.message !== undefined) {
					const val = r.message;
					try {
						localStorage.setItem("posa_tax_inclusive", JSON.stringify(val));
					} catch (err) {
						console.warn("Failed to cache tax inclusive setting", err);
					}
					import("../offline/index.js")
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
		},

		handleUpdateAfterDelete() {
			// Handle update after delete
		},

		remove_frappe_nav() {
			FRAPPE_NAV_SELECTORS.forEach((selector) => {
				const elements = document.querySelectorAll(selector);
				elements.forEach((el) => el.remove());
			});
			
			document.documentElement.style.setProperty("--posa-desk-sidebar-width", "0px");
		},

		setup_sidebar_observer() {
			// Disconnect existing observer if any
			if (this._sidebarObserver) {
				this._sidebarObserver.disconnect();
			}

			const observer = new MutationObserver((mutations) => {
				for (const mutation of mutations) {
					for (const node of mutation.addedNodes) {
						if (node.nodeType === Node.ELEMENT_NODE) {
							if (node.matches(FRAPPE_NAV_SELECTOR_STRING) || 
								node.querySelector(FRAPPE_NAV_SELECTOR_STRING)) {
								this.remove_frappe_nav();
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
			
			this._sidebarObserver = observer;
		},

		adjust_frappe_sidebar_offset() {
			// Always return 0 since sidebar should be removed
			document.documentElement.style.setProperty("--posa-desk-sidebar-width", "0px");
		},
	},
};
</script>

<style scoped>
.container1 {
	/* Use dynamic viewport units for better mobile support */
	height: 100dvh;
	max-height: 100dvh;
	overflow: hidden;
	padding-inline-start: var(--posa-desk-sidebar-width, 0px);
	box-sizing: border-box;
}

.main-content {
	/* Fill the available height of the container */
	height: 100%;
	display: flex;
	flex-direction: column;
}

.page-content {
	flex: 1;
	overflow-y: auto;
	padding-top: 8px;
}

/* Ensure proper spacing and prevent layout shifts */
:deep(.v-main__wrap) {
	display: flex;
	flex-direction: column;
	min-height: 100%;
	height: 100%;
}
</style>
