import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/posapp/services/api", () => ({
	default: {
		call: vi.fn(),
	},
}));

import api from "../src/posapp/services/api";
import itemService from "../src/posapp/services/itemService";

describe("itemService.createItem", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(api.call).mockResolvedValue({} as never);
	});

	it("adds a barcode child row when barcode is provided", async () => {
		await itemService.createItem({
			item_code: "ITEM-001",
			item_name: "Item 001",
			barcode: "123456789",
		});

		expect(api.call).toHaveBeenCalledWith(
			"frappe.client.insert",
			{
				doc: expect.objectContaining({
					doctype: "Item",
					item_code: "ITEM-001",
					item_name: "Item 001",
					barcodes: [{ barcode: "123456789" }],
				}),
			},
		);
	});

	it("omits barcode rows when barcode is blank", async () => {
		await itemService.createItem({
			item_code: "ITEM-001",
			item_name: "Item 001",
			barcode: "   ",
		});

		expect(api.call).toHaveBeenCalledWith(
			"frappe.client.insert",
			{
				doc: expect.not.objectContaining({
					barcodes: expect.anything(),
				}),
			},
		);
	});
});
