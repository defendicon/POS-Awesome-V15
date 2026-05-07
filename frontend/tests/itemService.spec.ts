import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiEnvelope } from "../src/posapp/services/api";

vi.mock("../src/posapp/services/api", () => ({
	default: {
		call: vi.fn(),
		callEnvelope: vi.fn(),
	},
	unwrapApiResult: vi.fn((result: any) => {
		if (result?.ok) return result.data;
		if (result?.ok === false) throw new Error(result.error?.message);
		return result;
	}),
}));

import api from "../src/posapp/services/api";
import itemService from "../src/posapp/services/itemService";

const successEnvelope = <T>(data: T): ApiEnvelope<T> => ({
	ok: true,
	data,
	error: null,
	requestId: "request-1",
	serverTime: null,
});

describe("itemService API surface", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("uses the base method for item group envelopes and a Data method for unwrapped data", async () => {
		const envelope = successEnvelope([{ name: "Products" }]);
		vi.mocked(api.callEnvelope).mockResolvedValue(envelope as never);

		await expect(itemService.getItemGroups()).resolves.toBe(envelope);
		await expect(itemService.getItemGroupsData()).resolves.toEqual([
			{ name: "Products" },
		]);

		expect(itemService).not.toHaveProperty("getItemGroupsEnvelope");
		expect(api.callEnvelope).toHaveBeenCalledTimes(2);
		expect(api.callEnvelope).toHaveBeenCalledWith(
			"posawesome.posawesome.api.items.get_items_groups",
		);
	});

	it("unwraps barcode lookups through getItemsFromBarcodeData", async () => {
		const item = { item_code: "ITEM-001" };
		vi.mocked(api.callEnvelope).mockResolvedValue(
			successEnvelope(item) as never,
		);

		await expect(
			itemService.getItemsFromBarcodeData({
				selling_price_list: "Standard Selling",
				currency: "USD",
				barcode: "123",
			}),
		).resolves.toBe(item);

		expect(itemService).not.toHaveProperty("getItemsFromBarcodeEnvelope");
		expect(api.callEnvelope).toHaveBeenCalledWith(
			"posawesome.posawesome.api.items.get_items_from_barcode",
			{
				selling_price_list: "Standard Selling",
				currency: "USD",
				barcode: "123",
			},
		);
	});
});

describe("itemService.createItem", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(api.callEnvelope).mockResolvedValue({} as never);
	});

	it("adds a barcode child row when barcode is provided", async () => {
		await itemService.createItem({
			item_code: "ITEM-001",
			item_name: "Item 001",
			barcode: "123456789",
		});

		expect(api.callEnvelope).toHaveBeenCalledWith("frappe.client.insert", {
			doc: expect.objectContaining({
				doctype: "Item",
				item_code: "ITEM-001",
				item_name: "Item 001",
				barcodes: [{ barcode: "123456789" }],
			}),
		});
	});

	it("omits barcode rows when barcode is blank", async () => {
		await itemService.createItem({
			item_code: "ITEM-001",
			item_name: "Item 001",
			barcode: "   ",
		});

		expect(api.callEnvelope).toHaveBeenCalledWith("frappe.client.insert", {
			doc: expect.not.objectContaining({
				barcodes: expect.anything(),
			}),
		});
	});
});
