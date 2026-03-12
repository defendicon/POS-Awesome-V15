import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

import type { DashboardResponse } from "../src/posapp/services/dashboardService";

describe("useDashboardData", () => {
	it("builds dashboard requests from reactive state", async () => {
		const { buildDashboardRequest } = await import(
			"../src/posapp/composables/dashboard/useDashboardData"
		);

		const request = buildDashboardRequest({
			profileName: computed(() => "POS-1"),
			dashboardScope: ref<"all" | "current" | "specific">("specific"),
			selectedProfileFilter: ref("POS-2"),
			selectedReportMonth: ref("2026-03"),
			configuredLowStockThreshold: computed(() => 7),
			itemSalesLimit: ref(20),
			categoryReportLimit: ref(12),
			inventoryStatusLimit: ref(15),
			stockMovementLimit: ref(25),
			reorderSuggestionLimit: ref(30),
			paymentReportLimit: ref(18),
			discountReportLimit: ref(16),
			customerReportLimit: ref(11),
			staffReportLimit: ref(10),
			profitabilityReportLimit: ref(9),
			branchReportLimit: ref(8),
			taxReportLimit: ref(7),
			fastMovingPage: ref(3),
			fastMovingPageSize: ref(40),
			fastMovingSearch: ref(" flour "),
		});

		expect(request).toEqual({
			pos_profile: "POS-1",
			scope: "specific",
			profile_filter: "POS-2",
			report_month: "2026-03",
			low_stock_threshold: 7,
			item_sales_limit: 20,
			category_report_limit: 12,
			inventory_status_limit: 15,
			stock_movement_limit: 25,
			reorder_suggestion_limit: 30,
			payment_report_limit: 18,
			discount_report_limit: 16,
			customer_report_limit: 11,
			staff_report_limit: 10,
			profitability_report_limit: 9,
			branch_report_limit: 8,
			tax_report_limit: 7,
			fast_moving_page: 3,
			fast_moving_page_size: 40,
			fast_moving_search: " flour ",
		});
	});

	it("hydrates dashboard state from the API response", async () => {
		const response: DashboardResponse = {
			enabled: true,
			allow_all_profiles: false,
			default_scope: "current",
			date_context: { report_month: "2026-02" },
			selected_profiles: ["POS-1"],
			sales_overview: {
				today_sales: 12,
				today_profit: 4,
				monthly_sales: 120,
				monthly_profit: 40,
			},
			inventory_insights: {
				fast_moving_items: [],
				low_stock_items: [],
				low_stock_threshold: 5,
			},
			supplier_overview: {
				purchase_summary: [],
			},
		};
		const fetcher = vi.fn().mockResolvedValue(response);
		const debug = vi.fn();

		const { useDashboardData } = await import(
			"../src/posapp/composables/dashboard/useDashboardData"
		);

		const dashboardScope = ref<"all" | "current" | "specific">("all");
		const selectedProfileFilter = ref("");
		const selectedReportMonth = ref("2026-03");
		const controller = useDashboardData(
			{
				profileName: computed(() => "POS-1"),
				dashboardScope,
				selectedProfileFilter,
				selectedReportMonth,
				configuredLowStockThreshold: computed(() => undefined),
				itemSalesLimit: ref(20),
				categoryReportLimit: ref(12),
				inventoryStatusLimit: ref(20),
				stockMovementLimit: ref(20),
				reorderSuggestionLimit: ref(25),
				paymentReportLimit: ref(20),
				discountReportLimit: ref(20),
				customerReportLimit: ref(20),
				staffReportLimit: ref(20),
				profitabilityReportLimit: ref(20),
				branchReportLimit: ref(20),
				taxReportLimit: ref(20),
				fastMovingPage: ref(1),
				fastMovingPageSize: ref(10),
				fastMovingSearch: ref(""),
			},
			{
				fetchDashboardData: fetcher,
				isDebugEnabled: () => true,
				logDebug: debug,
				translate: (value) => value,
				now: () => new Date("2026-03-12T00:00:00.000Z"),
			},
		);

		await controller.loadDashboard();

		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(controller.dashboardData.value.sales_overview.today_sales).toBe(12);
		expect(controller.allowAllProfiles.value).toBe(false);
		expect(controller.isDashboardEnabledOnServer.value).toBe(true);
		expect(controller.lastUpdatedAt.value?.toISOString()).toBe(
			"2026-03-12T00:00:00.000Z",
		);
		expect(selectedReportMonth.value).toBe("2026-02");
		expect(dashboardScope.value).toBe("current");
		expect(debug).toHaveBeenCalled();
	});
});
