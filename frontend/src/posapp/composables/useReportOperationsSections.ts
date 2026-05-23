import { computed, type Ref } from "vue";
import type { createReportFormatters } from "@/posapp/composables/useReportFormatters";
import {
	latestRows,
	limitRows,
	positiveMax,
	reportRangeLabel,
	sortByMagnitudeDesc,
	sortByNumberDesc,
	sortByStringAsc,
} from "@/posapp/composables/useReportDerivations";
import type {
	BranchLocationRow,
	BranchTopItemsByLocationRow,
	CustomerReportRow,
	DashboardResponse,
	ProfitabilityCategoryRow,
	ProfitabilityDayRow,
	ProfitabilityItemRow,
	StaffPerformanceRow,
	TaxChargeHeadRow,
	TaxChargesDayRow,
} from "@/posapp/services/dashboardService";

type ReportFormatters = ReturnType<typeof createReportFormatters>;

type OperationsSectionsOptions = {
	dashboardData: Ref<DashboardResponse>;
	translate: (value: string) => string;
	formatMoney: ReportFormatters["formatMoney"];
	formatDate: ReportFormatters["formatDate"];
	formatPercent: ReportFormatters["formatPercent"];
	staffReportLimit: Ref<number>;
	customerReportLimit: Ref<number>;
	profitabilityReportLimit: Ref<number>;
	branchReportLimit: Ref<number>;
	taxReportLimit: Ref<number>;
};

export function useReportOperationsSections(options: OperationsSectionsOptions) {
	const {
		dashboardData,
		translate: __,
		formatMoney,
		formatDate,
		formatPercent,
		staffReportLimit,
		customerReportLimit,
		profitabilityReportLimit,
		branchReportLimit,
		taxReportLimit,
	} = options;

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
			sortByNumberDesc(staffReport.value.top_by_invoices || [], (row) => Number(row.invoice_count || 0)),
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
	const staffSalesMax = computed(() =>
		positiveMax(staffCashierRows.value, (row) => Number(row.sales_amount || 0)),
	);

	const profitabilityReport = computed(() => dashboardData.value.profitability_report || {});
	const profitabilitySummary = computed(() => profitabilityReport.value.summary || {});
	const profitabilityHighlights = computed(() => profitabilityReport.value.highlights || {});
	const profitabilityRangeLabel = computed(() =>
		reportRangeLabel(profitabilityReport.value.period, dashboardData.value.date_context, formatDate, __),
	);
	const profitabilityItemRows = computed<ProfitabilityItemRow[]>(() =>
		limitRows(
			sortByNumberDesc(profitabilityReport.value.item_wise || [], (row) => Number(row.gross_profit || 0)),
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
			sortByMagnitudeDesc(customerReport.value.top_customers || [], (row) => Number(row.sales_amount || 0)),
			customerReportLimit.value,
		),
	);
	const repeatCustomerRows = computed<CustomerReportRow[]>(() =>
		limitRows(
			sortByNumberDesc(customerReport.value.repeat_customers || [], (row) => Number(row.invoice_count || 0)),
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

	return {
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
	};
}
