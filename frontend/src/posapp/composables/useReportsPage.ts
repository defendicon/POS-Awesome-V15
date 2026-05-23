import { useReportDashboard } from "@/posapp/composables/useReportDashboard";
import { useReportInventorySections } from "@/posapp/composables/useReportInventorySections";
import { useReportOperationsSections } from "@/posapp/composables/useReportOperationsSections";
import { useReportSalesSections } from "@/posapp/composables/useReportSalesSections";

/**
 * Wires dashboard shell state with tab-specific derived report sections.
 */
export function useReportsPage() {
	const dashboard = useReportDashboard();

	const sales = useReportSalesSections({
		dashboardData: dashboard.dashboardData,
		translate: dashboard.__,
		formatMoney: dashboard.formatMoney,
		formatQuantity: dashboard.formatQuantity,
		formatDate: dashboard.formatDate,
		formatTrendPct: dashboard.formatTrendPct,
		trendGrowthColor: dashboard.trendGrowthColor,
		paymentReportLimit: dashboard.paymentReportLimit,
		discountReportLimit: dashboard.discountReportLimit,
	});

	const inventory = useReportInventorySections({
		dashboardData: dashboard.dashboardData,
		translate: dashboard.__,
		formatMoney: dashboard.formatMoney,
		formatQuantity: dashboard.formatQuantity,
		formatDate: dashboard.formatDate,
		progressFromQuantityWithMax: dashboard.progressFromQuantity,
		itemSalesLimit: dashboard.itemSalesLimit,
		categoryReportLimit: dashboard.categoryReportLimit,
		stockMovementLimit: dashboard.stockMovementLimit,
		reorderSuggestionLimit: dashboard.reorderSuggestionLimit,
		fastMovingPage: dashboard.fastMovingPage,
		fastMovingPageSize: dashboard.fastMovingPageSize,
		fastMovingSearch: dashboard.fastMovingSearch,
		lowStockSearch: dashboard.lowStockSearch,
		lowStockWarehouseFilter: dashboard.lowStockWarehouseFilter,
		supplierSearch: dashboard.supplierSearch,
	});

	const operations = useReportOperationsSections({
		dashboardData: dashboard.dashboardData,
		translate: dashboard.__,
		formatMoney: dashboard.formatMoney,
		formatDate: dashboard.formatDate,
		formatPercent: dashboard.formatPercent,
		staffReportLimit: dashboard.staffReportLimit,
		customerReportLimit: dashboard.customerReportLimit,
		profitabilityReportLimit: dashboard.profitabilityReportLimit,
		branchReportLimit: dashboard.branchReportLimit,
		taxReportLimit: dashboard.taxReportLimit,
	});

	return {
		...dashboard,
		...sales,
		...inventory,
		...operations,
	};
}
