<template>
	<v-app class="container1" :class="rtlClasses">
		<v-main class="main-content">
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
				:is-dark="isDark"
				:cache-usage="cacheUsage"
				:cache-usage-loading="cacheUsageLoading"
				:cache-usage-details="cacheUsageDetails"
				:cache-ready="cacheReady"
				:loading-progress="loadingProgress"
				:loading-active="loadingActive"
				:loading-message="loadingMessage"
				@change-page="setPage($event)"
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
				<component v-bind:is="page" class="mx-4 md-4"></component>
			</div>
		</v-main>
	</v-app>
</template>

<script>
/* global frappe */
import Navbar from "./components/Navbar.vue";
import POS from "./components/pos/Pos.vue";
import Payments from "./components/payments/Pay.vue";
import {
	loadingState,
	initLoadingSources,
	setSourceProgress,
	markSourceLoaded,
	clearLoadingTimeout,
} from "./utils/loading.js";
import {
	getOpeningStorage,
	getCacheUsageEstimate,
	checkDbHealth,
	queueHealthCheck,
	purgeOldQueueEntries,
	MAX_QUEUE_ITEMS,
	initPromise,
	memoryInitPromise,
	isCacheReady,
	toggleManualOffline,
	isManualOffline,
	syncOfflineInvoices,
	getPendingOfflineInvoiceCount,
	isOffline,
	getLastSyncTotals,
} from "../offline/index.js";
import { silentPrint } from "./plugins/print.js";
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

export default {
	setup() {
		const { isRtl, rtlStyles, rtlClasses } = useRtl();
		return {
			isRtl,
			rtlStyles,
			rtlClasses,
		};
	},
	data: function () {
		return {
			page: "POS",
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
			cacheReady: false,

			// Loading progress handled via utility
		};
	},
	computed: {
		isDark() {
			return this.$theme?.current === "dark";
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
	},
	mounted() {
		this.remove_frappe_nav();
		// Initialize cache ready state early from stored value
		this.cacheReady = isCacheReady();
		initLoadingSources(["init", "items", "customers"]);
		this.initializeData();
		this.setupNetworkListeners();
		this.setupEventListeners();
		this.handleRefreshCacheUsage();
	},
	methods: {
		setupNetworkListeners,
		checkNetworkConnectivity,
		detectHostType,
		performConnectivityChecks,
		checkFrappePing,
		checkCurrentOrigin,
		checkExternalConnectivity,
		checkWebSocketConnectivity,
		setPage(page) {
			this.page = page;
		},

		async initializeData() {
			await initPromise;
			await memoryInitPromise;
			this.cacheReady = true;
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

			// Fallback: if items/customers don't load within 10 seconds, mark them as loaded
			setTimeout(() => {
				if (loadingState.active) {
					console.warn("Forcing items/customers to complete due to delay");
					markSourceLoaded("items");
					markSourceLoaded("customers");
				}
			}, 10000);
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
			// Trigger POS closing dialog via event bus
			this.eventBus.emit("open_closing_dialog");
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
			const url =
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

			if (this.posProfile.posa_silent_print) {
				silentPrint(url);
			} else {
				const printWindow = window.open(url, "Print");
				printWindow.addEventListener(
					"load",
					function () {
						printWindow.print();
					},
					{ once: true },
				);
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
			frappe.call("logout").finally(() => {
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
			this.$nextTick(function () {
				$(".page-head").remove();
				$(".navbar.navbar-default.navbar-fixed-top").remove();
			});
		},
	},
	beforeUnmount() {
		if (this.eventBus) {
			this.eventBus.off("pending_invoices_changed");
			this.eventBus.off("data-loaded");
		}
		// Clear loading timeout when component unmounts
		clearLoadingTimeout();
	},
	created: function () {
		setTimeout(() => {
			this.remove_frappe_nav();
		}, 1000);
	},
};
</script>

<style scoped>
.container1 {
	/* Use dynamic viewport units for better mobile support */
	height: 100dvh;
	max-height: 100dvh;
	overflow: hidden;
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
