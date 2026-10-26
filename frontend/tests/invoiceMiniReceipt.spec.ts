import { describe, expect, it } from "vitest";

import InvoiceMiniReceipt from "../src/posapp/components/pos/flows/InvoiceMiniReceipt.vue";

describe("InvoiceMiniReceipt", () => {
	it("uses the bounded preview and exposes View all only for large invoices", () => {
		const context = {
			invoice: {
				items_count: 6,
				item_preview: [
					{ item_code: "A" },
					{ item_code: "B" },
					{ item_code: "C" },
					{ item_code: "D" },
				],
			},
			maxItems: 4,
			allowViewAll: true,
		};

		const previewItems = (
			InvoiceMiniReceipt as any
		).computed.previewItems.call(context);
		const itemCount = (InvoiceMiniReceipt as any).computed.itemCount.call({
			...context,
			previewItems,
		});
		const showViewAll = (
			InvoiceMiniReceipt as any
		).computed.showViewAll.call({
			...context,
			itemCount,
		});

		expect(previewItems).toHaveLength(4);
		expect(itemCount).toBe(6);
		expect(showViewAll).toBe(true);
	});

	it("keeps compact invoices self-contained without a View all action", () => {
		const context = {
			invoice: { items: [{ item_code: "A" }, { item_code: "B" }] },
			maxItems: 4,
			allowViewAll: true,
		};
		const previewItems = (
			InvoiceMiniReceipt as any
		).computed.previewItems.call(context);
		const itemCount = (InvoiceMiniReceipt as any).computed.itemCount.call({
			...context,
			previewItems,
		});

		expect(
			(InvoiceMiniReceipt as any).computed.showViewAll.call({
				...context,
				itemCount,
			}),
		).toBe(false);
	});
});
