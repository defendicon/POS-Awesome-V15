import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/posapp/composables/pos/shared/useDiscounts", () => ({
	useDiscounts: () => ({
		updateDiscountAmount: vi.fn(),
	}),
}));

import { load_invoice } from "../src/posapp/components/pos/invoice_utils/loader";

describe("load_invoice draft batch hydration", () => {
	beforeEach(() => {
		vi.stubGlobal("__", (value: string) => value);
		vi.stubGlobal("flt", (value: unknown) => Number(value || 0));
		vi.stubGlobal("frappe", {
			datetime: {
				nowdate: () => "2026-04-14",
			},
		});
	});

	it("refreshes loaded draft items before payment so batch-required rows stay valid", async () => {
		const restoreManualSnapshots = vi.fn();
		const updateItemsDetails = vi.fn(async (items: any[]) => {
			items[0].has_batch_no = 1;
			items[0].batch_no_data = [
				{ batch_no: "BATCH-001", batch_qty: 4, is_expired: false },
			];
		});
		const setBatchQty = vi.fn();

		const context: any = {
			pos_profile: {
				posa_use_percentage_discount: 0,
			},
			additional_discount_percentage: 0,
			selected_delivery_charge: null,
			delivery_charges_rate: 0,
			additional_discount: 0,
			discount_amount: 0,
			clear_invoice: vi.fn(),
			eventBus: {
				emit: vi.fn(),
			},
			invoiceType: "Invoice",
			invoiceTypes: ["Invoice"],
			invoice_doc: {},
			posa_offers: [],
			items: [],
			packed_items: [],
			makeid: () => "row-1",
			set_batch_qty: setBatchQty,
			_snapshotManualValuesFromDocItems: vi.fn(() => [{ keys: {} }]),
			_restoreManualSnapshots: restoreManualSnapshots,
			update_items_details: updateItemsDetails,
			customer: null,
			set_delivery_charges: vi.fn(),
			formatDateForBackend: (value: string) => value,
			delivery_charges: [],
			Total: 0,
			subtotal: 0,
			return_doc: null,
			toastStore: {
				show: vi.fn(),
			},
			flt: (value: unknown) => Number(value || 0),
			currency_precision: 2,
		};

		const draftDoc = {
			customer: "Walk-in Customer",
			posting_date: "2026-04-14",
			items: [
				{
					item_code: "BATCH-ITEM",
					item_name: "Batch Item",
					qty: 1,
					rate: 100,
					amount: 100,
					batch_no: "BATCH-001",
				},
			],
		};

		await load_invoice(context, draftDoc);

		expect(updateItemsDetails).toHaveBeenCalledTimes(1);
		expect(updateItemsDetails).toHaveBeenCalledWith(context.items);
		expect(context.items[0].batch_no).toBe("BATCH-001");
		expect(context.items[0].has_batch_no).toBe(1);
		expect(context.items[0].batch_no_data).toEqual([
			{ batch_no: "BATCH-001", batch_qty: 4, is_expired: false },
		]);
		expect(setBatchQty).toHaveBeenCalledWith(context.items[0], "BATCH-001");
		expect(restoreManualSnapshots).toHaveBeenCalledWith(context.items, [
			{ keys: {} },
		]);
	});
});
