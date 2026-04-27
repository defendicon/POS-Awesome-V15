import { describe, expect, it, vi } from "vitest";

vi.mock("../src/offline/index", () => ({
	clearPriceListCache: vi.fn(),
}));

vi.mock("../src/posapp/stores/customersStore.js", () => ({
	useCustomersStore: () => ({
		setSelectedCustomer: vi.fn(),
		setCustomerInfo: vi.fn(),
	}),
}));

import invoiceWatchers from "../src/posapp/components/pos/invoice/invoiceWatchers";

describe("invoiceWatchers", () => {
	it("does not back-calculate percentage discounts from derived amount", () => {
		const context = {
			additional_discount: 49.999999999,
			additional_discount_percentage: 5,
			Total: 1000,
			isReturnInvoice: false,
			pos_profile: {
				posa_use_percentage_discount: true,
			},
			discount_amount: 49.999999999,
		};

		(invoiceWatchers as any).additional_discount.call(context);

		expect(context.additional_discount_percentage).toBe(5);
	});
});
