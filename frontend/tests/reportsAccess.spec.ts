// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import type { DashboardResponse } from "../src/posapp/services/dashboardService";

vi.mock("../src/posapp/services/dashboardService", () => ({
	fetchDashboardData: vi.fn(async () => ({
		enabled: false,
		disabled_reason: "profile_disabled",
		sales_overview: {},
	})),
}));

import Reports from "../src/posapp/components/reports/Reports.vue";
import { fetchDashboardData } from "../src/posapp/services/dashboardService";
import { useEmployeeStore } from "../src/posapp/stores/employeeStore";
import { useUIStore } from "../src/posapp/stores/uiStore";

const BoxStub = defineComponent({
	inheritAttrs: false,
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

const ButtonStub = defineComponent({
	inheritAttrs: false,
	emits: ["click"],
	setup(_, { slots, emit }) {
		return () => h("button", { onClick: () => emit("click") }, slots.default?.());
	},
});

const flushPromises = async () => {
	for (let index = 0; index < 5; index += 1) {
		await Promise.resolve();
	}
	await nextTick();
};

const currentMonthToken = () => {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const dashboardFixture = (): DashboardResponse =>
	({
		enabled: true,
		scope: "all",
		default_scope: "all",
		allow_all_profiles: true,
		selected_profiles: ["Main POS"],
		available_profiles: [
			{
				name: "Main POS",
				warehouse: "Stores - A",
				currency: "PKR",
				dashboard_enabled: true,
			},
		],
		currency: "PKR",
		date_context: {
			today: "2026-05-18",
			month_start: "2026-05-01",
			report_month: "2026-05",
		},
		sales_overview: {
			today_sales: 1234.5,
			today_profit: 210,
			monthly_sales: 9876,
			monthly_profit: 765,
			profit_method: "invoice_item",
		},
		daily_sales_summary: {
			period: {
				from: "2026-05-18",
				to: "2026-05-18",
			},
			invoice_count: 3,
			average_invoice_value: 411.5,
			net_sales: 1234.5,
			payment_methods: [
				{
					mode_of_payment: "Cash",
					category: "cash",
					amount: 600,
				},
			],
		},
		monthly_sales_summary: {
			period: {
				from: "2026-05-01",
				to: "2026-05-18",
			},
			invoice_count: 15,
			average_invoice_value: 658.4,
			net_sales: 9876,
			payment_methods: [
				{
					mode_of_payment: "Card",
					category: "card_online",
					amount: 9276,
				},
			],
		},
		payment_method_report: {
			period: {
				from: "2026-05-01",
				to: "2026-05-18",
			},
			totals: {
				invoice_count: 15,
				collected_amount: 9876,
				cash_amount: 600,
				card_online_amount: 9276,
			},
			method_wise: [
				{
					mode_of_payment: "Cash",
					category: "cash",
					amount: 600,
					invoice_count: 3,
					share_pct: 6.1,
				},
			],
			day_wise: [
				{
					date: "2026-05-18",
					invoice_count: 3,
					paid_amount: 600,
					pending_amount: 0,
				},
			],
		},
		inventory_status_report: {
			period: {
				from: "2026-05-01",
				to: "2026-05-18",
			},
			threshold: 8,
			summary: {
				total_items: 42,
				total_stock_qty: 128,
				low_stock_count: 4,
				out_of_stock_count: 1,
				negative_stock_count: 0,
				slow_moving_count: 2,
				dead_stock_count: 1,
			},
			low_stock_items: [
				{
					item_code: "ITEM-001",
					item_name: "Test Tea",
					actual_qty: 3,
					stock_uom: "Nos",
				},
			],
		},
		inventory_insights: {
			fast_moving_items: [
				{
					item_code: "ITEM-FAST",
					item_name: "Fast Coffee",
					stock_uom: "Nos",
					sold_qty: 12,
					sales_amount: 1200,
				},
			],
			fast_moving_pagination: {
				page: 1,
				page_size: 10,
				total_count: 1,
				total_pages: 1,
				search: "",
			},
			low_stock_items: [
				{
					item_code: "ITEM-LOW",
					item_name: "Low Sugar",
					actual_qty: 2,
					warehouse: "Stores - A",
				},
			],
			low_stock_threshold: 8,
		},
		supplier_overview: {
			summary: {
				supplier_count: 1,
				purchase_count: 2,
				purchase_amount: 5000,
				paid_amount: 3500,
				pending_amount: 1500,
				avg_invoice_value: 2500,
				pending_ratio_pct: 30,
			},
			purchase_summary: [
				{
					supplier: "SUP-001",
					supplier_name: "Acme Supplies",
					purchase_count: 2,
					purchase_amount: 5000,
					share_pct: 100,
				},
			],
			risk_suppliers: [
				{
					supplier: "SUP-001",
					supplier_name: "Acme Supplies",
					purchase_count: 2,
					purchase_amount: 5000,
					pending_amount: 1500,
					pending_ratio_pct: 30,
				},
			],
			day_wise: [
				{
					date: "2026-05-18",
					purchase_count: 2,
					purchase_amount: 5000,
					paid_amount: 3500,
					pending_amount: 1500,
				},
			],
			highlights: {
				top_supplier: {
					supplier: "SUP-001",
					supplier_name: "Acme Supplies",
					purchase_count: 2,
					purchase_amount: 5000,
				},
				top_pending_supplier: {
					supplier: "SUP-001",
					supplier_name: "Acme Supplies",
					purchase_count: 2,
					purchase_amount: 5000,
					pending_amount: 1500,
				},
			},
			period: {
				from: "2026-05-01",
				to: "2026-05-18",
			},
		},
	}) as DashboardResponse;

const mountReports = () =>
	mount(Reports, {
		global: {
			components: {
				VAlert: BoxStub,
				VBtn: ButtonStub,
				VCard: BoxStub,
				VChip: BoxStub,
				VCol: BoxStub,
				VContainer: BoxStub,
				VIcon: BoxStub,
				VPagination: BoxStub,
				VProgressLinear: BoxStub,
				VRow: BoxStub,
				VSelect: BoxStub,
				VSkeletonLoader: BoxStub,
				VTab: BoxStub,
				VTabs: BoxStub,
				VTextField: BoxStub,
			},
		},
	});

describe("Reports supervisor gating", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
		vi.stubGlobal("__", (value: string) => value);
		vi.stubGlobal("get_currency_symbol", (currency: string) => currency);
		const uiStore = useUIStore();
		uiStore.setPosProfile({
			name: "Main POS",
			currency: "PKR",
			posa_low_stock_alert_threshold: 8,
		} as any);
	});

	it("blocks non-supervisors from loading the dashboard", async () => {
		const employeeStore = useEmployeeStore();
		employeeStore.setCurrentCashier({
			user: "cashier@example.com",
			full_name: "Main Cashier",
			is_supervisor: false,
		});

		const wrapper = mountReports();

		await flushPromises();

		expect(fetchDashboardData).not.toHaveBeenCalled();
		expect(wrapper.text()).toContain("POS supervisor");
		expect(wrapper.text()).not.toContain("Today Sales");
	});

	it("allows supervisors to request dashboard data", async () => {
		const employeeStore = useEmployeeStore();
		employeeStore.setCurrentCashier({
			user: "supervisor@example.com",
			full_name: "Supervisor",
			is_supervisor: true,
		});

		mountReports();

		await flushPromises();

		expect(fetchDashboardData).toHaveBeenCalledWith(
			expect.objectContaining({
				pos_profile: "Main POS",
			}),
		);
	});

	it("renders supervisor dashboard tabs and refresh action", async () => {
		vi.mocked(fetchDashboardData).mockResolvedValue(dashboardFixture());
		const employeeStore = useEmployeeStore();
		employeeStore.setCurrentCashier({
			user: "supervisor@example.com",
			full_name: "Supervisor",
			is_supervisor: true,
		});

		const wrapper = mountReports();

		await flushPromises();

		expect(wrapper.text()).toContain("Sales");
		expect(wrapper.text()).toContain("Staff");
		expect(wrapper.text()).toContain("Customers");
		expect(wrapper.text()).toContain("Finance");
		expect(wrapper.text()).toContain("Branches");
		expect(wrapper.text()).toContain("Products");
		expect(wrapper.text()).toContain("Inventory");
		expect(wrapper.text()).toContain("Procurement");
		expect(wrapper.text()).toContain("Refresh");
	});

	it("loads the dashboard with POS Profile scope, report month, limits, and fast-moving params", async () => {
		vi.mocked(fetchDashboardData).mockResolvedValue(dashboardFixture());
		const employeeStore = useEmployeeStore();
		employeeStore.setCurrentCashier({
			user: "supervisor@example.com",
			full_name: "Supervisor",
			is_supervisor: true,
		});

		mountReports();

		await flushPromises();

		expect(fetchDashboardData).toHaveBeenCalledWith(
			expect.objectContaining({
				pos_profile: "Main POS",
				scope: "all",
				profile_filter: undefined,
				report_month: currentMonthToken(),
				low_stock_threshold: 8,
				item_sales_limit: 20,
				category_report_limit: 12,
				inventory_status_limit: 20,
				stock_movement_limit: 20,
				reorder_suggestion_limit: 25,
				payment_report_limit: 20,
				discount_report_limit: 20,
				customer_report_limit: 20,
				staff_report_limit: 20,
				profitability_report_limit: 20,
				branch_report_limit: 20,
				tax_report_limit: 20,
				fast_moving_page: 1,
				fast_moving_page_size: 10,
				fast_moving_search: undefined,
			}),
		);
	});

	it("renders loaded sales, payment, inventory, and supplier fixture data", async () => {
		vi.mocked(fetchDashboardData).mockResolvedValue(dashboardFixture());
		const employeeStore = useEmployeeStore();
		employeeStore.setCurrentCashier({
			user: "supervisor@example.com",
			full_name: "Supervisor",
			is_supervisor: true,
		});

		const wrapper = mountReports();

		await flushPromises();

		expect(wrapper.text()).toContain("Today Sales");
		expect(wrapper.text()).toContain("PKR 1,234.50");
		expect(wrapper.text()).toContain("Payment Method Report");
		expect(wrapper.text()).toContain("Cash");
		expect(wrapper.text()).toContain("Inventory Status Report");
		expect(wrapper.text()).toContain("Total Items");
		expect(wrapper.text()).toContain("42");
		expect(wrapper.text()).toContain("Supplier Purchase Summary");
		expect(wrapper.text()).toContain("Acme Supplies");
	});

	it("renders the dashboard error alert when loading fails", async () => {
		vi.mocked(fetchDashboardData).mockRejectedValue(new Error("Dashboard service failed"));
		const employeeStore = useEmployeeStore();
		employeeStore.setCurrentCashier({
			user: "supervisor@example.com",
			full_name: "Supervisor",
			is_supervisor: true,
		});

		const wrapper = mountReports();

		await flushPromises();

		expect(wrapper.text()).toContain("Dashboard service failed");
	});
});
