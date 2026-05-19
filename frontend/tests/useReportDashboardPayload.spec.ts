import { describe, expect, it } from "vitest";

import {
	createEmptyDashboard,
	mergeDashboardPayload,
} from "../src/posapp/composables/useReportDashboardPayload";

describe("report dashboard payload defaults", () => {
	it("creates a complete empty dashboard shape for safe report rendering", () => {
		const dashboard = createEmptyDashboard();

		expect(dashboard.enabled).toBe(true);
		expect(dashboard.sales_overview.today_sales).toBe(0);
		expect(dashboard.payment_method_report.method_wise).toEqual([]);
		expect(dashboard.inventory_insights.fast_moving_pagination).toMatchObject({
			page: 1,
			page_size: 10,
			total_count: 0,
			total_pages: 0,
			search: "",
		});
		expect(dashboard.supplier_overview.summary.pending_amount).toBe(0);
	});

	it("merges partial backend payloads without dropping report fallback branches", () => {
		const dashboard = mergeDashboardPayload({
			enabled: false,
			sales_overview: {
				today_sales: 125,
			} as any,
			inventory_insights: {
				fast_moving_items: [{ item_code: "ITEM-001", item_name: "Item", sold_qty: 4 }],
			} as any,
			payment_method_report: {
				totals: {
					paid_amount: 250,
				},
			} as any,
		});

		expect(dashboard.enabled).toBe(false);
		expect(dashboard.sales_overview.today_sales).toBe(125);
		expect(dashboard.sales_overview.monthly_sales).toBe(0);
		expect(dashboard.payment_method_report.totals.invoice_count).toBe(0);
		expect(dashboard.payment_method_report.totals.paid_amount).toBe(250);
		expect(dashboard.payment_method_report.totals.cash_amount).toBe(0);
		expect(dashboard.inventory_insights.fast_moving_items).toHaveLength(1);
		expect(dashboard.inventory_insights.low_stock_items).toEqual([]);
		expect(dashboard.supplier_overview.purchase_summary).toEqual([]);
	});
});
