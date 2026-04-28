import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/offline/index", () => ({
	getTaxTemplate: vi.fn(() => null),
	getTaxInclusiveSetting: vi.fn(() => false),
	isOffline: vi.fn(() => true),
}));

vi.mock("../src/posapp/components/pos/invoice_utils/currency", () => ({
	_getPlcConversionRate: vi.fn(() => 1),
	_logPriceListDebug: vi.fn(),
	_buildPriceListSnapshot: vi.fn(() => []),
}));

import { get_invoice_doc } from "../src/posapp/components/pos/invoice_utils/document";
import { process_invoice } from "../src/posapp/components/pos/invoice_utils/server";

describe("process_invoice return discount proration", () => {
	beforeEach(() => {
		(globalThis as any).flt = (value: unknown, precision = 2) => {
			const number = Number(value || 0);
			return Number(number.toFixed(precision));
		};
		vi.spyOn(console, "log").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("syncs stale return additional discount to the prorated amount before payment", async () => {
		const context: any = {
			invoiceType: "Return",
			pos_profile: {
				company: "Test Company",
				name: "Main POS",
				currency: "PKR",
				posa_use_percentage_discount: 0,
				payments: [{ mode_of_payment: "Cash", account: "Cash", type: "Cash", default: 1 }],
			},
			selected_currency: "PKR",
			conversion_rate: 1,
			company: { default_currency: "PKR" },
			price_list_currency: "PKR",
			get_price_list: () => "Standard Selling",
			customer_info: {
				customer: "CUST-001",
				customer_name: "Walk-in Customer",
			},
			customer: "CUST-001",
			isReturnInvoice: true,
			items: [],
			packed_items: [],
			Total: 500,
			subtotal: 250,
			additional_discount: -250,
			discount_amount: -250,
			additional_discount_percentage: 0,
			return_doc: {
				name: "SINV-ORIGINAL",
				discount_amount: 250,
				total: 1000,
			},
			return_discount_base_amount: 250,
			return_discount_base_total: 1000,
			roundAmount: (value: number) => value,
			pos_opening_shift: { name: "SHIFT-1" },
			posa_offers: [],
			posa_coupons: [],
			selected_delivery_charge: null,
			delivery_charges_rate: 0,
			posting_date_display: "2026-04-27",
			formatDateForBackend: (value: string) => value,
			invoice_doc: {
				customer: "CUST-001",
				customer_name: "Walk-in Customer",
				return_against: "SINV-ORIGINAL",
				payments: [],
				taxes: [],
			},
		};
		context.get_invoice_doc = () => get_invoice_doc(context);

		const doc = await process_invoice(context);

		expect(context.additional_discount).toBe(-125);
		expect(context.discount_amount).toBe(-125);
		expect(doc.discount_amount).toBe(-125);
	});
});
