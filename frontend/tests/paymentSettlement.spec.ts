import { describe, expect, it } from "vitest";

import { getNetInvoiceSettlementAmount } from "../src/features/payments/domain/paymentSettlement";

describe("paymentSettlement", () => {
	it("returns the absolute settlement total for return invoices", () => {
		expect(
			getNetInvoiceSettlementAmount({
				grand_total: -850,
				is_return: 1,
			}),
		).toBe(850);
	});

	it("subtracts covered amounts from regular invoices", () => {
		expect(
			getNetInvoiceSettlementAmount(
				{
					rounded_total: 1000,
					is_return: 0,
				},
				250,
			),
		).toBe(750);
	});
});
