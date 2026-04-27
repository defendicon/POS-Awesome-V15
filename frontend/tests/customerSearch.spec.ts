import { describe, expect, it } from "vitest";
import {
	customerMatchesSearchTerm,
	normalizeCustomerSearchTerm,
} from "../src/posapp/stores/customers/customerSearch";
import type { CustomerSummary } from "../src/posapp/types/models";

describe("customer search helpers", () => {
	it("normalizes empty and whitespace-only search terms", () => {
		expect(normalizeCustomerSearchTerm(null)).toBe("");
		expect(normalizeCustomerSearchTerm(undefined)).toBe("");
		expect(normalizeCustomerSearchTerm("  Jane Doe  ")).toBe("Jane Doe");
	});

	it("matches every search token across customer searchable fields", () => {
		const customer: CustomerSummary = {
			name: "CUST-001",
			customer_name: "Jane Doe",
			mobile_no: "+1 555 0101",
			email_id: "jane@example.com",
			tax_id: "TIN-99",
		};

		expect(customerMatchesSearchTerm(customer, "jane 0101 tin")).toBe(true);
		expect(customerMatchesSearchTerm(customer, "jane missing")).toBe(false);
		expect(customerMatchesSearchTerm(customer, "   ")).toBe(true);
	});
});
