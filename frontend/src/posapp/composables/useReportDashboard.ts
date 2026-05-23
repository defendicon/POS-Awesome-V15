import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useUIStore } from "@/posapp/stores/uiStore";
import { useEmployeeStore } from "@/posapp/stores/employeeStore";
import { createReportFormatters } from "@/posapp/composables/useReportFormatters";
import {
	createEmptyDashboard,
	mergeDashboardPayload,
} from "@/posapp/composables/useReportDashboardPayload";
import {
	createDashboardTabItems,
	type DashboardTab,
} from "@/posapp/composables/useReportDashboardTabs";
import {
	fetchDashboardData,
	type DashboardResponse,
} from "@/posapp/services/dashboardService";

const DASHBOARD_LOG_PREFIX = "[AwesomeDashboard]";

export function useReportDashboard() {
	const uiStore = useUIStore();
	const employeeStore = useEmployeeStore();

	const loading = ref(false);
	const errorMessage = ref("");
	const isDashboardEnabledOnServer = ref(true);
	const lastUpdatedAt = ref<Date | null>(null);
	const allowAllProfiles = ref(false);
	const activeDashboardTab = ref<DashboardTab>("sales");
	const dashboardScope = ref<"all" | "current" | "specific">("all");
	const selectedProfileFilter = ref("");
	const initialNow = new Date();
	const currentMonthToken = `${initialNow.getFullYear()}-${String(initialNow.getMonth() + 1).padStart(2, "0")}`;
	const selectedReportMonth = ref(currentMonthToken);
	const scopeInitialized = ref(false);
	const fastMovingPage = ref(1);
	const fastMovingPageSize = ref(10);
	const fastMovingSearch = ref("");
	const fastMovingSearchInput = ref("");
	const lowStockSearch = ref("");
	const lowStockWarehouseFilter = ref("");
	const supplierSearch = ref("");
	const itemSalesLimit = ref(20);
	const categoryReportLimit = ref(12);
	const inventoryStatusLimit = ref(20);
	const stockMovementLimit = ref(20);
	const reorderSuggestionLimit = ref(25);
	const paymentReportLimit = ref(20);
	const discountReportLimit = ref(20);
	const customerReportLimit = ref(20);
	const staffReportLimit = ref(20);
	const profitabilityReportLimit = ref(20);
	const branchReportLimit = ref(20);
	const taxReportLimit = ref(20);
	let fastMovingSearchDebounce: ReturnType<typeof setTimeout> | null = null;

	const dashboardData = ref<DashboardResponse>(createEmptyDashboard());

	const __ = (value: string) => (window.__ ? window.__(value) : value);
	const dashboardTabItems = computed(() => createDashboardTabItems(__));

	const posProfile = computed(() => uiStore.posProfile || {});
	const profileName = computed(() => String((posProfile.value as any)?.name || "").trim());
	const currency = computed(
		() => dashboardData.value.currency || (posProfile.value as any)?.currency || "",
	);

	const configuredLowStockThreshold = computed(() => {
		const rawValue = Number((posProfile.value as any)?.posa_low_stock_alert_threshold);
		return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : undefined;
	});

	const availableProfiles = computed(() => dashboardData.value.available_profiles || []);
	const enabledProfiles = computed(() =>
		availableProfiles.value.filter((profile) => profile.dashboard_enabled !== false),
	);
	const isPosSupervisor = computed(() => Boolean(employeeStore.currentCashier?.is_supervisor));

	const dashboardScopeItems = computed(() => {
		const items = [
			{ label: __("All Profiles"), value: "all" as const },
			{ label: __("Current Profile"), value: "current" as const },
			{ label: __("Specific Profile"), value: "specific" as const },
		];
		return allowAllProfiles.value ? items : items.filter((item) => item.value === "current");
	});

	const profileFilterItems = computed(() =>
		enabledProfiles.value.map((profile) => ({
			label: profile.name,
			value: profile.name,
		})),
	);

	const canRenderDashboard = computed(
		() => isPosSupervisor.value && isDashboardEnabledOnServer.value,
	);
	const disabledReasonText = computed(() => {
		if (!isPosSupervisor.value) {
			return __("Awesome Dashboard is visible only to POS supervisors.");
		}
		const reason = dashboardData.value.disabled_reason;
		if (reason === "profile_disabled") {
			return __("Awesome Dashboard is disabled for the selected POS Profile.");
		}
		if (reason === "no_profiles_in_scope") {
			return __("No profiles found for selected scope. Falling back to current profile failed.");
		}
		return __("Awesome Dashboard is unavailable for the selected scope.");
	});
	const selectedProfilesCount = computed(() =>
		Number(dashboardData.value.selected_profiles?.length || 0),
	);
	const scopeDisplayLabel = computed(() => {
		const current = dashboardData.value.scope || dashboardScope.value;
		if (current === "specific") {
			return __("Scope: Specific Profile");
		}
		if (current === "current") {
			return __("Scope: Current Profile");
		}
		return __("Scope: All Profiles");
	});
	const profitMethodLabel = computed(() =>
		dashboardData.value.sales_overview.profit_method === "stock_ledger"
			? __("Profit: Stock Ledger (COGS)")
			: __("Profit: Invoice Item Estimate"),
	);
	const profitMethodColor = computed(() =>
		dashboardData.value.sales_overview.profit_method === "stock_ledger" ? "success" : "warning",
	);

	const lastUpdatedLabel = computed(() => {
		if (!lastUpdatedAt.value) {
			return "";
		}
		return `${__("Updated")}: ${lastUpdatedAt.value.toLocaleTimeString()}`;
	});

	const formatters = createReportFormatters({
		getCurrency: () => currency.value,
		translate: __,
	});

	function logDashboardRequest() {
		console.groupCollapsed(`${DASHBOARD_LOG_PREFIX} fetch:start`);
		console.info("scope", dashboardScope.value);
		console.info("profile_filter", selectedProfileFilter.value || null);
		console.info("report_month", selectedReportMonth.value || null);
		console.info("pos_profile", profileName.value || null);
		console.info("threshold_override", configuredLowStockThreshold.value ?? null);
		console.info("fast_moving_page", fastMovingPage.value);
		console.info("fast_moving_page_size", fastMovingPageSize.value);
		console.info("fast_moving_search", fastMovingSearch.value || null);
		console.groupEnd();
	}

	function logDashboardResponse(response: DashboardResponse) {
		console.groupCollapsed(`${DASHBOARD_LOG_PREFIX} fetch:success`);
		console.info("enabled", response.enabled);
		console.info("disabled_reason", response.disabled_reason || null);
		console.info("global_enabled", response.global_enabled ?? null);
		console.info("scope", response.scope || null);
		console.info("allow_all_profiles", response.allow_all_profiles ?? null);
		console.info("selected_profiles", response.selected_profiles || []);
		console.info("available_profiles_count", response.available_profiles?.length || 0);
		console.info("profit_method", response.sales_overview?.profit_method || null);
		console.info("payment_method_count", response.payment_method_report?.method_wise?.length || 0);
		console.info("discount_cashier_count", response.discount_void_return_report?.cashier_wise?.length || 0);
		console.info("customer_top_count", response.customer_report?.top_customers?.length || 0);
		console.info("staff_cashier_count", response.staff_performance_report?.cashier_wise?.length || 0);
		console.info("profit_item_count", response.profitability_report?.item_wise?.length || 0);
		console.info("branch_count", response.branch_location_report?.location_wise?.length || 0);
		console.info("tax_head_count", response.tax_charges_report?.tax_heads?.length || 0);
		console.info("item_sales_count", response.item_sales_report?.items?.length || 0);
		console.info("category_report_count", response.category_brand_variant_report?.category_wise?.length || 0);
		console.info("inventory_status_total_items", response.inventory_status_report?.summary?.total_items || 0);
		console.info("stock_movement_count", response.stock_movement_report?.summary?.movement_count || 0);
		console.info(
			"reorder_suggestion_count",
			response.reorder_purchase_suggestions?.summary?.suggestion_count || 0,
		);
		console.info("fast_moving_pagination", response.inventory_insights?.fast_moving_pagination || null);
		console.groupEnd();
	}

	function logDashboardError(error: unknown) {
		console.groupCollapsed(`${DASHBOARD_LOG_PREFIX} fetch:error`);
		console.error(error);
		console.groupEnd();
	}

	function resetDashboardState() {
		dashboardData.value = createEmptyDashboard();
		errorMessage.value = "";
		isDashboardEnabledOnServer.value = true;
		lastUpdatedAt.value = null;
	}

	async function loadDashboard() {
		if (!isPosSupervisor.value) {
			resetDashboardState();
			return;
		}

		loading.value = true;
		errorMessage.value = "";
		logDashboardRequest();

		try {
			const response = await fetchDashboardData({
				pos_profile: profileName.value || undefined,
				scope: dashboardScope.value,
				profile_filter:
					dashboardScope.value === "specific" ? selectedProfileFilter.value || undefined : undefined,
				report_month: selectedReportMonth.value || undefined,
				low_stock_threshold: configuredLowStockThreshold.value,
				item_sales_limit: itemSalesLimit.value,
				category_report_limit: categoryReportLimit.value,
				inventory_status_limit: inventoryStatusLimit.value,
				stock_movement_limit: stockMovementLimit.value,
				reorder_suggestion_limit: reorderSuggestionLimit.value,
				payment_report_limit: paymentReportLimit.value,
				discount_report_limit: discountReportLimit.value,
				customer_report_limit: customerReportLimit.value,
				staff_report_limit: staffReportLimit.value,
				profitability_report_limit: profitabilityReportLimit.value,
				branch_report_limit: branchReportLimit.value,
				tax_report_limit: taxReportLimit.value,
				fast_moving_page: fastMovingPage.value,
				fast_moving_page_size: fastMovingPageSize.value,
				fast_moving_search: fastMovingSearch.value || undefined,
			});
			logDashboardResponse(response);
			dashboardData.value = mergeDashboardPayload(response);
			if (response.date_context?.report_month) {
				selectedReportMonth.value = String(response.date_context.report_month);
			}
			isDashboardEnabledOnServer.value = response.enabled !== false;
			allowAllProfiles.value = Boolean(response.allow_all_profiles);
			if (!scopeInitialized.value) {
				const defaultScope = (response.default_scope || dashboardScope.value) as
					| "all"
					| "current"
					| "specific";
				dashboardScope.value = defaultScope;
				scopeInitialized.value = true;
			}
			if (!allowAllProfiles.value && dashboardScope.value !== "current") {
				dashboardScope.value = "current";
			}
			if (dashboardScope.value === "specific" && !selectedProfileFilter.value) {
				const firstProfile = profileFilterItems.value[0]?.value || "";
				selectedProfileFilter.value = firstProfile;
			}
			lastUpdatedAt.value = new Date();
		} catch (error: any) {
			logDashboardError(error);
			errorMessage.value = error?.message || __("Failed to load dashboard data.");
		} finally {
			loading.value = false;
		}
	}

	watch(
		() => isPosSupervisor.value,
		(isSupervisor) => {
			if (!isSupervisor) {
				resetDashboardState();
				return;
			}
			void loadDashboard();
		},
		{ immediate: true },
	);

	watch(
		() => profileName.value,
		(newProfile, oldProfile) => {
			if (!newProfile || newProfile === oldProfile) {
				return;
			}
			void loadDashboard();
		},
	);

	watch(
		() => dashboardScope.value,
		(scope) => {
			if (scope !== "specific") {
				selectedProfileFilter.value = "";
			} else if (!selectedProfileFilter.value) {
				selectedProfileFilter.value = profileFilterItems.value[0]?.value || "";
			}
			void loadDashboard();
		},
	);

	watch(
		() => selectedProfileFilter.value,
		(newValue, oldValue) => {
			if (dashboardScope.value !== "specific") {
				return;
			}
			if (newValue === oldValue) {
				return;
			}
			void loadDashboard();
		},
	);

	watch(
		() => selectedReportMonth.value,
		(newMonth, oldMonth) => {
			if (newMonth === oldMonth) {
				return;
			}
			if (fastMovingPage.value !== 1) {
				fastMovingPage.value = 1;
				return;
			}
			void loadDashboard();
		},
	);

	watch(
		() => fastMovingPage.value,
		(newPage, oldPage) => {
			if (newPage === oldPage) {
				return;
			}
			void loadDashboard();
		},
	);

	watch(
		() => fastMovingPageSize.value,
		(newSize, oldSize) => {
			if (newSize === oldSize) {
				return;
			}
			if (fastMovingPage.value !== 1) {
				fastMovingPage.value = 1;
				return;
			}
			void loadDashboard();
		},
	);

	watch(
		() => fastMovingSearch.value,
		(newSearch, oldSearch) => {
			if (newSearch === oldSearch) {
				return;
			}
			if (fastMovingPage.value !== 1) {
				fastMovingPage.value = 1;
				return;
			}
			void loadDashboard();
		},
	);

	watch(
		() => fastMovingSearchInput.value,
		(newSearch, oldSearch) => {
			if (newSearch === oldSearch) {
				return;
			}
			if (fastMovingSearchDebounce) {
				clearTimeout(fastMovingSearchDebounce);
			}
			fastMovingSearchDebounce = setTimeout(() => {
				fastMovingSearch.value = String(newSearch || "").trim();
			}, 320);
		},
	);

	onBeforeUnmount(() => {
		if (fastMovingSearchDebounce) {
			clearTimeout(fastMovingSearchDebounce);
			fastMovingSearchDebounce = null;
		}
	});

	onMounted(() => {
		if (!isPosSupervisor.value) {
			resetDashboardState();
			return;
		}
		void loadDashboard();
	});

	return {
		__,
		loading,
		errorMessage,
		isDashboardEnabledOnServer,
		lastUpdatedAt,
		allowAllProfiles,
		activeDashboardTab,
		dashboardScope,
		selectedProfileFilter,
		currentMonthToken,
		selectedReportMonth,
		fastMovingPage,
		fastMovingPageSize,
		fastMovingSearch,
		fastMovingSearchInput,
		lowStockSearch,
		lowStockWarehouseFilter,
		supplierSearch,
		itemSalesLimit,
		categoryReportLimit,
		inventoryStatusLimit,
		stockMovementLimit,
		reorderSuggestionLimit,
		paymentReportLimit,
		discountReportLimit,
		customerReportLimit,
		staffReportLimit,
		profitabilityReportLimit,
		branchReportLimit,
		taxReportLimit,
		dashboardData,
		dashboardTabItems,
		isPosSupervisor,
		dashboardScopeItems,
		profileFilterItems,
		canRenderDashboard,
		disabledReasonText,
		selectedProfilesCount,
		scopeDisplayLabel,
		profitMethodLabel,
		profitMethodColor,
		lastUpdatedLabel,
		loadDashboard,
		resetDashboardState,
		...formatters,
	};
}
