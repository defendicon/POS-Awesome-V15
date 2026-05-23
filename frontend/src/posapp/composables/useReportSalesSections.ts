import { computed, type Ref } from "vue";
import type { createReportFormatters } from "@/posapp/composables/useReportFormatters";
import {
	latestRows,
	limitRows,
	positiveCombinedMax,
	positiveMax,
	reportRangeLabel,
	salesTrendRangeLabel as salesTrendPeriodLabel,
	sortByMagnitudeDesc,
	sortByStringAsc,
} from "@/posapp/composables/useReportDerivations";
import type {
	DashboardResponse,
	DiscountVoidReturnCashierRow,
	DiscountVoidReturnDayRow,
	DiscountVoidReturnItemRow,
	PaymentDaySummaryRow,
	PaymentMethodSummaryRow,
	SalesSummaryPayload,
} from "@/posapp/services/dashboardService";

type ReportFormatters = ReturnType<typeof createReportFormatters>;

type SalesSectionsOptions = {
	dashboardData: Ref<DashboardResponse>;
	translate: (value: string) => string;
	formatMoney: ReportFormatters["formatMoney"];
	formatQuantity: ReportFormatters["formatQuantity"];
	formatDate: ReportFormatters["formatDate"];
	formatTrendPct: ReportFormatters["formatTrendPct"];
	trendGrowthColor: ReportFormatters["trendGrowthColor"];
	paymentReportLimit: Ref<number>;
	discountReportLimit: Ref<number>;
};

export function useReportSalesSections(options: SalesSectionsOptions) {
	const {
		dashboardData,
		translate: __,
		formatMoney,
		formatQuantity,
		formatDate,
		formatTrendPct,
		trendGrowthColor,
		paymentReportLimit,
		discountReportLimit,
	} = options;

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
	const monthlySummary = computed<SalesSummaryPayload>(
		() => dashboardData.value.monthly_sales_summary || {},
	);

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
		reportRangeLabel(
			discountVoidReturnReport.value.period,
			dashboardData.value.date_context,
			formatDate,
			__,
		),
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
	const salesTrendRangeLabel = computed(() =>
		salesTrendPeriodLabel(salesTrend.value.period, formatDate, __),
	);
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

	return {
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
	};
}
