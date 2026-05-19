<template>
	<div class="awesome-dashboard-view">
		<v-container fluid class="dashboard-shell pa-3 pa-sm-4">
			<DashboardHeader
				v-model:dashboard-scope="dashboardScope"
				v-model:selected-profile-filter="selectedProfileFilter"
				v-model:selected-report-month="selectedReportMonth"
				:scope-display-label="scopeDisplayLabel"
				:selected-profiles-count="selectedProfilesCount"
				:profit-method-label="profitMethodLabel"
				:profit-method-color="profitMethodColor"
				:dashboard-scope-items="dashboardScopeItems"
				:profile-filter-items="profileFilterItems"
				:current-month-token="currentMonthToken"
				:last-updated-label="lastUpdatedLabel"
				:is-pos-supervisor="isPosSupervisor"
				:loading="loading"
				@refresh="loadDashboard"
			/>

			<v-alert
				v-if="!isPosSupervisor || !isDashboardEnabledOnServer"
				type="warning"
				variant="tonal"
				class="mb-4"
			>
				{{ disabledReasonText }}
			</v-alert>

			<v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-4">
				{{ errorMessage }}
			</v-alert>

			<template v-if="canRenderDashboard">
				<DashboardTabs v-model:active-tab="activeDashboardTab" :tabs="dashboardTabItems" />

				<template v-if="activeDashboardTab === 'sales'">
					<SalesOverviewCards :metrics="salesMetrics" :format-money="formatMoney" />

					<SalesSummarySection
						:title="__('Monthly Sales Summary')"
						:range-label-prefix="__('Month')"
						:range-label="monthlySummaryRangeLabel"
						:has-closing-snapshot="Boolean(monthlySummary.has_closing_snapshot)"
						:closing-snapshot-label="__('Closing Snapshot Available')"
						:live-snapshot-label="__('Live Snapshot')"
						:metrics="monthlySummaryMetrics"
						:payment-methods="monthlyPaymentMethods"
						:format-money="formatMoney"
						:payment-category-color="paymentCategoryColor"
					/>

					<SalesSummarySection
						:title="__('Daily Sales Summary')"
						:range-label-prefix="__('Date')"
						:range-label="dailySummaryRangeLabel"
						:has-closing-snapshot="Boolean(dailySummary.has_closing_snapshot)"
						:closing-snapshot-label="__('Shift Closed Snapshot')"
						:live-snapshot-label="__('Live Snapshot')"
						:metrics="dailySummaryMetrics"
						:payment-methods="dailyPaymentMethods"
						:format-money="formatMoney"
						:payment-category-color="paymentCategoryColor"
					/>

					<SalesTrendSection
						:range-label="salesTrendRangeLabel"
						:best-day-label="bestDayLabel"
						:best-hour-label="bestHourLabel"
						:growth-chips="trendGrowthChips"
						:day-points="salesTrendDayPoints"
						:week-points="salesTrendWeekPoints"
						:month-points="salesTrendMonthPoints"
						:hour-points="salesTrendHourPoints"
						:day-max="salesTrendDayMax"
						:week-max="salesTrendWeekMax"
						:month-max="salesTrendMonthMax"
						:hour-max="salesTrendHourMax"
						:format-money="formatMoney"
						:format-quantity="formatQuantity"
						:format-date="formatDate"
						:trend-progress="trendProgress"
					/>

					<DiscountVoidReturnSection
						:range-label="discountVoidReturnRangeLabel"
						:totals="discountVoidReturnTotals"
						:cashier-rows="discountCashierRows"
						:top-return-items="discountTopReturnItems"
						:day-rows="discountDayRows"
						:cashier-max="discountCashierMax"
						:return-item-max="discountReturnItemMax"
						:day-max="discountDayMax"
						:format-money="formatMoney"
						:format-quantity="formatQuantity"
						:format-date="formatDate"
						:trend-progress="trendProgress"
					/>
				</template>

				<PaymentBreakdownSection
					v-if="activeDashboardTab === 'sales'"
					:range-label="paymentReportRangeLabel"
					:totals="paymentReportTotals"
					:method-rows="paymentMethodRows"
					:day-rows="paymentDayRows"
					:day-max="paymentDayMax"
					:format-money="formatMoney"
					:format-quantity="formatQuantity"
					:format-date="formatDate"
					:format-percent="formatPercent"
					:trend-progress="trendProgress"
				/>

				<StaffPerformanceSection
					v-if="activeDashboardTab === 'staff'"
					:range-label="staffReportRangeLabel"
					:summary="staffSummary"
					:cashier-rows="staffCashierRows"
					:invoice-rows="staffInvoiceRows"
					:risk-rows="staffRiskRows"
					:sales-max="staffSalesMax"
					:format-money="formatMoney"
					:format-quantity="formatQuantity"
					:trend-progress="trendProgress"
				/>

				<CustomerReportSection
					v-if="activeDashboardTab === 'customers'"
					:range-label="customerReportRangeLabel"
					:summary="customerSummary"
					:top-rows="topCustomerRows"
					:repeat-rows="repeatCustomerRows"
					:recent-rows="recentCustomerRows"
					:sales-max="customerSalesMax"
					:format-money="formatMoney"
					:format-quantity="formatQuantity"
					:format-date="formatDate"
					:format-percent="formatPercent"
					:format-days="formatDays"
					:trend-progress="trendProgress"
				/>

				<FinanceSection
					v-if="activeDashboardTab === 'finance'"
					:profitability-range-label="profitabilityRangeLabel"
					:top-profit-item-label="topProfitItemLabel"
					:lowest-margin-item-label="lowestMarginItemLabel"
					:profitability-summary="profitabilitySummary"
					:profitability-item-rows="profitabilityItemRows"
					:profitability-category-rows="profitabilityCategoryRows"
					:profitability-day-rows="profitabilityDayRows"
					:profitability-item-max="profitabilityItemMax"
					:profitability-day-max="profitabilityDayMax"
					:tax-charges-range-label="taxChargesRangeLabel"
					:top-tax-head-label="topTaxHeadLabel"
					:top-charge-head-label="topChargeHeadLabel"
					:tax-charges-totals="taxChargesTotals"
					:tax-head-rows="taxHeadRows"
					:charge-head-rows="chargeHeadRows"
					:tax-charges-day-rows="taxChargesDayRows"
					:tax-day-max="taxDayMax"
					:format-money="formatMoney"
					:format-quantity="formatQuantity"
					:format-date="formatDate"
					:format-percent="formatPercent"
					:trend-progress="trendProgress"
				/>

				<BranchLocationSection
					v-if="activeDashboardTab === 'branches'"
					:range-label="branchReportRangeLabel"
					:summary="branchSummary"
					:location-rows="branchRows"
					:top-items-by-location="branchTopItemsByLocation"
					:sales-max="branchSalesMax"
					:format-money="formatMoney"
					:format-quantity="formatQuantity"
					:trend-progress="trendProgress"
				/>

				<ProductInsightsSection
					v-show="activeDashboardTab === 'products'"
					:item-sales-range-label="itemSalesRangeLabel"
					:item-sales-best-seller-label="itemSalesBestSellerLabel"
					:item-sales-top-margin-label="itemSalesTopMarginLabel"
					:item-sales-top-discount-label="itemSalesTopDiscountLabel"
					:item-sales-items="itemSalesItems"
					:item-sales-max-sales="itemSalesMaxSales"
					:category-variant-range-label="categoryVariantRangeLabel"
					:top-category-label="topCategoryLabel"
					:top-brand-label="topBrandLabel"
					:top-variant-label="topVariantLabel"
					:category-sales-points="categorySalesPoints"
					:brand-sales-points="brandSalesPoints"
					:variant-sales-points="variantSalesPoints"
					:attribute-sales-points="attributeSalesPoints"
					:category-sales-max="categorySalesMax"
					:brand-sales-max="brandSalesMax"
					:variant-sales-max="variantSalesMax"
					:attribute-sales-max="attributeSalesMax"
					:format-money="formatMoney"
					:format-quantity="formatQuantity"
					:format-percent="formatPercent"
					:trend-progress="trendProgress"
				/>

				<InventoryStatusSection
					v-show="activeDashboardTab === 'inventory'"
					:range-label="inventoryStatusRangeLabel"
					:threshold="inventoryStatusReport.threshold || lowStockThreshold"
					:summary="inventoryStatusSummary"
					:low-stock-items="inventoryStatusLowStockItems"
					:out-of-stock-items="inventoryStatusOutOfStockItems"
					:negative-items="inventoryStatusNegativeItems"
					:slow-moving-items="inventoryStatusSlowMovingItems"
					:dead-stock-items="inventoryStatusDeadStockItems"
					:low-max="inventoryStatusLowMax"
					:negative-max="inventoryStatusNegativeMax"
					:slow-max="inventoryStatusSlowMax"
					:dead-max="inventoryStatusDeadMax"
					:format-quantity="formatQuantity"
					:format-days="formatDays"
					:trend-progress="trendProgress"
				/>

				<StockMovementSection
					v-show="activeDashboardTab === 'inventory'"
					:range-label="stockMovementRangeLabel"
					:summary="stockMovementSummary"
					:incoming-qty="stockMovementIncomingQty"
					:outgoing-qty="stockMovementOutgoingQty"
					:day-rows="stockMovementDaySimple"
					:recent-rows="stockMovementRecent"
					:day-max="stockMovementDayMax"
					:format-money="formatMoney"
					:format-quantity="formatQuantity"
					:format-signed-quantity="formatSignedQuantity"
					:format-date="formatDate"
					:format-movement-category="formatMovementCategory"
					:trend-progress="trendProgress"
				/>

				<InventoryInsightsSection
					v-show="activeDashboardTab === 'inventory'"
					v-model:fast-moving-search-input="fastMovingSearchInput"
					v-model:fast-moving-page-size="fastMovingPageSize"
					v-model:fast-moving-page="fastMovingPage"
					v-model:low-stock-search="lowStockSearch"
					v-model:low-stock-warehouse-filter="lowStockWarehouseFilter"
					:loading="loading"
					:fast-moving-range-label="fastMovingRangeLabel"
					:fast-moving-total-count="fastMovingTotalCount"
					:fast-moving-page-size-items="fastMovingPageSizeItems"
					:fast-moving-items="fastMovingItems"
					:fast-moving-total-pages="fastMovingTotalPages"
					:low-stock-threshold="lowStockThreshold"
					:low-stock-warehouse-items="lowStockWarehouseItems"
					:low-stock-items="filteredLowStockItems"
					:format-quantity="formatQuantity"
					:progress-from-quantity="progressFromQuantity"
					:stock-chip-color="stockChipColor"
				/>

				<ReorderSuggestionsSection
					v-show="activeDashboardTab === 'procurement'"
					:range-label="reorderRangeLabel"
					:summary="reorderSummary"
					:suggestions="reorderSuggestions"
					:format-money="formatMoney"
					:format-quantity="formatQuantity"
					:format-days="formatDays"
					:urgency-label="urgencyLabel"
					:urgency-color="urgencyColor"
				/>

				<SupplierPurchaseSection
					v-show="activeDashboardTab === 'procurement'"
					v-model:supplier-search="supplierSearch"
					:loading="loading"
					:range-label="monthRangeLabel"
					:top-supplier-label="topSupplierLabel"
					:top-pending-supplier-label="topPendingSupplierLabel"
					:summary="supplierOverviewSummary"
					:supplier-rows="filteredSupplierSummary"
					:risk-rows="filteredSupplierRiskRows"
					:day-rows="supplierDayRows"
					:purchase-max="supplierPurchaseMax"
					:pending-max="supplierPendingMax"
					:day-max="supplierDayMax"
					:format-money="formatMoney"
					:format-quantity="formatQuantity"
					:format-percent="formatPercent"
					:format-date="formatDate"
					:trend-progress="trendProgress"
				/>
			</template>
		</v-container>
	</div>
</template>

<script setup lang="ts">
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
	latestRows,
	limitRows,
	positiveCombinedMax,
	positiveMax,
	reportRangeLabel,
	salesTrendRangeLabel as salesTrendPeriodLabel,
	sortByMagnitudeDesc,
	sortByNumberDesc,
	sortByStringAsc,
} from "@/posapp/composables/useReportDerivations";
import {
	type BranchLocationRow,
	type BranchTopItemsByLocationRow,
	fetchDashboardData,
	type CategoryBrandVariantRow,
	type CustomerReportRow,
	type DiscountVoidReturnCashierRow,
	type DiscountVoidReturnDayRow,
	type DiscountVoidReturnItemRow,
	type DashboardResponse,
	type SalesSummaryPayload,
	type FastMovingItem,
	type InventoryStatusRow,
	type ItemSalesRow,
	type PaymentDaySummaryRow,
	type PaymentMethodSummaryRow,
	type ReorderSuggestionRow,
	type ProfitabilityCategoryRow,
	type ProfitabilityDayRow,
	type ProfitabilityItemRow,
	type StaffPerformanceRow,
	type StockMovementDayRow,
	type StockMovementRecentRow,
	type TaxChargeHeadRow,
	type TaxChargesDayRow,
	type LowStockItem,
	type SupplierDayRow,
	type SupplierOverviewSummary,
	type SupplierSummaryRow,
} from "@/posapp/services/dashboardService";
import BranchLocationSection from "./components/BranchLocationSection.vue";
import CustomerReportSection from "./components/CustomerReportSection.vue";
import DiscountVoidReturnSection from "./components/DiscountVoidReturnSection.vue";
import DashboardHeader from "./components/DashboardHeader.vue";
import DashboardTabs from "./components/DashboardTabs.vue";
import FinanceSection from "./components/FinanceSection.vue";
import InventoryInsightsSection from "./components/InventoryInsightsSection.vue";
import InventoryStatusSection from "./components/InventoryStatusSection.vue";
import PaymentBreakdownSection from "./components/PaymentBreakdownSection.vue";
import ProductInsightsSection from "./components/ProductInsightsSection.vue";
import ReorderSuggestionsSection from "./components/ReorderSuggestionsSection.vue";
import SalesOverviewCards from "./components/SalesOverviewCards.vue";
import SalesSummarySection from "./components/SalesSummarySection.vue";
import SalesTrendSection from "./components/SalesTrendSection.vue";
import StaffPerformanceSection from "./components/StaffPerformanceSection.vue";
import StockMovementSection from "./components/StockMovementSection.vue";
import SupplierPurchaseSection from "./components/SupplierPurchaseSection.vue";
import "./components/reports.css";

defineOptions({
	name: "Reports",
});

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
const DASHBOARD_LOG_PREFIX = "[AwesomeDashboard]";
const dashboardTabItems = computed(() => createDashboardTabItems(__));

const posProfile = computed(() => uiStore.posProfile || {});
const profileName = computed(() => String((posProfile.value as any)?.name || "").trim());
const currency = computed(() => dashboardData.value.currency || (posProfile.value as any)?.currency || "");

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

const canRenderDashboard = computed(() => isPosSupervisor.value && isDashboardEnabledOnServer.value);
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
const selectedProfilesCount = computed(() => Number(dashboardData.value.selected_profiles?.length || 0));
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

const salesMetrics = computed(() => [
	{
		key: "today_sales",
		label: __("Today Sales"),
		icon: "mdi-cart-outline",
		value: Number(dashboardData.value.sales_overview.today_sales || 0),
		styleClass: "metric-card--sales",
	},
	{
		key: "today_profit",
		label: __("Today Profit"),
		icon: "mdi-cash-plus",
		value: Number(dashboardData.value.sales_overview.today_profit || 0),
		styleClass: "metric-card--profit",
	},
	{
		key: "monthly_sales",
		label: __("Monthly Sales"),
		icon: "mdi-calendar-month-outline",
		value: Number(dashboardData.value.sales_overview.monthly_sales || 0),
		styleClass: "metric-card--sales",
	},
	{
		key: "monthly_profit",
		label: __("Monthly Profit"),
		icon: "mdi-finance",
		value: Number(dashboardData.value.sales_overview.monthly_profit || 0),
		styleClass: "metric-card--profit",
	},
]);

const dailySummary = computed<SalesSummaryPayload>(() => dashboardData.value.daily_sales_summary || {});
const monthlySummary = computed<SalesSummaryPayload>(() => dashboardData.value.monthly_sales_summary || {});

function summaryRangeLabel(summary: SalesSummaryPayload, fallbackLabel: string) {
	const from = summary.period?.from;
	const to = summary.period?.to;
	if (!from || !to) {
		return fallbackLabel;
	}
	if (from === to) {
		return formatDate(from);
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
}

function summaryPaymentMethods(summary: SalesSummaryPayload) {
	return (summary.payment_methods || [])
		.filter((row) => Math.abs(Number(row.amount || 0)) > 0.00001)
		.sort((a, b) => Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0)));
}

function summaryMetrics(summary: SalesSummaryPayload) {
	const variance = Number(summary.cash_variance || 0);
	return [
		{
			key: "invoice_count",
			label: __("Invoices"),
			value: formatQuantity(Number(summary.invoice_count || 0)),
			valueClass: "",
		},
		{
			key: "avg_invoice",
			label: __("Average Bill"),
			value: formatMoney(Number(summary.average_invoice_value || 0)),
			valueClass: "",
		},
		{
			key: "opening_cash",
			label: __("Opening Cash"),
			value: formatMoney(Number(summary.opening_cash || 0)),
			valueClass: "",
		},
		{
			key: "gross_sales",
			label: __("Gross Sales"),
			value: formatMoney(Number(summary.gross_sales || 0)),
			valueClass: "",
		},
		{
			key: "returns_amount",
			label: __("Returns"),
			value: formatMoney(Number(summary.returns_amount || 0)),
			valueClass: "",
		},
		{
			key: "discount_amount",
			label: __("Discounts"),
			value: formatMoney(Number(summary.discount_amount || 0)),
			valueClass: "",
		},
		{
			key: "tax_amount",
			label: __("Tax"),
			value: formatMoney(Number(summary.tax_amount || 0)),
			valueClass: "",
		},
		{
			key: "net_sales",
			label: __("Net Sales"),
			value: formatMoney(Number(summary.net_sales || 0)),
			valueClass: "",
		},
		{
			key: "cash_collections",
			label: __("Cash Collections"),
			value: formatMoney(Number(summary.cash_collections || 0)),
			valueClass: "",
		},
		{
			key: "card_online_collections",
			label: __("Card / Online"),
			value: formatMoney(Number(summary.card_online_collections || 0)),
			valueClass: "",
		},
		{
			key: "expected_cash",
			label: __("Expected Cash"),
			value: formatMoney(Number(summary.expected_cash || 0)),
			valueClass: "",
		},
		{
			key: "actual_cash",
			label: __("Cash In Hand"),
			value: formatMoney(Number(summary.actual_cash || 0)),
			valueClass: "",
		},
		{
			key: "cash_variance",
			label: __("Expected vs Actual"),
			value: formatMoney(variance),
			valueClass:
				variance > 0
					? "summary-metric__value--success"
					: variance < 0
						? "summary-metric__value--danger"
						: "",
		},
	];
}

const dailySummaryRangeLabel = computed(() =>
	summaryRangeLabel(
		dailySummary.value,
		dashboardData.value.date_context?.today
			? formatDate(dashboardData.value.date_context.today)
			: __("Today"),
	),
);
const monthlySummaryRangeLabel = computed(() => summaryRangeLabel(monthlySummary.value, __("Current Month")));
const dailyPaymentMethods = computed(() => summaryPaymentMethods(dailySummary.value));
const monthlyPaymentMethods = computed(() => summaryPaymentMethods(monthlySummary.value));
const dailySummaryMetrics = computed(() => summaryMetrics(dailySummary.value));
const monthlySummaryMetrics = computed(() => summaryMetrics(monthlySummary.value));

const paymentReport = computed(() => dashboardData.value.payment_method_report || {});
const paymentReportTotals = computed(() => paymentReport.value.totals || {});
const paymentReportRangeLabel = computed(() =>
	reportRangeLabel(paymentReport.value.period, dashboardData.value.date_context, formatDate, __),
);
const paymentMethodRows = computed<PaymentMethodSummaryRow[]>(() =>
	limitRows(
		sortByMagnitudeDesc(paymentReport.value.method_wise || [], (row) => Number(row.amount || 0)),
		paymentReportLimit.value,
	),
);
const paymentDayRows = computed<PaymentDaySummaryRow[]>(() =>
	latestRows(sortByStringAsc(paymentReport.value.day_wise || [], (row) => row.date), 14),
);
const paymentDayMax = computed(() =>
	positiveCombinedMax(
		paymentDayRows.value,
		(row) => Math.abs(Number(row.paid_amount || 0)) + Math.abs(Number(row.pending_amount || 0)),
	),
);

const discountVoidReturnReport = computed(() => dashboardData.value.discount_void_return_report || {});
const discountVoidReturnTotals = computed(() => discountVoidReturnReport.value.totals || {});
const discountVoidReturnRangeLabel = computed(() =>
	reportRangeLabel(discountVoidReturnReport.value.period, dashboardData.value.date_context, formatDate, __),
);
const discountCashierRows = computed<DiscountVoidReturnCashierRow[]>(() =>
	[...(discountVoidReturnReport.value.cashier_wise || [])]
		.sort((a, b) => {
			const left =
				Math.abs(Number(a.void_amount || 0)) +
				Math.abs(Number(a.return_amount || 0)) +
				Math.abs(Number(a.discount_amount || 0));
			const right =
				Math.abs(Number(b.void_amount || 0)) +
				Math.abs(Number(b.return_amount || 0)) +
				Math.abs(Number(b.discount_amount || 0));
			return right - left;
		})
		.slice(0, Number(discountReportLimit.value || 20)),
);
const discountTopReturnItems = computed<DiscountVoidReturnItemRow[]>(() =>
	limitRows(
		sortByMagnitudeDesc(discountVoidReturnReport.value.top_return_items || [], (row) =>
			Number(row.return_amount || 0),
		),
		discountReportLimit.value,
	),
);
const discountDayRows = computed<DiscountVoidReturnDayRow[]>(() =>
	latestRows(sortByStringAsc(discountVoidReturnReport.value.day_wise || [], (row) => row.date), 14),
);
const discountMagnitude = (row: {
	discount_amount?: number;
	return_amount?: number;
	void_amount?: number;
}) =>
	Math.abs(Number(row.discount_amount || 0)) +
	Math.abs(Number(row.return_amount || 0)) +
	Math.abs(Number(row.void_amount || 0));
const discountDayMax = computed(() => positiveCombinedMax(discountDayRows.value, discountMagnitude));
const discountCashierMax = computed(() => positiveCombinedMax(discountCashierRows.value, discountMagnitude));
const discountReturnItemMax = computed(() =>
	positiveMax(discountTopReturnItems.value, (row) => Number(row.return_amount || 0)),
);

const staffReport = computed(() => dashboardData.value.staff_performance_report || {});
const staffSummary = computed(() => staffReport.value.summary || {});
const staffReportRangeLabel = computed(() =>
	reportRangeLabel(staffReport.value.period, dashboardData.value.date_context, formatDate, __),
);
const staffCashierRows = computed<StaffPerformanceRow[]>(() =>
	limitRows(
		sortByMagnitudeDesc(staffReport.value.cashier_wise || [], (row) => Number(row.sales_amount || 0)),
		staffReportLimit.value,
	),
);
const staffInvoiceRows = computed<StaffPerformanceRow[]>(() =>
	limitRows(
		sortByNumberDesc(staffReport.value.top_by_invoices || [], (row) =>
			Number(row.invoice_count || 0),
		),
		staffReportLimit.value,
	),
);
const staffRiskRows = computed<StaffPerformanceRow[]>(() =>
	[...(staffReport.value.risk_activity || [])]
		.sort(
			(a, b) =>
				Math.abs(Number(b.void_amount || 0)) +
				Math.abs(Number(b.return_amount || 0)) -
				(Math.abs(Number(a.void_amount || 0)) + Math.abs(Number(a.return_amount || 0))),
		)
		.slice(0, Number(staffReportLimit.value || 20)),
);
const staffSalesMax = computed(() => positiveMax(staffCashierRows.value, (row) => Number(row.sales_amount || 0)));

const profitabilityReport = computed(() => dashboardData.value.profitability_report || {});
const profitabilitySummary = computed(() => profitabilityReport.value.summary || {});
const profitabilityHighlights = computed(() => profitabilityReport.value.highlights || {});
const profitabilityRangeLabel = computed(() =>
	reportRangeLabel(profitabilityReport.value.period, dashboardData.value.date_context, formatDate, __),
);
const profitabilityItemRows = computed<ProfitabilityItemRow[]>(() =>
	limitRows(
		sortByNumberDesc(profitabilityReport.value.item_wise || [], (row) =>
			Number(row.gross_profit || 0),
		),
		profitabilityReportLimit.value,
	),
);
const profitabilityCategoryRows = computed<ProfitabilityCategoryRow[]>(() =>
	limitRows(
		sortByNumberDesc(profitabilityReport.value.category_wise || [], (row) =>
			Number(row.gross_profit || 0),
		),
		profitabilityReportLimit.value,
	),
);
const profitabilityDayRows = computed<ProfitabilityDayRow[]>(() =>
	latestRows(sortByStringAsc(profitabilityReport.value.day_wise || [], (row) => row.date), 14),
);
const profitabilityItemMax = computed(() =>
	positiveMax(profitabilityItemRows.value, (row) => Number(row.gross_profit || 0)),
);
const profitabilityDayMax = computed(() =>
	positiveMax(profitabilityDayRows.value, (row) => Number(row.gross_profit || 0)),
);
const topProfitItemLabel = computed(() => {
	const row = profitabilityHighlights.value.top_profit_item;
	if (!row) {
		return __("N/A");
	}
	const name = String(row.item_name || row.item_code || "").trim();
	if (!name) {
		return __("N/A");
	}
	return `${name} . ${formatMoney(Number(row.gross_profit || 0))}`;
});
const lowestMarginItemLabel = computed(() => {
	const row = profitabilityHighlights.value.lowest_margin_item;
	if (!row) {
		return __("N/A");
	}
	const name = String(row.item_name || row.item_code || "").trim();
	if (!name) {
		return __("N/A");
	}
	return `${name} . ${formatPercent(row.gross_margin_pct, 1)}`;
});

const taxChargesReport = computed(() => dashboardData.value.tax_charges_report || {});
const taxChargesTotals = computed(() => taxChargesReport.value.totals || {});
const taxChargesHighlights = computed(() => taxChargesReport.value.highlights || {});
const taxChargesRangeLabel = computed(() =>
	reportRangeLabel(taxChargesReport.value.period, dashboardData.value.date_context, formatDate, __),
);
const taxHeadRows = computed<TaxChargeHeadRow[]>(() =>
	limitRows(
		sortByMagnitudeDesc(taxChargesReport.value.tax_heads || [], (row) => Number(row.amount || 0)),
		taxReportLimit.value,
	),
);
const chargeHeadRows = computed<TaxChargeHeadRow[]>(() =>
	limitRows(
		sortByMagnitudeDesc(taxChargesReport.value.charge_heads || [], (row) => Number(row.amount || 0)),
		taxReportLimit.value,
	),
);
const taxChargesDayRows = computed<TaxChargesDayRow[]>(() =>
	latestRows(sortByStringAsc(taxChargesReport.value.day_wise || [], (row) => row.date), 14),
);
const taxDayMax = computed(() =>
	positiveMax(taxChargesDayRows.value, (row) => Number(row.total_charge_amount || 0)),
);
const topTaxHeadLabel = computed(() => {
	const row = taxChargesHighlights.value.top_tax_head;
	if (!row?.label) {
		return __("N/A");
	}
	return `${row.label} . ${formatMoney(Number(row.amount || 0))}`;
});
const topChargeHeadLabel = computed(() => {
	const row = taxChargesHighlights.value.top_charge_head;
	if (!row?.label) {
		return __("N/A");
	}
	return `${row.label} . ${formatMoney(Number(row.amount || 0))}`;
});

const branchReport = computed(() => dashboardData.value.branch_location_report || {});
const branchSummary = computed(() => branchReport.value.summary || {});
const branchReportRangeLabel = computed(() =>
	reportRangeLabel(branchReport.value.period, dashboardData.value.date_context, formatDate, __),
);
const branchRows = computed<BranchLocationRow[]>(() =>
	limitRows(
		sortByNumberDesc(branchReport.value.location_wise || [], (row) => Number(row.sales_amount || 0)),
		branchReportLimit.value,
	),
);
const branchTopItemsByLocation = computed<BranchTopItemsByLocationRow[]>(() =>
	limitRows([...(branchReport.value.top_items_by_location || [])], branchReportLimit.value),
);
const branchSalesMax = computed(() => positiveMax(branchRows.value, (row) => Number(row.sales_amount || 0)));

const customerReport = computed(() => dashboardData.value.customer_report || {});
const customerSummary = computed(() => customerReport.value.summary || {});
const customerReportRangeLabel = computed(() =>
	reportRangeLabel(customerReport.value.period, dashboardData.value.date_context, formatDate, __),
);
const topCustomerRows = computed<CustomerReportRow[]>(() =>
	limitRows(
		sortByMagnitudeDesc(customerReport.value.top_customers || [], (row) =>
			Number(row.sales_amount || 0),
		),
		customerReportLimit.value,
	),
);
const repeatCustomerRows = computed<CustomerReportRow[]>(() =>
	limitRows(
		sortByNumberDesc(customerReport.value.repeat_customers || [], (row) =>
			Number(row.invoice_count || 0),
		),
		customerReportLimit.value,
	),
);
const recentCustomerRows = computed<CustomerReportRow[]>(() =>
	[...(customerReport.value.recent_customers || [])]
		.sort((a, b) => String(b.last_purchase_date || "").localeCompare(String(a.last_purchase_date || "")))
		.slice(0, Number(customerReportLimit.value || 20)),
);
const customerSalesMax = computed(() =>
	positiveMax(topCustomerRows.value, (row) => Number(row.sales_amount || 0)),
);

const salesTrend = computed(() => dashboardData.value.sales_trend || {});
const salesTrendDayPoints = computed(() =>
	[...(salesTrend.value.day_wise || [])]
		.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
		.slice(-14),
);
const salesTrendWeekPoints = computed(() =>
	[...(salesTrend.value.week_wise || [])]
		.sort((a, b) => String(a.week_start || "").localeCompare(String(b.week_start || "")))
		.slice(-8),
);
const salesTrendMonthPoints = computed(() =>
	[...(salesTrend.value.month_wise || [])]
		.sort((a, b) => String(a.month || "").localeCompare(String(b.month || "")))
		.slice(-6),
);
const salesTrendHourPoints = computed(() =>
	[...(salesTrend.value.hourly || [])]
		.filter((row) => Math.abs(Number(row.sales || 0)) > 0.00001)
		.sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0))
		.slice(0, 8),
);
const salesTrendRangeLabel = computed(() => {
	return salesTrendPeriodLabel(salesTrend.value.period, formatDate, __);
});
const trendHighlights = computed(() => salesTrend.value.highlights || {});
const bestDayLabel = computed(() => {
	const bestDay = trendHighlights.value.best_day;
	if (!bestDay?.date) {
		return __("N/A");
	}
	return `${formatDate(bestDay.date)} . ${formatMoney(Number(bestDay.sales || 0))}`;
});
const bestHourLabel = computed(() => {
	const bestHour = trendHighlights.value.best_hour;
	if (!bestHour) {
		return __("N/A");
	}
	const label = bestHour.label || `${String(Number(bestHour.hour || 0)).padStart(2, "0")}:00`;
	return `${label} . ${formatMoney(Number(bestHour.sales || 0))}`;
});
const trendGrowthChips = computed(() => {
	const dayGrowth = trendHighlights.value.day_growth_pct;
	const weekGrowth = trendHighlights.value.week_growth_pct;
	const monthGrowth = trendHighlights.value.month_growth_pct;
	return [
		{
			key: "day_growth",
			label: __("Day Δ"),
			value: formatTrendPct(trendHighlights.value.day_growth_pct),
			color: trendGrowthColor(dayGrowth),
		},
		{
			key: "week_growth",
			label: __("Week Δ"),
			value: formatTrendPct(trendHighlights.value.week_growth_pct),
			color: trendGrowthColor(weekGrowth),
		},
		{
			key: "month_growth",
			label: __("Month Δ"),
			value: formatTrendPct(trendHighlights.value.month_growth_pct),
			color: trendGrowthColor(monthGrowth),
		},
	];
});
const salesTrendDayMax = computed(() => positiveMax(salesTrendDayPoints.value, (row) => Number(row.sales || 0)));
const salesTrendWeekMax = computed(() =>
	positiveMax(salesTrendWeekPoints.value, (row) => Number(row.sales || 0)),
);
const salesTrendMonthMax = computed(() =>
	positiveMax(salesTrendMonthPoints.value, (row) => Number(row.sales || 0)),
);
const salesTrendHourMax = computed(() =>
	positiveMax(salesTrendHourPoints.value, (row) => Number(row.sales || 0)),
);

const itemSalesReport = computed(() => dashboardData.value.item_sales_report || {});
const itemSalesItems = computed<ItemSalesRow[]>(() =>
	limitRows(
		sortByNumberDesc(itemSalesReport.value.items || [], (row) => Number(row.sales_amount || 0)),
		itemSalesLimit.value,
	),
);
const itemSalesHighlights = computed(() => itemSalesReport.value.highlights || {});
const itemSalesRangeLabel = computed(() =>
	reportRangeLabel(itemSalesReport.value.period, dashboardData.value.date_context, formatDate, __),
);
const itemSalesBestSellerLabel = computed(() => {
	const row = itemSalesHighlights.value.best_seller;
	if (!row) {
		return __("N/A");
	}
	const name = String(row.item_name || row.item_code || "").trim();
	if (!name) {
		return __("N/A");
	}
	return `${name} . ${formatQuantity(Number(row.sold_qty || 0))}`;
});
const itemSalesTopMarginLabel = computed(() => {
	const row = itemSalesHighlights.value.top_margin_item;
	if (!row) {
		return __("N/A");
	}
	const name = String(row.item_name || row.item_code || "").trim();
	if (!name) {
		return __("N/A");
	}
	return `${name} . ${formatMoney(Number(row.estimated_margin || 0))}`;
});
const itemSalesTopDiscountLabel = computed(() => {
	const row = itemSalesHighlights.value.top_discount_item;
	if (!row) {
		return __("N/A");
	}
	const name = String(row.item_name || row.item_code || "").trim();
	if (!name) {
		return __("N/A");
	}
	return `${name} . ${formatMoney(Number(row.discount_amount || 0))}`;
});
const itemSalesMaxSales = computed(() =>
	positiveMax(itemSalesItems.value, (row) => Number(row.sales_amount || 0)),
);

const categoryVariantReport = computed(() => dashboardData.value.category_brand_variant_report || {});
const categoryVariantHighlights = computed(() => categoryVariantReport.value.highlights || {});
const categorySalesPoints = computed<CategoryBrandVariantRow[]>(() =>
	limitRows(
		sortByNumberDesc(categoryVariantReport.value.category_wise || [], (row) =>
			Number(row.sales_amount || 0),
		),
		categoryReportLimit.value,
		12,
	),
);
const brandSalesPoints = computed<CategoryBrandVariantRow[]>(() =>
	limitRows(
		sortByNumberDesc(categoryVariantReport.value.brand_wise || [], (row) =>
			Number(row.sales_amount || 0),
		),
		categoryReportLimit.value,
		12,
	),
);
const variantSalesPoints = computed<CategoryBrandVariantRow[]>(() =>
	limitRows(
		sortByNumberDesc(categoryVariantReport.value.variant_wise || [], (row) =>
			Number(row.sales_amount || 0),
		),
		categoryReportLimit.value,
		12,
	),
);
const attributeSalesPoints = computed<CategoryBrandVariantRow[]>(() =>
	limitRows(
		sortByNumberDesc(categoryVariantReport.value.attribute_wise || [], (row) =>
			Number(row.sales_amount || 0),
		),
		categoryReportLimit.value,
		12,
	),
);
const categoryVariantRangeLabel = computed(() =>
	reportRangeLabel(categoryVariantReport.value.period, dashboardData.value.date_context, formatDate, __),
);
const topCategoryLabel = computed(() => {
	const row = categoryVariantHighlights.value.top_category;
	if (!row?.label) {
		return __("N/A");
	}
	return `${row.label} . ${formatMoney(Number(row.sales_amount || 0))}`;
});
const topBrandLabel = computed(() => {
	const row = categoryVariantHighlights.value.top_brand;
	if (!row?.label) {
		return __("N/A");
	}
	return `${row.label} . ${formatMoney(Number(row.sales_amount || 0))}`;
});
const topVariantLabel = computed(() => {
	const row = categoryVariantHighlights.value.top_variant;
	if (!row?.label) {
		return __("N/A");
	}
	return `${row.label} . ${formatMoney(Number(row.sales_amount || 0))}`;
});
const categorySalesMax = computed(() =>
	positiveMax(categorySalesPoints.value, (row) => Number(row.sales_amount || 0)),
);
const brandSalesMax = computed(() =>
	positiveMax(brandSalesPoints.value, (row) => Number(row.sales_amount || 0)),
);
const variantSalesMax = computed(() =>
	positiveMax(variantSalesPoints.value, (row) => Number(row.sales_amount || 0)),
);
const attributeSalesMax = computed(() =>
	positiveMax(attributeSalesPoints.value, (row) => Number(row.sales_amount || 0)),
);

const inventoryStatusReport = computed(() => dashboardData.value.inventory_status_report || {});
const inventoryStatusSummary = computed(() => inventoryStatusReport.value.summary || {});
const inventoryStatusRangeLabel = computed(() =>
	reportRangeLabel(inventoryStatusReport.value.period, dashboardData.value.date_context, formatDate, __),
);
const inventoryStatusLowStockItems = computed<InventoryStatusRow[]>(
	() => inventoryStatusReport.value.low_stock_items || [],
);
const inventoryStatusOutOfStockItems = computed<InventoryStatusRow[]>(
	() => inventoryStatusReport.value.out_of_stock_items || [],
);
const inventoryStatusNegativeItems = computed<InventoryStatusRow[]>(
	() => inventoryStatusReport.value.negative_stock_items || [],
);
const inventoryStatusSlowMovingItems = computed<InventoryStatusRow[]>(
	() => inventoryStatusReport.value.slow_moving_items || [],
);
const inventoryStatusDeadStockItems = computed<InventoryStatusRow[]>(
	() => inventoryStatusReport.value.dead_stock_items || [],
);
const inventoryStatusLowMax = computed(() =>
	positiveMax(inventoryStatusLowStockItems.value, (row) => Number(row.actual_qty || 0)),
);
const inventoryStatusSlowMax = computed(() =>
	positiveMax(inventoryStatusSlowMovingItems.value, (row) => Number(row.stock_cover_days || 0)),
);
const inventoryStatusDeadMax = computed(() =>
	positiveMax(inventoryStatusDeadStockItems.value, (row) => Number(row.actual_qty || 0)),
);
const inventoryStatusNegativeMax = computed(() =>
	positiveMax(inventoryStatusNegativeItems.value, (row) => Number(row.actual_qty || 0)),
);

const stockMovementReport = computed(() => dashboardData.value.stock_movement_report || {});
const stockMovementSummary = computed(() => stockMovementReport.value.summary || {});
const stockMovementRangeLabel = computed(() =>
	reportRangeLabel(stockMovementReport.value.period, dashboardData.value.date_context, formatDate, __),
);
const stockMovementDayWise = computed<StockMovementDayRow[]>(() =>
	latestRows(sortByStringAsc(stockMovementReport.value.day_wise || [], (row) => row.date), 31),
);
const stockMovementRecent = computed<StockMovementRecentRow[]>(() =>
	limitRows([...(stockMovementReport.value.recent_movements || [])], stockMovementLimit.value),
);
const stockMovementIncomingQty = computed(
	() =>
		Number(stockMovementSummary.value.return_in_qty || 0) +
		Number(stockMovementSummary.value.adjustment_in_qty || 0) +
		Number(stockMovementSummary.value.transfer_in_qty || 0) +
		Number(stockMovementSummary.value.other_in_qty || 0),
);
const stockMovementOutgoingQty = computed(
	() =>
		Number(stockMovementSummary.value.sale_out_qty || 0) +
		Number(stockMovementSummary.value.adjustment_out_qty || 0) +
		Number(stockMovementSummary.value.transfer_out_qty || 0) +
		Number(stockMovementSummary.value.other_out_qty || 0),
);
const stockMovementDaySimple = computed<
	Array<StockMovementDayRow & { incoming: number; outgoing: number; net: number }>
>(() =>
	stockMovementDayWise.value.map((row) => {
		const incoming =
			Number(row.return_in_qty || 0) +
			Number(row.adjustment_in_qty || 0) +
			Number(row.transfer_in_qty || 0) +
			Number(row.other_in_qty || 0);
		const outgoing =
			Number(row.sale_out_qty || 0) +
			Number(row.adjustment_out_qty || 0) +
			Number(row.transfer_out_qty || 0) +
			Number(row.other_out_qty || 0);
		const net = Number(row.net_qty || 0);
		return { ...row, incoming, outgoing, net };
	}),
);
const stockMovementDayMax = computed(() =>
	positiveCombinedMax(
		stockMovementDaySimple.value,
		(row) => Math.abs(Number(row.incoming || 0)) + Math.abs(Number(row.outgoing || 0)),
	),
);

const reorderReport = computed(() => dashboardData.value.reorder_purchase_suggestions || {});
const reorderSummary = computed(() => reorderReport.value.summary || {});
const reorderSuggestions = computed<ReorderSuggestionRow[]>(() =>
	[...(reorderReport.value.suggestions || [])]
		.sort((a, b) => {
			const order = { critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>;
			const left = order[String(a.urgency || "").toLowerCase()] ?? 99;
			const right = order[String(b.urgency || "").toLowerCase()] ?? 99;
			if (left !== right) {
				return left - right;
			}
			return Number(b.suggested_qty || 0) - Number(a.suggested_qty || 0);
		})
		.slice(0, Number(reorderSuggestionLimit.value || 25)),
);
const reorderRangeLabel = computed(() =>
	reportRangeLabel(reorderReport.value.period, dashboardData.value.date_context, formatDate, __),
);

const fastMovingItems = computed<FastMovingItem[]>(
	() => dashboardData.value.inventory_insights.fast_moving_items || [],
);
const fastMovingPagination = computed(() => {
	const fallbackSize = Number(fastMovingPageSize.value || 10);
	return (
		dashboardData.value.inventory_insights.fast_moving_pagination || {
			page: Number(fastMovingPage.value || 1),
			page_size: fallbackSize,
			total_count: fastMovingItems.value.length,
			total_pages: fastMovingItems.value.length > 0 ? 1 : 0,
			search: fastMovingSearch.value,
		}
	);
});
const fastMovingTotalCount = computed(() =>
	Number(fastMovingPagination.value.total_count || fastMovingItems.value.length || 0),
);
const fastMovingTotalPages = computed(() => Number(fastMovingPagination.value.total_pages || 0));
const fastMovingPageSizeItems = computed(() =>
	[10, 20, 30, 50].map((size) => ({
		label: String(size),
		value: size,
	})),
);
const lowStockItems = computed<LowStockItem[]>(
	() => dashboardData.value.inventory_insights.low_stock_items || [],
);
const supplierOverview = computed(() => dashboardData.value.supplier_overview);
const supplierOverviewSummary = computed<SupplierOverviewSummary>(() => supplierOverview.value.summary || {});
const supplierSummary = computed<SupplierSummaryRow[]>(() => supplierOverview.value.purchase_summary || []);
const supplierRiskRows = computed<SupplierSummaryRow[]>(() => supplierOverview.value.risk_suppliers || []);
const supplierDayRows = computed<SupplierDayRow[]>(() =>
	[...(supplierOverview.value.day_wise || [])]
		.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
		.slice(-14),
);
const lowStockWarehouseItems = computed(() => {
	const values = Array.from(
		new Set(lowStockItems.value.map((item) => String(item.warehouse || "").trim()).filter(Boolean)),
	).sort((a, b) => a.localeCompare(b));
	return [{ label: __("All Warehouses"), value: "" }, ...values.map((value) => ({ label: value, value }))];
});
const filteredLowStockItems = computed<LowStockItem[]>(() => {
	const searchText = String(lowStockSearch.value || "")
		.trim()
		.toLowerCase();
	const warehouse = String(lowStockWarehouseFilter.value || "").trim();
	return lowStockItems.value.filter((item) => {
		if (warehouse && String(item.warehouse || "").trim() !== warehouse) {
			return false;
		}
		if (!searchText) {
			return true;
		}
		return (
			String(item.item_code || "")
				.toLowerCase()
				.includes(searchText) ||
			String(item.item_name || "")
				.toLowerCase()
				.includes(searchText) ||
			String(item.warehouse || "")
				.toLowerCase()
				.includes(searchText)
		);
	});
});
const filteredSupplierSummary = computed<SupplierSummaryRow[]>(() => {
	const searchText = String(supplierSearch.value || "")
		.trim()
		.toLowerCase();
	if (!searchText) {
		return supplierSummary.value;
	}
	return supplierSummary.value.filter((supplier) => {
		return (
			String(supplier.supplier || "")
				.toLowerCase()
				.includes(searchText) ||
			String(supplier.supplier_name || "")
				.toLowerCase()
				.includes(searchText)
		);
	});
});
const filteredSupplierRiskRows = computed<SupplierSummaryRow[]>(() => {
	const searchText = String(supplierSearch.value || "")
		.trim()
		.toLowerCase();
	if (!searchText) {
		return supplierRiskRows.value;
	}
	return supplierRiskRows.value.filter((supplier) => {
		return (
			String(supplier.supplier || "")
				.toLowerCase()
				.includes(searchText) ||
			String(supplier.supplier_name || "")
				.toLowerCase()
				.includes(searchText)
		);
	});
});
const supplierPurchaseMax = computed(() =>
	positiveMax(filteredSupplierSummary.value, (row) => Number(row.purchase_amount || 0)),
);
const supplierPendingMax = computed(() =>
	positiveMax(filteredSupplierRiskRows.value, (row) => Number(row.pending_amount || 0)),
);
const supplierDayMax = computed(() =>
	positiveMax(supplierDayRows.value, (row) => Number(row.purchase_amount || 0)),
);
const topSupplierLabel = computed(() => {
	const row = supplierOverview.value.highlights?.top_supplier;
	if (!row) {
		return __("N/A");
	}
	return String(row.supplier_name || row.supplier || __("N/A"));
});
const topPendingSupplierLabel = computed(() => {
	const row = supplierOverview.value.highlights?.top_pending_supplier;
	if (!row) {
		return __("N/A");
	}
	return String(row.supplier_name || row.supplier || __("N/A"));
});

const maxFastMovingQty = computed(() => positiveMax(fastMovingItems.value, (item) => Number(item.sold_qty || 0)));

const lowStockThreshold = computed(() =>
	Number(dashboardData.value.inventory_insights.low_stock_threshold || 10),
);

const monthRangeLabel = computed(() =>
	reportRangeLabel(supplierOverview.value.period, dashboardData.value.date_context, formatDate, __),
);

const fastMovingRangeLabel = computed(() => {
	const period = dashboardData.value.inventory_insights.fast_moving_period;
	const from = period?.from || dashboardData.value.date_context?.month_start;
	const to = period?.to || dashboardData.value.date_context?.today;
	if (!from || !to) {
		return __("Current Month");
	}

	let days = Number(period?.days || 0);
	if (!Number.isFinite(days) || days <= 0) {
		const fromDate = new Date(from);
		const toDate = new Date(to);
		if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
			const msPerDay = 24 * 60 * 60 * 1000;
			const computedDays = Math.floor((toDate.getTime() - fromDate.getTime()) / msPerDay) + 1;
			days = computedDays > 0 ? computedDays : 0;
		}
	}

	const daysLabel = days > 0 ? ` (${days} ${__("days")})` : "";
	return `${formatDate(from)} - ${formatDate(to)}${daysLabel}`;
});

const lastUpdatedLabel = computed(() => {
	if (!lastUpdatedAt.value) {
		return "";
	}
	return `${__("Updated")}: ${lastUpdatedAt.value.toLocaleTimeString()}`;
});

const {
	formatMoney,
	formatQuantity,
	formatSignedQuantity,
	formatDate,
	formatPercent,
	formatDays,
	formatMovementCategory,
	urgencyLabel,
	urgencyColor,
	progressFromQuantity: progressFromQuantityWithMax,
	stockChipColor,
	paymentCategoryColor,
	trendProgress,
	formatTrendPct,
	trendGrowthColor,
} = createReportFormatters({
	getCurrency: () => currency.value,
	translate: __,
});

function progressFromQuantity(quantity: number) {
	return progressFromQuantityWithMax(quantity, maxFastMovingQty.value);
}

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

function logDashboardError(error: any) {
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
</script>

<style scoped>
.awesome-dashboard-view {
	--dashboard-bg-base: var(--pos-surface-muted, var(--pos-surface, #f4f6f8));
	--dashboard-glow-primary: rgba(25, 118, 210, 0.08);
	--dashboard-glow-secondary: rgba(76, 175, 80, 0.08);
	--dashboard-tabs-bg: var(--pos-surface-raised, var(--pos-card-bg, #ffffff));
	--dashboard-tab-active-bg: var(--pos-card-bg, #ffffff);
	--dashboard-tab-hover-bg: var(--pos-surface-container, rgba(0, 0, 0, 0.04));
	height: 100%;
	overflow: auto;
	background:
		radial-gradient(circle at top right, var(--dashboard-glow-primary), transparent 40%),
		radial-gradient(circle at bottom left, var(--dashboard-glow-secondary), transparent 45%),
		var(--dashboard-bg-base);
}

:deep(.v-theme--dark) .awesome-dashboard-view {
	--dashboard-bg-base: var(--pos-surface-muted, #1a2028);
	--dashboard-glow-primary: rgba(66, 165, 245, 0.18);
	--dashboard-glow-secondary: rgba(102, 187, 106, 0.14);
	--dashboard-tabs-bg: rgba(255, 255, 255, 0.04);
	--dashboard-tab-active-bg: rgba(255, 255, 255, 0.08);
	--dashboard-tab-hover-bg: rgba(255, 255, 255, 0.06);
}

.dashboard-shell {
	min-height: 100%;
}

</style>
