// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

const toastShow = vi.fn();
const calcStockQty = vi.fn((item: any, value: number) => {
	item.stock_qty = Number(item.conversion_factor || 1) * Number(value || 0);
});

vi.mock("../src/posapp/stores/toastStore", () => ({
	useToastStore: () => ({
		show: toastShow,
	}),
}));

vi.mock("../src/posapp/composables/pos/shared/useStockUtils", () => ({
	useStockUtils: () => ({
		calc_stock_qty: calcStockQty,
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

describe("useInvoiceItems stock quantity limits", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		setActivePinia(createPinia());
		(window as any).__ = (value: string) => value;
		(globalThis as any).__ = (value: string) => value;
		(globalThis as any).flt = (value: any, precision = 2) => {
			const numeric = Number(value);
			return Number.isFinite(numeric) ? Number(numeric.toFixed(precision)) : 0;
		};
		(window as any).frappe = {
			defaults: {
				get_default: vi.fn(() => "2"),
			},
			datetime: {
				nowdate: vi.fn(() => "2026-05-07"),
			},
		};
		(globalThis as any).frappe = (window as any).frappe;
	});

	it("clamps manual cart quantity to available stock when block sale is enabled", async () => {
		const { useUIStore } = await import("../src/posapp/stores/uiStore");
		const { useInvoiceItems } = await import(
			"../src/posapp/composables/pos/invoice/useInvoiceItems"
		);
		const uiStore = useUIStore();
		uiStore.setPosProfile({
			name: "POS-1",
			posa_validate_stock: 0,
			posa_block_sale_beyond_available_qty: 1,
		} as any);
		uiStore.setStockSettings({ allow_negative_stock: 0 } as any);

		const invoiceItems = useInvoiceItems(ref("Invoice"));
		const item = {
			item_code: "ITEM-1",
			item_name: "Item 1",
			qty: 1,
			conversion_factor: 1,
			is_stock_item: 1,
			_base_actual_qty: 5,
		};

		const parsed = invoiceItems.setFormatedQty(item, "qty", null, false, 9);

		expect(parsed).toBe(5);
		expect(item.qty).toBe(5);
		expect(item.max_qty).toBe(5);
		expect(item.disable_increment).toBe(true);
		expect(calcStockQty).toHaveBeenCalledWith(item, 5);
		expect(toastShow).toHaveBeenCalledWith(
			expect.objectContaining({ color: "error" }),
		);
	});

	it("allows manual cart quantity and plus increments beyond stock when negative stock is enabled and block sale is off", async () => {
		const { useUIStore } = await import("../src/posapp/stores/uiStore");
		const { useInvoiceItems } = await import(
			"../src/posapp/composables/pos/invoice/useInvoiceItems"
		);
		const uiStore = useUIStore();
		uiStore.setPosProfile({
			name: "POS-1",
			posa_validate_stock: 1,
			posa_block_sale_beyond_available_qty: 0,
		} as any);
		uiStore.setStockSettings({ allow_negative_stock: 1 } as any);

		const invoiceItems = useInvoiceItems(ref("Invoice"));
		const item = {
			item_code: "ITEM-1",
			item_name: "Item 1",
			qty: 5,
			conversion_factor: 1,
			is_stock_item: 1,
			_base_actual_qty: 5,
		};

		invoiceItems.add_one(item);

		expect(item.qty).toBe(6);
		expect(item.max_qty).toBe(5);
		expect(item.disable_increment).toBe(false);
		expect(calcStockQty).toHaveBeenCalledWith(item, 6);
		expect(toastShow).not.toHaveBeenCalled();
	});

	it("bumps invoice metadata when quantity decreases so offers and pricing rules re-evaluate", async () => {
		const { useUIStore } = await import("../src/posapp/stores/uiStore");
		const { useInvoiceStore } = await import("../src/posapp/stores/invoiceStore");
		const { useInvoiceItems } = await import(
			"../src/posapp/composables/pos/invoice/useInvoiceItems"
		);
		const uiStore = useUIStore();
		uiStore.setPosProfile({
			name: "POS-1",
			posa_validate_stock: 0,
			posa_block_sale_beyond_available_qty: 0,
		} as any);
		uiStore.setStockSettings({ allow_negative_stock: 1 } as any);
		const invoiceStore = useInvoiceStore();
		invoiceStore.addItem({
			posa_row_id: "row-dis-water",
			item_code: "dis-water",
			item_name: "DIS WATER",
			qty: 25,
			rate: 10,
			base_rate: 10,
			conversion_factor: 1,
			is_stock_item: 1,
			allow_negative_stock: 1,
		});
		const invoiceItems = useInvoiceItems(ref("Invoice"));
		const beforeVersion = invoiceStore.metadata.changeVersion;

		invoiceItems.subtract_one(invoiceStore.items[0]);

		expect(invoiceStore.items[0].qty).toBe(24);
		expect(invoiceStore.items[0].amount).toBe(240);
		expect(invoiceStore.grossTotal).toBe(240);
		expect(invoiceStore.metadata.changeVersion).toBeGreaterThan(beforeVersion);
		expect(calcStockQty).toHaveBeenCalledWith(invoiceStore.items[0], 24);
	});
});
