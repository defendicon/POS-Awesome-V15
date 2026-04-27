<template>
	<nav :class="['pos-themed-card', rtlClasses]">
		<!-- Use the modular NavbarAppBar component -->
		<NavbarAppBar
			:pos-profile="posProfile"
			:cashier-name="currentCashierDisplay"
			:pending-invoices="pendingInvoices"
			:loading-progress="loadingProgress"
			:loading-active="loadingActive"
			:loading-indeterminate="loadingIndeterminate"
			:loading-message="loadingMessage"
			@nav-click="handleNavClick"
			@go-desk="goDesk"
			@show-offline-invoices="showOfflineInvoices = true"
			@open-employee-switch="openEmployeeSwitch"
		>
			<!-- Slot for status indicator -->
			<template #status-indicator>
				<div class="status-entry-surface">
					<StatusIndicator
						:network-online="networkOnline"
						:server-online="serverOnline"
						:server-connecting="serverConnecting"
						:is-ip-host="isIpHost"
						:bootstrap-warning-active="bootstrapWarningActive"
						:bootstrap-warning-tooltip="bootstrapWarningTooltip"
						@toggle-panel="toggleOfflineStatusPanel"
					/>
					<OfflineStatusPanel
						v-model="offlinePanelOpen"
						@toggle-offline="toggleManualOfflineFromPanel"
						@refresh-offline-data="handleRefreshOfflineDataAction"
						@rebuild-offline-data="handleRebuildOfflineDataAction"
						@clear-cache="handleClearCacheAction"
						@open-diagnostics="handleOpenOfflineDiagnosticsAction"
					/>
				</div>
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
					:cashier-name="currentCashierDisplay"
					:manual-offline="manualOffline"
					:network-online="networkOnline"
					:server-online="serverOnline"
					@close-shift="openCloseShift"
					@sync-invoices="syncPendingInvoices"
					@open-employee-switch="openEmployeeSwitch"
					@lock-pos="lockPosScreen"
					@open-customer-display="$emit('open-customer-display')"
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
			:footer-action="drawerFooterAction"
			@open-settings="openSettingsPanel"
			@change-page="changePage"
		/>
		<NavbarSettingsPanel
			v-model="settingsPanelOpen"
			:sections="settingsSections"
			:pos-profile="posProfile"
			:current-cashier="currentCashier"
			:current-cashier-display="currentCashierDisplay"
			@select-action="handleSettingsPanelAction"
		/>

		<!-- Use the modular AboutDialog component -->
		<AboutDialog v-model="showAboutDialog" />
		<EmployeeSwitchDialog />

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
			<div class="d-flex align-center ga-3">
				<v-progress-circular
					v-if="toastLoading"
					indeterminate
					size="18"
					width="2"
					color="white"
				/>
				<span>{{ text }}</span>
			</div>
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
import NavbarSettingsPanel from "./navbar/NavbarSettingsPanel.vue";
import NotificationBell from "./navbar/NotificationBell.vue";
import OfflineStatusPanel from "./navbar/OfflineStatusPanel.vue";
import StatusIndicator from "./navbar/StatusIndicator.vue";
import CacheUsageMeter from "./navbar/CacheUsageMeter.vue";
import AboutDialog from "./navbar/AboutDialog.vue";
import OfflineInvoices from "./OfflineInvoices.vue";
import EmployeeSwitchDialog from "./pos/employee/EmployeeSwitchDialog.vue";
import posLogo from "./pos/pos.png";
import { forceClearAllCache } from "../../offline/index";
import { clearAllCaches } from "../../utils/clearAllCaches";
import { isOffline } from "../../offline/index";
import { useRtl } from "../composables/core/useRtl";

const ServerUsageGadget = defineAsyncComponent(() => import("./navbar/ServerUsageGadget.vue"));
const DatabaseUsageGadget = defineAsyncComponent(() => import("./navbar/DatabaseUsageGadget.vue"));

import { useToastStore } from "../stores/toastStore";
import { useUIStore } from "../stores/uiStore";
import { useEmployeeStore } from "../stores/employeeStore";
import { useOfflineSyncStore } from "../stores/offlineSyncStore";
import { storeToRefs } from "pinia";

export default {
	name: "NavBar",
	setup() {
		const { isRtl, rtlStyles, rtlClasses } = useRtl();
		const toastStore = useToastStore();
		const uiStore = useUIStore();
		const employeeStore = useEmployeeStore();
		const offlineSyncStore = useOfflineSyncStore();
		// Extract reactive refs
		const { visible, text, color, timeout, loading: toastLoading, history, unreadCount } = storeToRefs(toastStore);
		const { isFrozen, freezeTitle, freezeMessage } = storeToRefs(uiStore);
		const { currentCashier, currentCashierDisplay } = storeToRefs(employeeStore);
		const { panelOpen: offlinePanelOpen } = storeToRefs(offlineSyncStore);

		return {
			isRtl,
			rtlStyles,
			rtlClasses,
			toastStore,
			uiStore,
			offlineSyncStore,
			visible,
			text,
			color,
			timeout,
			toastLoading,
			history,
			unreadCount,
			isFrozen,
			freezeTitle,
			freezeMessage,
			employeeStore,
			currentCashier,
			currentCashierDisplay,
			offlinePanelOpen,
		};
	},
	components: {
		NavbarAppBar,
		NavbarDrawer,
		NavbarMenu,
		NavbarSettingsPanel,
		NotificationBell,
		OfflineStatusPanel,
		StatusIndicator,
		CacheUsageMeter,
		AboutDialog,
		EmployeeSwitchDialog,
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
		bootstrapWarningActive: Boolean,
		bootstrapWarningTooltip: {
			type: String,
			default: "",
		},
		bootstrapCapabilities: {
			type: Array,
			default: () => [],
		},
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
		loadingIndeterminate: {
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
				{ text: "Payments", icon: "mdi-credit-card", to: "/payments" },
				{ text: "Purchase Order", icon: "mdi-cart-plus", to: "/orders" },
				{ text: "Barcode Printing", icon: "mdi-barcode", to: "/barcode" },
			],
			items: [],
			company: "POS Awesome",
			companyImg: posLogo,
			showAboutDialog: false,
			showOfflineInvoices: false,
			settingsPanelOpen: false,
			lastSyncTotalsSnapshot: { pending: 0, synced: 0, drafted: 0 },
			syncNotificationPrimed: false,
			employeeSwitchHandler: null,
			lockPosHandler: null,
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
				void this.fetchTerminalEmployees();
			},
			deep: true,
			immediate: true,
		},
		offlineStatusState: {
			handler() {
				this.syncOfflineStatusSurface();
			},
			deep: true,
			immediate: true,
		},
		currentCashier: {
			handler() {
				this.updateNavigationItems();
			},
			deep: true,
		},
	},
	computed: {
		appBarColor() {
			return this.isDark ? this.$vuetify.theme.themes.dark.colors.surface : "white";
		},
		offlineStatusState() {
			return {
				pendingInvoices: this.pendingInvoices,
				networkOnline: this.networkOnline,
				serverOnline: this.serverOnline,
				serverConnecting: this.serverConnecting,
				manualOffline: this.manualOffline,
				cacheUsage: this.cacheUsage,
				cacheUsageDetails: this.cacheUsageDetails,
				bootstrapWarningActive: this.bootstrapWarningActive,
				bootstrapWarningTooltip: this.bootstrapWarningTooltip,
				bootstrapCapabilities: this.bootstrapCapabilities,
			};
		},
		drawerFooterAction() {
			return {
				id: "settings",
				text: this.__("Settings"),
				subtitle: this.__("Offline, terminal, and system controls"),
				icon: "mdi-cog-outline",
			};
		},
		settingsSections() {
			const offlineActions = [
				{
					id: "refresh-offline-data",
					label: this.__("Refresh Offline Data"),
					subtitle: this.__("Fetch the latest offline prerequisite updates"),
					icon: "mdi-sync",
					tone: "info",
				},
				{
					id: "rebuild-offline-data",
					label: this.__("Rebuild Offline Data"),
					subtitle: this.__("Recreate local offline prerequisites from scratch"),
					icon: "mdi-refresh-circle",
					tone: "warning",
				},
				{
					id: "clear-cache",
					label: this.__("Clear Cache"),
					subtitle: this.__("Remove cached data and reload the POS app"),
					icon: "mdi-broom",
					tone: "warning",
				},
				{
					id: "open-diagnostics",
					label: this.__("View Data Diagnostics"),
					subtitle: this.__("Inspect cache, sync, and prerequisite status"),
					icon: "mdi-file-search-outline",
					tone: "primary",
				},
			];

			const terminalActions = [];
			if (this.posProfile?.posa_enable_customer_display) {
				terminalActions.push({
					id: "open-customer-display",
					label: this.__("Open Customer Display"),
					subtitle: this.__("Show the active cart on a customer-facing screen"),
					icon: "mdi-monitor-eye",
					tone: "primary",
				});
			}

			const personalActions = [
				{
					id: "manage-cashier-pin",
					label: this.__("Manage Cashier PIN"),
					subtitle: this.currentCashierDisplay || this.__("Create or change your PIN"),
					icon: "mdi-form-textbox-password",
					tone: "secondary",
				},
				{
					id: "toggle-theme",
					label: this.__("Toggle Theme"),
					subtitle: this.__("Switch the POS appearance theme"),
					icon: "mdi-theme-light-dark",
					tone: "secondary",
				},
			];

			const systemActions = [
				{
					id: "show-about",
					label: this.__("About"),
					subtitle: this.__("View app information and current build details"),
					icon: "mdi-information-outline",
					tone: "neutral",
				},
				{
					id: "logout",
					label: this.__("Logout"),
					subtitle: this.__("Sign out of the current POS session"),
					icon: "mdi-logout",
					tone: "danger",
				},
			];

			return [
				{
					id: "offline-sync",
					title: this.__("Offline & Sync"),
					description: this.__("Keep offline prerequisites healthy and recover stale data safely."),
					actions: offlineActions,
				},
				{
					id: "terminal-devices",
					title: this.__("Terminal & Devices"),
					description: this.__("Tools for customer-facing screens and terminal-specific actions."),
					actions: terminalActions,
				},
				{
					id: "personal",
					title: this.__("Personal"),
					description: this.__("Appearance and user-level preferences for the current session."),
					actions: personalActions,
				},
				{
					id: "system-diagnostics",
					title: this.__("System / Diagnostics"),
					description: this.__("Low-frequency maintenance and system details."),
					actions: systemActions,
				},
			].filter((section) => section.actions.length);
		},
	},
	mounted() {
		this.updateNavigationItems();
		this.initializeNavbar();
		this.setupEventListeners();
		this.syncOfflineStatusSurface();
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
			if (this.employeeSwitchHandler) {
				this.eventBus.off("open_employee_switch", this.employeeSwitchHandler);
			}
			if (this.lockPosHandler) {
				this.eventBus.off("lock_pos_screen", this.lockPosHandler);
			}
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
			if (this.posProfile?.posa_use_gift_cards) {
				items.splice(2, 0, {
					text: "Gift Cards",
					icon: "mdi-card-account-details-outline",
					to: "/gift-cards",
				});
			}
			if (this.currentCashier?.is_supervisor) {
				items.splice(1, 0, {
					text: "Awesome Dashboard",
					icon: "mdi-view-dashboard-outline",
					to: "/dashboard",
				});
			}
			if (this.posProfile?.posa_enable_cash_movement) {
				items.push({
					text: "Cash Movement",
					icon: "mdi-cash-sync",
					to: "/cash-movement",
				});
			}
			this.items = items;
		},
		async fetchTerminalEmployees() {
			if (!this.posProfile?.name) {
				this.employeeStore.setTerminalEmployees([]);
				return;
			}

			try {
				const response = await frappe.call({
					method: "posawesome.posawesome.api.employees.get_terminal_employees",
					args: {
						pos_profile: this.posProfile.name,
					},
				});
				this.employeeStore.setTerminalEmployees(response?.message || []);
			} catch (error) {
				console.error("Failed to load terminal employees", error);
				this.employeeStore.setTerminalEmployees([]);
			}
		},
		openEmployeeSwitch() {
			this.employeeStore.openEmployeeSwitch();
		},
		lockPosScreen() {
			this.employeeStore.lockTerminal();
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
				this.employeeSwitchHandler = () => this.openEmployeeSwitch();
				this.lockPosHandler = () => this.lockPosScreen();
				this.eventBus.on("open_employee_switch", this.employeeSwitchHandler);
				this.eventBus.on("lock_pos_screen", this.lockPosHandler);
			}
		},
		handleNavClick() {
			this.drawer = !this.drawer;
			this.$emit("nav-click");
		},
		openSettingsPanel() {
			this.drawer = false;
			this.closeOfflineStatusPanel();
			this.refreshCacheUsage();
			this.settingsPanelOpen = true;
		},
		closeSettingsPanel() {
			this.settingsPanelOpen = false;
		},
		goDesk() {
			window.location.href = "/app";
		},

		openCloseShift() {
			this.$emit("close-shift");
		},
		toggleOfflineStatusPanel() {
			const nextOpen = !this.offlinePanelOpen;
			this.offlineSyncStore.setPanelOpen(nextOpen);
			if (nextOpen) {
				this.refreshCacheUsage();
			}
		},
		closeOfflineStatusPanel() {
			this.offlineSyncStore.setPanelOpen(false);
		},
		syncPendingInvoices() {
			this.$emit("sync-invoices");
		},
		toggleManualOffline() {
			this.$emit("toggle-offline");
		},
		toggleManualOfflineFromPanel() {
			this.closeOfflineStatusPanel();
			this.toggleManualOffline();
		},
		handleRefreshOfflineDataAction() {
			this.closeOfflineStatusPanel();
			this.refreshCacheUsage();
			this.$emit("refresh-offline-data");
		},
		handleRebuildOfflineDataAction() {
			this.closeOfflineStatusPanel();
			this.$emit("rebuild-offline-data");
		},
		handleClearCacheAction() {
			this.closeOfflineStatusPanel();
			this.refreshCacheUsage();
			return this.clearCache();
		},
		handleOpenOfflineDiagnosticsAction() {
			this.closeOfflineStatusPanel();
			this.refreshCacheUsage();
			this.$emit("open-offline-diagnostics");
		},
		handleSettingsPanelAction(actionId) {
			switch (actionId) {
				case "refresh-offline-data":
					this.closeSettingsPanel();
					this.refreshCacheUsage();
					this.$emit("refresh-offline-data");
					break;
				case "rebuild-offline-data":
					this.closeSettingsPanel();
					this.$emit("rebuild-offline-data");
					break;
				case "clear-cache":
					this.closeSettingsPanel();
					this.refreshCacheUsage();
					void this.clearCache();
					break;
				case "open-diagnostics":
					this.closeSettingsPanel();
					this.refreshCacheUsage();
					this.$emit("open-offline-diagnostics");
					break;
				case "open-customer-display":
					this.closeSettingsPanel();
					this.$emit("open-customer-display");
					break;
				case "toggle-theme":
					this.closeSettingsPanel();
					this.toggleTheme();
					break;
				case "show-about":
					this.closeSettingsPanel();
					this.showAboutDialog = true;
					break;
				case "logout":
					this.closeSettingsPanel();
					this.logOut();
					break;
				default:
					break;
			}
		},
		parseBootstrapWarningLines() {
			return String(this.bootstrapWarningTooltip || "")
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean);
		},
		syncOfflineStatusSurface() {
			this.offlineSyncStore.setSummary({
				networkOnline: Boolean(this.networkOnline),
				serverOnline: Boolean(this.serverOnline),
				serverConnecting: Boolean(this.serverConnecting),
				manualOffline: Boolean(this.manualOffline),
				pendingInvoices: Number(this.pendingInvoices || 0),
				cacheUsage: Number(this.cacheUsage || 0),
				cacheUsageDetails: this.cacheUsageDetails || {
					total: 0,
					indexedDB: 0,
					localStorage: 0,
				},
			});

			const warningLines = this.parseBootstrapWarningLines();
			const warningTitle =
				warningLines[0] ||
				(this.bootstrapWarningActive
					? this.__("POS is running with limited offline prerequisites.")
					: "");
			const warningMessages = warningTitle ? warningLines.slice(1) : warningLines;
			this.offlineSyncStore.setBootstrapWarning({
				active: Boolean(this.bootstrapWarningActive),
				title: warningTitle,
				messages: warningMessages,
			});
			this.offlineSyncStore.setCapabilitySummaries(
				Array.isArray(this.bootstrapCapabilities)
					? this.bootstrapCapabilities
					: [],
			);

			const shouldInjectFallback =
				this.offlineSyncStore.resourceStates.length === 0;
			if (shouldInjectFallback) {
				if (this.bootstrapWarningActive) {
					this.offlineSyncStore.setResourceStates([
						{
							resourceId: "bootstrap_config",
							status: "limited",
							lastSyncedAt: null,
							watermark: null,
							lastSuccessHash: null,
							lastError: warningMessages.join(" "),
							consecutiveFailures: 0,
							scopeSignature: this.posProfile?.name ? `profile:${this.posProfile.name}` : null,
							schemaVersion: null,
						},
					]);
				} else {
					this.offlineSyncStore.setResourceStates([]);
				}
			}
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
				await clearAllCaches({ confirmBeforeClear: false });
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
		__(text, args = []) {
			if (window.__) {
				const nextArgs = Array.isArray(args) ? args : [args];
				return window.__(text, ...nextArgs);
			}
			return text;
		},
	},
	emits: [
		"nav-click",
		"change-page",
		"close-shift",
		"sync-invoices",
		"retry-status",
		"open-customer-display",
		"toggle-offline",
		"refresh-offline-data",
		"rebuild-offline-data",
		"open-offline-diagnostics",
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

.status-entry-surface {
	position: relative;
	display: flex;
	align-items: center;
}
</style>
