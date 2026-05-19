// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import BranchLocationSection from "../src/posapp/components/reports/components/BranchLocationSection.vue";
import CustomerReportSection from "../src/posapp/components/reports/components/CustomerReportSection.vue";
import DiscountVoidReturnSection from "../src/posapp/components/reports/components/DiscountVoidReturnSection.vue";
import FinanceSection from "../src/posapp/components/reports/components/FinanceSection.vue";
import InventoryInsightsSection from "../src/posapp/components/reports/components/InventoryInsightsSection.vue";
import InventoryStatusSection from "../src/posapp/components/reports/components/InventoryStatusSection.vue";
import PaymentBreakdownSection from "../src/posapp/components/reports/components/PaymentBreakdownSection.vue";
import ProductInsightsSection from "../src/posapp/components/reports/components/ProductInsightsSection.vue";
import ReorderSuggestionsSection from "../src/posapp/components/reports/components/ReorderSuggestionsSection.vue";
import SalesOverviewCards from "../src/posapp/components/reports/components/SalesOverviewCards.vue";
import SalesSummarySection from "../src/posapp/components/reports/components/SalesSummarySection.vue";
import SalesTrendSection from "../src/posapp/components/reports/components/SalesTrendSection.vue";
import StaffPerformanceSection from "../src/posapp/components/reports/components/StaffPerformanceSection.vue";
import StockMovementSection from "../src/posapp/components/reports/components/StockMovementSection.vue";
import SupplierPurchaseSection from "../src/posapp/components/reports/components/SupplierPurchaseSection.vue";

const BoxStub = defineComponent({
	inheritAttrs: false,
	setup(_, { attrs, slots }) {
		return () => h("div", attrs, slots.default?.());
	},
});

const TextFieldStub = defineComponent({
	inheritAttrs: false,
	emits: ["update:modelValue"],
	setup(_, { attrs, emit }) {
		return () =>
			h("input", {
				value: attrs.modelValue as string,
				"data-label": attrs.label as string,
				onInput: (event: Event) =>
					emit("update:modelValue", (event.target as HTMLInputElement).value),
			});
	},
});

const SelectStub = defineComponent({
	inheritAttrs: false,
	emits: ["update:modelValue"],
	setup(_, { attrs }) {
		return () => h("select", { "data-label": attrs.label as string });
	},
});

const PaginationStub = defineComponent({
	inheritAttrs: false,
	emits: ["update:modelValue"],
	setup(_, { attrs, emit }) {
		return () =>
			h(
				"button",
				{
					"data-pagination": String(attrs.length || ""),
					onClick: () => emit("update:modelValue", 2),
				},
				"pagination",
			);
	},
});

const mountOptions = {
	global: {
		components: {
			VCard: BoxStub,
			VChip: BoxStub,
			VCol: BoxStub,
			VIcon: BoxStub,
			VPagination: PaginationStub,
			VProgressLinear: BoxStub,
			VRow: BoxStub,
			VSelect: SelectStub,
			VSkeletonLoader: BoxStub,
			VTextField: TextFieldStub,
		},
	},
};

const formatMoney = (value: number) => `PKR ${value.toFixed(2)}`;
const formatQuantity = (value: number) => String(value);
const formatDate = (value?: string) => value || "-";
const formatPercent = (value?: number | null, digits = 1) =>
	typeof value === "number" ? `${value.toFixed(digits)}%` : "0.0%";
const formatDays = (value?: number | null) =>
	typeof value === "number" ? `${value.toFixed(1)} days` : "-";
const trendProgress = (value: number, maxValue: number) => (maxValue ? (value / maxValue) * 100 : 0);
const paymentCategoryColor = (category?: string) => (category === "cash" ? "success" : "info");

describe("Sales report sections", () => {
	beforeEach(() => {
		(window as any).__ = (value: string) => value;
	});

	it("renders sales overview metrics with formatted values", () => {
		const wrapper = mount(SalesOverviewCards, {
			...mountOptions,
			props: {
				formatMoney,
				metrics: [
					{
						key: "today_sales",
						label: "Today Sales",
						icon: "mdi-cart-outline",
						value: 1234.5,
						styleClass: "metric-card--sales",
					},
				],
			},
		});

		expect(wrapper.text()).toContain("Today Sales");
		expect(wrapper.text()).toContain("PKR 1234.50");
		expect(wrapper.text()).toContain("mdi-cart-outline");
	});

	it("renders summary metrics, snapshot state, and payment method chips", () => {
		const wrapper = mount(SalesSummarySection, {
			...mountOptions,
			props: {
				title: "Monthly Sales Summary",
				rangeLabelPrefix: "Month",
				rangeLabel: "2026-05-01 - 2026-05-18",
				hasClosingSnapshot: true,
				closingSnapshotLabel: "Closing Snapshot Available",
				liveSnapshotLabel: "Live Snapshot",
				metrics: [
					{ key: "invoice_count", label: "Invoices", value: "15" },
					{ key: "net_sales", label: "Net Sales", value: "PKR 9876.00" },
				],
				paymentMethods: [{ mode_of_payment: "Cash", category: "cash", amount: 600 }],
				formatMoney,
				paymentCategoryColor,
			},
		});

		expect(wrapper.text()).toContain("Monthly Sales Summary");
		expect(wrapper.text()).toContain("Month: 2026-05-01 - 2026-05-18");
		expect(wrapper.text()).toContain("Closing Snapshot Available");
		expect(wrapper.text()).toContain("Invoices");
		expect(wrapper.text()).toContain("Cash: PKR 600.00");
	});

	it("renders trend highlights and all trend panels", () => {
		const wrapper = mount(SalesTrendSection, {
			...mountOptions,
			props: {
				rangeLabel: "2026-05-01 - 2026-05-18",
				bestDayLabel: "2026-05-18 . PKR 900.00",
				bestHourLabel: "14:00 . PKR 500.00",
				growthChips: [{ key: "day", label: "Day Growth", value: "5.0%", color: "success" }],
				dayPoints: [{ date: "2026-05-18", sales: 900, invoice_count: 3 }],
				weekPoints: [{ label: "Week 20", week_start: "2026-05-11", week_end: "2026-05-18", sales: 1200 }],
				monthPoints: [{ month: "2026-05", label: "May 2026", sales: 9876, invoice_count: 15 }],
				hourPoints: [{ hour: 14, label: "14:00", sales: 500, invoice_count: 2 }],
				dayMax: 900,
				weekMax: 1200,
				monthMax: 9876,
				hourMax: 500,
				formatMoney,
				formatQuantity,
				formatDate,
				trendProgress,
			},
		});

		expect(wrapper.text()).toContain("Sales Trend Report");
		expect(wrapper.text()).toContain("Best Day: 2026-05-18 . PKR 900.00");
		expect(wrapper.text()).toContain("Peak Hour: 14:00 . PKR 500.00");
		expect(wrapper.text()).toContain("Day-wise (MTD)");
		expect(wrapper.text()).toContain("Week-wise");
		expect(wrapper.text()).toContain("Month-wise");
		expect(wrapper.text()).toContain("Hourly (Today)");
	});

	it("renders discount, void, and return totals with row breakdowns", () => {
		const wrapper = mount(DiscountVoidReturnSection, {
			...mountOptions,
			props: {
				rangeLabel: "2026-05-01 - 2026-05-18",
				totals: {
					discounted_invoice_count: 4,
					return_count: 2,
					void_count: 1,
					discount_amount: 55,
					return_amount: 120,
					void_amount: 30,
				},
				cashierRows: [
					{ cashier: "Ayesha", discount_amount: 15, return_amount: 20, void_amount: 5, return_count: 1, void_count: 1 },
				],
				topReturnItems: [
					{ item_code: "ITEM-1", item_name: "Coffee", return_amount: 80, return_qty: 2, return_invoice_count: 1, stock_uom: "Nos" },
				],
				dayRows: [{ date: "2026-05-18", discount_amount: 15, return_amount: 20, void_amount: 5, return_count: 1, void_count: 1 }],
				cashierMax: 40,
				returnItemMax: 80,
				dayMax: 40,
				formatMoney,
				formatQuantity,
				formatDate,
				trendProgress,
			},
		});

		expect(wrapper.text()).toContain("Discount / Void / Return Report");
		expect(wrapper.text()).toContain("Discount: PKR 55.00");
		expect(wrapper.text()).toContain("Ayesha");
		expect(wrapper.text()).toContain("Coffee");
		expect(wrapper.text()).toContain("Last 14 Days Activity");
	});

	it("renders payment totals, method rows, and paid versus pending day activity", () => {
		const wrapper = mount(PaymentBreakdownSection, {
			...mountOptions,
			props: {
				rangeLabel: "2026-05-01 - 2026-05-18",
				totals: {
					invoice_count: 15,
					pending_invoice_count: 2,
					partial_invoice_count: 1,
					unpaid_invoice_count: 1,
					collected_amount: 900,
					pending_amount: 100,
					cash_amount: 400,
					card_online_amount: 500,
					split_invoice_count: 3,
				},
				methodRows: [
					{ mode_of_payment: "Cash", category: "cash", amount: 400, invoice_count: 5, share_pct: 44.4 },
				],
				dayRows: [{ date: "2026-05-18", paid_amount: 900, pending_amount: 100, invoice_count: 4 }],
				dayMax: 1000,
				formatMoney,
				formatQuantity,
				formatDate,
				formatPercent,
				trendProgress,
			},
		});

		expect(wrapper.text()).toContain("Payment Method Report");
		expect(wrapper.text()).toContain("Collected: PKR 900.00");
		expect(wrapper.text()).toContain("Pending Invoices");
		expect(wrapper.text()).toContain("Partial");
		expect(wrapper.text()).toContain("Unpaid");
		expect(wrapper.text()).toContain("Cash");
		expect(wrapper.text()).toContain("Share: 44.4%");
		expect(wrapper.text()).toContain("Last 14 Days (Paid vs Pending)");
		expect(wrapper.text()).toContain("Pending: PKR 100.00");
	});

	it("renders staff summary, cashier sales, active cashiers, and risk rows", () => {
		const wrapper = mount(StaffPerformanceSection, {
			...mountOptions,
			props: {
				rangeLabel: "2026-05-01 - 2026-05-18",
				summary: {
					cashier_count: 2,
					invoice_count: 15,
					items_sold: 40,
					average_bill: 250,
					return_count: 1,
					void_count: 1,
					sales_amount: 1000,
					discount_amount: 30,
				},
				cashierRows: [
					{ cashier: "Ayesha", sales_amount: 700, invoice_count: 8, items_sold: 25, average_bill: 87.5 },
				],
				invoiceRows: [
					{ cashier: "Bilal", invoice_count: 9, sales_amount: 300, items_per_invoice: 2.5 },
				],
				riskRows: [
					{ cashier: "Ayesha", return_count: 1, void_count: 1, discount_amount: 30, return_amount: 20, void_amount: 10 },
				],
				salesMax: 700,
				formatMoney,
				formatQuantity,
				trendProgress,
			},
		});

		expect(wrapper.text()).toContain("Staff / Cashier Performance Report");
		expect(wrapper.text()).toContain("Sales: PKR 1000.00");
		expect(wrapper.text()).toContain("Cashiers");
		expect(wrapper.text()).toContain("Top Sales by Cashier");
		expect(wrapper.text()).toContain("Ayesha");
		expect(wrapper.text()).toContain("PKR 700.00");
		expect(wrapper.text()).toContain("Most Active Cashiers");
		expect(wrapper.text()).toContain("Bilal");
		expect(wrapper.text()).toContain("Items/Invoice: 2.50");
		expect(wrapper.text()).toContain("Returns / Voids / Discounts");
		expect(wrapper.text()).toContain("Discount: PKR 30.00");
	});

	it("renders customer summary, top customers, repeat customers, and recent activity", () => {
		const wrapper = mount(CustomerReportSection, {
			...mountOptions,
			props: {
				rangeLabel: "2026-05-01 - 2026-05-18",
				summary: {
					customer_count: 3,
					repeat_customer_count: 1,
					repeat_customer_rate_pct: 33.3,
					invoice_count: 12,
					sales_amount: 1500,
					average_basket_size: 125,
					average_purchase_frequency_days: 4.5,
				},
				topRows: [
					{ customer: "CUST-001", customer_name: "Acme Store", sales_amount: 900, invoice_count: 6, average_basket_size: 150 },
				],
				repeatRows: [
					{ customer: "CUST-002", customer_name: "Repeat Buyer", sales_amount: 400, invoice_count: 3, purchase_frequency_days: 2.25, last_purchase_date: "2026-05-18" },
				],
				recentRows: [
					{ customer: "CUST-003", customer_name: "Recent Buyer", sales_amount: 200, invoice_count: 2, return_count: 1, last_purchase_date: "2026-05-17" },
				],
				salesMax: 900,
				formatMoney,
				formatQuantity,
				formatDate,
				formatPercent,
				formatDays,
				trendProgress,
			},
		});

		expect(wrapper.text()).toContain("Customer Report");
		expect(wrapper.text()).toContain("Repeat Rate: 33.3%");
		expect(wrapper.text()).toContain("Customers");
		expect(wrapper.text()).toContain("Average Basket");
		expect(wrapper.text()).toContain("Top Customers");
		expect(wrapper.text()).toContain("Acme Store");
		expect(wrapper.text()).toContain("CUST-001 . Invoices: 6 . Avg Bill: PKR 150.00");
		expect(wrapper.text()).toContain("Repeat Customers");
		expect(wrapper.text()).toContain("Frequency: 2.3 days");
		expect(wrapper.text()).toContain("Recently Active Customers");
		expect(wrapper.text()).toContain("Recent Buyer");
		expect(wrapper.text()).toContain("Returns: 1");
	});

	it("renders profitability and tax charge reports", () => {
		const wrapper = mount(FinanceSection, {
			...mountOptions,
			props: {
				profitabilityRangeLabel: "2026-05-01 - 2026-05-18",
				topProfitItemLabel: "Coffee . PKR 500.00",
				lowestMarginItemLabel: "Tea . 12.5%",
				profitabilitySummary: {
					revenue: 2000,
					cogs: 1200,
					gross_profit: 800,
					gross_margin_pct: 40,
					invoice_count: 10,
					average_invoice_profit: 80,
				},
				profitabilityItemRows: [
					{ item_code: "ITEM-1", item_name: "Coffee", revenue: 1000, cogs: 500, gross_profit: 500, gross_margin_pct: 50 },
				],
				profitabilityCategoryRows: [
					{ category: "Drinks", label: "Drinks", revenue: 1500, gross_profit: 600, gross_margin_pct: 40, item_count: 2 },
				],
				profitabilityDayRows: [
					{ date: "2026-05-18", revenue: 500, cogs: 250, gross_profit: 250, invoice_count: 3 },
				],
				profitabilityItemMax: 500,
				profitabilityDayMax: 250,
				taxChargesRangeLabel: "2026-05-01 - 2026-05-18",
				topTaxHeadLabel: "VAT",
				topChargeHeadLabel: "Service Charge",
				taxChargesTotals: {
					invoice_count: 10,
					return_invoice_count: 1,
					taxable_amount: 1800,
					tax_amount: 180,
					service_charge_amount: 50,
					fee_amount: 20,
					round_off_amount: 1,
					invoice_adjustment_amount: 5,
					total_charge_amount: 256,
				},
				taxHeadRows: [{ label: "VAT", amount: 180, invoice_count: 10, share_pct: 70.3 }],
				chargeHeadRows: [{ label: "Service Charge", category: "service", amount: 50, invoice_count: 4, share_pct: 19.5 }],
				taxChargesDayRows: [
					{ date: "2026-05-18", tax_amount: 80, service_charge_amount: 20, fee_amount: 5, other_charge_amount: 2, total_charge_amount: 107, invoice_count: 3 },
				],
				taxDayMax: 107,
				formatMoney,
				formatQuantity,
				formatDate,
				formatPercent,
				trendProgress,
			},
		});

		expect(wrapper.text()).toContain("Profitability Report");
		expect(wrapper.text()).toContain("Top Profit Item: Coffee . PKR 500.00");
		expect(wrapper.text()).toContain("Revenue");
		expect(wrapper.text()).toContain("PKR 2000.00");
		expect(wrapper.text()).toContain("Item-wise Profitability");
		expect(wrapper.text()).toContain("Coffee");
		expect(wrapper.text()).toContain("Category-wise Margin");
		expect(wrapper.text()).toContain("Last 14 Days Gross Profit");
		expect(wrapper.text()).toContain("Tax / Charges Report");
		expect(wrapper.text()).toContain("Top Tax Head: VAT");
		expect(wrapper.text()).toContain("Taxable Amount");
		expect(wrapper.text()).toContain("Tax Heads");
		expect(wrapper.text()).toContain("Share: 70.3%");
		expect(wrapper.text()).toContain("Charge Heads");
		expect(wrapper.text()).toContain("Category: service");
		expect(wrapper.text()).toContain("Last 14 Days Tax/Charges");
		expect(wrapper.text()).toContain("Charges: PKR 27.00");
	});

	it("renders branch location summary, performance, and top item rows", () => {
		const wrapper = mount(BranchLocationSection, {
			...mountOptions,
			props: {
				rangeLabel: "2026-05-01 - 2026-05-18",
				summary: {
					location_count: 2,
					total_sales: 2500,
					total_profit: 600,
					total_invoices: 20,
					total_stock_qty: 150,
					low_stock_total: 4,
					cashier_count: 3,
				},
				locationRows: [
					{
						profile: "Main POS",
						warehouse: "Main Warehouse",
						sales_amount: 1500,
						invoice_count: 12,
						average_bill: 125,
						profit_amount: 350,
						stock_qty: 90,
						low_stock_count: 2,
					},
				],
				topItemsByLocation: [
					{
						profile: "Main POS",
						warehouse: "Main Warehouse",
						items: [{ item_code: "ITEM-1", item_name: "Coffee", sales_amount: 700 }],
					},
					{
						profile: "Second POS",
						warehouse: "Second Warehouse",
						items: [],
					},
				],
				salesMax: 1500,
				formatMoney,
				formatQuantity,
				trendProgress,
			},
		});

		expect(wrapper.text()).toContain("Branch / Location-wise Report");
		expect(wrapper.text()).toContain("Locations: 2");
		expect(wrapper.text()).toContain("Sales: PKR 2500.00");
		expect(wrapper.text()).toContain("Low Stock Total");
		expect(wrapper.text()).toContain("Location Performance");
		expect(wrapper.text()).toContain("Main POS");
		expect(wrapper.text()).toContain("Warehouse: Main Warehouse . Invoices: 12 . Avg Bill: PKR 125.00");
		expect(wrapper.text()).toContain("Profit: PKR 350.00 . Stock: 90 . Low Stock: 2");
		expect(wrapper.text()).toContain("Top Items by Location");
		expect(wrapper.text()).toContain("Coffee: PKR 700.00");
		expect(wrapper.text()).toContain("No top items found for this location.");
	});

	it("renders product item sales and category brand variant reports", () => {
		const wrapper = mount(ProductInsightsSection, {
			...mountOptions,
			props: {
				itemSalesRangeLabel: "2026-05-01 - 2026-05-18",
				itemSalesBestSellerLabel: "Coffee . 12",
				itemSalesTopMarginLabel: "Coffee . PKR 500.00",
				itemSalesTopDiscountLabel: "Tea . PKR 75.00",
				itemSalesItems: [
					{
						item_code: "ITEM-1",
						item_name: "Coffee",
						sales_amount: 1200,
						sold_qty: 12,
						stock_uom: "Nos",
						estimated_margin: 500,
						estimated_margin_pct: 41.67,
						discount_amount: 25,
						discount_frequency_pct: 8.5,
					},
				],
				itemSalesMaxSales: 1200,
				categoryVariantRangeLabel: "2026-05-01 - 2026-05-18",
				topCategoryLabel: "Drinks . PKR 2000.00",
				topBrandLabel: "House . PKR 1500.00",
				topVariantLabel: "Coffee Parent . PKR 900.00",
				categorySalesPoints: [{ category: "Drinks", label: "Drinks", sales_amount: 2000, item_count: 4 }],
				brandSalesPoints: [{ brand: "House", label: "House", sales_amount: 1500, item_count: 3 }],
				variantSalesPoints: [
					{ variant_of: "COFFEE-PARENT", label: "Coffee Parent", sales_amount: 900, variant_item_count: 2 },
				],
				attributeSalesPoints: [
					{ attribute: "Size", attribute_value: "Large", label: "Size: Large", sales_amount: 700, item_count: 2 },
				],
				categorySalesMax: 2000,
				brandSalesMax: 1500,
				variantSalesMax: 900,
				attributeSalesMax: 700,
				formatMoney,
				formatQuantity,
				formatPercent,
				trendProgress,
			},
		});

		expect(wrapper.text()).toContain("Item / Product Sales Report");
		expect(wrapper.text()).toContain("Best Seller: Coffee . 12");
		expect(wrapper.text()).toContain("Coffee");
		expect(wrapper.text()).toContain("ITEM-1 . Qty: 12 Nos");
		expect(wrapper.text()).toContain("Margin: PKR 500.00 (41.7%) . Discount: PKR 25.00 (8.5%)");
		expect(wrapper.text()).toContain("Category / Brand / Variant Report");
		expect(wrapper.text()).toContain("Top Category: Drinks . PKR 2000.00");
		expect(wrapper.text()).toContain("Category-wise");
		expect(wrapper.text()).toContain("Brand-wise");
		expect(wrapper.text()).toContain("Variant-wise");
		expect(wrapper.text()).toContain("Attributes (Size/Color)");
		expect(wrapper.text()).toContain("Items: 4");
		expect(wrapper.text()).toContain("Variants: 2");
		expect(wrapper.text()).toContain("Size: Large");
	});

	it("renders inventory status summary and item exception panels", () => {
		const wrapper = mount(InventoryStatusSection, {
			...mountOptions,
			props: {
				rangeLabel: "2026-05-01 - 2026-05-18",
				threshold: 8,
				summary: {
					total_items: 20,
					total_stock_qty: 300,
					low_stock_count: 3,
					out_of_stock_count: 1,
					negative_stock_count: 1,
					slow_moving_count: 2,
					dead_stock_count: 1,
				},
				lowStockItems: [{ item_code: "LOW-1", item_name: "Low Item", actual_qty: 4 }],
				outOfStockItems: [{ item_code: "OUT-1", item_name: "Out Item", actual_qty: 0 }],
				negativeItems: [{ item_code: "NEG-1", item_name: "Negative Item", actual_qty: -2 }],
				slowMovingItems: [{ item_code: "SLOW-1", item_name: "Slow Item", actual_qty: 40, sold_qty: 1, stock_cover_days: 40 }],
				deadStockItems: [{ item_code: "DEAD-1", item_name: "Dead Item", actual_qty: 25 }],
				lowMax: 4,
				negativeMax: 2,
				slowMax: 40,
				deadMax: 25,
				formatQuantity,
				formatDays,
				trendProgress,
			},
		});

		expect(wrapper.text()).toContain("Inventory Status Report");
		expect(wrapper.text()).toContain("Low Stock Threshold: 8");
		expect(wrapper.text()).toContain("Total Items");
		expect(wrapper.text()).toContain("20");
		expect(wrapper.text()).toContain("Low Stock Items");
		expect(wrapper.text()).toContain("Low Item");
		expect(wrapper.text()).toContain("Out of Stock Items");
		expect(wrapper.text()).toContain("Out Item");
		expect(wrapper.text()).toContain("Negative Stock Items");
		expect(wrapper.text()).toContain("Negative Item");
		expect(wrapper.text()).toContain("Slow Moving Items");
		expect(wrapper.text()).toContain("Stock: 40 . Sold: 1");
		expect(wrapper.text()).toContain("Dead Stock Items");
		expect(wrapper.text()).toContain("Dead Item");
	});

	it("renders stock movement summary, day rows, and recent entries", () => {
		const wrapper = mount(StockMovementSection, {
			...mountOptions,
			props: {
				rangeLabel: "2026-05-01 - 2026-05-18",
				summary: {
					movement_count: 5,
					net_qty: -3,
					net_value: -150,
				},
				incomingQty: 7,
				outgoingQty: 10,
				dayRows: [{ date: "2026-05-18", incoming: 7, outgoing: 10, net: -3, movement_count: 5 }],
				recentRows: [
					{
						posting_date: "2026-05-18",
						item_code: "ITEM-1",
						item_name: "Coffee",
						qty: -2,
						category: "sale",
						direction: "Out",
						warehouse: "Main Warehouse",
						voucher_type: "Sales Invoice",
						voucher_no: "SINV-001",
					},
				],
				dayMax: 17,
				formatMoney,
				formatQuantity,
				formatSignedQuantity: (value: number) => (value > 0 ? `+${value}` : String(value)),
				formatDate,
				formatMovementCategory: (value?: string) => (value === "sale" ? "Sale" : "Other"),
				trendProgress,
			},
		});

		expect(wrapper.text()).toContain("Stock Movement Report");
		expect(wrapper.text()).toContain("Movements");
		expect(wrapper.text()).toContain("Total Out");
		expect(wrapper.text()).toContain("10");
		expect(wrapper.text()).toContain("Total In");
		expect(wrapper.text()).toContain("7");
		expect(wrapper.text()).toContain("Net Qty");
		expect(wrapper.text()).toContain("-3");
		expect(wrapper.text()).toContain("Net Value");
		expect(wrapper.text()).toContain("PKR -150.00");
		expect(wrapper.text()).toContain("Day-wise Movement");
		expect(wrapper.text()).toContain("In: 7 . Out: 10 . Entries: 5");
		expect(wrapper.text()).toContain("Recent Movement Entries");
		expect(wrapper.text()).toContain("Coffee");
		expect(wrapper.text()).toContain("Sale . Out");
		expect(wrapper.text()).toContain("Main Warehouse . Sales Invoice SINV-001");
	});

	it("renders inventory insights filters, fast moving rows, and low stock rows", () => {
		const wrapper = mount(InventoryInsightsSection, {
			...mountOptions,
			props: {
				loading: false,
				fastMovingRangeLabel: "2026-05-01 - 2026-05-18 (18 days)",
				fastMovingTotalCount: 2,
				fastMovingSearchInput: "",
				fastMovingPageSize: 10,
				fastMovingPageSizeItems: [
					{ label: "10", value: 10 },
					{ label: "20", value: 20 },
				],
				fastMovingItems: [
					{ item_code: "FAST-1", item_name: "Coffee", sold_qty: 15, stock_uom: "Nos" },
				],
				fastMovingTotalPages: 2,
				fastMovingPage: 1,
				lowStockThreshold: 8,
				lowStockSearch: "",
				lowStockWarehouseFilter: "",
				lowStockWarehouseItems: [
					{ label: "All Warehouses", value: "" },
					{ label: "Main Warehouse", value: "Main Warehouse" },
				],
				lowStockItems: [
					{ item_code: "LOW-1", item_name: "Tea", actual_qty: 3, stock_uom: "Nos", warehouse: "Main Warehouse" },
				],
				formatQuantity,
				progressFromQuantity: (quantity: number) => quantity * 2,
				stockChipColor: (quantity: number) => (quantity <= 0 ? "error" : "warning"),
			},
		});

		expect(wrapper.text()).toContain("Fast Moving Items");
		expect(wrapper.text()).toContain("Age Bracket: 2026-05-01 - 2026-05-18 (18 days)");
		expect(wrapper.text()).toContain("Total: 2");
		expect(wrapper.text()).toContain("Coffee");
		expect(wrapper.text()).toContain("15 Nos");
		expect(wrapper.text()).toContain("Low Stock Alerts");
		expect(wrapper.text()).toContain("Threshold: 8");
		expect(wrapper.text()).toContain("Tea");
		expect(wrapper.text()).toContain("LOW-1 . Main Warehouse");

		expect(wrapper.find('input[data-label="Search item"]').exists()).toBe(true);
		expect(wrapper.find('input[data-label="Search item / code"]').exists()).toBe(true);
		expect(wrapper.find("button[data-pagination='2']").exists()).toBe(true);
	});

	it("renders reorder purchase suggestion summary and rows", () => {
		const wrapper = mount(ReorderSuggestionsSection, {
			...mountOptions,
			props: {
				rangeLabel: "2026-05-01 - 2026-05-18",
				summary: {
					critical_count: 1,
					high_count: 2,
					total_suggested_qty: 40,
					estimated_purchase_value: 5000,
				},
				suggestions: [
					{
						item_code: "ITEM-LOW",
						item_name: "Low Coffee",
						urgency: "critical",
						current_qty: 2,
						suggested_qty: 20,
						avg_daily_sales: 3.5,
						lead_time_days: 4,
						stock_cover_days: 1.2,
						supplier: "Bean Supplier",
						estimated_purchase_value: 2500,
					},
				],
				formatMoney,
				formatQuantity,
				formatDays,
				urgencyLabel: (value?: string) => (value === "critical" ? "Critical" : "Other"),
				urgencyColor: (value?: string) => (value === "critical" ? "error" : "secondary"),
			},
		});

		expect(wrapper.text()).toContain("Reorder / Purchase Suggestions");
		expect(wrapper.text()).toContain("Critical: 1");
		expect(wrapper.text()).toContain("High: 2");
		expect(wrapper.text()).toContain("Suggested Qty: 40");
		expect(wrapper.text()).toContain("Est. Purchase: PKR 5000.00");
		expect(wrapper.text()).toContain("Low Coffee");
		expect(wrapper.text()).toContain("Critical");
		expect(wrapper.text()).toContain("ITEM-LOW . Current: 2 . Suggested: 20");
		expect(wrapper.text()).toContain("Daily Sales: 3.5 . Lead Time: 4.0 days . Cover: 1.2 days");
		expect(wrapper.text()).toContain("Supplier: Bean Supplier . Est. Value: PKR 2500.00");
	});

	it("renders supplier purchase summary, risk, day panels, and detail rows", () => {
		const wrapper = mount(SupplierPurchaseSection, {
			...mountOptions,
			props: {
				loading: false,
				rangeLabel: "2026-05-01 - 2026-05-18",
				topSupplierLabel: "Bean Supplier",
				topPendingSupplierLabel: "Milk Supplier",
				supplierSearch: "",
				summary: {
					supplier_count: 2,
					purchase_count: 5,
					purchase_amount: 9000,
					paid_amount: 6000,
					pending_amount: 3000,
					avg_invoice_value: 1800,
					pending_ratio_pct: 33.33,
				},
				supplierRows: [
					{
						supplier: "SUP-001",
						supplier_name: "Bean Supplier",
						purchase_amount: 7000,
						purchase_count: 4,
						share_pct: 77.7,
						avg_invoice_value: 1750,
						last_purchase_date: "2026-05-18",
						paid_amount: 5000,
						pending_amount: 2000,
						pending_ratio_pct: 28.5,
					},
				],
				riskRows: [
					{
						supplier: "SUP-002",
						supplier_name: "Milk Supplier",
						pending_amount: 3000,
						pending_ratio_pct: 60,
						purchase_amount: 5000,
					},
				],
				dayRows: [
					{ date: "2026-05-18", purchase_amount: 4000, purchase_count: 2, pending_amount: 1000 },
				],
				purchaseMax: 7000,
				pendingMax: 3000,
				dayMax: 4000,
				formatMoney,
				formatQuantity,
				formatPercent,
				formatDate,
				trendProgress,
			},
		});

		expect(wrapper.text()).toContain("Supplier Purchase Summary");
		expect(wrapper.text()).toContain("Top Supplier: Bean Supplier");
		expect(wrapper.text()).toContain("Top Pending: Milk Supplier");
		expect(wrapper.text()).toContain("Suppliers");
		expect(wrapper.text()).toContain("Purchase Amount");
		expect(wrapper.text()).toContain("PKR 9000.00");
		expect(wrapper.text()).toContain("Top Suppliers by Spend");
		expect(wrapper.text()).toContain("Bean Supplier");
		expect(wrapper.text()).toContain("Invoices: 4 . Share: 77.7%");
		expect(wrapper.text()).toContain("Pending Exposure");
		expect(wrapper.text()).toContain("Milk Supplier");
		expect(wrapper.text()).toContain("Pending Ratio: 60.0% . Total Purchase: PKR 5000.00");
		expect(wrapper.text()).toContain("Last 14 Days Purchases");
		expect(wrapper.text()).toContain("Invoices: 2 . Pending: PKR 1000.00");
		expect(wrapper.text()).toContain("Detailed Supplier Breakdown");
		expect(wrapper.text()).toContain("Avg Invoice: PKR 1750.00 . Last: 2026-05-18");
		expect(wrapper.find('input[data-label="Search supplier"]').exists()).toBe(true);
	});
});
