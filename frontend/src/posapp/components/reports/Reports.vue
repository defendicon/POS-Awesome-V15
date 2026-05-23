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
import { useReportsPage } from "@/posapp/composables/useReportsPage";
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

const {
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
	salesMetrics,
	dailySummary,
	monthlySummary,
	dailySummaryRangeLabel,
	monthlySummaryRangeLabel,
	dailyPaymentMethods,
	monthlyPaymentMethods,
	dailySummaryMetrics,
	monthlySummaryMetrics,
	paymentReportTotals,
	paymentReportRangeLabel,
	paymentMethodRows,
	paymentDayRows,
	paymentDayMax,
	discountVoidReturnTotals,
	discountVoidReturnRangeLabel,
	discountCashierRows,
	discountTopReturnItems,
	discountDayRows,
	discountDayMax,
	discountCashierMax,
	discountReturnItemMax,
	salesTrendRangeLabel,
	bestDayLabel,
	bestHourLabel,
	trendGrowthChips,
	salesTrendDayPoints,
	salesTrendWeekPoints,
	salesTrendMonthPoints,
	salesTrendHourPoints,
	salesTrendDayMax,
	salesTrendWeekMax,
	salesTrendMonthMax,
	salesTrendHourMax,
	itemSalesRangeLabel,
	itemSalesBestSellerLabel,
	itemSalesTopMarginLabel,
	itemSalesTopDiscountLabel,
	itemSalesItems,
	itemSalesMaxSales,
	categoryVariantRangeLabel,
	topCategoryLabel,
	topBrandLabel,
	topVariantLabel,
	categorySalesPoints,
	brandSalesPoints,
	variantSalesPoints,
	attributeSalesPoints,
	categorySalesMax,
	brandSalesMax,
	variantSalesMax,
	attributeSalesMax,
	inventoryStatusReport,
	inventoryStatusSummary,
	inventoryStatusRangeLabel,
	inventoryStatusLowStockItems,
	inventoryStatusOutOfStockItems,
	inventoryStatusNegativeItems,
	inventoryStatusSlowMovingItems,
	inventoryStatusDeadStockItems,
	inventoryStatusLowMax,
	inventoryStatusSlowMax,
	inventoryStatusDeadMax,
	inventoryStatusNegativeMax,
	stockMovementRangeLabel,
	stockMovementSummary,
	stockMovementIncomingQty,
	stockMovementOutgoingQty,
	stockMovementDaySimple,
	stockMovementRecent,
	stockMovementDayMax,
	reorderRangeLabel,
	reorderSummary,
	reorderSuggestions,
	fastMovingRangeLabel,
	fastMovingTotalCount,
	fastMovingPageSizeItems,
	fastMovingItems,
	fastMovingTotalPages,
	lowStockThreshold,
	lowStockWarehouseItems,
	filteredLowStockItems,
	monthRangeLabel,
	topSupplierLabel,
	topPendingSupplierLabel,
	supplierOverviewSummary,
	filteredSupplierSummary,
	filteredSupplierRiskRows,
	supplierDayRows,
	supplierPurchaseMax,
	supplierPendingMax,
	supplierDayMax,
	progressFromQuantity,
	staffSummary,
	staffReportRangeLabel,
	staffCashierRows,
	staffInvoiceRows,
	staffRiskRows,
	staffSalesMax,
	profitabilityRangeLabel,
	topProfitItemLabel,
	lowestMarginItemLabel,
	profitabilitySummary,
	profitabilityItemRows,
	profitabilityCategoryRows,
	profitabilityDayRows,
	profitabilityItemMax,
	profitabilityDayMax,
	taxChargesRangeLabel,
	topTaxHeadLabel,
	topChargeHeadLabel,
	taxChargesTotals,
	taxHeadRows,
	chargeHeadRows,
	taxChargesDayRows,
	taxDayMax,
	branchReportRangeLabel,
	branchSummary,
	branchRows,
	branchTopItemsByLocation,
	branchSalesMax,
	customerReportRangeLabel,
	customerSummary,
	topCustomerRows,
	repeatCustomerRows,
	recentCustomerRows,
	customerSalesMax,
	formatMoney,
	formatQuantity,
	formatSignedQuantity,
	formatDate,
	formatPercent,
	formatDays,
	formatMovementCategory,
	urgencyLabel,
	urgencyColor,
	stockChipColor,
	paymentCategoryColor,
	trendProgress,
	formatTrendPct,
	trendGrowthColor,
} = useReportsPage();

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
