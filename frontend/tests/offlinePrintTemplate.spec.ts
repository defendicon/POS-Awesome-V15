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
		expect(html).toContain("<td style=\"width:40%; text-align:right;\">100</td>");
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

		expect(html).toContain("<td style=\"width:40%; text-align:right;\">-80</td>");
	});
});
