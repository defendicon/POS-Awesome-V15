import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/offline/index", () => ({
	getTaxTemplate: vi.fn(() => null),
	getTaxInclusiveSetting: vi.fn(() => false),
	isOffline: vi.fn(() => false),
}));

vi.mock("../src/posapp/components/pos/invoice_utils/currency", () => ({
	_getPlcConversionRate: vi.fn(() => 1),
}));

import { get_invoice_doc } from "../src/posapp/components/pos/invoice_utils/document";

describe("get_invoice_doc", () => {
	beforeEach(() => {
		(globalThis as any).flt = (value: unknown, precision = 2) => {
			const number = Number(value || 0);
			return Number(number.toFixed(precision));
		};
	});

	it("updates customer title when draft customer changes", () => {
		const context: any = {
			invoiceType: "Invoice",
			pos_profile: {
				company: "Test Company",
				name: "Main POS",
				currency: "PKR",
				payments: [{ mode_of_payment: "Cash", account: "Cash", type: "Cash", default: 1 }],
			},
			selected_currency: "PKR",
			conversion_rate: 1,
			company: { default_currency: "PKR" },
			price_list_currency: "PKR",
			get_price_list: () => "Standard Selling",
			customer_info: {
				customer: "CUST-NEW",
				customer_name: "New Customer",
			},
			customer: "CUST-NEW",
			isReturnInvoice: false,
			items: [],
			packed_items: [],
			Total: 0,
			subtotal: 0,
			additional_discount: 0,
			additional_discount_percentage: 0,
			roundAmount: (value: number) => value,
			pos_opening_shift: { name: "SHIFT-1" },
			posa_offers: [],
			posa_coupons: [],
			selected_delivery_charge: null,
			delivery_charges_rate: 0,
			posting_date_display: "2026-03-28",
			formatDateForBackend: (value: string) => value,
			invoice_doc: {
				name: "SINV-DRAFT",
				customer: "CUST-OLD",
				customer_name: "Old Customer",
				payments: [],
				taxes: [],
			},
		};

		const doc = get_invoice_doc(context);

		expect(doc.customer).toBe("CUST-NEW");
		expect(doc.customer_name).toBe("New Customer");
	});

	it("clears stale party details when customer changes on a reused source doc", () => {
		const context: any = {
			invoiceType: "Invoice",
			pos_profile: {
				company: "Test Company",
				name: "Main POS",
				currency: "PKR",
				payments: [{ mode_of_payment: "Cash", account: "Cash", type: "Cash", default: 1 }],
			},
			selected_currency: "PKR",
			conversion_rate: 1,
			company: { default_currency: "PKR" },
			price_list_currency: "PKR",
			get_price_list: () => "Standard Selling",
			customer_info: {
				customer: "CUST-NEW",
				customer_name: "New Customer",
			},
			customer: "CUST-NEW",
			isReturnInvoice: false,
			items: [],
			packed_items: [],
			Total: 0,
			subtotal: 0,
			additional_discount: 0,
			additional_discount_percentage: 0,
			roundAmount: (value: number) => value,
			pos_opening_shift: { name: "SHIFT-1" },
			posa_offers: [],
			posa_coupons: [],
			selected_delivery_charge: null,
			delivery_charges_rate: 0,
			posting_date_display: "2026-03-28",
			formatDateForBackend: (value: string) => value,
			invoice_doc: {
				name: "ACC-SINV-0001",
				customer: "CUST-OLD",
				customer_name: "Old Customer",
				customer_address: "ADDR-OLD",
				shipping_address_name: "SHIP-OLD",
				contact_person: "CONT-OLD",
				address_display: "Old Address",
				contact_display: "Old Contact",
				contact_mobile: "0300",
				contact_email: "old@example.com",
				territory: "Old Territory",
				payments: [],
				taxes: [],
			},
		};

		const doc = get_invoice_doc(context);

		expect(doc.customer).toBe("CUST-NEW");
		expect(doc.customer_name).toBe("New Customer");
		expect(doc.customer_address).toBeNull();
		expect(doc.shipping_address_name).toBeNull();
		expect(doc.contact_person).toBeNull();
		expect(doc.address_display).toBeNull();
		expect(doc.contact_display).toBeNull();
		expect(doc.contact_mobile).toBeNull();
		expect(doc.contact_email).toBeNull();
		expect(doc.territory).toBeNull();
	});

	it("ignores mismatched cached customer info when resolving a different customer", () => {
		const context: any = {
			invoiceType: "Invoice",
			pos_profile: {
				company: "Test Company",
				name: "Main POS",
				currency: "PKR",
				payments: [{ mode_of_payment: "Cash", account: "Cash", type: "Cash", default: 1 }],
			},
			selected_currency: "PKR",
			conversion_rate: 1,
			company: { default_currency: "PKR" },
			price_list_currency: "PKR",
			get_price_list: () => "Standard Selling",
			customer_info: {
				customer: "CUST-OLD",
				customer_name: "Old Customer",
				customer_address: "ADDR-OLD",
				shipping_address: "SHIP-OLD",
				contact_person: "CONT-OLD",
				territory: "Old Territory",
			},
			customer: "CUST-NEW",
			isReturnInvoice: false,
			items: [],
			packed_items: [],
			Total: 0,
			subtotal: 0,
			additional_discount: 0,
			additional_discount_percentage: 0,
			roundAmount: (value: number) => value,
			pos_opening_shift: { name: "SHIFT-1" },
			posa_offers: [],
			posa_coupons: [],
			selected_delivery_charge: null,
			delivery_charges_rate: 0,
			posting_date_display: "2026-03-28",
			formatDateForBackend: (value: string) => value,
			invoice_doc: {
				name: "ACC-SINV-0002",
				customer: "CUST-OLD",
				customer_name: "Old Customer",
				customer_address: "ADDR-OLD",
				shipping_address_name: "SHIP-OLD",
				contact_person: "CONT-OLD",
				territory: "Old Territory",
				payments: [],
				taxes: [],
			},
		};

		const doc = get_invoice_doc(context);

		expect(doc.customer).toBe("CUST-NEW");
		expect(doc.customer_name).toBe("CUST-NEW");
		expect(doc.customer_address).toBeNull();
		expect(doc.shipping_address_name).toBeNull();
		expect(doc.contact_person).toBeNull();
		expect(doc.territory).toBeNull();
	});
});
