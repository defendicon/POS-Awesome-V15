import { beforeEach, describe, expect, it, vi } from "vitest";

const getStoredCustomerMock = vi.fn();

vi.mock("../src/offline/index", () => ({
	getStoredCustomer: (...args: any[]) => getStoredCustomerMock(...args),
	getCachedPriceListItems: vi.fn(() => null),
}));

import {
	fetch_customer_details,
	sync_invoice_customer_details,
} from "../src/posapp/components/pos/invoice_utils/customer";

describe("invoice customer sync", () => {
	beforeEach(() => {
		getStoredCustomerMock.mockReset();
		(globalThis as any).frappe = {
			call: vi.fn(),
		};
	});

	it("updates local draft customer title immediately on customer change", () => {
		const context: any = {
			customer: "CUST-NEW",
			customer_info: {
				customer: "CUST-OLD",
				customer_name: "Old Customer",
				customer_address: "ADDR-OLD",
				shipping_address: "SHIP-OLD",
				contact_person: "CONT-OLD",
				territory: "Old Territory",
			},
			invoice_doc: {
				customer: "CUST-OLD",
				customer_name: "Old Customer",
				customer_address: "ADDR-OLD",
				shipping_address_name: "SHIP-OLD",
				contact_person: "CONT-OLD",
				territory: "Old Territory",
			},
		};

		sync_invoice_customer_details(context, null);

		expect(context.invoice_doc.customer).toBe("CUST-NEW");
		expect(context.invoice_doc.customer_name).toBe("CUST-NEW");
		expect(context.invoice_doc.customer_address).toBeNull();
		expect(context.invoice_doc.shipping_address_name).toBeNull();
		expect(context.invoice_doc.contact_person).toBeNull();
		expect(context.invoice_doc.territory).toBeNull();
	});

	it("ignores stale async customer info responses", async () => {
		getStoredCustomerMock.mockResolvedValue(null);
		(globalThis as any).frappe.call.mockResolvedValue({
			message: {
				customer: "CUST-OLD",
				customer_name: "Old Customer",
				customer_price_list: "Old Price List",
			},
		});

		const context: any = {
			customer: "CUST-OLD",
			customer_info: {},
			items: [],
			pos_profile: { selling_price_list: "Standard", currency: "PKR" },
			selected_price_list: "Standard",
			price_list_currency: "PKR",
			update_items_details: vi.fn(),
		};

		const request = fetch_customer_details(context);
		context.customer = "CUST-NEW";
		await request;

		expect(context.customer_info).toEqual({});
		expect(context.selected_price_list).toBe("Standard");
	});
});
