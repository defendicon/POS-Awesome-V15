// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const itemAddition = vi.hoisted(() => ({
	addItem: vi.fn(),
}));

vi.mock("../src/posapp/composables/pos/items/useItemAddition", () => ({
	useItemAddition: () => ({
		addItem: itemAddition.addItem,
	}),
}));

vi.mock("../src/posapp/components/pos/invoice_utils/currency", () => ({
	_buildPriceListSnapshot: vi.fn(() => ({})),
	_logPriceListDebug: vi.fn(),
}));

vi.mock("../src/posapp/components/pos/invoice_utils/item_updates", () => ({
	applyReturnDiscountProration: vi.fn(),
}));

vi.mock("../src/posapp/components/pos/invoice_utils/document", () => ({
	get_invoice_doc: vi.fn(() => ({})),
	get_invoice_items: vi.fn(() => []),
	get_payments: vi.fn(() => []),
}));

vi.mock("../src/posapp/utils/documentSources", () => ({
	prepareDocumentFlowAction: vi.fn(),
}));

describe("invoice item add focus behavior", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		(window as any).__ = (value: string) => value;
		(globalThis as any).frappe = {
			datetime: {
				nowdate: () => "2026-07-11",
			},
		};
	});

	it("does not focus cart quantity when POS Profile disables it", async () => {
		const { add_item } = await import("../src/posapp/components/pos/invoice_utils/actions");
		itemAddition.addItem.mockResolvedValue({
			posa_row_id: "ROW-1",
			item_code: "ITEM-1",
		});
		const context = {
			pos_profile: {
				posa_focus_cart_qty_after_item_add: 0,
			},
			eventBus: {
				emit: vi.fn(),
			},
		};

		await add_item(context, { item_code: "ITEM-1" });
		vi.runAllTimers();

		expect(context.eventBus.emit).not.toHaveBeenCalledWith(
			"focus_cart_item_qty",
			expect.anything(),
		);
	});

	it("keeps focusing cart quantity by default for existing POS Profiles", async () => {
		const { add_item } = await import("../src/posapp/components/pos/invoice_utils/actions");
		itemAddition.addItem.mockResolvedValue({
			posa_row_id: "ROW-1",
			item_code: "ITEM-1",
		});
		const context = {
			pos_profile: {},
			eventBus: {
				emit: vi.fn(),
			},
		};

		await add_item(context, { item_code: "ITEM-1" });
		vi.runAllTimers();

		expect(context.eventBus.emit).toHaveBeenCalledWith("focus_cart_item_qty", {
			item: {
				posa_row_id: "ROW-1",
				item_code: "ITEM-1",
			},
			rowId: "ROW-1",
			itemCode: "ITEM-1",
		});
	});
});
