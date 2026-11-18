// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";

vi.mock("../src/posapp/stores/toastStore", () => ({
	useToastStore: () => ({
		show: vi.fn(),
	}),
}));

vi.mock("../src/posapp/composables/pos/shared/useStockUtils", () => ({
	useStockUtils: () => ({
		calc_stock_qty: vi.fn(),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useItemAddition", () => ({
	useItemAddition: () => ({
		removeItem: vi.fn(),
		addItem: vi.fn(),
	}),
}));

vi.mock("../src/offline/index", () => ({
	getCachedDeliveryCharges: vi.fn(() => []),
	saveDeliveryChargesCache: vi.fn(),
}));

describe("useInvoiceItems column preferences", () => {
	beforeEach(() => {
		vi.resetModules();
		setActivePinia(createPinia());
		localStorage.clear();
		(window as any).__ = (value: string) => value;
		(globalThis as any).__ = (value: string) => value;
		(globalThis as any).flt = (value: any) => Number(value || 0);
		(window as any).frappe = {
			defaults: {
				get_default: vi.fn(() => "2"),
			},
			datetime: {
				nowdate: vi.fn(() => "2026-07-10"),
			},
		};
		(globalThis as any).frappe = (window as any).frappe;
	});

	it("updates optional cart columns and persists only valid optional keys", async () => {
		const { useInvoiceItems } = await import(
			"../src/posapp/composables/pos/invoice/useInvoiceItems"
		);
		const invoiceItems = useInvoiceItems(ref("Invoice"));

		invoiceItems.setSelectedColumns([
			"uom",
			"price_list_rate",
			"item_name",
			"discount_value",
			"unknown_column",
		]);
		invoiceItems.saveColumnPreferences();

		expect(invoiceItems.selected_columns.value).toEqual([
			"uom",
			"price_list_rate",
			"discount_percentage",
		]);
		expect(
			invoiceItems.items_headers.value.map((column) => column.key),
		).toEqual(
			expect.arrayContaining([
				"item_name",
				"qty",
				"uom",
				"price_list_rate",
				"discount_percentage",
				"rate",
				"amount",
				"actions",
			]),
		);
		expect(localStorage.getItem("posawesome_selected_columns")).toBe(
			JSON.stringify(["uom", "price_list_rate", "discount_percentage"]),
		);
	});
	it("previews visibility in the workspace editor without hiding required columns or saving on cancel", async () => {
		const { useInvoiceItems } = await import(
			"../src/posapp/composables/pos/invoice/useInvoiceItems"
		);
		const { workspaceCustomization: workspace } = await import(
			"../src/posapp/composables/core/workspaceCustomization"
		);
		let invoiceItems!: ReturnType<typeof useInvoiceItems>;
		const wrapper = mount(
			defineComponent({
				setup() {
					invoiceItems = useInvoiceItems(ref("Invoice"));
					return () => h("div");
				},
			}),
		);
		workspace.open("invoice");
		const visibility = workspace.participants.value.find(
			(part) => part.kind === "visibility",
		)!;
		visibility.setVisible?.("uom", true);
		visibility.setVisible?.("item_name", false);
		expect(
			invoiceItems.items_headers.value.map((column) => column.key),
		).toContain("uom");
		expect(
			invoiceItems.items_headers.value.map((column) => column.key),
		).toContain("item_name");
		expect(localStorage.getItem("posawesome_selected_columns")).toBeNull();
		workspace.cancel();
		expect(invoiceItems.selected_columns.value).toEqual([]);
		workspace.open("invoice");
		visibility.setVisible?.("uom", true);
		expect(workspace.apply()).toBe(true);
		expect(
			JSON.parse(localStorage.getItem("posawesome_selected_columns")!),
		).toEqual(["uom"]);
		wrapper.unmount();
	});
});
