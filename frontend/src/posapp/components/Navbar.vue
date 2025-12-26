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
					:notifications="notificationCenter.items"
					:unread-count="notificationCenter.unread"
					@mark-read="markBellNotificationsRead"
					@clear="clearBellNotifications"
				/>
			</template>

			<!-- Slot for menu -->
			<template #menu>
				<NavbarMenu
					:pos-profile="posProfile"
					:last-invoice-id="lastInvoiceId"
					:manual-offline="manualOffline"
					:network-online="networkOnline"
					:server-online="serverOnline"
					@close-shift="openCloseShift"
					@print-last-invoice="printLastInvoice"
					@sync-invoices="syncPendingInvoices"
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
		<v-dialog v-model="freeze" persistent max-width="290">
			<v-card class="pos-themed-card">
				<v-card-title class="text-h5 pos-text-primary">{{ freezeTitle }}</v-card-title>
				<v-card-text class="pos-text-secondary">{{ freezeMsg }}</v-card-text>
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
			v-model="snack"
			:timeout="snackTimeout"
			:color="snackColor"
			:location="isRtl ? 'top left' : 'top right'"
		>
			{{ snackText }}
			<template v-slot:actions>
				<v-btn class="pos-themed-button" variant="text" @click="dismissActiveNotification(true)">
					{{ __("Close") }}
				</v-btn>
			</template>
		</v-snackbar>
	</nav>
</template>

<script>
/* global frappe */
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
import { forceClearAllCache } from "../../offline/cache.js";
import { clearAllCaches } from "../../utils/clearAllCaches.js";
import { isOffline } from "../../offline/index.js";
import { useRtl } from "../composables/useRtl.js";

const ServerUsageGadget = defineAsyncComponent(() => import("./navbar/ServerUsageGadget.vue"));
const DatabaseUsageGadget = defineAsyncComponent(() => import("./navbar/DatabaseUsageGadget.vue"));
const DEFAULT_SNACK_TIMEOUT = 3000;
const OFFLINE_WARNING_TITLE = "Connection lost. Some features might not work.";
const OFFLINE_WARNING_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const OFFLINE_NOTIFICATION_KEY = "offline-connection-warning";

export default {
	name: "NavBar",
	setup() {
		const { isRtl, rtlStyles, rtlClasses } = useRtl();
		return {
			isRtl,
			rtlStyles,
			rtlClasses,
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
		lastInvoiceId: String,
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
			items: [
				{ text: "POS", icon: "mdi-network-pos" },
				{ text: "Payments", icon: "mdi-credit-card" },
			],
			company: "POS Awesome",
			companyImg: posLogo,
			showAboutDialog: false,
			showOfflineInvoices: false,
			freeze: false,
			freezeTitle: "",
			freezeMsg: "",
			snack: false,
			snackText: "",
			snackColor: "success",
			snackTimeout: DEFAULT_SNACK_TIMEOUT,
			notificationQueue: [],
			currentNotification: null,
			clearQueuedOnClose: false,
			lastNotificationShownAt: {},
			clearingCache: false,
			notificationUpdateHandle: null,
			notificationUpdateUsesTimeout: false,
			notificationCenter: {
				items: [],
				unread: 0,
			},
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
	},
	computed: {
		appBarColor() {
			return this.isDark ? this.$vuetify.theme.themes.dark.colors.surface : "white";
		},
	},
	mounted() {
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
			this.eventBus.off("show_message", this.showMessage);
			this.eventBus.off("freeze", this.handleFreeze);
			this.eventBus.off("unfreeze", this.handleUnfreeze);
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

		initializeNavbar() {
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
				this.eventBus.on("show_message", this.showMessage);
				this.eventBus.on("freeze", this.handleFreeze);
				this.eventBus.on("unfreeze", this.handleUnfreeze);
				this.eventBus.on("set_company", this.handleSetCompany);
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
		changePage(page) {
			this.$emit("change-page", page);
		},
		openCloseShift() {
			this.$emit("close-shift");
		},
		printLastInvoice() {
			this.$emit("print-last-invoice");
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
				this.showMessage({
					color: "warning",
					title: this.__("Cannot clear cache while offline"),
				});
				return;
			}
			let shouldReload = false;
			try {
				this.clearingCache = true;
				this.showMessage({
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
				this.showMessage({
					color: "success",
					title: this.__("Cache cleared successfully"),
				});
				shouldReload = true;
			} catch (e) {
				console.error("Failed to clear cache", e);
				this.showMessage({
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
					this.addBellNotification({
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

				this.addBellNotification({
					title: pendingTitle,
					detail: this.__("Pending count updated from {0} to {1}", [
						previous.pending,
						normalized.pending,
					]),
					color: normalized.pending ? "warning" : "success",
				});
			}

			if (diffSynced > 0) {
				this.addBellNotification({
					title: this.__("{0} offline invoice{1} synced", [diffSynced, diffSynced > 1 ? "s" : ""]),
					detail: this.__("Pending: {0}", [normalized.pending]),
					color: "success",
				});
			}

			if (diffDrafted > 0) {
				this.addBellNotification({
					title: this.__("{0} offline invoice{1} saved as draft", [
						diffDrafted,
						diffDrafted > 1 ? "s" : "",
					]),
					detail: this.__("Pending: {0}", [normalized.pending]),
					color: "warning",
				});
			}

			if (normalized.pending === 0 && previous.pending > 0 && diffSynced === 0 && diffDrafted === 0) {
				this.addBellNotification({
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

			this.addBellNotification({
				title,
				detail: this.__("Saved as draft because: {0}", [reasonText]),
				color: "error",
				timestamp: payload.timestamp || Date.now(),
			});

			this.showMessage({
				title,
				summary: title,
				detail: reasonText,
				color: "error",
				groupId: "invoice-submission-failed",
			});
		},
		addBellNotification(notification = {}) {
			const title = notification.title || this.__("Notification");
			const detail = notification.detail || "";
			const color = notification.color || "info";
			const timestamp = notification.timestamp || Date.now();

			const entry = {
				id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
				title,
				detail,
				color,
				timestamp,
			};

			this.notificationCenter.items = [entry, ...this.notificationCenter.items].slice(0, 20);
			this.notificationCenter.unread += 1;
		},
		markBellNotificationsRead() {
			this.notificationCenter.unread = 0;
		},
		clearBellNotifications() {
			this.notificationCenter.items = [];
			this.notificationCenter.unread = 0;
		},
		showMessage(data) {
			const notification = this.normalizeNotification(data);

			if (!notification.title) {
				return;
			}

			if (this.shouldThrottleNotification(notification)) {
				return;
			}

			if (this.currentNotification && this.currentNotification.key === notification.key) {
				this.mergeNotifications(this.currentNotification, notification);
				this.updateActiveNotification();
				return;
			}

			const existingQueued = this.notificationQueue.find((item) => item.key === notification.key);

			if (existingQueued) {
				this.mergeNotifications(existingQueued, notification);
			} else {
				this.notificationQueue.push({ ...notification });
			}

			if (!this.currentNotification && !this.snack) {
				this.processNextNotification();
			}
		},
		normalizeNotification(data = {}) {
			const title = typeof data.title === "string" ? data.title.trim() : "";
			const color = data.color || "success";
			const timeout =
				typeof data.timeout === "number" && data.timeout >= 0 ? data.timeout : DEFAULT_SNACK_TIMEOUT;
			const summary = typeof data.summary === "string" ? data.summary.trim() : "";
			const detail = typeof data.detail === "string" ? data.detail.trim() : "";
			const count = Number.isFinite(data.count) && data.count > 0 ? Math.floor(data.count) : 1;
			const providedKey =
				(typeof data.groupId === "string" && data.groupId.trim()) ||
				(typeof data.groupKey === "string" && data.groupKey.trim()) ||
				"";

			const offlineWarning = this.isConnectionLossNotification(title, summary, detail);
			const cooldownMs =
				typeof data.cooldownMs === "number" && data.cooldownMs >= 0
					? data.cooldownMs
					: offlineWarning
						? OFFLINE_WARNING_COOLDOWN_MS
						: undefined;

			const baseKey = offlineWarning
				? OFFLINE_NOTIFICATION_KEY
				: providedKey || `${color}::${summary || title}`;

			return {
				title,
				color,
				timeout,
				count,
				key: baseKey,
				summary,
				latestDetail: detail,
				cooldownMs,
				isOfflineWarning: offlineWarning,
			};
		},
		shouldThrottleNotification(notification) {
			const effectiveCooldown = this.getNotificationCooldown(notification);
			if (!effectiveCooldown) {
				return false;
			}

			const lastShown = this.lastNotificationShownAt[notification.key] || 0;
			const now = Date.now();

			if (now - lastShown < effectiveCooldown) {
				return true;
			}

			this.lastNotificationShownAt[notification.key] = now;
			return false;
		},
		getNotificationCooldown(notification) {
			if (typeof notification.cooldownMs === "number") {
				return notification.cooldownMs;
			}

			if (notification.isOfflineWarning || notification.title === OFFLINE_WARNING_TITLE) {
				return OFFLINE_WARNING_COOLDOWN_MS;
			}

			return 0;
		},
		isConnectionLossNotification(title = "", summary = "", detail = "") {
			const combined = `${title} ${summary} ${detail}`.toLowerCase();
			if (!combined) {
				return false;
			}

			return (
				combined.includes("connection lost") ||
				combined.includes("not connected to internet") ||
				(combined.includes("connection") && combined.includes("offline")) ||
				(combined.includes("internet") && combined.includes("retry"))
			);
		},
		mergeNotifications(target, incoming) {
			target.count += incoming.count;
			target.timeout = Math.max(target.timeout, incoming.timeout);
			if (incoming.title) {
				target.title = incoming.title;
			}
			if (incoming.summary) {
				target.summary = incoming.summary;
			}
			if (incoming.latestDetail) {
				target.latestDetail = incoming.latestDetail;
			}
		},
		processNextNotification() {
			if (!this.notificationQueue.length) {
				this.currentNotification = null;
				return;
			}

			const nextNotification = this.notificationQueue.shift();
			this.currentNotification = { ...nextNotification };
			this.updateActiveNotification();
		},
		updateActiveNotification() {
			if (!this.currentNotification) {
				return;
			}

			if (this.notificationUpdateHandle !== null) {
				return;
			}

			const hasWindow = typeof window !== "undefined";
			const scheduleWithRaf = hasWindow && typeof window.requestAnimationFrame === "function";

			if (scheduleWithRaf) {
				this.notificationUpdateUsesTimeout = false;
				this.notificationUpdateHandle = window.requestAnimationFrame(() => {
					this.notificationUpdateHandle = null;
					this.applyNotificationState();
				});
			} else {
				this.notificationUpdateUsesTimeout = true;
				this.notificationUpdateHandle = setTimeout(() => {
					this.notificationUpdateHandle = null;
					this.applyNotificationState();
				}, 16);
			}
		},
		applyNotificationState() {
			if (!this.currentNotification) {
				return;
			}

			this.snackColor = this.currentNotification.color;
			this.snackTimeout = this.currentNotification.timeout;
			this.snackText = this.formatNotificationMessage(this.currentNotification);

			if (!this.snack) {
				this.snack = true;
			}
		},
		formatNotificationMessage(notification) {
			if (!notification) {
				return "";
			}

			const baseText = notification.summary || notification.title;

			if (!baseText) {
				return notification.title || "";
			}

			const multiplier = notification.count > 1 ? ` (${notification.count}×)` : "";
			const detail = notification.latestDetail;

			if (notification.summary && detail) {
				return `${baseText}${multiplier} – ${detail}`;
			}

			return `${baseText}${multiplier}`;
		},
		dismissActiveNotification(clearQueue = false) {
			if (clearQueue) {
				this.clearQueuedOnClose = true;
			}
			this.snack = false;
		},
		handleSnackbarClosed() {
			if (this.clearQueuedOnClose) {
				this.notificationQueue = [];
			}
			this.clearQueuedOnClose = false;
			this.currentNotification = null;

			if (this.notificationQueue.length) {
				this.$nextTick(() => this.processNextNotification());
			}
		},
		handleFreeze(data) {
			this.freezeTitle = data?.title || "";
			this.freezeMsg = data?.message || "";
			this.freeze = true;
		},
		handleUnfreeze() {
			this.freeze = false;
			this.freezeTitle = "";
			this.freezeMsg = "";
		},
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
		"print-last-invoice",
		"sync-invoices",
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
