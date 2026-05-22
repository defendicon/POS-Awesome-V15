import { describe, expect, it } from "vitest";

import { shouldCreateSalesOrder } from "../src/posapp/utils/salesOrderMode";

describe("shouldCreateSalesOrder", () => {
	it("uses Allow Create Sales Order as the primary Order-mode gate", () => {
		expect(
			shouldCreateSalesOrder("Order", {
				posa_allow_sales_order: 1,
				posa_create_only_sales_order: 0,
			}),
		).toBe(true);
	});

	it("keeps the legacy Create Only Sales Order flag as a fallback", () => {
		expect(
			shouldCreateSalesOrder("Order", {
				posa_allow_sales_order: 0,
				posa_create_only_sales_order: 1,
			}),
		).toBe(true);
	});

	it("does not affect regular invoice mode", () => {
		expect(
			shouldCreateSalesOrder("Invoice", {
				posa_allow_sales_order: 1,
				posa_create_only_sales_order: 1,
			}),
		).toBe(false);
	});
});
