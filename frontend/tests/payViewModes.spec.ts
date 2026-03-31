import { describe, expect, it } from "vitest";

import {
	getAllowedPartyTypes,
	normalizePartyTypeForPaymentType,
	shouldShowReconciliationSections,
} from "../src/posapp/components/pos_pay/paymentModes";

describe("paymentModes", () => {
	it("limits receive mode to customers only", () => {
		expect(getAllowedPartyTypes("Receive")).toEqual(["Customer"]);
	});

	it("allows customer, supplier, and employee in pay mode", () => {
		expect(getAllowedPartyTypes("Pay")).toEqual([
			"Customer",
			"Supplier",
			"Employee",
		]);
	});

	it("normalizes unsupported receive-mode party types back to customer", () => {
		expect(normalizePartyTypeForPaymentType("Receive", "Supplier")).toBe(
			"Customer",
		);
	});

	it("hides reconciliation sections for employee pay mode", () => {
		expect(shouldShowReconciliationSections("Pay", "Employee")).toBe(false);
	});

	it("keeps reconciliation sections visible for supplier pay mode", () => {
		expect(shouldShowReconciliationSections("Pay", "Supplier")).toBe(true);
	});
});
