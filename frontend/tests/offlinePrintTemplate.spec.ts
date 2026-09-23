// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/offline/index", () => ({
	getPrintTemplate: vi.fn(() => ""),
	getTermsAndConditions: vi.fn(() => ""),
	memoryInitPromise: Promise.resolve(),
}));

import renderOfflineInvoiceHTML from "../src/offline_print_template";

describe("offline print fallback totals", () => {
	beforeEach(() => {
		vi.stubGlobal("frappe", { _: (text: string) => text });
	});

	it("prints paid amount net of change in invoice currency", async () => {
		const html = await renderOfflineInvoiceHTML({
			name: "ACC-SINV-OFFLINE-1",
			company: "Test Co",
			customer: "Walk In",
			grand_total: 100,
			change_amount: 20,
			payments: [{ mode_of_payment: "Cash", amount: 120 }],
			items: [],
			taxes: [],
		});

		expect(html).toContain("Change Amount");
		expect(html).toContain("20");
		expect(html).toContain(
			'<td style="width:40%; text-align:right;">100</td>',
		);
	});

	it("prints return paid amount as negative", async () => {
		const html = await renderOfflineInvoiceHTML({
			name: "ACC-SINV-RETURN-OFFLINE",
			company: "Test Co",
			customer: "Walk In",
			is_return: 1,
			grand_total: -80,
			payments: [{ mode_of_payment: "Cash", amount: -80 }],
			items: [],
			taxes: [],
		});

		expect(html).toContain(
			'<td style="width:40%; text-align:right;">-80</td>',
		);
	});

	it("removes executable markup from offline invoice fields", async () => {
		const html = await renderOfflineInvoiceHTML({
			name: "ACC-SINV-XSS",
			company: '<img src=x onerror="globalThis.pwned=1">',
			customer_name: "<script>globalThis.pwned=1</script>Customer",
			posa_notes: '<a href="javascript:alert(1)">note</a>',
			terms_and_conditions:
				'<iframe srcdoc="<script>alert(1)</script>"></iframe><b>Safe terms</b>',
			grand_total: 10,
			items: [
				{
					item_code: "ITEM-XSS",
					item_name: '<svg onload="alert(1)">Item</svg>',
					qty: 1,
					uom: "Nos",
					rate: 10,
					amount: 10,
				},
			],
			taxes: [],
			payments: [],
		});

		expect(html).not.toMatch(
			/<script|<iframe|onerror=|onload=|javascript:/i,
		);
		expect(html).toContain("Safe terms");
		expect(html).toContain("Content-Security-Policy");
	});
});
