import { computed, type Ref } from "vue";
import type { createReportFormatters } from "@/posapp/composables/useReportFormatters";
import {
	latestRows,
	limitRows,
	positiveCombinedMax,
	positiveMax,
	reportRangeLabel,
	sortByNumberDesc,
	sortByStringAsc,
} from "@/posapp/composables/useReportDerivations";
import type {
	CategoryBrandVariantRow,
	DashboardResponse,
	FastMovingItem,
	InventoryStatusRow,
	ItemSalesRow,
	LowStockItem,
	ReorderSuggestionRow,
	StockMovementDayRow,
	StockMovementRecentRow,
	SupplierDayRow,
	SupplierOverviewSummary,
	SupplierSummaryRow,
} from "@/posapp/services/dashboardService";

type ReportFormatters = ReturnType<typeof createReportFormatters>;

type InventorySectionsOptions = {
	dashboardData: Ref<DashboardResponse>;
	translate: (value: string) => string;
	formatMoney: ReportFormatters["formatMoney"];
	formatQuantity: ReportFormatters["formatQuantity"];
	formatDate: ReportFormatters["formatDate"];
	progressFromQuantityWithMax: ReportFormatters["progressFromQuantity"];
	itemSalesLimit: Ref<number>;
	categoryReportLimit: Ref<number>;
	stockMovementLimit: Ref<number>;
	reorderSuggestionLimit: Ref<number>;
	fastMovingPage: Ref<number>;
	fastMovingPageSize: Ref<number>;
	fastMovingSearch: Ref<string>;
	lowStockSearch: Ref<string>;
	lowStockWarehouseFilter: Ref<string>;
	supplierSearch: Ref<string>;
};

export function useReportInventorySections(options: InventorySectionsOptions) {
	const {
		dashboardData,
		translate: __,
		formatMoney,
		formatQuantity,
		formatDate,
		progressFromQuantityWithMax,
		itemSalesLimit,
		categoryReportLimit,
		stockMovementLimit,
		reorderSuggestionLimit,
		fastMovingPage,
		fastMovingPageSize,
		fastMovingSearch,
		lowStockSearch,
		lowStockWarehouseFilter,
		supplierSearch,
	} = options;

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
			sortByNumberDesc(categoryVariantReport.value.brand_wise || [], (row) => Number(row.sales_amount || 0)),
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
	const supplierOverviewSummary = computed<SupplierOverviewSummary>(
		() => supplierOverview.value.summary || {},
	);
	const supplierSummary = computed<SupplierSummaryRow[]>(
		() => supplierOverview.value.purchase_summary || [],
	);
	const supplierRiskRows = computed<SupplierSummaryRow[]>(
		() => supplierOverview.value.risk_suppliers || [],
	);
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

	const maxFastMovingQty = computed(() =>
		positiveMax(fastMovingItems.value, (item) => Number(item.sold_qty || 0)),
	);

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

	function progressFromQuantity(quantity: number) {
		return progressFromQuantityWithMax(quantity, maxFastMovingQty.value);
	}

	return {
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
	};
}
