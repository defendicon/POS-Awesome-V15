<template>
	<nav :class="['pos-themed-card', rtlClasses]">
		<!-- Use the modular NavbarAppBar component -->
		<NavbarAppBar
			:pos-profile="posProfile"
			:pending-invoices="pendingInvoices"
			:loading-progress="loadingProgress"
			:loading-active="loadingActive"
			:loading-message="loadingMessage"
			@nav-click="handleNavClick"
			@go-desk="goDesk"
			@show-offline-invoices="showOfflineInvoices = true"
		>
			<!-- Slot for status indicator -->
			<template #status-indicator>
				<StatusIndicator
					:network-online="networkOnline"
					:server-online="serverOnline"
					:server-connecting="serverConnecting"
					:is-ip-host="isIpHost"
				/>
			</template>

			<!-- Slot for cache usage meter -->
			<template #cache-usage-meter>
				<CacheUsageMeter
					:cache-usage="cacheUsage"
					:cache-usage-loading="cacheUsageLoading"
					:cache-usage-details="cacheUsageDetails"
					@refresh="refreshCacheUsage"
				/>
			</template>

			<!-- Slot for CPU gadget -->
			<template #cpu-gadget>
				<ServerUsageGadget />
			</template>

			<!-- Slot for Database Usage Gadget -->
			<template #db-usage-gadget>
				<DatabaseUsageGadget />
			</template>

			<template #notification-bell>
				<NotificationBell
					:notifications="history"
					:unread-count="unreadCount"
					@mark-read="toastStore.markRead()"
					@clear="toastStore.clearHistory()"
				/>
			</template>

			<!-- Slot for menu -->
			<template #menu>
				<NavbarMenu
					:pos-profile="posProfile"
					:manual-offline="manualOffline"
					:network-online="networkOnline"
					:server-online="serverOnline"
					@close-shift="openCloseShift"
					@sync-invoices="syncPendingInvoices"
					@open-customer-display="$emit('open-customer-display')"
					@toggle-offline="toggleManualOffline"
					@clear-cache="clearCache"
					@show-about="showAboutDialog = true"
					@toggle-theme="toggleTheme"
					@logout="logOut"
				/>
			</template>
		</NavbarAppBar>

		<!-- Use the modular NavbarDrawer component -->
		<NavbarDrawer
			v-model:drawer="drawer"
			v-model:item="item"
			:company="company"
			:company-img="companyImg"
			:items="items"
			@change-page="changePage"
		/>

		<!-- Use the modular AboutDialog component -->
		<AboutDialog v-model="showAboutDialog" />

		<!-- Keep existing dialogs -->
		<v-dialog v-model="isFrozen" persistent max-width="290">
			<v-card class="pos-themed-card">
				<v-card-title class="text-h5 pos-text-primary">{{ freezeTitle }}</v-card-title>
				<v-card-text class="pos-text-secondary">{{ freezeMessage }}</v-card-text>
			</v-card>
		</v-dialog>

		<OfflineInvoicesDialog
			v-model="showOfflineInvoices"
			:pos-profile="posProfile"
			@deleted="updateAfterDelete"
			@sync-all="syncPendingInvoices"
		/>

		<!-- Snackbar for notifications -->
		<v-snackbar
			v-model="visible"
			:timeout="timeout"
			:color="color"
			:location="isRtl ? 'top left' : 'top right'"
			@update:modelValue="(val) => !val && toastStore.onSnackbarClosed()"
		>
			{{ text }}
			<template v-slot:actions>
				<v-btn class="pos-themed-button" variant="text" @click="visible = false">
					{{ __("Close") }}
				</v-btn>
			</template>
		</v-snackbar>
	</nav>
</template>

<script>
import { defineAsyncComponent } from "vue";
import NavbarAppBar from "./navbar/NavbarAppBar.vue";
import NavbarDrawer from "./navbar/NavbarDrawer.vue";
import NavbarMenu from "./navbar/NavbarMenu.vue";
import NotificationBell from "./navbar/NotificationBell.vue";
import StatusIndicator from "./navbar/StatusIndicator.vue";
import CacheUsageMeter from "./navbar/CacheUsageMeter.vue";
import AboutDialog from "./navbar/AboutDialog.vue";
import OfflineInvoices from "./OfflineInvoices.vue";
import posLogo from "./pos/pos.png";
import { forceClearAllCache } from "../../offline/index";
import { clearAllCaches } from "../../utils/clearAllCaches";
import { isOffline } from "../../offline/index";
import { useRtl } from "../composables/core/useRtl";

const ServerUsageGadget = defineAsyncComponent(() => import("./navbar/ServerUsageGadget.vue"));
const DatabaseUsageGadget = defineAsyncComponent(() => import("./navbar/DatabaseUsageGadget.vue"));

import { useToastStore } from "../stores/toastStore.js";
import { useUIStore } from "../stores/uiStore.js";
import { storeToRefs } from "pinia";

export default {
	name: "NavBar",
	setup() {
		const { isRtl, rtlStyles, rtlClasses } = useRtl();
		const toastStore = useToastStore();
		const uiStore = useUIStore();
		// Extract reactive refs
		const { visible, text, color, timeout, history, unreadCount } = storeToRefs(toastStore);
		const { isFrozen, freezeTitle, freezeMessage } = storeToRefs(uiStore);

		return {
			isRtl,
			rtlStyles,
			rtlClasses,
			toastStore,
			uiStore,
			visible,
			text,
			color,
			timeout,
			history,
			unreadCount,
			isFrozen,
			freezeTitle,
			freezeMessage,
		};
	},
	components: {
		NavbarAppBar,
		NavbarDrawer,
		NavbarMenu,
		NotificationBell,
		StatusIndicator,
		CacheUsageMeter,
		AboutDialog,
		OfflineInvoicesDialog: OfflineInvoices,
		ServerUsageGadget,
		DatabaseUsageGadget,
	},
	props: {
		posProfile: {
			type: Object,
			default: () => ({}),
		},
		pendingInvoices: {
			type: Number,
			default: 0,
		},
		networkOnline: Boolean,
		serverOnline: Boolean,
		serverConnecting: Boolean,
		isIpHost: Boolean,
		syncTotals: {
			type: Object,
			default: () => ({ pending: 0, synced: 0, drafted: 0 }),
		},
		manualOffline: Boolean,
		cacheUsage: {
			type: Number,
			default: 0,
		},
		cacheUsageLoading: {
			type: Boolean,
			default: false,
		},
		cacheUsageDetails: {
			type: Object,
			default: () => ({ total: 0, indexedDB: 0, localStorage: 0 }),
		},
		loadingProgress: {
			type: Number,
			default: 0,
		},
		loadingActive: {
			type: Boolean,
			default: false,
		},
		loadingMessage: {
			type: String,
			default: "Loading app data...",
		},
	},
	data() {
		return {
			drawer: false,
			mini: true,
			item: 0,
			baseItems: [
				{ text: "POS", icon: "mdi-network-pos", to: "/pos" },
				{ text: "Awesome Dashboard", icon: "mdi-view-dashboard-outline", to: "/dashboard" },
				{ text: "Payments", icon: "mdi-credit-card", to: "/payments" },
				{ text: "Purchase Order", icon: "mdi-cart-plus", to: "/orders" },
				{ text: "Barcode Printing", icon: "mdi-barcode", to: "/barcode" },
			],
			items: [],
			company: "POS Awesome",
			companyImg: posLogo,
			showAboutDialog: false,
			showOfflineInvoices: false,
			lastSyncTotalsSnapshot: { pending: 0, synced: 0, drafted: 0 },
			syncNotificationPrimed: false,
		};
	},
	watch: {
		snack(newVal, oldVal) {
			if (!newVal && oldVal) {
				this.handleSnackbarClosed();
			}
		},
		syncTotals: {
			handler(newTotals, oldTotals) {
				this.handleSyncTotalsNotification(newTotals, oldTotals);
			},
			deep: true,
			immediate: true,
		},
		posProfile: {
			handler() {
				this.updateNavigationItems();
			},
			deep: true,
			immediate: true,
		},
	},
	computed: {
		appBarColor() {
			return this.isDark ? this.$vuetify.theme.themes.dark.colors.surface : "white";
		},
	},
	mounted() {
		this.updateNavigationItems();
		this.initializeNavbar();
		this.setupEventListeners();
	},

	created() {
		// Initialize early to prevent reactivity issues
		this.preInitialize();
	},
	unmounted() {
		if (this.notificationUpdateHandle !== null) {
			if (this.notificationUpdateUsesTimeout) {
				clearTimeout(this.notificationUpdateHandle);
			} else if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
				window.cancelAnimationFrame(this.notificationUpdateHandle);
			}
			this.notificationUpdateHandle = null;
		}
		if (this.eventBus) {
			this.eventBus.off("show_message");
			this.eventBus.off("set_company", this.handleSetCompany);
			this.eventBus.off("invoice_submission_failed", this.handleInvoiceSubmissionFailed);
		}
	},
	methods: {
		preInitialize() {
			// Early initialization to prevent cache-related element destruction
			// Use reactive assignment instead of direct property modification
			if (typeof frappe !== "undefined" && frappe.boot) {
				// Set company reactively
				if (frappe.boot.sysdefaults && frappe.boot.sysdefaults.company) {
					this.$set
						? this.$set(this, "company", frappe.boot.sysdefaults.company)
						: (this.company = frappe.boot.sysdefaults.company);
				}

				// Set company logo reactively - prioritize app_logo over banner_image
				if (frappe.boot.website_settings) {
					const logo =
						frappe.boot.website_settings.app_logo || frappe.boot.website_settings.banner_image;
					if (logo) {
						this.$set ? this.$set(this, "companyImg", logo) : (this.companyImg = logo);
					}
				}
			}
		},
		updateNavigationItems() {
			const items = [...this.baseItems];
			if (this.posProfile?.posa_enable_cash_movement) {
				items.push({
					text: "Cash Movement",
					icon: "mdi-cash-sync",
					to: "/cash-movement",
				});
			}
			this.items = items;
		},

		initializeNavbar() {
			// Watch store for company changes
			this.$watch(
				() => this.uiStore.companyDoc,
				(doc) => {
					this.handleSetCompany(doc);
				},
				{ deep: true, immediate: true },
			);

			// Enhanced initialization with better reactivity handling
			const updateCompanyInfo = () => {
				let updated = false;

				// Update company if not already set or changed
				if (frappe.boot && frappe.boot.sysdefaults && frappe.boot.sysdefaults.company) {
					if (this.company !== frappe.boot.sysdefaults.company) {
						this.company = frappe.boot.sysdefaults.company;
						updated = true;
					}
				}

				// Update logo if not already set or changed
				if (frappe.boot && frappe.boot.website_settings) {
					const newLogo =
						frappe.boot.website_settings.app_logo || frappe.boot.website_settings.banner_image;
					if (newLogo && this.companyImg !== newLogo) {
						this.companyImg = newLogo;
						updated = true;
					}
				}

				// Only force update if something actually changed
				if (updated) {
					this.$nextTick(() => {
						// Emit event to parent components if needed
						this.$emit("navbar-updated");
					});
				}
			};

			// Check if frappe is available
			if (typeof frappe !== "undefined") {
				updateCompanyInfo();
			} else {
				// Wait for frappe to become available
				const checkFrappe = setInterval(() => {
					if (typeof frappe !== "undefined") {
						clearInterval(checkFrappe);
						updateCompanyInfo();
					}
				}, 100);

				// Clear interval after 5 seconds to prevent infinite checking
				setTimeout(() => clearInterval(checkFrappe), 5000);
			}
		},

		setupEventListeners() {
			if (this.eventBus) {
				this.eventBus.on("show_message", (data) => this.toastStore.show(data));
				this.eventBus.on("invoice_submission_failed", this.handleInvoiceSubmissionFailed);
			}
		},
		handleNavClick() {
			this.drawer = !this.drawer;
			this.$emit("nav-click");
		},
		goDesk() {
			window.location.href = "/app";
		},

		openCloseShift() {
			this.$emit("close-shift");
		},
		syncPendingInvoices() {
			this.$emit("sync-invoices");
		},
		toggleManualOffline() {
			this.$emit("toggle-offline");
		},
		async clearCache() {
			if (this.clearingCache) {
				return;
			}
			if (isOffline()) {
				this.toastStore.show({
					color: "warning",
					title: this.__("Cannot clear cache while offline"),
				});
				return;
			}
			let shouldReload = false;
			try {
				this.clearingCache = true;
				this.toastStore.show({
					color: "info",
					title: this.__("Clearing local cache..."),
				});
				let westernPref = null;
				if (typeof localStorage !== "undefined") {
					westernPref = localStorage.getItem("use_western_numerals");
				}
				await forceClearAllCache();
				await clearAllCaches({ confirmBeforeClear: false }).catch(() => {});
				if (westernPref !== null && typeof localStorage !== "undefined") {
					localStorage.setItem("use_western_numerals", westernPref);
				}
				this.toastStore.show({
					color: "success",
					title: this.__("Cache cleared successfully"),
				});
				shouldReload = true;
			} catch (e) {
				console.error("Failed to clear cache", e);
				this.toastStore.show({
					color: "error",
					title: this.__("Failed to clear cache"),
				});
			} finally {
				this.clearingCache = false;
				if (shouldReload) {
					setTimeout(() => location.reload(), 1000);
				}
			}
		},
		toggleTheme() {
			this.$emit("toggle-theme");
		},
		logOut() {
			this.$emit("logout");
		},
		refreshCacheUsage() {
			this.$emit("refresh-cache-usage");
		},
		updateAfterDelete() {
			this.$emit("update-after-delete");
		},
		handleSyncTotalsNotification(newTotals = {}, oldTotals = {}) {
			const normalized = this.normalizeSyncTotals(newTotals);
			const previous = this.syncNotificationPrimed
				? this.normalizeSyncTotals(this.lastSyncTotalsSnapshot)
				: this.normalizeSyncTotals(oldTotals);

			// Prime state without spamming when component mounts
			if (!this.syncNotificationPrimed) {
				this.syncNotificationPrimed = true;
				this.lastSyncTotalsSnapshot = normalized;

				if (this.hasOfflineSyncCounts(normalized)) {
					this.toastStore.show({
						title: this.__("Offline invoices status"),
						detail: this.__("Pending: {0} | Synced: {1} | Draft: {2}", [
							normalized.pending,
							normalized.synced,
							normalized.drafted,
						]),
						color: normalized.pending ? "warning" : "success",
					});
				}
				return;
			}

			const diffSynced = Math.max(0, normalized.synced - previous.synced);
			const diffDrafted = Math.max(0, normalized.drafted - previous.drafted);

			if (normalized.pending !== previous.pending) {
				const pendingTitle =
					normalized.pending > 0
						? this.__("{0} offline invoice{1} pending", [
								normalized.pending,
								normalized.pending > 1 ? "s" : "",
							])
						: this.__("No pending offline invoices");

				this.toastStore.show({
					title: pendingTitle,
					detail: this.__("Pending count updated from {0} to {1}", [
						previous.pending,
						normalized.pending,
					]),
					color: normalized.pending ? "warning" : "success",
				});
			}

			if (diffSynced > 0) {
				this.toastStore.show({
					title: this.__("{0} offline invoice{1} synced", [diffSynced, diffSynced > 1 ? "s" : ""]),
					detail: this.__("Pending: {0}", [normalized.pending]),
					color: "success",
				});
			}

			if (diffDrafted > 0) {
				this.toastStore.show({
					title: this.__("{0} offline invoice{1} saved as draft", [
						diffDrafted,
						diffDrafted > 1 ? "s" : "",
					]),
					detail: this.__("Pending: {0}", [normalized.pending]),
					color: "warning",
				});
			}

			if (normalized.pending === 0 && previous.pending > 0 && diffSynced === 0 && diffDrafted === 0) {
				this.toastStore.show({
					title: this.__("Offline invoices synced"),
					detail: this.__("All pending invoices are up to date"),
					color: "success",
				});
			}

			this.lastSyncTotalsSnapshot = normalized;
		},
		normalizeSyncTotals(totals = {}) {
			const toNumber = (value) => {
				const parsed = Number(value);
				return Number.isFinite(parsed) ? parsed : 0;
			};

			return {
				pending: toNumber(totals.pending),
				synced: toNumber(totals.synced),
				drafted: toNumber(totals.drafted),
			};
		},
		hasOfflineSyncCounts(totals = {}) {
			const normalized = this.normalizeSyncTotals(totals);
			return normalized.pending > 0 || normalized.synced > 0 || normalized.drafted > 0;
		},
		handleInvoiceSubmissionFailed(payload = {}) {
			const invoiceNumber =
				payload.invoice ||
				payload.invoiceId ||
				payload.invoice_name ||
				payload.name ||
				payload.reference;
			const rawReason = (payload.reason || payload.error || payload.message || "").toString().trim();
			const reasonText =
				rawReason || this.__("The invoice stayed in draft. Please review and submit it manually.");
			const title = invoiceNumber
				? this.__("Invoice {0} submission failed", [invoiceNumber])
				: this.__("Invoice submission failed");

			this.toastStore.show({
				title,
				detail: this.__("Saved as draft because: {0}", [reasonText]),
				color: "error",
				timestamp: payload.timestamp || Date.now(),
			});

			// Show message already handled by toastStore.show above? No, above adds to history and shows snack.
			// The original code did both: addBellNotification (history) and showMessage (snack).
			// Our new toastStore.show does both. So one call is enough.
		},

		// Notification logic moved to toastStore

		handleSetCompany(data) {
			if (typeof data === "string") {
				this.company = data;
			} else if (data && data.name) {
				this.company = data.name;
				if (data.company_image) {
					this.companyImg = data.company_image;
				}
			}
		},
		handleMouseLeave() {
			if (!this.drawer) return;
			clearTimeout(this._closeTimeout);
			this._closeTimeout = setTimeout(() => {
				this.drawer = false;
				this.mini = true;
			}, 250);
		},
	},
	emits: [
		"nav-click",
		"change-page",
		"close-shift",
		"sync-invoices",
		"open-customer-display",
		"toggle-offline",
		"toggle-theme",
		"logout",
		"refresh-cache-usage",
		"update-after-delete",
		"navbar-updated",
	],
};
</script>

<style scoped>
/* Main navigation container styles - scoped to POSApp */
.posapp nav {
	position: relative;
	z-index: 1000;
}

/* Snackbar positioning - scoped to POSApp */
.posapp :deep(.v-snackbar) {
	z-index: 9999;
}
</style>
