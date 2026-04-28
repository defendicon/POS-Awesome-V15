import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import { useLastInvoiceRate } from "../src/posapp/composables/pos/items/useLastInvoiceRate";

vi.mock("../src/offline/index", () => ({
	isOffline: () => false,
}));

describe("useLastInvoiceRate", () => {
	it("fetches only the opened item's last invoice rate", async () => {
		const frappeCall = vi.fn().mockResolvedValue({
			message: [
				{
					item_code: "ITEM-001",
					rate: 120,
					currency: "PKR",
					invoice: "SINV-1",
				},
			],
		});
		(globalThis as any).frappe = { call: frappeCall };

		const customer = ref("CUST-1");
		const displayedItems = ref([
			{ item_code: "ITEM-001" },
			{ item_code: "ITEM-002" },
		]);

		const { fetchLastInvoiceRateForItem, getLastInvoiceRate } =
			useLastInvoiceRate({
				pos_profile: { company: "ACME" },
				customer,
				displayedItems,
				show_last_invoice_rate: true,
				autoRefresh: false,
			});

		await fetchLastInvoiceRateForItem({ item_code: "ITEM-001" });

		expect(frappeCall).toHaveBeenCalledTimes(1);
		expect(frappeCall).toHaveBeenCalledWith({
			method: "posawesome.posawesome.api.invoices.get_last_invoice_rates",
			args: {
				customer: "CUST-1",
				item_codes: ["ITEM-001"],
				company: "ACME",
			},
			freeze: false,
		});
		expect(getLastInvoiceRate({ item_code: "ITEM-001" })?.rate).toBe(120);
		expect(getLastInvoiceRate({ item_code: "ITEM-002" })).toBeNull();
	});
});
