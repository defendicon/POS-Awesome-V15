import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/offline/index", () => ({
	getCachedCustomerBalance: vi.fn(() => null),
	isOffline: vi.fn(() => false),
	saveCustomerBalance: vi.fn(),
}));

vi.mock("../src/posapp/composables/pos/shared/useDiscounts", () => ({
	useDiscounts: () => ({
		updateDiscountAmount: vi.fn(),
	}),
}));

import { load_invoice } from "../src/posapp/components/pos/invoice_utils/loader";

describe("load_invoice draft batch preservation", () => {
	beforeEach(() => {
		(globalThis as any).__ = (value: string) => value;
		(globalThis as any).flt = (value: unknown, precision = 2) => {
			const number = Number(value || 0);
			return Number(number.toFixed(precision));
		};
		(globalThis as any).frappe = {
			datetime: {
				nowdate: () => "2026-04-12",
			},
		};
	});

	it("keeps an existing draft batch when batch metadata has not been refreshed yet", async () => {
		const setBatchQty = vi.fn((item: any) => {
			item.batch_no = null;
		});

		const context: any = {
			pos_profile: {
				posa_use_percentage_discount: 0,
				posa_use_delivery_charges: 0,
			},
			additional_discount_percentage: 0,
			selected_delivery_charge: null,
			delivery_charges_rate: 0,
			additional_discount: 0,
			discount_amount: 0,
			clear_invoice: vi.fn(),
			eventBus: { emit: vi.fn() },
			invoiceType: "Invoice",
			invoiceTypes: ["Invoice", "Order", "Quotation"],
			invoice_doc: null,
			posa_offers: [],
			items: [],
			packed_items: [],
			makeid: () => "ROW-1",
			set_batch_qty: setBatchQty,
			customer: "",
			set_delivery_charges: vi.fn().mockResolvedValue(undefined),
			formatDateForBackend: (value: string) => value,
			delivery_charges: [],
			Total: 0,
			subtotal: 0,
			return_doc: null,
			toastStore: { show: vi.fn() },
		};

		const draftDoc = {
			customer: "CUST-0001",
			posting_date: "2026-04-12",
			items: [
				{
					item_code: "ITEM-001",
					item_name: "Tracked Item",
					qty: 1,
					batch_no: "BATCH-001",
				},
			],
			packed_items: [],
		};

		await load_invoice(context, draftDoc);

		expect(setBatchQty).not.toHaveBeenCalled();
		expect(context.items[0].batch_no).toBe("BATCH-001");
	});

	it("rounds loaded return discount percentage to POS decimal precision", async () => {
		const context: any = {
			pos_profile: {
				posa_use_percentage_discount: 1,
				posa_decimal_precision: 3,
				posa_use_delivery_charges: 0,
			},
			float_precision: 3,
			currency_precision: 3,
			additional_discount_percentage: 0,
			selected_delivery_charge: null,
			delivery_charges_rate: 0,
			additional_discount: 0,
			discount_amount: 0,
			clear_invoice: vi.fn(),
			eventBus: { emit: vi.fn() },
			invoiceType: "Invoice",
			invoiceTypes: ["Invoice", "Order", "Quotation"],
			invoice_doc: null,
			posa_offers: [],
			items: [],
			packed_items: [],
			makeid: () => "ROW-1",
			set_batch_qty: vi.fn(),
			customer: "",
			set_delivery_charges: vi.fn().mockResolvedValue(undefined),
			formatDateForBackend: (value: string) => value,
			delivery_charges: [],
			Total: 100,
			subtotal: 100,
			return_doc: null,
			toastStore: { show: vi.fn() },
			flt: (value: unknown, precision = 2) => {
				const number = Number(value || 0);
				return Number(number.toFixed(precision));
			},
			$nextTick: (fn: () => void) => fn(),
		};

		await load_invoice(context, {
			customer: "CUST-0001",
			posting_date: "2026-04-12",
			is_return: 1,
			return_against: "ACC-SINV-0001",
			additional_discount_percentage: 12.34567,
			discount_amount: -12.34567,
			total: -100,
			net_total: -100,
			grand_total: -87.65433,
			items: [],
			packed_items: [],
		});

		expect(context.additional_discount_percentage).toBe(-12.346);
	});

	it("marks server-loaded pricing rule free rows as auto-managed", async () => {
		const context: any = {
			pos_profile: {
				posa_use_percentage_discount: 0,
				posa_use_delivery_charges: 0,
			},
			additional_discount_percentage: 0,
			selected_delivery_charge: null,
			delivery_charges_rate: 0,
			additional_discount: 0,
			discount_amount: 0,
			clear_invoice: vi.fn(),
			eventBus: { emit: vi.fn() },
			invoiceType: "Invoice",
			invoiceTypes: ["Invoice", "Order", "Quotation"],
			invoice_doc: null,
			posa_offers: [],
			items: [],
			packed_items: [],
			makeid: () => "ROW-1",
			set_batch_qty: vi.fn(),
			customer: "",
			set_delivery_charges: vi.fn().mockResolvedValue(undefined),
			formatDateForBackend: (value: string) => value,
			delivery_charges: [],
			Total: 100,
			subtotal: 100,
			return_doc: null,
			toastStore: { show: vi.fn() },
		};

		await load_invoice(context, {
			customer: "CUST-0001",
			posting_date: "2026-04-12",
			items: [
				{
					item_code: "PAID-ITEM",
					item_name: "Paid Item",
					qty: 1,
					posa_row_id: "ROW-PAID",
				},
				{
					item_code: "FREE-ITEM",
					item_name: "Free Item",
					qty: 1,
					is_free_item: 1,
					pricing_rules: "[\"RULE-REWARD\"]",
				},
			],
			packed_items: [],
		});

		const freeLine = context.items.find((item: any) => item.is_free_item);
		expect(freeLine.source_rule).toBe("RULE-REWARD");
		expect(freeLine.auto_free_source).toBe("RULE-REWARD::FREE-ITEM");
	});
});
