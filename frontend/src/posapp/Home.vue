<template>
	<v-app class="container1" :class="rtlClasses">
		<AppLoadingOverlay :visible="globalLoading" />
		<UpdatePrompt />
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
				@change-pos-profile="handleChangePosProfile"
			/>
			<div class="page-content">
				<component v-bind:is="page" class="mx-4 md-4"></component>
			</div>
		</v-main>

		<!-- POS Profile Change Dialog -->
		<v-dialog v-model="showPosProfileDialog" max-width="600px" persistent>
			<v-card>
				<v-card-title class="text-h6 d-flex align-center">
					<v-icon start color="primary" class="mr-2">mdi-swap-horizontal</v-icon>
					{{ __("Switch POS Profile") }}
				</v-card-title>
				<v-card-text>
					<div class="text-body-2 mb-3">
						{{ __("Select a new POS Profile to switch to") }}
					</div>
					<v-autocomplete
						v-model="selectedPosProfile"
						:items="availablePosProfiles"
						item-title="name"
						item-value="name"
						:label="__('POS Profile')"
						variant="outlined"
						density="compact"
						:loading="loadingPosProfiles"
						:disabled="loadingPosProfiles"
						clearable
					>
						<template #item="{ item, props }">
							<v-list-item v-bind="props">
								<template #prepend>
									<v-icon :color="item.raw.name === posProfile?.name ? 'primary' : 'grey'">
										{{
											item.raw.name === posProfile?.name
												? "mdi-check-circle"
												: "mdi-circle-outline"
										}}
									</v-icon>
								</template>
								<v-list-item-title>
									{{ item.raw.name }}
								</v-list-item-title>
								<v-list-item-subtitle v-if="item.raw.company">
									{{ item.raw.company }}
								</v-list-item-subtitle>
							</v-list-item>
						</template>
					</v-autocomplete>
					<v-alert
						v-if="selectedPosProfile && selectedPosProfile !== posProfile?.name"
						type="info"
						variant="tonal"
						density="compact"
						class="mt-3"
					>
						{{ __("Switching to") }}: <strong>{{ selectedPosProfile }}</strong>
					</v-alert>
				</v-card-text>
				<v-card-actions class="pa-4 pt-0">
					<v-spacer />
					<v-btn
						color="error"
						variant="text"
						@click="closePosProfileDialog"
						:disabled="loadingPosProfiles"
					>
						{{ __("Cancel") }}
					</v-btn>
					<v-btn
						color="primary"
						variant="elevated"
						@click="switchPosProfile"
						:disabled="!selectedPosProfile || selectedPosProfile === posProfile?.name || loadingPosProfiles"
						:loading="loadingPosProfiles"
					>
						{{ __("Switch Profile") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-app>
</template>

<script>
/* global frappe, $ */
import Navbar from "./components/Navbar.vue";
import POS from "./components/pos/Pos.vue";
import Payments from "./components/payments/Pay.vue";
import AppLoadingOverlay from "./components/ui/LoadingOverlay.vue";
import UpdatePrompt from "./components/ui/UpdatePrompt.vue";
import { useLoading } from "./composables/useLoading.js";
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
	isCacheReady,
	toggleManualOffline,
	isManualOffline,
	syncOfflineInvoices,
	getPendingOfflineInvoiceCount,
	isOffline,
	getLastSyncTotals,
} from "../offline/index.js";
import { silentPrint, watchPrintWindow } from "./plugins/print.js";
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
		const { overlayVisible } = useLoading();
		return {
			isRtl,
			rtlStyles,
			rtlClasses,
			globalLoading: overlayVisible,
		};
	},
	data: function () {
		return {
			page: "POS",
			// POS Profile data
			posProfile: {},
			pos_opening_shift: {},
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

			// POS Profile change data
			showPosProfileDialog: false,
			selectedPosProfile: null,
			availablePosProfiles: [],
			loadingPosProfiles: false,

			// Loading progress handled via utility
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
		AppLoadingOverlay,
		UpdatePrompt,
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
				this.pos_opening_shift = openingData.pos_opening_shift || {};
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
					this.pos_opening_shift = data.pos_opening_shift || {};
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

                        const printOptions = {};
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
			frappe.call("logout").finally(() => {
				window.location.href = "/app";
			});
		},

		handleChangePosProfile() {
			this.showPosProfileDialog = true;
			this.loadAvailablePosProfiles();
		},

		async loadAvailablePosProfiles() {
			this.loadingPosProfiles = true;
			try {
				const r = await frappe.call({
					method: "posawesome.posawesome.api.utilities.get_available_pos_profiles",
					args: {
						company: this.posProfile?.company || frappe.boot?.sysdefaults?.company,
						currency: this.posProfile?.currency || frappe.boot?.sysdefaults?.currency,
					},
				});
				if (r.message) {
					this.availablePosProfiles = r.message;
				}
			} catch (error) {
				console.error("Failed to load POS profiles:", error);
				frappe.msgprint(__("Failed to load POS profiles"));
			} finally {
				this.loadingPosProfiles = false;
			}
		},

		closePosProfileDialog() {
			this.showPosProfileDialog = false;
			this.selectedPosProfile = null;
		},

		async switchPosProfile() {
			if (!this.selectedPosProfile || this.selectedPosProfile === this.posProfile?.name) {
				return;
			}

			this.loadingPosProfiles = true;
			try {
				// Step 1: Get current opening shift from backend
				const currentShiftData = await frappe.call(
					"posawesome.posawesome.api.posapp.check_opening_shift",
					{
						user: frappe.session.user
					}
				);

				console.log("Current shift data response:", currentShiftData);

				let openingShiftData = null;
				let balanceDetails = [];

				// Check if we have a valid opening shift from backend
				if (currentShiftData.message && 
					currentShiftData.message !== "" && 
					currentShiftData.message.pos_opening_shift) {
					// Use the opening shift from backend
					openingShiftData = currentShiftData.message.pos_opening_shift;
					balanceDetails = openingShiftData.balance_details || [];
					console.log("Using backend opening shift:", openingShiftData);
				} else if (this.pos_opening_shift && Object.keys(this.pos_opening_shift).length > 0) {
					// Fallback to frontend data
					openingShiftData = this.pos_opening_shift;
					balanceDetails = openingShiftData.balance_details || [];
					console.log("Using frontend opening shift:", openingShiftData);
				} else if (this.posProfile?.pos_opening_shift && Object.keys(this.posProfile.pos_opening_shift).length > 0) {
					// Fallback to posProfile data
					openingShiftData = this.posProfile.pos_opening_shift;
					balanceDetails = openingShiftData.balance_details || [];
					console.log("Using posProfile opening shift:", openingShiftData);
				} else {
					// No opening shift found, create a new one directly
					console.log("No opening shift found, creating new one directly");
					await this.createNewOpeningShift();
					return;
				}

				console.log("Balance details:", balanceDetails);

				// Step 2: Close the current shift
				const closingData = await frappe.call(
					"posawesome.posawesome.doctype.pos_closing_shift.pos_closing_shift.make_closing_shift_from_opening",
					{
						opening_shift: JSON.stringify(openingShiftData),
					}
				);

				if (closingData.message) {
					// Step 3: Submit the closing shift
					await frappe.call(
						"posawesome.posawesome.doctype.pos_closing_shift.pos_closing_shift.submit_closing_shift",
						{
							closing_shift: JSON.stringify(closingData.message),
						}
					);

					// Step 4: Create new opening shift for selected profile
					const newOpeningData = await frappe.call(
						"posawesome.posawesome.api.posapp.create_opening_voucher",
						{
							pos_profile: this.selectedPosProfile,
							company: this.posProfile?.company || frappe.boot?.sysdefaults?.company,
							balance_details: JSON.stringify(balanceDetails),
						}
					);

					if (newOpeningData.message) {
						// Step 5: Update the UI with new profile data
						this.posProfile = newOpeningData.message.pos_profile;
						this.pos_opening_shift = newOpeningData.message.pos_opening_shift;
						
						// Emit events to update other components
						if (this.eventBus) {
							this.eventBus.emit("register_pos_profile", newOpeningData.message);
							this.eventBus.emit("set_company", newOpeningData.message.company);
						}
						
						// Close the dialog
						this.closePosProfileDialog();
						
						// Show success message
						frappe.msgprint(__("POS Profile switched successfully"), __("Success"));
					}
				}
			} catch (error) {
				console.error("Failed to switch POS profile:", error);
				frappe.msgprint(__("Failed to switch POS profile: ") + error.message);
			} finally {
				this.loadingPosProfiles = false;
			}
		},

		async createNewOpeningShift() {
			try {
				console.log("Creating new opening shift for profile:", this.selectedPosProfile);
				
				// Create new opening shift for selected profile
				const newOpeningData = await frappe.call(
					"posawesome.posawesome.api.posapp.create_opening_voucher",
					{
						pos_profile: this.selectedPosProfile,
						company: this.posProfile?.company || frappe.boot?.sysdefaults?.company,
						balance_details: JSON.stringify([]), // Empty balance details for new shift
					}
				);

				if (newOpeningData.message) {
					// Update the UI with new profile data
					this.posProfile = newOpeningData.message.pos_profile;
					this.pos_opening_shift = newOpeningData.message.pos_opening_shift;
					
					// Emit events to update other components
					if (this.eventBus) {
						this.eventBus.emit("register_pos_profile", newOpeningData.message);
						this.eventBus.emit("set_company", newOpeningData.message.company);
					}
					
					// Close the dialog
					this.closePosProfileDialog();
					
					// Show success message
					frappe.msgprint(__("POS Profile switched successfully"), __("Success"));
				}
			} catch (error) {
				console.error("Failed to create new opening shift:", error);
				frappe.msgprint(__("Failed to create new opening shift: ") + error.message);
			} finally {
				this.loadingPosProfiles = false;
			}
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
