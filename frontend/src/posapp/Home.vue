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

			const print_format = this.posProfile.sales_invoice_print_format || this.posProfile.print_format_for_online || this.posProfile.print_format;
			const letter_head = this.posProfile.letter_head || 0;
			const doctype = this.posProfile.create_pos_invoice_instead_of_sales_invoice
				? "POS Invoice"
				: "Sales Invoice";
			const docname = this.lastInvoiceId;
			const lang_code = frappe.boot.lang;

			if (this.posProfile.qz_printing) {
				this._print_via_qz(doctype, docname, print_format, letter_head, lang_code);
				console.log("Attempting to print via QZ Tray from Home.vue");
			} else {
				this._print_regular(doctype, docname, print_format, letter_head);
				console.log("Printing via regular method from Home.vue");
			}
		},

		_print_regular(doctype, docname, print_format, letter_head) {
			const url =
				frappe.urllib.get_base_url() +
				"/printview?doctype=" +
				encodeURIComponent(doctype) +
				"&name=" +
				docname +
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

		_print_via_qz(doctype, docname, print_format, letter_head, lang_code) {
			try {
				const print_format_printer_map = this._get_print_format_printer_map();
				const mapped_printer = this._get_mapped_printer(print_format_printer_map, doctype, print_format);

				if (mapped_printer.length === 1) {
					this._print_with_mapped_printer(doctype, docname, print_format, letter_head, lang_code, mapped_printer[0]);
				} else if (this._is_raw_printing(print_format)) {
					frappe.show_alert({
						message: __("Printer mapping not set."),
						subtitle: __("Please set a printer mapping for this print format in the Printer Settings"),
						indicator: "warning"
					}, 14);
					this._printer_setting_dialog(doctype, print_format);
				} else {
					this._print_regular(doctype, docname, print_format, letter_head);
				}
			} catch (error) {
				console.error("QZ printing failed:", error);
				frappe.show_alert({
					message: __("QZ printing failed, using regular print."),
					indicator: "orange"
				});
				this._print_regular(doctype, docname, print_format, letter_head);
			}
		},

		_print_with_mapped_printer(doctype, docname, print_format, letter_head, lang_code, printer_map) {
			if (this._is_raw_printing(print_format)) {
				this._get_raw_commands(doctype, docname, print_format, lang_code, (out) => {
					frappe.ui.form.qz_connect()
						.then(() => {
							let config = qz.configs.create(printer_map.printer);
							let data = [out.raw_commands];
							return qz.print(config, data);
						})
						.then(frappe.ui.form.qz_success)
						.catch((err) => {
							frappe.ui.form.qz_fail(err);
							this._print_regular(doctype, docname, print_format, letter_head);
						});
				});
			} else {
				frappe.show_alert({
					message: __('PDF printing via "Raw Print" is not supported.'),
					subtitle: __("Please remove the printer mapping in Printer Settings and try again."),
					indicator: "info"
				}, 14);
				this._print_regular(doctype, docname, print_format, letter_head);
			}
		},

		_get_raw_commands(doctype, docname, print_format, lang_code, callback) {
			frappe.call({
				method: "frappe.www.printview.get_rendered_raw_commands",
				args: {
					doc: frappe.get_doc(doctype, docname),
					print_format: print_format,
					_lang: lang_code
				},
				callback: (r) => {
					if (!r.exc) {
						callback(r.message);
					}
				}
			});
		},

		_is_raw_printing(format) {
			let print_format = {};
			if (locals["Print Format"] && locals["Print Format"][format]) {
				print_format = locals["Print Format"][format];
			}
			return print_format.raw_printing === 1;
		},

		_get_print_format_printer_map() {
			try {
				return JSON.parse(localStorage.print_format_printer_map || "{}");
			} catch (e) {
				return {};
			}
		},

		_get_mapped_printer(print_format_printer_map, doctype, print_format) {
			if (print_format_printer_map[doctype]) {
				return print_format_printer_map[doctype].filter(
					(printer_map) => printer_map.print_format === print_format
				);
			}
			return [];
		},

		_get_print_format_options(doctype, callback) {
			// Try to get print formats from meta first
			try {
				let formats = frappe.meta.get_print_formats(doctype);
				if (formats && Array.isArray(formats) && formats.length > 2) {
					callback(formats);
					return;
				}
			} catch (error) {
				console.warn("Error getting print formats from meta:", error);
			}

			// Try to get from frappe.boot if available
			if (frappe.boot && frappe.boot.print_formats && frappe.boot.print_formats[doctype]) {
				let formats = frappe.boot.print_formats[doctype];
				if (formats && formats.length > 2) {
					callback(formats);
					return;
				}
			}

			// Fetch all print formats from database
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Print Format",
					fields: ["name", "print_format_type", "disabled"],
					filters: [
						["doc_type", "=", doctype],
						["disabled", "=", 0]
					],
					order_by: "name"
				},
				callback: (r) => {
					let formats = ["Standard"]; // Always include Standard
					
					if (r.message && r.message.length > 0) {
						// Add all enabled print formats
						const custom_formats = r.message.map(format => format.name);
						formats = formats.concat(custom_formats);
					}
					
					// Add some common fallback formats if none found
					if (formats.length <= 1) {
						formats.push("POS invoice print");
					}
					
					// Remove duplicates and return
					formats = [...new Set(formats)];
					callback(formats);
				},
				error: () => {
					// Final fallback
					callback(["Standard", "POS invoice print"]);
				}
			});
		},

		_printer_setting_dialog(doctype, current_print_format) {
			// Show loading message
			const loading_dialog = frappe.show_alert({
				message: __("Loading print formats and printers..."),
				indicator: 'blue'
			});

			Promise.all([
				frappe.ui.form.qz_get_printer_list(),
				new Promise((resolve) => {
					this._get_print_format_options(doctype, resolve);
				})
			]).then(([printer_list, print_format_options]) => {
				// Hide loading message
				if (loading_dialog) loading_dialog.hide();

				if (!(printer_list && printer_list.length)) {
					frappe.throw(__("No Printer is Available."));
					return;
				}

				const print_format_printer_map = this._get_print_format_printer_map();
				let data = print_format_printer_map[doctype] || [];

				const dialog = new frappe.ui.Dialog({
					title: __("Printer Settings"),
					fields: [
						{
							fieldtype: "Section Break"
						},
						{
							fieldname: "printer_mapping",
							fieldtype: "Table",
							label: __("Printer Mapping"),
							in_place_edit: true,
							data: data,
							get_data: () => {
								return data;
							},
							fields: [
								{
									fieldtype: "Select",
									fieldname: "print_format",
									default: 0,
									options: print_format_options,
									read_only: 0,
									in_list_view: 1,
									label: __("Print Format")
								},
								{
									fieldtype: "Select",
									fieldname: "printer",
									default: 0,
									options: printer_list,
									read_only: 0,
									in_list_view: 1,
									label: __("Printer")
								}
							]
						}
					],
					primary_action: () => {
						let printer_mapping = dialog.get_values()["printer_mapping"];
						if (printer_mapping && printer_mapping.length) {
							let print_format_list = printer_mapping.map((a) => a.print_format);
							let has_duplicate = print_format_list.some(
								(item, idx) => print_format_list.indexOf(item) != idx
							);
							if (has_duplicate) {
								frappe.throw(__("Cannot have multiple printers mapped to a single print format."));
								return;
							}
						} else {
							printer_mapping = [];
						}

						let saved_print_format_printer_map = this._get_print_format_printer_map();
						saved_print_format_printer_map[doctype] = printer_mapping;
						localStorage.print_format_printer_map = JSON.stringify(saved_print_format_printer_map);

						dialog.hide();

						// Try printing again with the new settings
						this._print_via_qz(doctype, docname, current_print_format, letter_head, lang_code);
					},
					primary_action_label: __("Save")
				});

				dialog.show();
			}).catch((error) => {
				// Hide loading message
				if (loading_dialog) loading_dialog.hide();
				
				frappe.show_alert({
					message: __("Error loading printer settings: ") + (error.message || error),
					indicator: 'red'
				});
			});
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
